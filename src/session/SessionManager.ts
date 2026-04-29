import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import type { AppConfig } from '../config.js';
import { getChatConfig } from '../config.js';
import type { IAgentProvider } from '../agent/types.js';
import type { MemoryManager } from '../memory/MemoryManager.js';
import { MemoryEventBus } from '../memory/events.js';
import { createStrategies } from '../memory/strategyFactory.js';
import { SingleAgentRouter } from '../agent/SingleAgentRouter.js';
import { ManagedSession } from './ManagedSession.js';
import { sessionsActive, sessionsWarmPool, agentSpawns, agentKills } from '../observability/metrics.js';

const log = getLogger('SessionManager');
const CLEANUP_INTERVAL = 60_000;

/**
 * Agent 进程池 — 按 chatId 管理 ManagedSession 实例。
 * 负责 LRU 淘汰（MAX_PROCS）、空闲清理（IDLE_TIMEOUT）、
 * 预热池和通过 loadSession 恢复会话。
 */
export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private pending = new Map<string, Promise<ManagedSession>>();
  private warmPool: { proc: import('../agent/types.js').IAgentProcess; command: string; args: string[] }[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private agentProvider: IAgentProvider,
    private config: AppConfig,
    private memoryManager?: MemoryManager,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanupIdle(), CLEANUP_INTERVAL);
  }

  /** 预热 N 个空闲 Agent 进程，加速冷启动。 */
  async warmUp(count: number): Promise<void> {
    if (count <= 0) return;
    log.info(`Pre-warming ${count} agent processes`);
    const chatConfig = getChatConfig(this.config, '__warmup__');
    for (let i = 0; i < count; i++) {
      try {
        const proc = await this.agentProvider.spawn({
          command: chatConfig.agent.command,
          args: chatConfig.agent.args,
          cwd: this.config.env.WORK_DIR,
          env: chatConfig.agent.env,
        });
        this.warmPool.push({ proc, command: chatConfig.agent.command, args: chatConfig.agent.args });
      } catch (e) {
        log.error(e, `Warm-up ${i} failed`);
      }
    }
    log.info(`Warm pool: ${this.warmPool.length} processes ready`);
    sessionsWarmPool.set(this.warmPool.length);
  }

  /** 获取已有会话或创建新的。处理 LRU 淘汰和会话恢复。 */
  async getOrCreate(chatId: string): Promise<ManagedSession> {
    if (/[/\\]|\.\./.test(chatId)) throw new Error(`Invalid chatId: ${chatId}`);

    const existing = this.sessions.get(chatId);
    if (existing?.alive) return existing;

    // Prevent concurrent creation for same chatId
    if (this.pending.has(chatId)) return this.pending.get(chatId)!;

    const p = this.doCreate(chatId);
    this.pending.set(chatId, p);
    try {
      return await p;
    } finally {
      this.pending.delete(chatId);
    }
  }

  private async doCreate(chatId: string): Promise<ManagedSession> {

    if (this.sessions.size >= this.config.env.MAX_PROCS) await this.evictLRU();

    const chatConfig = getChatConfig(this.config, chatId);
    const spawnOpts = {
      command: chatConfig.agent.command,
      args: chatConfig.agent.args,
      cwd: this.config.env.WORK_DIR,
      env: chatConfig.agent.env,
    };

    log.info(`Spawning agent for ${chatId}`);
    const warmProc = this.takeMatchingWarmProc(spawnOpts.command, spawnOpts.args);
    const proc = warmProc ?? await this.agentProvider.spawn(spawnOpts);
    agentSpawns.inc({ reason: warmProc ? 'warm' : 'new' });
    if (warmProc) sessionsWarmPool.dec();
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

    const eventBus = new MemoryEventBus(createStrategies(this.config.bot.memory.summarize));
    const session = new ManagedSession(chatId, router, {
      chatId,
      agentConfig: chatConfig.agent,
      mode: chatConfig.mode,
      workDir: this.config.env.WORK_DIR,
      promptTimeout: this.config.env.PROMPT_TIMEOUT,
      injectionMaxChars: this.config.bot.memory.injectionMaxChars,
      eventBus,
    }, this.memoryManager);

    this.sessions.set(chatId, session);
    sessionsActive.set(this.sessions.size);
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
      sessionsActive.set(this.sessions.size);
      agentKills.inc({ reason: 'lru' });
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
        sessionsActive.set(this.sessions.size);
        agentKills.inc({ reason: 'idle' });
      }
    }
  }

  private async readLastSessionId(chatId: string): Promise<string | null> {
    try {
      const p = join(this.config.env.WORK_DIR, 'sessions', chatId, 'last_session_id');
      return (await readFile(p, 'utf-8')).trim();
    } catch { /* file not found — first time for this chat */
      return null;
    }
  }

  private takeMatchingWarmProc(command: string, args: string[]): import('../agent/types.js').IAgentProcess | null {
    const idx = this.warmPool.findIndex(w => w.command === command && w.args.join(' ') === args.join(' '));
    if (idx === -1) return null;
    const { proc } = this.warmPool.splice(idx, 1)[0];
    return proc.alive ? proc : null;
  }

  getActiveChatIds(): string[] {
    return [...this.sessions.keys()];
  }

  getSessionId(chatId: string): string | null {
    return this.sessions.get(chatId)?.sessionId ?? null;
  }

  getSession(chatId: string): ManagedSession | undefined {
    return this.sessions.get(chatId);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    // Kill warm pool processes
    for (const w of this.warmPool) await w.proc.kill().catch(() => {});
    this.warmPool = [];
    const tasks = [...this.sessions.entries()].map(async ([chatId, s]) => {
      log.info(`Shutting down session: ${chatId}`);
      await s.recycle().catch((e) => log.error(e, 'Shutdown recycle failed'));
    });
    await Promise.all(tasks);
    this.sessions.clear();
  }
}
