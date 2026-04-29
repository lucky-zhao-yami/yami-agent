import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('ws', () => {
  const { EventEmitter: EE } = require('node:events');
  class MockWS extends EE {
    static OPEN = 1;
    readyState = 1;
    send = vi.fn((_data: string, cb?: (err?: Error) => void) => { cb?.(); });
    close = vi.fn();
  }
  return { default: MockWS };
});

vi.mock('../../../observability/metrics.js', () => ({
  wsConnected: { set: vi.fn() },
  wsReconnects: { inc: vi.fn() },
  streamConflicts: { inc: vi.fn() },
}));

import { WeComPlatform } from '../WeComPlatform.js';
import type { BotConfig } from '../../../config.js';

const botConfig = {
  bot_id: 'test-bot', secret: 'test-secret', welcome_msg: '👋',
  agent: { command: 'echo', args: [] }, chats: {},
  memory: { layers: [], injectionMaxChars: 2000 },
} as BotConfig;

function makeWs() {
  const ws = new EventEmitter() as any;
  ws.readyState = 1;
  ws.send = vi.fn((_data: string, cb?: (err?: Error) => void) => { cb?.(); });
  ws.close = vi.fn();
  return ws;
}

describe('WeComPlatform', () => {
  let platform: WeComPlatform;

  beforeEach(() => {
    platform = new WeComPlatform(botConfig);
  });

  it('registers handlers without error', () => {
    platform.onMessage(vi.fn());
    platform.onEvent(vi.fn());
    expect(true).toBe(true);
  });

  it('sendStream sends via WS', async () => {
    const ws = makeWs();
    (platform as any).ws = ws;
    (platform as any).sendLock = Promise.resolve();
    await platform.sendStream('req1', 'stream1', 'content', false);
    expect(ws.send).toHaveBeenCalled();
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.cmd).toBe('aibot_respond_msg');
  });

  it('sendWelcome sends via WS', async () => {
    const ws = makeWs();
    (platform as any).ws = ws;
    (platform as any).sendLock = Promise.resolve();
    await platform.sendWelcome('req1', '👋');
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.cmd).toBe('aibot_respond_welcome_msg');
  });

  it('sendMessage sends markdown', async () => {
    const ws = makeWs();
    (platform as any).ws = ws;
    (platform as any).sendLock = Promise.resolve();
    (platform as any).sendMsgChain = Promise.resolve();
    (platform as any).lastSendMsg = 0;
    await platform.sendMessage('chat1', 'hello', 2);
    expect(ws.send).toHaveBeenCalled();
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.cmd).toBe('aibot_send_msg');
  });

  it('disconnect closes WS', async () => {
    const ws = makeWs();
    (platform as any).ws = ws;
    await platform.disconnect();
    expect(ws.close).toHaveBeenCalled();
  });

  it('failedReqIds tracks conflicts', () => {
    platform.failedReqIds.add('req-fail');
    expect(platform.failedReqIds.has('req-fail')).toBe(true);
  });
});
