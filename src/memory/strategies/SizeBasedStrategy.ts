import type { ISummarizeStrategy, MemoryEvent, SessionMemoryState } from '../events.js';

/** 字节数超限时触发总结 + 轮换。 */
export class SizeBasedStrategy implements ISummarizeStrategy {
  readonly name = 'size';
  constructor(private limit: number) {}

  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    if (event.type !== 'message_processed') return null;
    return state.bytes >= this.limit ? 'rotate' : null;
  }

  onSummarized(): void {}
}
