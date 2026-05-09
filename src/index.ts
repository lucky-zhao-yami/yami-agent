import { readdir, unlink, stat } from 'node:fs/promises';
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

const TIMER_TICK_INTERVAL = 60_000;

/**
 * 定时器：每 60s 对所有活跃 session 发 timer_tick 事件。
 * IntervalStrategy 会判断是否需要触发总结。
 */
function startTimerTick(sessionManager: SessionManager) {
  setInterval(() => {
    const now = Date.now();
    for (const chatId of sessionManager.getActiveChatIds()) {
      const session = sessionManager.getSession(chatId);
      if (!session) continue;
      const action = session.eventBus.check(
        { type: 'timer_tick', now },
        session.getMemoryState(),
      );
      if (action === 'rotate') {
        session.rotate().catch(e => log.error(e, `Timer rotate failed for ${chatId}`));
      } else if (action === 'summarize') {
        session.triggerSummarize().catch(e => log.error(e, `Timer summarize failed for ${chatId}`));
      }
    }
  }, TIMER_TICK_INTERVAL);
}

/**
 * 每日清理：gzip 压缩超过 30 天的摘要 + 删除超过 30 天的 archive。
 * 总结逻辑已由 timer_tick + Strategy 接管，这里只做清理。
 */
async function dailyCleanup(memoryManager: MemoryManager, sessionsDir: string) {
  log.info('Running daily cleanup');
  let dirs: string[];
  try {
    dirs = await readdir(sessionsDir);
  } catch { /* sessions dir not created yet */
    return;
  }

  for (const chatId of dirs) {
    // gzip 超过 30 天的 memory/*.md
    await memoryManager.cleanup(chatId).catch(e =>
      log.info(`Cleanup skipped for ${chatId}: ${(e as Error).message}`),
    );

    // 删除超过 30 天的 archive 文件
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
    } catch { /* no archive dir — expected */ }
  }
}

function scheduleDailyCleanup(memoryManager: MemoryManager, sessionsDir: string) {
  const msUntilMidnight = () => {
    const now = new Date();
    const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const shanghaiMidnight = new Date(shanghaiNow);
    shanghaiMidnight.setHours(24, 0, 0, 0);
    return shanghaiMidnight.getTime() - shanghaiNow.getTime();
  };
  const run = () => {
    dailyCleanup(memoryManager, sessionsDir).catch(e => log.error(e, 'Daily cleanup failed'));
    setTimeout(run, msUntilMidnight());
  };
  setTimeout(run, msUntilMidnight());
}

async function main() {
  const config = loadConfig();
  log.info(`Starting yami-agent, WORK_DIR=${config.env.WORK_DIR}`);

  const platform = new WeComPlatform(config.bot);
  const agentProvider = new AcpAgentProvider();

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

  // AgentFlow Platform（可选）
  if (config.agentflow) {
    const { AgentFlowPlatform } = await import("./platform/agentflow/AgentFlowPlatform.js");
    const afPlatform = new AgentFlowPlatform({ ...config.agentflow, workDir: config.env.WORK_DIR });
    new Bridge(afPlatform, sessionManager, config);
    await afPlatform.connect();
    bridge.setAgentFlowPlatform(afPlatform);
    log.info("AgentFlow platform connected");
  }

  // 定时器：timer_tick 驱动 IntervalStrategy
  startTimerTick(sessionManager);

  // 每日清理：gzip + archive 过期删除
  const sessionsDir = join(config.env.WORK_DIR, 'sessions');
  scheduleDailyCleanup(memoryManager, sessionsDir);

  await platform.connect();
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
