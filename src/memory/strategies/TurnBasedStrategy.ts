import type { ISummarizeStrategy, MemoryEvent, SessionMemoryState } from '../events.js';

/** 每 N 轮触发一次总结。 */
export class TurnBasedStrategy implements ISummarizeStrategy {
  readonly name = 'turn';
  constructor(private interval: number) {}

  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    if (event.type !== 'message_processed') return null;
    return state.turns > 0 && state.turns % this.interval === 0 ? 'summarize' : null;
  }

  onSummarized(): void {}
}
