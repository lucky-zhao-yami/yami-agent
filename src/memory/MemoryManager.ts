import { getLogger } from '../logger.js';
import type { IMemoryLayer, IMemoryRecycler, HistoryEntry } from './types.js';

const log = getLogger('MemoryManager');

/**
 * Orchestrates multiple IMemoryLayer instances and the IMemoryRecycler.
 * - recall(): merges context from all layers for prompt injection
 * - save(): broadcasts conversation turns to all layers
 * - summarize(): triggers recycler → broadcasts summary to all layers (per-chatId locked)
 * - cleanup(): delegates old data cleanup to all layers
 */
export class MemoryManager {
  private summarizeLocks = new Map<string, Promise<void>>();

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
    // Per-chatId lock to prevent concurrent summarization
    const prev = this.summarizeLocks.get(chatId) ?? Promise.resolve();
    const current = prev.then(async () => {
      log.info(`Summarizing ${chatId} session=${sessionId}`);
      const summary = await this.recycler.summarize(chatId, sessionId);
      const today = new Date().toLocaleDateString('sv-SE');
      await Promise.all(this.layers.map(l =>
        l.onSummary(chatId, today, summary).catch(e => log.error(e, `onSummary failed for layer ${l.name}`)),
      ));
    }).catch(e => log.error(e, `summarize failed for ${chatId}`))
      .finally(() => this.summarizeLocks.delete(chatId));
    this.summarizeLocks.set(chatId, current);
    return current;
  }

  async cleanup(chatId: string): Promise<void> {
    await Promise.all(this.layers.map(l =>
      l.cleanup(chatId).catch(e => log.error(e, `cleanup failed for layer ${l.name}`)),
    ));
  }
}
