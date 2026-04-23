/**
 * 企微智能机器人 WebSocket 长连接客户端
 * 对齐企微官方 WS 协议 (wss://openws.work.weixin.qq.com)
 */
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { IMessagePlatform, type IncomingMessage, type PlatformEvent } from '../types.js';
import type { BotConfig } from '../../config.js';
import { parseMsgCallback } from './MessageParser.js';
import { getLogger } from '../../logger.js';

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

  /** req_id set that received 6000 errcode (stream conflict) */
  readonly failedReqIds = new Set<string>();

  /** Pending media download futures: req_id → {resolve} */
  private mediaWaiters = new Map<string, { resolve: (v: Buffer | null) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(private config: BotConfig) { super(); }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>) { this.msgHandler = handler; }
  onEvent(handler: (evt: PlatformEvent) => Promise<void>) { this.evtHandler = handler; }

  async connect(): Promise<void> {
    this.closing = false;
    this.authFailures = 0;
    await this.connectLoop();
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.stopHeartbeat();
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
    // Rate limit: >= 2s between send_msg calls
    const gap = Date.now() - this.lastSendMsg;
    if (gap < SEND_MSG_MIN_GAP) await sleep(SEND_MSG_MIN_GAP - gap);
    this.lastSendMsg = Date.now();

    const actualId = chatType === 1 ? chatId.replace(/^dm_/, '') : chatId;
    await this.sendRaw({
      cmd: 'aibot_send_msg',
      headers: { req_id: reqId() },
      body: { chatid: actualId, chat_type: chatType, msgtype: 'markdown', markdown: { content } },
    });
  }

  async sendWelcome(rid: string, text: string): Promise<void> {
    await this.sendRaw({
      cmd: 'aibot_respond_welcome_msg',
      headers: { req_id: rid },
      body: { msgtype: 'text', text: { content: text } },
    });
  }

  async getMedia(mediaId: string): Promise<Buffer | null> {
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
  }

  // ---- Connection lifecycle ----

  private async connectLoop(): Promise<void> {
    let backoff = 1000;
    while (!this.closing) {
      try {
        await this.doConnect();
        this.authFailures = 0;
        backoff = 1000;
        await this.recvLoop();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('认证失败')) {
          this.authFailures++;
          if (this.authFailures >= 5) {
            log.error('Auth failed %d times, stopping', this.authFailures);
            return;
          }
        }
        log.error('WS disconnected: %s, reconnect in %dms', msg, backoff);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF);
      } finally {
        this.stopHeartbeat();
        this.ws = null;
      }
    }
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.on('open', () => { this.ws = ws; resolve(); });
      ws.on('error', reject);
    });
  }

  private async recvLoop(): Promise<void> {
    if (!this.ws) return;
    await this.subscribe();
    this.lastPong = Date.now();
    this.startHeartbeat();
    log.info('WS connected and authenticated');

    return new Promise<void>((resolve, reject) => {
      this.ws!.on('message', (raw: Buffer | string) => this.onRawMessage(raw));
      this.ws!.on('close', () => resolve());
      this.ws!.on('error', (err) => reject(err));
    });
  }

  private async subscribe(): Promise<void> {
    await this.sendRaw({
      cmd: 'aibot_subscribe',
      headers: { req_id: reqId() },
      body: { bot_id: this.config.bot_id, secret: this.config.secret },
    });
    // Wait for auth response
    const raw = await this.waitForMessage(10_000);
    const resp = JSON.parse(raw);
    if (resp.errcode !== 0) throw new Error(`认证失败: ${JSON.stringify(resp)}`);
  }

  private waitForMessage(timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws?.removeListener('message', handler);
        reject(new Error('subscribe timeout'));
      }, timeout);
      const handler = (data: Buffer | string) => {
        clearTimeout(timer);
        this.ws?.removeListener('message', handler);
        resolve(data.toString());
      };
      this.ws?.once('message', handler);
    });
  }

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
    let msg: Record<string, unknown>;
    try {
      if (Buffer.isBuffer(raw)) {
        try { msg = JSON.parse(raw.toString()); } catch {
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
        msg = JSON.parse(raw);
      }
    } catch { return; }

    const cmd = (msg['cmd'] as string) || '';
    const headers = (msg['headers'] as Record<string, string>) || {};
    const rid = headers['req_id'] || '';
    const body = (msg['body'] as Record<string, unknown>) || {};

    // Check if this is a media response
    if (rid && this.mediaWaiters.has(rid)) {
      const waiter = this.mediaWaiters.get(rid)!;
      clearTimeout(waiter.timer);
      this.mediaWaiters.delete(rid);
      if ((msg['errcode'] as number) !== 0) {
        waiter.resolve(null);
      } else {
        const data = body['data'] as string;
        waiter.resolve(data ? Buffer.from(data, 'base64') : null);
      }
      return;
    }

    if (cmd === 'aibot_msg_callback') {
      this.handleMsgCallback(rid, body);
    } else if (cmd === 'aibot_event_callback') {
      this.handleEventCallback(rid, body);
    } else if (cmd === 'pong' || (!cmd && (msg['errcode'] as number) === 0)) {
      this.lastPong = Date.now();
    } else if (!cmd && (msg['errcode'] as number) === 6000) {
      const failedRid = headers['req_id'] || '';
      if (failedRid) this.failedReqIds.add(failedRid);
      log.info('6000 conflict req=%s, will degrade to send_msg', failedRid);
    }
  }

  private handleMsgCallback(rid: string, body: Record<string, unknown>) {
    if (!this.msgHandler) return;
    const incoming = parseMsgCallback(this.config.bot_id, rid, body);
    if (!incoming) return; // bot's own message filtered
    this.msgHandler(incoming).catch(err => log.error(err, 'Message handler error'));
  }

  private handleEventCallback(rid: string, body: Record<string, unknown>) {
    if (!this.evtHandler) return;
    const event = (body['event'] as Record<string, unknown>) || {};
    const eventType = (event['eventtype'] as string) || '';
    const chatId = (body['chatid'] as string) || '';
    const evt: PlatformEvent = {
      type: eventType === 'enter_chat' ? 'enter_chat' : 'disconnected',
      chatId: chatId || undefined,
      reqId: rid,
    };
    this.evtHandler(evt).catch(err => log.error(err, 'Event handler error'));
  }

  // ---- Low-level send ----

  private sendRaw(payload: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      this.ws.send(JSON.stringify(payload), (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
