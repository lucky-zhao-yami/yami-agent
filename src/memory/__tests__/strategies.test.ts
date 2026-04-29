import { describe, it, expect } from 'vitest';
import { MemoryEventBus, type SessionMemoryState } from '../events.js';
import { TurnBasedStrategy } from '../strategies/TurnBasedStrategy.js';
import { SizeBasedStrategy } from '../strategies/SizeBasedStrategy.js';
import { IntervalStrategy } from '../strategies/IntervalStrategy.js';
import { createStrategies } from '../strategyFactory.js';

const baseState: SessionMemoryState = {
  turns: 0, bytes: 0, lastSummarizeTime: Date.now(), sessionStartTime: Date.now(),
};

describe('TurnBasedStrategy', () => {
  it('triggers summarize at interval', () => {
    const s = new TurnBasedStrategy(10);
    expect(s.check({ type: 'message_processed', turns: 10, bytes: 0 }, { ...baseState, turns: 10 })).toBe('summarize');
    expect(s.check({ type: 'message_processed', turns: 5, bytes: 0 }, { ...baseState, turns: 5 })).toBeNull();
  });

  it('ignores non-message events', () => {
    const s = new TurnBasedStrategy(10);
    expect(s.check({ type: 'timer_tick', now: Date.now() }, { ...baseState, turns: 10 })).toBeNull();
  });
});

describe('SizeBasedStrategy', () => {
  it('triggers rotate when bytes exceed limit', () => {
    const s = new SizeBasedStrategy(1000);
    expect(s.check({ type: 'message_processed', turns: 1, bytes: 1200 }, { ...baseState, bytes: 1200 })).toBe('rotate');
    expect(s.check({ type: 'message_processed', turns: 1, bytes: 500 }, { ...baseState, bytes: 500 })).toBeNull();
  });
});

describe('IntervalStrategy', () => {
  it('triggers summarize when interval elapsed', () => {
    const s = new IntervalStrategy(60); // 60 minutes
    const old = Date.now() - 61 * 60_000;
    expect(s.check({ type: 'timer_tick', now: Date.now() }, { ...baseState, lastSummarizeTime: old })).toBe('summarize');
  });

  it('does not trigger when interval not elapsed', () => {
    const s = new IntervalStrategy(60);
    expect(s.check({ type: 'timer_tick', now: Date.now() }, { ...baseState, lastSummarizeTime: Date.now() })).toBeNull();
  });

  it('ignores non-timer events', () => {
    const s = new IntervalStrategy(60);
    const old = Date.now() - 120 * 60_000;
    expect(s.check({ type: 'message_processed', turns: 1, bytes: 0 }, { ...baseState, lastSummarizeTime: old })).toBeNull();
  });
});

describe('MemoryEventBus', () => {
  it('returns first matching strategy result', () => {
    const bus = new MemoryEventBus([new TurnBasedStrategy(10), new SizeBasedStrategy(1000)]);
    // TurnBased matches first
    expect(bus.check(
      { type: 'message_processed', turns: 10, bytes: 500 },
      { ...baseState, turns: 10, bytes: 500 },
    )).toBe('summarize');
  });

  it('returns null when no strategy matches', () => {
    const bus = new MemoryEventBus([new TurnBasedStrategy(10)]);
    expect(bus.check(
      { type: 'message_processed', turns: 5, bytes: 0 },
      { ...baseState, turns: 5 },
    )).toBeNull();
  });

  it('notifySummarized calls all strategies', () => {
    const s1 = new TurnBasedStrategy(10);
    const s2 = new SizeBasedStrategy(1000);
    const bus = new MemoryEventBus([s1, s2]);
    // Should not throw
    bus.notifySummarized();
  });
});

describe('createStrategies', () => {
  it('creates strategies from config', () => {
    const strategies = createStrategies([
      { type: 'turn', interval: 20 },
      { type: 'size', limit: 5000 },
      { type: 'interval', minutes: 30 },
    ]);
    expect(strategies).toHaveLength(3);
    expect(strategies[0].name).toBe('turn');
    expect(strategies[1].name).toBe('size');
    expect(strategies[2].name).toBe('interval');
  });

  it('uses defaults when no config', () => {
    const strategies = createStrategies();
    expect(strategies).toHaveLength(2);
    expect(strategies[0].name).toBe('turn');
    expect(strategies[1].name).toBe('size');
  });

  it('throws on unknown type', () => {
    expect(() => createStrategies([{ type: 'unknown' }])).toThrow('Unknown summarize strategy');
  });
});
