import { describe, it, expect } from 'vitest';
import { MessageQueue } from '../MessageQueue.js';

describe('MessageQueue', () => {
  it('executes tasks serially', async () => {
    const queue = new MessageQueue(10);
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      await sleep(50);
      order.push(1);
      return 'a';
    });
    const p2 = queue.enqueue(async () => {
      order.push(2);
      return 'b';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(order).toEqual([1, 2]); // task 2 waits for task 1
  });

  it('rejects with timeout error', async () => {
    const queue = new MessageQueue(0.05); // 50ms timeout

    await expect(queue.enqueue(() => sleep(200))).rejects.toThrow('Prompt timeout');
  });

  it('continues processing after a failed task', async () => {
    const queue = new MessageQueue(10);

    const p1 = queue.enqueue(async () => { throw new Error('fail'); });
    const p2 = queue.enqueue(async () => 'ok');

    await expect(p1).rejects.toThrow('fail');
    expect(await p2).toBe('ok');
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
