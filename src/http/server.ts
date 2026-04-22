/**
 * HTTP API — POST /send, GET /health
 */
import Fastify from 'fastify';
import pino from 'pino';
import type { WeComPlatform } from '../platform/wecom/WeComPlatform.js';
import type { SessionManager } from '../session/SessionManager.js';

const log = pino({ name: 'HttpServer' });

interface SendBody { chatId: string; content: string }

export async function startHttpServer(
  port: number,
  platform: WeComPlatform,
  sessionManager: SessionManager,
): Promise<void> {
  const app = Fastify({ logger: false });

  app.post<{ Body: SendBody }>('/send', async (req, reply) => {
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
  }));

  await app.listen({ port, host: '0.0.0.0' });
  log.info(`HTTP server listening on :${port}`);
}
