import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pino from 'pino';
import { loadConfig } from './config.js';
import { WeComPlatform } from './platform/wecom/WeComPlatform.js';
import { AcpAgentProvider } from './agent/acp/AcpAgentProvider.js';
import { ConversationMemoryLayer } from './memory/ConversationMemoryLayer.js';
import { AcpMemoryRecycler } from './memory/AcpMemoryRecycler.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { SessionManager } from './session/SessionManager.js';
import { Bridge } from './bridge/Bridge.js';
import { startHttpServer } from './http/server.js';

const log = pino({ name: 'yami-agent' });

function msUntilMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

async function dailySummarizeAndCleanup(memoryManager: MemoryManager, sessionsDir: string) {
  log.info('Running daily summarize & cleanup');
  let dirs: string[];
  try {
    dirs = await readdir(sessionsDir);
  } catch {
    return;
  }

  for (const chatId of dirs) {
    try {
      const sid = (await readFile(join(sessionsDir, chatId, 'last_session_id'), 'utf-8')).trim();
      if (!sid) continue;
      await memoryManager.summarize(chatId, sid);
      await memoryManager.cleanup(chatId);
      log.info(`Daily summarize+cleanup done for ${chatId}`);
    } catch {
      // no last_session_id or other error — skip
    }
  }
}

function scheduleDailyCron(memoryManager: MemoryManager, sessionsDir: string) {
  const run = () => {
    dailySummarizeAndCleanup(memoryManager, sessionsDir).catch(
      e => log.error(e, 'Daily cron failed'),
    );
    // Schedule next run at midnight
    setTimeout(run, msUntilMidnight());
  };
  setTimeout(run, msUntilMidnight());
}

async function main() {
  const config = loadConfig();
  log.info(`Starting yami-agent, WORK_DIR=${config.env.WORK_DIR}`);

  const platform = new WeComPlatform(config.bot);
  const agentProvider = new AcpAgentProvider();

  // Memory
  const layers = [new ConversationMemoryLayer(config.env)];
  const recycler = new AcpMemoryRecycler(agentProvider, {
    command: config.bot.agent.command,
    args: config.bot.agent.args,
    cwd: config.env.WORK_DIR,
    env: config.bot.agent.env,
  });
  const memoryManager = new MemoryManager(layers, recycler);

  const sessionManager = new SessionManager(agentProvider, config, memoryManager);
  const bridge = new Bridge(platform, sessionManager, config);

  // Task 3.4 + 3.6: daily cron
  const sessionsDir = join(config.env.WORK_DIR, 'sessions');
  scheduleDailyCron(memoryManager, sessionsDir);

  await platform.connect();

  // Task 4.4: HTTP API
  await startHttpServer(config.env.PORT, platform, sessionManager);

  log.info('yami-agent started');

  const shutdown = async () => {
    log.info('Shutting down...');
    await bridge.shutdown();
    await platform.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(err, 'Fatal error');
  process.exit(1);
});
