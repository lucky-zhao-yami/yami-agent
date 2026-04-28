import type { ISummarizeStrategy } from './events.js';
import { TurnBasedStrategy } from './strategies/TurnBasedStrategy.js';
import { SizeBasedStrategy } from './strategies/SizeBasedStrategy.js';
import { IntervalStrategy } from './strategies/IntervalStrategy.js';

export interface SummarizeConfig {
  type: string;
  interval?: number;
  limit?: number;
  minutes?: number;
}

const DEFAULT_STRATEGIES: SummarizeConfig[] = [
  { type: 'turn', interval: 30 },
  { type: 'size', limit: 2097152 },
];

/** 从配置创建总结策略实例。不配置时使用默认值。 */
export function createStrategies(configs?: SummarizeConfig[]): ISummarizeStrategy[] {
  const list = configs ?? DEFAULT_STRATEGIES;
  return list.map(c => {
    switch (c.type) {
      case 'turn': return new TurnBasedStrategy(c.interval ?? 30);
      case 'size': return new SizeBasedStrategy(c.limit ?? 2097152);
      case 'interval': return new IntervalStrategy(c.minutes ?? 60);
      default: throw new Error(`Unknown summarize strategy: ${c.type}`);
    }
  });
}
