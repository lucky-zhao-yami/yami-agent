/** 记忆系统事件 — 任何组件都可以发出。 */
export type MemoryEvent =
  | { type: 'message_processed'; turns: number; bytes: number }
  | { type: 'timer_tick'; now: number }
  | { type: 'session_idle_recycle' };

/** Strategy 做决策时需要的 session 状态（只读）。 */
export interface SessionMemoryState {
  turns: number;
  bytes: number;
  lastSummarizeTime: number;
  sessionStartTime: number;
}

/** 总结触发策略 — 纯决策，无副作用。 */
export interface ISummarizeStrategy {
  readonly name: string;
  /**
   * 收到事件后决策。
   * 返回 'summarize'（触发总结）、'rotate'（总结+新session）、null（不触发）。
   */
  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null;
  /** 总结完成后调用，可重置内部计数。 */
  onSummarized(): void;
}

/**
 * 记忆事件总线 — 连接事件源和总结策略。
 * 按顺序检查所有策略，第一个返回非 null 的结果生效。
 */
export class MemoryEventBus {
  constructor(private strategies: ISummarizeStrategy[]) {}

  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    for (const s of this.strategies) {
      const result = s.check(event, state);
      if (result) return result;
    }
    return null;
  }

  notifySummarized(): void {
    for (const s of this.strategies) s.onSummarized();
  }
}
