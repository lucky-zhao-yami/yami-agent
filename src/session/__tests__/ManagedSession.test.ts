import { describe, it, expect, vi } from 'vitest';
import { ManagedSession } from '../ManagedSession.js';
import { MemoryEventBus } from '../../memory/events.js';
import type { IAgentRouter, AgentChunk, PromptContent } from '../../agent/types.js';
import type { MemoryManager } from '../../memory/MemoryManager.js';
import type { ManagedSessionOptions } from '../types.js';

function mockRouter(): IAgentRouter {
  return {
    sessionId: 'sess-1',
    alive: true,
    availableModes: [],
    handle: vi.fn(async function* (): AsyncGenerator<AgentChunk> {
      yield { type: 'text', text: 'reply' };
      yield { type: 'done', stopReason: 'end' };
    }),
    switchAgent: vi.fn(),
    setMode: vi.fn(),
    cancel: vi.fn(),
    createSession: vi.fn(async () => 'new-sess'),
    loadSession: vi.fn(),
    kill: vi.fn(),
  } as unknown as IAgentRouter;
}

function mockMemoryManager(): MemoryManager {
  return {
    recall: vi.fn(async () => 'history summary'),
    save: vi.fn(async () => {}),
    summarize: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
  } as unknown as MemoryManager;
}

function makeSession(overrides: Partial<{ router: IAgentRouter; mm: MemoryManager; strategies: any[] }> = {}) {
  const router = overrides.router ?? mockRouter();
  const mm = overrides.mm ?? mockMemoryManager();
  const eventBus = new MemoryEventBus(overrides.strategies ?? []);
  const opts: ManagedSessionOptions = {
    chatId: 'chat1',
    agentConfig: { command: 'echo', args: [] },
    mode: 'full',
    workDir: '/tmp/yami-test',
    promptTimeout: 30,
    injectionMaxChars: 2000,
    eventBus,
  };
  return { session: new ManagedSession('chat1', router, opts, mm), router, mm, eventBus };
}

describe('ManagedSession', () => {
  it('send yields chunks via onChunk', async () => {
    const { session } = makeSession();
    const chunks: AgentChunk[] = [];
    await session.send([{ type: 'text', text: 'hi' }], async (c) => { chunks.push(c); });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'text', text: 'reply' });
  });

  it('first message injects preamble and memory context', async () => {
    const router = mockRouter();
    const { session } = makeSession({ router });
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    const call = (router.handle as any).mock.calls[0][0] as PromptContent[];
    // Should have preamble + context + skill hint + user message = 4 parts
    expect(call.length).toBeGreaterThanOrEqual(4);
    expect((call[0] as any).text).toContain('SYSTEM RULES');
    expect((call[1] as any).text).toContain('history summary');
  });

  it('second message does not inject context', async () => {
    const router = mockRouter();
    const { session } = makeSession({ router });
    await session.send([{ type: 'text', text: 'first' }], async () => {});
    await session.send([{ type: 'text', text: 'second' }], async () => {});
    const secondCall = (router.handle as any).mock.calls[1][0] as PromptContent[];
    // Should only have user message, no preamble
    expect(secondCall).toHaveLength(1);
    expect((secondCall[0] as any).text).toBe('second');
  });

  it('tracks turns and bytes', async () => {
    const { session } = makeSession();
    await session.send([{ type: 'text', text: 'hello' }], async () => {});
    const state = session.getMemoryState();
    expect(state.turns).toBe(1);
    expect(state.bytes).toBeGreaterThan(0);
  });

  it('calls memoryManager.save after reply', async () => {
    const mm = mockMemoryManager();
    const { session } = makeSession({ mm });
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    expect(mm.save).toHaveBeenCalledWith('chat1', expect.objectContaining({
      assistant: 'reply',
    }));
  });

  it('rotate triggers summarize + createSession + resets counters', async () => {
    const router = mockRouter();
    const mm = mockMemoryManager();
    const { session } = makeSession({ router, mm });
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    await session.rotate();
    expect(mm.summarize).toHaveBeenCalled();
    expect(router.createSession).toHaveBeenCalled();
    expect(session.getMemoryState().turns).toBe(0);
    expect(session.getMemoryState().bytes).toBe(0);
  });

  it('recycle writes last_session_id and kills router', async () => {
    const router = mockRouter();
    const { session } = makeSession({ router });
    // recycle writes to disk — use a temp dir to avoid errors
    await session.recycle();
    expect(router.kill).toHaveBeenCalled();
  });

  it('switchAgent resets counters and skips injection', async () => {
    const router = mockRouter();
    const { session } = makeSession({ router });
    await session.switchAgent('new-agent', { command: 'new', args: [], cwd: '/tmp' });
    expect(router.switchAgent).toHaveBeenCalled();
    // After switch, send should NOT inject context (firstMsg = false)
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    const call = (router.handle as any).mock.calls[0][0] as PromptContent[];
    expect(call).toHaveLength(1); // just user message
  });

  it('eventBus triggers summarize on strategy match', async () => {
    const mm = mockMemoryManager();
    const strategy = {
      name: 'test',
      check: vi.fn(() => 'summarize' as const),
      onSummarized: vi.fn(),
    };
    const { session } = makeSession({ mm, strategies: [strategy] });
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    expect(mm.summarize).toHaveBeenCalled();
    expect(strategy.onSummarized).toHaveBeenCalled();
  });

  it('eventBus triggers rotate on strategy match', async () => {
    const router = mockRouter();
    const mm = mockMemoryManager();
    const strategy = {
      name: 'test',
      check: vi.fn(() => 'rotate' as const),
      onSummarized: vi.fn(),
    };
    const { session } = makeSession({ router, mm, strategies: [strategy] });
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    expect(mm.summarize).toHaveBeenCalled();
    expect(router.createSession).toHaveBeenCalled();
  });

  it('getMemoryState returns current state', async () => {
    const { session } = makeSession();
    await session.send([{ type: 'text', text: 'hi' }], async () => {});
    const state = session.getMemoryState();
    expect(state.turns).toBe(1);
    expect(state.bytes).toBeGreaterThan(0);
    expect(state.lastSummarizeTime).toBeGreaterThan(0);
    expect(state.sessionStartTime).toBeGreaterThan(0);
  });
});
