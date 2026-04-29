import { describe, it, expect, vi } from 'vitest';
import { SingleAgentRouter } from '../SingleAgentRouter.js';
import type { IAgentProcess, IAgentProvider, AgentSpawnOptions } from '../types.js';

function mockProcess(sessionId = 'sess-1'): IAgentProcess {
  return {
    sessionId,
    alive: true,
    initialize: vi.fn(),
    createSession: vi.fn(async () => 'new-sess'),
    loadSession: vi.fn(),
    prompt: vi.fn(async function* () {
      yield { type: 'text' as const, text: 'hello' };
      yield { type: 'done' as const, stopReason: 'end' };
    }),
    cancel: vi.fn(),
    kill: vi.fn(),
  } as unknown as IAgentProcess;
}

function mockProvider(proc?: IAgentProcess): IAgentProvider {
  return {
    spawn: vi.fn(async () => proc ?? mockProcess('spawned-sess')),
  } as unknown as IAgentProvider;
}

const defaultOpts: AgentSpawnOptions = { command: 'echo', args: [], cwd: '/tmp' };

describe('SingleAgentRouter', () => {
  it('handle yields chunks from process.prompt', async () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    const chunks = [];
    for await (const c of router.handle([{ type: 'text', text: 'hi' }])) {
      chunks.push(c);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'text', text: 'hello' });
    expect(chunks[1]).toEqual({ type: 'done', stopReason: 'end' });
  });

  it('sessionId delegates to process', () => {
    const proc = mockProcess('my-sess');
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    expect(router.sessionId).toBe('my-sess');
  });

  it('alive delegates to process', () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    expect(router.alive).toBe(true);
  });

  it('createSession delegates to process', async () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    const sid = await router.createSession();
    expect(sid).toBe('new-sess');
    expect(proc.createSession).toHaveBeenCalledWith('/tmp');
  });

  it('loadSession delegates to process', async () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    await router.loadSession('old-sess');
    expect(proc.loadSession).toHaveBeenCalledWith('old-sess');
  });

  it('cancel delegates to process', async () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    await router.cancel('sess-1');
    expect(proc.cancel).toHaveBeenCalledWith('sess-1');
  });

  it('kill delegates to process', async () => {
    const proc = mockProcess();
    const router = new SingleAgentRouter(proc, mockProvider(), defaultOpts);
    await router.kill();
    expect(proc.kill).toHaveBeenCalled();
  });

  it('switchAgent kills old process and spawns new', async () => {
    const oldProc = mockProcess();
    const newProc = mockProcess('new-proc-sess');
    const provider = mockProvider(newProc);
    const router = new SingleAgentRouter(oldProc, provider, defaultOpts);

    await router.switchAgent('new-agent', { command: 'new-cmd', args: ['--flag'], cwd: '/work' });

    expect(oldProc.kill).toHaveBeenCalled();
    expect(provider.spawn).toHaveBeenCalledWith({ command: 'new-cmd', args: ['--flag'], cwd: '/work' });
    expect(newProc.createSession).toHaveBeenCalled();
    expect(router.sessionId).toBe('new-proc-sess');
  });
});
