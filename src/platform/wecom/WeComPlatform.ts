import WebSocket from 'ws';
import pino from 'pino';
import { IMessagePlatform, type IncomingMessage, type PlatformEvent } from '../types.js';
import type { BotConfig } from '../../config.js';

const log = pino({ name: 'WeComPlatform' });

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const MAX_RECONNECT_DELAY = 60_000;

interface WsFrame {
  action: string;
  data?: Record<string, unknown>;
}

export class WeComPlatform extends IMessagePlatform {
  private ws: WebSocket | null = null;
  private msgHandler: ((msg: IncomingMessage) => Promise<void>) | null = null;
  private evtHandler: ((evt: PlatformEvent) => Promise<void>) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = Date.now();
  private reconnectDelay = 1000;
  private closing = false;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private reqCounter = 0;

  constructor(private config: BotConfig) { super(); }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>) { this.msgHandler = handler; }
  onEvent(handler: (evt: PlatformEvent) => Promise<void>) { this.evtHandler = handler; }

  async connect(): Promise<void> {
    this.closing = false;
    await this.doConnect();
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  async sendStream(chatId: string, streamId: string, content: string, finish: boolean): Promise<void> {
    if (finish) {
      await this.send('aibot_stream_push', { stream_id: streamId, content });
      await this.send('aibot_stream_close', { stream_id: streamId });
    } else {
      await this.send('aibot_stream_push', { stream_id: streamId, content });
    }
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    await this.send('aibot_send_text', { conversation_id: chatId, content });
  }

  async getMedia(_mediaId: string): Promise<Buffer | null> {
    return null; // Phase 4
  }

  async streamOpen(chatId: string, msgId: string): Promise<string> {
    const resp = await this.sendRequest('aibot_stream_open', { conversation_id: chatId, msg_id: msgId });
    return (resp as Record<string, unknown>)['stream_id'] as string;
  }

  async streamPush(streamId: string, content: string): Promise<void> {
    await this.send('aibot_stream_push', { stream_id: streamId, content });
  }

  async streamClose(streamId: string): Promise<void> {
    await this.send('aibot_stream_close', { stream_id: streamId });
  }

  // --- internal ---

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const host = process.env['WECOM_WS_HOST'] || 'localhost';
      const port = process.env['WECOM_WS_PORT'] || '18887';
      const url = `ws://${host}:${port}`;
      log.info(`Connecting to ${url}`);

      this.ws = new WebSocket(url);

      this.ws.on('open', async () => {
        log.info('WebSocket connected, subscribing...');
        try {
          await this.subscribe();
          this.reconnectDelay = 1000;
          this.startHeartbeat();
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      this.ws.on('message', (raw) => this.onRawMessage(raw.toString()));
      this.ws.on('close', () => this.onClose());
      this.ws.on('error', (err) => {
        log.error(err, 'WebSocket error');
        reject(err);
      });
    });
  }

  private async subscribe(): Promise<void> {
    const token = process.env['WECOM_TOKEN'] || this.config.secret;
    const resp = await this.sendRequest('aibot_subscribe', { token });
    const status = (resp as Record<string, unknown>)['status'];
    if (status !== 'success') {
      throw new Error(`Subscribe failed: ${JSON.stringify(resp)}`);
    }
    log.info('Subscribed successfully');
  }

  private startHeartbeat() {
    this.lastPong = Date.now();
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > HEARTBEAT_TIMEOUT) {
        log.error('Heartbeat timeout, reconnecting');
        this.ws?.close();
        return;
      }
      this.send('ping', {}).catch(() => {});
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private onClose() {
    this.stopHeartbeat();
    if (this.closing) return;
    log.info(`Reconnecting in ${this.reconnectDelay}ms`);
    setTimeout(() => {
      this.doConnect().catch((err) => {
        log.error(err, 'Reconnect failed');
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
        this.onClose();
      });
    }, this.reconnectDelay);
  }

  private onRawMessage(raw: string) {
    let frame: WsFrame;
    try { frame = JSON.parse(raw); } catch { return; }

    if (frame.action === 'pong') {
      this.lastPong = Date.now();
      return;
    }

    // Handle request-response
    const reqId = frame.data?.['req_id'] as string | undefined;
    if (reqId && this.pendingRequests.has(reqId)) {
      const pending = this.pendingRequests.get(reqId)!;
      this.pendingRequests.delete(reqId);
      pending.resolve(frame.data);
      return;
    }

    // Handle response to our requests (stream_id etc.)
    if (frame.data && typeof frame.data === 'object') {
      // Check for pending by action-based matching
      const actionReqId = frame.data['_req_id'] as string | undefined;
      if (actionReqId && this.pendingRequests.has(actionReqId)) {
        const pending = this.pendingRequests.get(actionReqId)!;
        this.pendingRequests.delete(actionReqId);
        pending.resolve(frame.data);
        return;
      }
    }

    if (frame.action === 'aibot_msg_callback') {
      this.handleMsgCallback(frame.data ?? {});
    } else if (frame.action === 'aibot_event_callback') {
      this.handleEventCallback(frame.data ?? {});
    }
  }

  private handleMsgCallback(data: Record<string, unknown>) {
    if (!this.msgHandler) return;
    const msg: IncomingMessage = {
      chatId: (data['conversation_id'] as string) || '',
      userId: (data['sender'] as string) || '',
      msgType: (data['msg_type'] as IncomingMessage['msgType']) || 'text',
      text: (data['content'] as string) || '',
      reqId: (data['msg_id'] as string) || '',
    };
    this.msgHandler(msg).catch(err => log.error(err, 'Message handler error'));
  }

  private handleEventCallback(data: Record<string, unknown>) {
    if (!this.evtHandler) return;
    const evt: PlatformEvent = {
      type: (data['event_type'] as PlatformEvent['type']) || 'enter_chat',
      chatId: data['conversation_id'] as string,
      reqId: (data['msg_id'] as string) || '',
    };
    this.evtHandler(evt).catch(err => log.error(err, 'Event handler error'));
  }

  private send(action: string, data: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }
      this.ws.send(JSON.stringify({ action, data }), (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  private sendRequest(action: string, data: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const reqId = `req_${++this.reqCounter}`;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error(`Request ${action} timed out`));
      }, 10_000);

      this.pendingRequests.set(reqId, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.send(action, { ...data, _req_id: reqId }).catch(reject);
    });
  }
}
