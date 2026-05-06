import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import type { IAgentRouter, AgentChunk, PromptContent } from '../agent/types.js';
import type { AgentSpawnOptions } from '../agent/types.js';
import type { ManagedSessionOptions } from './types.js';
import type { MemoryManager } from '../memory/MemoryManager.js';
import type { SessionMemoryState } from '../memory/events.js';
import { MessageQueue } from './MessageQueue.js';
import { getPreamble } from '../bridge/guard.js';
import { sessionRotations, sessionSummarizations } from '../observability/metrics.js';

const log = getLogger('ManagedSession');

/**
 * 单个聊天的 Agent 会话管理 — 消息排队、字节/轮数追踪、
 * 上下文注入、会话轮换和记忆总结。
 * 每个 chatId 一个实例，由 SessionManager 管理。
 */
export class ManagedSession {
  private queue: MessageQueue;
  private bytes = 0;
  private turns = 0;
  private firstMsg = true;
  private sessionDir: string;
  private lastSummarizeTime = Date.now();
  private sessionStartTime = Date.now();
  lastActive = Date.now();

  constructor(
    readonly chatId: string,
    private router: IAgentRouter,
    private opts: ManagedSessionOptions,
    private memoryManager?: MemoryManager,
  ) {
    this.queue = new MessageQueue(opts.promptTimeout);
    this.sessionDir = join(opts.workDir, 'sessions', chatId);
  }

  get alive() { return this.router.alive; }
  get sessionId() { return this.router.sessionId; }
  get workDir() { return this.opts.workDir; }

  /** 获取当前记忆状态（供事件总线和外部定时器使用）。 */
  getMemoryState(): SessionMemoryState {
    return {
      turns: this.turns,
      bytes: this.bytes,
      lastSummarizeTime: this.lastSummarizeTime,
      sessionStartTime: this.sessionStartTime,
    };
  }

  /** 获取事件总线（供外部定时器发 timer_tick）。 */
  get eventBus() { return this.opts.eventBus; }

  async switchAgent(name: string, spawnOpts: AgentSpawnOptions): Promise<void> {
    log.info(`Switching agent for ${this.chatId} to ${name}`);
    await this.router.switchAgent(name, spawnOpts);
    this.bytes = 0;
    this.turns = 0;
    this.firstMsg = false;
  }

  /** 发送消息给 Agent，串行排队。首条消息注入 preamble + 记忆摘要概要。 */
  async send(content: PromptContent[], onChunk: (chunk: AgentChunk) => Promise<void>): Promise<void> {
    try {
      await this.queue.enqueue(async () => {
        this.lastActive = Date.now();
        this.turns++;
        this.bytes += this.measureBytes(content);

        // 首条消息：强制注入 preamble + 摘要概要 + skill 提示
        const finalContent = this.firstMsg ? await this.injectContext(content) : content;
        this.firstMsg = false;

        let assistantText = '';
        for await (const chunk of this.router.handle(finalContent)) {
          if (chunk.type === 'text') {
            this.bytes += Buffer.byteLength(chunk.text, 'utf-8');
            assistantText += chunk.text;
          }
          await onChunk(chunk);
          if (chunk.type === 'done') break;
        }

        // 保存对话记录给所有 Layer
        if (this.memoryManager && assistantText) {
          const userText = finalContent.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
          await this.memoryManager.save(this.chatId, {
            user: userText, assistant: assistantText,
            timestamp: Date.now(), bytes: Buffer.byteLength(userText + assistantText, 'utf-8'),
          }).catch(e => log.error(e, 'Memory save failed'));
        }

        // 事件驱动：检查总结策略
        const action = this.opts.eventBus.check(
          { type: 'message_processed', turns: this.turns, bytes: this.bytes },
          this.getMemoryState(),
        );
        if (action === 'rotate') await this.rotate();
        else if (action === 'summarize') await this.triggerSummarize();
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'Prompt timeout' && this.router.sessionId) {
        log.info(`Cancelling agent for ${this.chatId} after timeout`);
        await this.router.cancel(this.router.sessionId).catch(e => log.error(e, 'Cancel after timeout failed'));
      }
      throw err;
    }
  }

  /** 触发记忆总结 → 创建新会话 → 重置计数器。 */
  async rotate(): Promise<void> {
    log.info(`Rotating session for ${this.chatId}, bytes=${this.bytes}, turns=${this.turns}`);
    sessionRotations.inc();
    await this.triggerSummarize();
    await this.router.createSession();
    this.bytes = 0;
    this.turns = 0;
    this.firstMsg = true;
    this.sessionStartTime = Date.now();
  }

  /** 触发记忆总结（不轮换）。 */
  async triggerSummarize(): Promise<void> {
    if (!this.memoryManager || !this.router.sessionId) return;
    sessionSummarizations.inc({ trigger: 'strategy' });
    await this.memoryManager.summarize(this.chatId, this.router.sessionId).catch(
      (e) => log.error(e, 'Summarize failed'),
    );
    this.lastSummarizeTime = Date.now();
    this.opts.eventBus.notifySummarized();
  }

  /** 保存 sessionId 到磁盘（供下次 loadSession 恢复），然后杀掉进程。 */
  async recycle(): Promise<void> {
    log.info(`Recycling session for ${this.chatId}`);
    if (this.router.sessionId) {
      await mkdir(this.sessionDir, { recursive: true });
      await writeFile(join(this.sessionDir, 'last_session_id'), this.router.sessionId, 'utf-8');
    }
    await this.router.kill();
  }

  async kill(): Promise<void> {
    await this.router.kill();
  }

  private async injectContext(content: PromptContent[]): Promise<PromptContent[]> {
    const parts: PromptContent[] = [];

    // 摘要概要（字数截断）
    if (this.memoryManager) {
      try {
        const context = await this.memoryManager.recall(this.chatId, undefined, this.opts.injectionMaxChars);
        if (context) {
          parts.push({ type: 'text', text: `<context>\n${context}\n</context>\n\n` });
        }
      } catch (e) {
        log.error(e, 'Failed to recall memory context');
      }
    }

    // Skill 提示
    parts.push({ type: 'text', text: '如需查看更多历史对话，读取 sessions/ 目录下对应 chatId 的 memory/*.md 文件。\n\n' });

    return [...parts, ...content];
  }

  private measureBytes(content: PromptContent[]): number {
    let total = 0;
    for (const c of content) {
      if (c.type === 'text') total += Buffer.byteLength(c.text, 'utf-8');
      else total += c.data.length;
    }
    return total;
  }
}
