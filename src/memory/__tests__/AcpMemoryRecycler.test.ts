import { describe, it, expect, vi } from 'vitest';
import { AcpMemoryRecycler } from '../AcpMemoryRecycler.js';
import type { IAgentProvider, IAgentProcess } from '../../agent/types.js';

function mockProvider(summaryText = 'test summary'): IAgentProvider {
  const kill = vi.fn(async () => {});
  const proc = {
    sessionId: null,
    alive: true,
    initialize: vi.fn(),
    createSession: vi.fn(async () => 'tmp-sess'),
    loadSession: vi.fn(),
    async *prompt() {
      if (summaryText) yield { type: 'text' as const, text: summaryText };
      yield { type: 'done' as const, stopReason: 'end' };
    },
    cancel: vi.fn(),
    kill,
  } as unknown as IAgentProcess;
  return { spawn: vi.fn(async () => proc), _proc: proc, _kill: kill } as any;
}

describe('AcpMemoryRecycler', () => {
  it('summarize spawns temp process and returns summary', async () => {
    const provider = mockProvider('the summary');
    const recycler = new AcpMemoryRecycler(provider, { command: 'echo', args: [], cwd: '/tmp' });
    const result = await recycler.summarize('chat1', 'session-123');
    expect(result).toBe('the summary');
    expect(provider.spawn).toHaveBeenCalled();
  });

  it('summarize kills temp process after use', async () => {
    const provider = mockProvider();
    const recycler = new AcpMemoryRecycler(provider, { command: 'echo', args: [], cwd: '/tmp' });
    await recycler.summarize('chat1', 'session-123');
    expect((provider as any)._kill).toHaveBeenCalled();
  });

  it('summarize returns fallback on error', async () => {
    const provider: IAgentProvider = {
      spawn: vi.fn(async () => { throw new Error('spawn failed'); }),
    } as unknown as IAgentProvider;
    const recycler = new AcpMemoryRecycler(provider, { command: 'echo', args: [], cwd: '/tmp' });
    const result = await recycler.summarize('chat1', 'session-123');
    // spawn 失败会被外层 catch 捕获，返回失败提示
    expect(result).toMatch(/失败|摘要/);
  });

  it('summarize returns fallback on empty response', async () => {
    const provider = mockProvider('');
    const recycler = new AcpMemoryRecycler(provider, { command: 'echo', args: [], cwd: '/tmp' });
    const result = await recycler.summarize('chat1', 'session-123');
    expect(result).toContain('无法生成');
  });
});
