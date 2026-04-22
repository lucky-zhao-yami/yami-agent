import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pino from 'pino';
import type { IAgentRouter, AgentChunk, PromptContent } from '../agent/types.js';
import type { ManagedSessionOptions } from './types.js';
import { MessageQueue } from './MessageQueue.js';

const log = pino({ name: 'ManagedSession' });

export class ManagedSession {
  private queue: MessageQueue;
  private bytes = 0;
  private turns = 0;
  private sessionDir: string;
  lastActive = Date.now();

  constructor(
    readonly chatId: string,
    private router: IAgentRouter,
    private opts: ManagedSessionOptions,
    private memoryManager?: { summarize(chatId: string, sessionId: string): Promise<void> },
  ) {
    this.queue = new MessageQueue(opts.promptTimeout);
    this.sessionDir = join(opts.workDir, 'sessions', chatId);
  }

  get alive() { return this.router.alive; }
  get sessionId() { return this.router.sessionId; }

  async send(content: PromptContent[], onChunk: (chunk: AgentChunk) => Promise<void>): Promise<void> {
    await this.queue.enqueue(async () => {
      this.lastActive = Date.now();
      this.turns++;
      this.bytes += this.measureBytes(content);

      for await (const chunk of this.router.handle(content)) {
        if (chunk.type === 'text') this.bytes += Buffer.byteLength(chunk.text, 'utf-8');
        await onChunk(chunk);
        if (chunk.type === 'done') break;
      }

      if (this.bytes >= this.opts.sessionSizeLimit) await this.rotate();
    });
  }

  async rotate(): Promise<void> {
    log.info(`Rotating session for ${this.chatId}, bytes=${this.bytes}, turns=${this.turns}`);
    if (this.memoryManager && this.router.sessionId) {
      await this.memoryManager.summarize(this.chatId, this.router.sessionId).catch(
        (e) => log.error(e, 'Summarize failed during rotate'),
      );
    }
    await this.router.createSession();
    this.bytes = 0;
    this.turns = 0;
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

  private measureBytes(content: PromptContent[]): number {
    let total = 0;
    for (const c of content) {
      if (c.type === 'text') total += Buffer.byteLength(c.text, 'utf-8');
      else total += c.data.length; // base64 image
    }
    return total;
  }
}
