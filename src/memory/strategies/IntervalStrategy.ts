import type { ISummarizeStrategy, MemoryEvent, SessionMemoryState } from '../events.js';

/** 距上次总结超过 N 分钟时触发总结。 */
export class IntervalStrategy implements ISummarizeStrategy {
  readonly name = 'interval';
  private intervalMs: number;

  constructor(minutes: number) {
    this.intervalMs = minutes * 60_000;
  }

  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    if (event.type !== 'timer_tick') return null;
    return event.now - state.lastSummarizeTime >= this.intervalMs ? 'summarize' : null;
  }

  onSummarized(): void {}
}
