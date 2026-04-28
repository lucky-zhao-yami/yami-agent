import { readdir, readFile, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from './logger.js';
import { loadConfig } from './config.js';
import { WeComPlatform } from './platform/wecom/WeComPlatform.js';
import { AcpAgentProvider } from './agent/acp/AcpAgentProvider.js';
import { ConversationMemoryLayer } from './memory/ConversationMemoryLayer.js';
import { AcpMemoryRecycler } from './memory/AcpMemoryRecycler.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { SessionManager } from './session/SessionManager.js';
import { Bridge } from './bridge/Bridge.js';
import { startHttpServer } from './http/server.js';

const log = getLogger('main');

function msUntilMidnight(): number {
  // Calculate ms until midnight in Asia/Shanghai
  const now = new Date();
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const shanghaiMidnight = new Date(shanghaiNow);
  shanghaiMidnight.setHours(24, 0, 0, 0);
  return shanghaiMidnight.getTime() - shanghaiNow.getTime();
}

async function dailySummarizeAndCleanup(memoryManager: MemoryManager, sessionsDir: string, sessionManager: SessionManager) {
  log.info('Running daily summarize & cleanup');
  // Summarize active sessions using their live sessionId
  for (const chatId of sessionManager.getActiveChatIds()) {
    const sid = sessionManager.getSessionId(chatId);
    if (sid) {
      try {
        await memoryManager.summarize(chatId, sid);
        await memoryManager.cleanup(chatId);
        log.info(`Daily summarize+cleanup done for active ${chatId}`);
      } catch (e) {
        log.error(e, `Daily summarize failed for active ${chatId}`);
      }
    }
  }

  // Summarize inactive sessions using last_session_id on disk
  const activeChatIds = new Set(sessionManager.getActiveChatIds());
  let dirs: string[];
  try {
    dirs = await readdir(sessionsDir);
  } catch { /* sessions dir not created yet */
    return;
  }

  for (const chatId of dirs) {
    if (activeChatIds.has(chatId)) continue;
    try {
      const sid = (await readFile(join(sessionsDir, chatId, 'last_session_id'), 'utf-8')).trim();
      if (!sid) continue;
      await memoryManager.summarize(chatId, sid);
      await memoryManager.cleanup(chatId);
      log.info(`Daily summarize+cleanup done for ${chatId}`);
    } catch (e) {
      // no last_session_id or summarize failed — skip this chat
      log.info(`Skipped daily summarize for ${chatId}: ${(e as Error).message}`);
    }

    // FR-12: clean archive files older than 30 days
    try {
      const archiveDir = join(sessionsDir, chatId, 'memory', 'archive');
      const archiveFiles = await readdir(archiveDir);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const f of archiveFiles) {
        const filePath = join(archiveDir, f);
        const s = await stat(filePath);
        if (s.mtimeMs < cutoff) {
          await unlink(filePath);
          log.info(`Deleted old archive: ${chatId}/${f}`);
        }
      }
    } catch { /* no archive dir for this chat — expected */ }
  }
}

function scheduleDailyCron(memoryManager: MemoryManager, sessionsDir: string, sessionManager: SessionManager) {
  const run = () => {
    dailySummarizeAndCleanup(memoryManager, sessionsDir, sessionManager).catch(
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
  await sessionManager.warmUp(config.env.WARM_POOL_SIZE);
  const bridge = new Bridge(platform, sessionManager, config);

  // Task 3.4 + 3.6: daily cron
  const sessionsDir = join(config.env.WORK_DIR, 'sessions');
  scheduleDailyCron(memoryManager, sessionsDir, sessionManager);

  await platform.connect();

  // Task 4.4: HTTP API
  await startHttpServer(config.env.PORT, platform, sessionManager);

  log.info('yami-agent started');

  const shutdown = async () => {
    log.info('Shutting down...');
    const timer = setTimeout(() => {
      log.error('Shutdown timeout, force exit');
      process.exit(1);
    }, 30_000);
    try {
      await bridge.shutdown();
      await platform.disconnect();
    } catch (e) {
      log.error(e, 'Shutdown error');
    }
    clearTimeout(timer);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(err, 'Fatal error');
  process.exit(1);
});
