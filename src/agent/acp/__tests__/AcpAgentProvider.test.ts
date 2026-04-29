import { describe, it, expect, vi } from 'vitest';

vi.mock('../AcpAgentProcess.js', () => {
  return {
    AcpAgentProcess: class {
      initialize = vi.fn(async () => {});
      sessionId = null;
      alive = true;
    },
  };
});

import { AcpAgentProvider } from '../AcpAgentProvider.js';

describe('AcpAgentProvider', () => {
  it('spawn creates and initializes a process', async () => {
    const provider = new AcpAgentProvider();
    const proc = await provider.spawn({ command: 'echo', args: [], cwd: '/tmp' });
    expect(proc).toBeDefined();
    expect(proc.initialize).toHaveBeenCalled();
    expect(proc.alive).toBe(true);
  });
});
