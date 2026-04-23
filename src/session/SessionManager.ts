import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import type { AppConfig } from '../config.js';
import { getChatConfig } from '../config.js';
import type { IAgentProvider } from '../agent/types.js';
import type { MemoryManager } from '../memory/MemoryManager.js';
import { SingleAgentRouter } from '../agent/SingleAgentRouter.js';
import { ManagedSession } from './ManagedSession.js';

const log = getLogger('SessionManager');
const CLEANUP_INTERVAL = 60_000;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private agentProvider: IAgentProvider,
    private config: AppConfig,
    private memoryManager?: MemoryManager,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), CLEANUP_INTERVAL);
  }

  async getOrCreate(chatId: string): Promise<ManagedSession> {
    if (/[\/\\]|\.\./.test(chatId)) throw new Error(`Invalid chatId: ${chatId}`);

    const existing = this.sessions.get(chatId);
    if (existing?.alive) return existing;

    if (this.sessions.size >= this.config.env.MAX_PROCS) await this.evictLRU();

    const chatConfig = getChatConfig(this.config, chatId);
    const spawnOpts = {
      command: chatConfig.agent.command,
      args: chatConfig.agent.args,
      cwd: this.config.env.WORK_DIR,
      env: chatConfig.agent.env,
    };

    log.info(`Spawning agent for ${chatId}`);
    const proc = await this.agentProvider.spawn(spawnOpts);
    const router = new SingleAgentRouter(proc, this.agentProvider, spawnOpts);

    try {
      const lastSessionId = await this.readLastSessionId(chatId);
      if (lastSessionId) {
        try {
          await router.loadSession(lastSessionId);
          log.info(`Restored session ${lastSessionId} for ${chatId}`);
        } catch {
          log.info(`loadSession failed for ${chatId}, creating new session`);
          await router.createSession();
        }
      } else {
        await router.createSession();
      }
    } catch (e) {
      await router.kill().catch(() => {});
      throw e;
    }

    const session = new ManagedSession(chatId, router, {
      chatId,
      agentConfig: chatConfig.agent,
      mode: chatConfig.mode,
      workDir: this.config.env.WORK_DIR,
      sessionSizeLimit: this.config.env.SESSION_SIZE_LIMIT,
      promptTimeout: this.config.env.PROMPT_TIMEOUT,
      memorySummaryInterval: this.config.env.MEMORY_SUMMARY_INTERVAL,
    }, this.memoryManager);

    this.sessions.set(chatId, session);
    return session;
  }

  private async evictLRU(): Promise<void> {
    let oldest: { chatId: string; lastActive: number } | null = null;
    for (const [chatId, s] of this.sessions) {
      if (!oldest || s.lastActive < oldest.lastActive) oldest = { chatId, lastActive: s.lastActive };
    }
    if (oldest) {
      log.info(`Evicting LRU session: ${oldest.chatId}`);
      const s = this.sessions.get(oldest.chatId)!;
      await s.recycle().catch((e) => log.error(e, 'Evict recycle failed'));
      this.sessions.delete(oldest.chatId);
    }
  }

  private async cleanupIdle(): Promise<void> {
    const now = Date.now();
    const idleMs = this.config.env.IDLE_TIMEOUT * 1000;
    for (const [chatId, s] of this.sessions) {
      if (now - s.lastActive > idleMs) {
        log.info(`Idle cleanup: ${chatId}`);
        await s.recycle().catch((e) => log.error(e, 'Idle recycle failed'));
        this.sessions.delete(chatId);
      }
    }
  }

  private async readLastSessionId(chatId: string): Promise<string | null> {
    try {
      const p = join(this.config.env.WORK_DIR, 'sessions', chatId, 'last_session_id');
      return (await readFile(p, 'utf-8')).trim();
    } catch {
      return null;
    }
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    const tasks = [...this.sessions.entries()].map(async ([chatId, s]) => {
      log.info(`Shutting down session: ${chatId}`);
      await s.recycle().catch((e) => log.error(e, 'Shutdown recycle failed'));
    });
    await Promise.all(tasks);
    this.sessions.clear();
  }
}
