import { describe, it, expect } from 'vitest';
import { generateReqId, AsyncQueue } from '../utils.js';

describe('generateReqId', () => {
  it('returns 16 char hex string', () => {
    const id = generateReqId();
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateReqId()));
    expect(ids.size).toBe(100);
  });
});

describe('AsyncQueue', () => {
  it('push and iterate', async () => {
    const q = new AsyncQueue<number>();
    q.push(1);
    q.push(2);
    q.close();
    const items: number[] = [];
    for await (const v of q) items.push(v);
    expect(items).toEqual([1, 2]);
  });

  it('waits for push', async () => {
    const q = new AsyncQueue<string>();
    const p = (async () => {
      const items: string[] = [];
      for await (const v of q) items.push(v);
      return items;
    })();
    q.push('a');
    q.push('b');
    q.close();
    expect(await p).toEqual(['a', 'b']);
  });

  it('close ends iteration', async () => {
    const q = new AsyncQueue<number>();
    q.close();
    const items: number[] = [];
    for await (const v of q) items.push(v);
    expect(items).toEqual([]);
  });

  it('push after close is ignored', async () => {
    const q = new AsyncQueue<number>();
    q.push(1);
    q.close();
    q.push(2); // should be ignored
    const items: number[] = [];
    for await (const v of q) items.push(v);
    expect(items).toEqual([1]);
  });
});
