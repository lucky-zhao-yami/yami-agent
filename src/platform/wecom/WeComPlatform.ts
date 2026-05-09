/**
 * 企微智能机器人 WebSocket 长连接客户端
 * 对齐企微官方 WS 协议 (wss://openws.work.weixin.qq.com)
 */
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { IMessagePlatform, type IncomingMessage, type PlatformEvent } from '../types.js';
import type { BotConfig } from '../../config.js';
import type { WsMessage, EventCallbackBody } from './protocol.js';
import { parseMsgCallback } from './MessageParser.js';
import { getLogger } from '../../logger.js';
import { wsConnected, wsReconnects, streamConflicts } from '../../observability/metrics.js';

const log = getLogger('WeComPlatform');

const WS_URL = 'wss://openws.work.weixin.qq.com';
const HEARTBEAT_INTERVAL = 30_000;
const PONG_TIMEOUT = 90_000;
const MAX_BACKOFF = 60_000;
const SEND_MSG_MIN_GAP = 2000;

function reqId(): string { return randomUUID().replace(/-/g, '').slice(0, 16); }

export class WeComPlatform extends IMessagePlatform {
  private ws: WebSocket | null = null;
  private msgHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private evtHandler: ((evt: PlatformEvent) => Promise<void>) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private closing = false;
  private authFailures = 0;
  private lastSendMsg = 0;
  private sendMsgChain: Promise<void> = Promise.resolve();
  private sendLock: Promise<void> = Promise.resolve();

  /** req_id set that received 6000 errcode (stream conflict) */
  readonly failedReqIds = new Set<string>();

  /** Pending media download futures: req_id → {resolve} */
  private mediaWaiters = new Map<string, { resolve: (v: Buffer | null) => void; timer: ReturnType<typeof setTimeout> }>();
  private mediaChain: Promise<Buffer | null> = Promise.resolve(null);

  constructor(private config: BotConfig) { super(); }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>) { this.msgHandler = handler; }
  onEvent(handler: (evt: PlatformEvent) => Promise<void>) { this.evtHandler = handler; }

  async connect(): Promise<void> {
    this.closing = false;
    this.authFailures = 0;
    // Connect and authenticate once, then run recv loop in background
    await this.doConnect();
    const messagePromise = this.setupRecvHandlers();
    await this.subscribe();
    this.lastPong = Date.now();
    this.startHeartbeat();
    log.info('WS connected and authenticated');
    wsConnected.set(1);
    // Background: when connection drops, reconnect loop kicks in
    messagePromise.then(() => this.reconnectLoop()).catch(() => this.reconnectLoop());
  }

  private setupRecvHandlers(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ws!.on('message', (raw: Buffer | string) => this.onRawMessage(raw));
      this.ws!.on('close', () => resolve());
      this.ws!.on('error', (err) => reject(err));
    });
  }

  private async reconnectLoop(): Promise<void> {
    let backoff = 1000;
    while (!this.closing) {
      this.stopHeartbeat();
      this.ws = null;
      wsConnected.set(0);
      log.info('Reconnecting in %dms', backoff);
      await sleep(backoff);
      try {
        await this.doConnect();
        const messagePromise = this.setupRecvHandlers();
        await this.subscribe();
        this.lastPong = Date.now();
        this.startHeartbeat();
        this.authFailures = 0;
        backoff = 1000;
        wsConnected.set(1);
        wsReconnects.inc();
        log.info('WS reconnected and authenticated');
        await messagePromise;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('认证失败')) {
          this.authFailures++;
          if (this.authFailures >= 5) {
            log.error('Auth failed %d times, stopping reconnect', this.authFailures);
            return;
          }
        }
        log.error('Reconnect failed: %s', msg);
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      }
    }
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.stopHeartbeat();
    // Clean up pending media waiters
    for (const [, waiter] of this.mediaWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    this.mediaWaiters.clear();
    this.ws?.close();
    this.ws = null;
  }

  // ---- Public send methods (aligned with Python ws_client) ----

  async sendStream(reqId: string, streamId: string, content: string, finish: boolean): Promise<void> {
    await this.sendRaw({
      cmd: 'aibot_respond_msg',
      headers: { req_id: reqId },
      body: { msgtype: 'stream', stream: { id: streamId, finish, content } },
    });
  }

  async sendMessage(chatId: string, content: string, chatType = 2): Promise<void> {
    const doSend = async () => {
      const gap = Date.now() - this.lastSendMsg;
      if (gap < SEND_MSG_MIN_GAP) await sleep(SEND_MSG_MIN_GAP - gap);
      this.lastSendMsg = Date.now();
      const actualId = chatType === 1 ? chatId.replace(/^dm_/, '') : chatId;
      await this.sendRaw({
        cmd: 'aibot_send_msg',
        headers: { req_id: reqId() },
        body: { chatid: actualId, chat_type: chatType, msgtype: 'markdown', markdown: { content } },
      });
    };
    this.sendMsgChain = this.sendMsgChain.then(doSend, doSend);
    return this.sendMsgChain;
  }

  async sendWelcome(rid: string, text: string): Promise<void> {
    await this.sendRaw({
      cmd: 'aibot_respond_welcome_msg',
      headers: { req_id: rid },
      body: { msgtype: 'text', text: { content: text } },
    });
  }

  async sendTemplateCard(chatId: string, chatType: number, card: {
    title: string; desc?: string; taskId: string;
    buttons: Array<{ text: string; key: string; style?: number }>;
  }): Promise<void> {
    const actualId = chatType === 1 ? chatId.replace(/^dm_/, '') : chatId;
    await this.sendRaw({
      cmd: 'aibot_send_msg',
      headers: { req_id: reqId() },
      body: {
        chatid: actualId, chat_type: chatType, msgtype: 'template_card',
        template_card: {
          card_type: 'button_interaction',
          main_title: { title: card.title, desc: card.desc ?? '' },
          button_list: card.buttons.map(b => ({ text: b.text, style: b.style ?? 1, key: b.key })),
          task_id: card.taskId,
        },
      },
    });
  }

  async getMedia(mediaId: string): Promise<Buffer | null> {
    const doGet = (): Promise<Buffer | null> => {
      const rid = reqId();
      return new Promise<Buffer | null>((resolve) => {
        const timer = setTimeout(() => {
          this.mediaWaiters.delete(rid);
          log.error('getMedia timeout media_id=%s', mediaId);
          resolve(null);
        }, 30_000);
        this.mediaWaiters.set(rid, { resolve, timer });
        this.sendRaw({
          cmd: 'aibot_get_media',
          headers: { req_id: rid },
          body: { media_id: mediaId },
        }).catch(() => {
          clearTimeout(timer);
          this.mediaWaiters.delete(rid);
          resolve(null);
        });
      });
    };
    // Serialize getMedia calls to avoid binary response mismatch
    this.mediaChain = this.mediaChain.then(doGet, doGet);
    return this.mediaChain;
  }

  // ---- Connection helpers ----

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.on('open', () => { this.ws = ws; resolve(); });
      ws.on('error', reject);
    });
  }

  private async subscribe(): Promise<void> {
    const authReqId = reqId();
    const authPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingAuthReqId = null;
        reject(new Error('subscribe timeout'));
      }, 10_000);
      this._pendingAuthReqId = authReqId;
      this._authCallback = (resp: WsMessage) => {
        clearTimeout(timer);
        this._pendingAuthReqId = null;
        this._authCallback = null;
        if (resp.errcode !== 0) reject(new Error(`认证失败: ${JSON.stringify(resp)}`));
        else resolve();
      };
    });

    await this.sendRaw({
      cmd: 'aibot_subscribe',
      headers: { req_id: authReqId },
      body: { bot_id: this.config.bot_id, secret: this.config.secret },
    });

    return authPromise;
  }

  private _pendingAuthReqId: string | null = null;
  private _authCallback: ((resp: WsMessage) => void) | null = null;

  // ---- Heartbeat ----

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > PONG_TIMEOUT) {
        log.error('No pong for %dms, closing', PONG_TIMEOUT);
        this.ws?.close();
        return;
      }
      this.sendRaw({ cmd: 'ping', headers: { req_id: reqId() } }).catch(() => {});
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ---- Message dispatch ----

  private onRawMessage(raw: Buffer | string) {
    let msg: WsMessage;
    try {
      if (Buffer.isBuffer(raw)) {
        try { msg = JSON.parse(raw.toString()) as WsMessage; } catch { /* binary data, not JSON */
          // Binary media data — dispatch to first waiting media waiter
          for (const [rid, waiter] of this.mediaWaiters) {
            clearTimeout(waiter.timer);
            this.mediaWaiters.delete(rid);
            waiter.resolve(raw);
            return;
          }
          return;
        }
      } else {
        msg = JSON.parse(raw) as WsMessage;
      }
    } catch { /* non-JSON message, ignore */ return; }

    const cmd = msg.cmd || '';
    const headers = msg.headers || {};
    const rid = (headers.req_id as string) || '';
    const body = msg.body || {};

    // Check if this is a media response
    if (rid && this.mediaWaiters.has(rid)) {
      const waiter = this.mediaWaiters.get(rid)!;
      clearTimeout(waiter.timer);
      this.mediaWaiters.delete(rid);
      if (msg.errcode !== 0) {
        waiter.resolve(null);
      } else {
        const data = body['data'] as string | undefined;
        waiter.resolve(data ? Buffer.from(data, 'base64') : null);
      }
      return;
    }

    if (cmd === 'aibot_msg_callback') {
      this.handleMsgCallback(rid, body);
    } else if (cmd === 'aibot_event_callback') {
      this.handleEventCallback(rid, body);
    } else if (cmd === 'pong' || (!cmd && msg.errcode === 0)) {
      this.lastPong = Date.now();
      if (rid && rid === this._pendingAuthReqId && this._authCallback) {
        this._authCallback(msg);
      }
    } else if (!cmd && msg.errcode === 6000) {
      const failedRid = (headers.req_id as string) || '';
      if (failedRid) this.failedReqIds.add(failedRid);
      streamConflicts.inc();
      log.info('6000 conflict req=%s, will degrade to send_msg', failedRid);
    } else if (!cmd && this._pendingAuthReqId && this._authCallback) {
      this._authCallback(msg);
    }
  }

  private handleMsgCallback(rid: string, body: Record<string, unknown>) {
    if (!this.msgHandler) return;
    const incoming = parseMsgCallback(this.config.bot_id, rid, body);
    if (!incoming) return; // bot's own message filtered
    this.msgHandler(incoming).catch(err => log.error(err, 'Message handler error'));
  }

  private handleEventCallback(_rid: string, body: Record<string, unknown>) {
    // Handle template card button clicks as messages
    if (body.event_type === 'template_card_event') {
      if (!this.msgHandler) return;
      const taskId = (body.task_id as string) ?? '';
      const key = ((body.selected_items as any[])?.[0]?.key as string) ?? '';
      const userId = (body.from_user as string) ?? (body.userid as string) ?? '';
      const chatType = (body.chat_type as number) ?? 1;
      const chatId = chatType === 1 ? `dm_${userId}` : ((body.chatid as string) ?? '');
      this.msgHandler({
        chatId, userId, msgType: 'text',
        text: `__card_click__:${taskId}:${key}`,
        reqId: reqId(), chatType,
      }).catch(err => log.error(err, 'Card click handler error'));
      return;
    }

    if (!this.evtHandler) return;
    const b = body as unknown as EventCallbackBody;
    const eventType = b.event?.eventtype || '';
    const chatId = b.chatid || '';
    const evt: PlatformEvent = {
      type: eventType === 'enter_chat' ? 'enter_chat' : 'disconnected',
      chatId: chatId || undefined,
      reqId: _rid,
    };
    this.evtHandler(evt).catch(err => log.error(err, 'Event handler error'));
  }

  // ---- Low-level send ----

  private sendRaw(payload: Record<string, unknown>): Promise<void> {
    const doSend = (): Promise<void> => new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) reject(err); else resolve();
      });
    });
    this.sendLock = this.sendLock.then(doSend, doSend);
    return this.sendLock;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
