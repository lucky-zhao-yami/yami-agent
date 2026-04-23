import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import type { IAgentRouter, AgentChunk, PromptContent } from '../agent/types.js';
import type { AgentSpawnOptions } from '../agent/types.js';
import type { ManagedSessionOptions } from './types.js';
import type { MemoryManager } from '../memory/MemoryManager.js';
import { MessageQueue } from './MessageQueue.js';
import { getPreamble } from '../bridge/guard.js';

const log = getLogger('ManagedSession');

export class ManagedSession {
  private queue: MessageQueue;
  private bytes = 0;
  private turns = 0;
  private firstMsg = true;
  private sessionDir: string;
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

  async switchAgent(name: string, spawnOpts: AgentSpawnOptions): Promise<void> {
    log.info(`Switching agent for ${this.chatId} to ${name}`);
    await this.router.switchAgent(name, spawnOpts);
    this.bytes = 0;
    this.turns = 0;
    this.firstMsg = false; // /agent: don't inject history on clean switch
  }

  async send(content: PromptContent[], onChunk: (chunk: AgentChunk) => Promise<void>): Promise<void> {
    await this.queue.enqueue(async () => {
      this.lastActive = Date.now();
      this.turns++;
      this.bytes += this.measureBytes(content);

      // Task 3.5: inject memory context on first message
      const finalContent = this.firstMsg ? await this.injectContext(content) : content;
      this.firstMsg = false;

      for await (const chunk of this.router.handle(finalContent)) {
        if (chunk.type === 'text') this.bytes += Buffer.byteLength(chunk.text, 'utf-8');
        await onChunk(chunk);
        if (chunk.type === 'done') break;
      }

      // Task 3.4: turn-based summarize
      if (this.shouldSummarize()) await this.triggerSummarize();
      // Size-based rotation
      if (this.bytes >= this.opts.sessionSizeLimit) await this.rotate();
    });
  }

  async rotate(): Promise<void> {
    log.info(`Rotating session for ${this.chatId}, bytes=${this.bytes}, turns=${this.turns}`);
    await this.triggerSummarize();
    await this.router.createSession();
    this.bytes = 0;
    this.turns = 0;
    this.firstMsg = true;
  }

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

  private shouldSummarize(): boolean {
    return this.opts.memorySummaryInterval > 0 &&
      this.turns > 0 &&
      this.turns % this.opts.memorySummaryInterval === 0;
  }

  private async triggerSummarize(): Promise<void> {
    if (!this.memoryManager || !this.router.sessionId) return;
    await this.memoryManager.summarize(this.chatId, this.router.sessionId).catch(
      (e) => log.error(e, 'Summarize failed'),
    );
  }

  private async injectContext(content: PromptContent[]): Promise<PromptContent[]> {
    const parts: PromptContent[] = [];

    // FR-9: inject safety preamble on first message
    parts.push({ type: 'text', text: getPreamble(this.opts.mode) });

    // Inject memory context
    if (this.memoryManager) {
      try {
        const context = await this.memoryManager.recall(this.chatId);
        if (context) {
          parts.push({ type: 'text', text: `<context>\n${context}\n</context>\n\n以上是之前对话的历史摘要，请参考。\n\n` });
        }
      } catch (e) {
        log.error(e, 'Failed to recall memory context');
      }
    }

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
