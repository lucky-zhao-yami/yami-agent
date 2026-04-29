import { describe, it, expect, vi } from 'vitest';
import { MemoryManager } from '../MemoryManager.js';
import type { IMemoryLayer, HistoryEntry, IMemoryRecycler } from '../types.js';

function mockLayer(name: string, recallResult = ''): IMemoryLayer {
  return {
    name,
    save: vi.fn(async () => {}),
    recall: vi.fn(async () => recallResult),
    onSummary: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
  } as unknown as IMemoryLayer;
}

function mockRecycler(result = 'summary text'): IMemoryRecycler {
  return { summarize: vi.fn(async () => result) } as unknown as IMemoryRecycler;
}

describe('MemoryManager', () => {
  it('recall merges results from all layers', async () => {
    const l1 = mockLayer('a', 'context A');
    const l2 = mockLayer('b', 'context B');
    const mm = new MemoryManager([l1, l2], mockRecycler());
    const result = await mm.recall('chat1');
    expect(result).toBe('context A\n\ncontext B');
  });

  it('recall skips empty layer results', async () => {
    const l1 = mockLayer('a', 'context A');
    const l2 = mockLayer('b', '');
    const mm = new MemoryManager([l1, l2], mockRecycler());
    const result = await mm.recall('chat1');
    expect(result).toBe('context A');
  });

  it('recall passes maxChars to layers', async () => {
    const l1 = mockLayer('a');
    const mm = new MemoryManager([l1], mockRecycler());
    await mm.recall('chat1', 'query', 500);
    expect(l1.recall).toHaveBeenCalledWith('chat1', 'query', 500);
  });

  it('recall handles layer error gracefully', async () => {
    const l1 = mockLayer('a');
    (l1.recall as any).mockRejectedValue(new Error('fail'));
    const mm = new MemoryManager([l1], mockRecycler());
    const result = await mm.recall('chat1');
    expect(result).toBe('');
  });

  it('save broadcasts to all layers', async () => {
    const l1 = mockLayer('a');
    const l2 = mockLayer('b');
    const mm = new MemoryManager([l1, l2], mockRecycler());
    const entry: HistoryEntry = { user: 'hi', assistant: 'hello', timestamp: 1, bytes: 10 };
    await mm.save('chat1', entry);
    expect(l1.save).toHaveBeenCalledWith('chat1', entry);
    expect(l2.save).toHaveBeenCalledWith('chat1', entry);
  });

  it('summarize calls recycler then broadcasts onSummary', async () => {
    const l1 = mockLayer('a');
    const recycler = mockRecycler('the summary');
    const mm = new MemoryManager([l1], recycler);
    await mm.summarize('chat1', 'session-123');
    expect(recycler.summarize).toHaveBeenCalledWith('chat1', 'session-123');
    expect(l1.onSummary).toHaveBeenCalled();
    const call = (l1.onSummary as any).mock.calls[0];
    expect(call[0]).toBe('chat1');
    expect(call[2]).toBe('the summary');
  });

  it('summarize handles recycler error gracefully', async () => {
    const recycler = mockRecycler();
    (recycler.summarize as any).mockRejectedValue(new Error('fail'));
    const mm = new MemoryManager([], recycler);
    // Should not throw
    await mm.summarize('chat1', 'session-123');
  });

  it('cleanup broadcasts to all layers', async () => {
    const l1 = mockLayer('a');
    const l2 = mockLayer('b');
    const mm = new MemoryManager([l1, l2], mockRecycler());
    await mm.cleanup('chat1');
    expect(l1.cleanup).toHaveBeenCalledWith('chat1');
    expect(l2.cleanup).toHaveBeenCalledWith('chat1');
  });

  it('concurrent summarize for same chatId is serialized', async () => {
    const order: number[] = [];
    const recycler: IMemoryRecycler = {
      summarize: vi.fn(async () => {
        order.push(1);
        await new Promise(r => setTimeout(r, 50));
        order.push(2);
        return 'summary';
      }),
    } as unknown as IMemoryRecycler;
    const mm = new MemoryManager([mockLayer('a')], recycler);
    await Promise.all([mm.summarize('chat1', 's1'), mm.summarize('chat1', 's2')]);
    // Second call should wait for first to finish
    expect(order).toEqual([1, 2, 1, 2]);
  });
});
