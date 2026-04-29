/**
 * HTTP API — POST /send, GET /health, GET /metrics, GET /status
 */
import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { getLogger } from '../logger.js';
import type { IMessagePlatform } from '../platform/types.js';
import type { SessionManager } from '../session/SessionManager.js';
import { registry } from '../observability/metrics.js';

const log = getLogger('HttpServer');

interface SendBody { chatId: string; content: string }

export async function startHttpServer(
  port: number,
  platform: IMessagePlatform,
  sessionManager: SessionManager,
): Promise<void> {
  const app = Fastify({ logger: false });
  const apiKey = process.env['API_KEY'];

  app.post<{ Body: SendBody }>('/send', async (req, reply) => {
    if (apiKey) {
      const provided = (req.headers['authorization'] ?? '').replace('Bearer ', '');
      const a = Buffer.from(provided);
      const b = Buffer.from(apiKey);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return reply.status(401).send({ ok: false, error: 'Unauthorized' });
      }
    }
    const { chatId, content } = req.body ?? {} as SendBody;
    if (!chatId || !content) return reply.status(400).send({ ok: false, error: 'chatId and content required' });
    try {
      await platform.sendMessage(chatId, content);
      return { ok: true };
    } catch (e) {
      log.error(e, 'send failed');
      return reply.status(500).send({ ok: false, error: String(e) });
    }
  });

  app.get('/health', async () => ({
    ok: true,
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    activeSessions: sessionManager.getActiveChatIds().length,
  }));

  /** Prometheus 指标端点。 */
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  /** JSON 状态详情，供人工查看和调试。 */
  app.get('/status', async () => {
    const sessions = sessionManager.getActiveChatIds().map(chatId => {
      const s = sessionManager.getSession(chatId);
      if (!s) return { chatId, alive: false };
      const state = s.getMemoryState();
      return {
        chatId,
        alive: s.alive,
        bytes: state.bytes,
        turns: state.turns,
        lastActive: new Date(s.lastActive).toISOString(),
        sessionId: s.sessionId,
      };
    });

    return {
      uptime: process.uptime(),
      memory: {
        rss: process.memoryUsage().rss,
        heapUsed: process.memoryUsage().heapUsed,
      },
      sessions,
    };
  });

  app.post('/shutdown', async (_req, reply) => {
    log.info('Shutdown requested via HTTP');
    reply.send({ ok: true, message: 'shutting down gracefully' });
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 500);
  });

  await app.listen({ port, host: '0.0.0.0' });
  log.info(`HTTP server listening on :${port}`);
}
