import pino from 'pino';
import type { IMemoryLayer, IMemoryRecycler, HistoryEntry } from './types.js';

const log = pino({ name: 'MemoryManager' });

export class MemoryManager {
  constructor(
    private layers: IMemoryLayer[],
    private recycler: IMemoryRecycler,
  ) {}

  async recall(chatId: string, query?: string): Promise<string> {
    const parts: string[] = [];
    for (const layer of this.layers) {
      try {
        const ctx = await layer.recall(chatId, query);
        if (ctx) parts.push(ctx);
      } catch (e) {
        log.error(e, `recall failed for layer ${layer.name}`);
      }
    }
    return parts.join('\n\n');
  }

  async save(chatId: string, entry: HistoryEntry): Promise<void> {
    await Promise.all(this.layers.map(l =>
      l.save(chatId, entry).catch(e => log.error(e, `save failed for layer ${l.name}`)),
    ));
  }

  async summarize(chatId: string, sessionId: string): Promise<void> {
    log.info(`Summarizing ${chatId} session=${sessionId}`);
    const summary = await this.recycler.summarize(chatId, sessionId);
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(this.layers.map(l =>
      l.onSummary(chatId, today, summary).catch(e => log.error(e, `onSummary failed for layer ${l.name}`)),
    ));
  }

  async cleanup(chatId: string): Promise<void> {
    await Promise.all(this.layers.map(l =>
      l.cleanup(chatId).catch(e => log.error(e, `cleanup failed for layer ${l.name}`)),
    ));
  }
}
