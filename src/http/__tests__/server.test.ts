import { describe, it, expect, vi, beforeEach } from 'vitest';

// 需要 mock metrics 模块，避免 prom-client 注册冲突
vi.mock('../../observability/metrics.js', () => ({
  registry: { contentType: 'text/plain', metrics: async () => '# HELP test\nyami_test 1\n' },
  messagesTotal: { inc: vi.fn() },
  messagesProcessed: { inc: vi.fn() },
  messageDuration: { observe: vi.fn() },
  injectionBlocked: { inc: vi.fn() },
  sessionsActive: { set: vi.fn() },
  sessionsWarmPool: { set: vi.fn(), dec: vi.fn() },
  agentSpawns: { inc: vi.fn() },
  agentKills: { inc: vi.fn() },
  agentCrashes: { inc: vi.fn() },
  sessionRotations: { inc: vi.fn() },
  sessionSummarizations: { inc: vi.fn() },
  wsConnected: { set: vi.fn() },
  wsReconnects: { inc: vi.fn() },
  streamConflicts: { inc: vi.fn() },
}));

import Fastify from 'fastify';
import type { IMessagePlatform } from '../../platform/types.js';
import type { SessionManager } from '../../session/SessionManager.js';

// 因为 startHttpServer 会 listen，我们直接测路由逻辑
// 复制路由注册逻辑来测试
import { registry } from '../../observability/metrics.js';

function mockPlatform(): IMessagePlatform {
  return {
    sendMessage: vi.fn(async () => {}),
  } as unknown as IMessagePlatform;
}

function mockSessionManager(): SessionManager {
  return {
    getActiveChatIds: vi.fn(() => ['chat1', 'chat2']),
    getSession: vi.fn((id: string) => id === 'chat1' ? {
      alive: true, sessionId: 'sess-1', lastActive: Date.now(),
      getMemoryState: () => ({ turns: 5, bytes: 1024, lastSummarizeTime: Date.now(), sessionStartTime: Date.now() }),
    } : undefined),
  } as unknown as SessionManager;
}

describe('HTTP endpoints', () => {
  let app: ReturnType<typeof Fastify>;
  let platform: IMessagePlatform;
  let sm: SessionManager;

  beforeEach(async () => {
    platform = mockPlatform();
    sm = mockSessionManager();
    app = Fastify({ logger: false });

    // Register routes inline (same as server.ts)
    app.post('/send', async (req: any, reply: any) => {
      const { chatId, content } = req.body ?? {} as any;
      if (!chatId || !content) return reply.status(400).send({ ok: false, error: 'chatId and content required' });
      await platform.sendMessage(chatId, content);
      return { ok: true };
    });

    app.get('/health', async () => ({
      ok: true, uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      activeSessions: sm.getActiveChatIds().length,
    }));

    app.get('/metrics', async (_req: any, reply: any) => {
      reply.header('Content-Type', registry.contentType);
      return registry.metrics();
    });

    app.get('/status', async () => ({
      uptime: process.uptime(),
      sessions: sm.getActiveChatIds().map(id => {
        const s = sm.getSession(id);
        return s ? { chatId: id, alive: s.alive } : { chatId: id, alive: false };
      }),
    }));

    await app.ready();
  });

  it('POST /send calls platform.sendMessage', async () => {
    const res = await app.inject({ method: 'POST', url: '/send', payload: { chatId: 'c1', content: 'hi' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(platform.sendMessage).toHaveBeenCalledWith('c1', 'hi');
  });

  it('POST /send returns 400 without chatId', async () => {
    const res = await app.inject({ method: 'POST', url: '/send', payload: { content: 'hi' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET /health returns status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.activeSessions).toBe(2);
  });

  it('GET /metrics returns prometheus format', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.headers['content-type']).toBe('text/plain');
    expect(res.body).toContain('yami_test');
  });

  it('GET /status returns session details', async () => {
    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = JSON.parse(res.body);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].chatId).toBe('chat1');
    expect(body.sessions[0].alive).toBe(true);
  });
});
