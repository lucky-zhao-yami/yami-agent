import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import type { IAgentProvider, IAgentProcess } from '../../agent/types.js';
import type { MemoryManager } from '../../memory/MemoryManager.js';
import type { AppConfig } from '../../config.js';

function mockProcess(sessionId = 'sess-1'): IAgentProcess {
  return {
    sessionId,
    alive: true,
    initialize: vi.fn(),
    createSession: vi.fn(async () => sessionId),
    loadSession: vi.fn(),
    prompt: vi.fn(async function* () {
      yield { type: 'done' as const, stopReason: 'end' };
    }),
    cancel: vi.fn(),
    kill: vi.fn(),
  } as unknown as IAgentProcess;
}

function mockProvider(): IAgentProvider & { proc: IAgentProcess } {
  const proc = mockProcess();
  return {
    proc,
    spawn: vi.fn(async () => proc),
  } as unknown as IAgentProvider & { proc: IAgentProcess };
}

function mockMemoryManager(): MemoryManager {
  return {
    recall: vi.fn(async () => ''),
    save: vi.fn(async () => {}),
    summarize: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
  } as unknown as MemoryManager;
}

function makeConfig(overrides: Partial<AppConfig['env']> = {}): AppConfig {
  return {
    bot: {
      bot_id: 'b', secret: 's', welcome_msg: '👋',
      agent: { command: 'echo', args: [] },
      chats: { default: { mode: 'full' as const } },
      memory: { layers: [], injectionMaxChars: 2000 },
    },
    env: {
      WORK_DIR: '/tmp/yami-sm-test',
      MAX_PROCS: 3,
      WARM_POOL_SIZE: 0,
      IDLE_TIMEOUT: 1800,
      PROMPT_TIMEOUT: 300,
      SESSION_SIZE_LIMIT: 2097152,
      MEMORY_SUMMARY_INTERVAL: 30,
      MEMORY_RECALL_DAYS: 7,
      PORT: 8900,
      ...overrides,
    },
  } as AppConfig;
}

describe('SessionManager', () => {
  let sm: SessionManager;
  let provider: ReturnType<typeof mockProvider>;
  let mm: MemoryManager;

  beforeEach(() => {
    provider = mockProvider();
    mm = mockMemoryManager();
    sm = new SessionManager(provider, makeConfig(), mm);
  });

  afterEach(async () => {
    await sm.shutdown();
  });

  it('getOrCreate spawns new session', async () => {
    const session = await sm.getOrCreate('chat1');
    expect(session).toBeDefined();
    expect(session.chatId).toBe('chat1');
    expect(provider.spawn).toHaveBeenCalled();
  });

  it('getOrCreate returns existing alive session', async () => {
    const s1 = await sm.getOrCreate('chat1');
    const s2 = await sm.getOrCreate('chat1');
    expect(s1).toBe(s2);
    expect(provider.spawn).toHaveBeenCalledTimes(1);
  });

  it('getActiveChatIds returns active sessions', async () => {
    await sm.getOrCreate('chat1');
    await sm.getOrCreate('chat2');
    expect(sm.getActiveChatIds()).toEqual(expect.arrayContaining(['chat1', 'chat2']));
  });

  it('getSession returns session by chatId', async () => {
    await sm.getOrCreate('chat1');
    expect(sm.getSession('chat1')).toBeDefined();
    expect(sm.getSession('nonexistent')).toBeUndefined();
  });

  it('getSessionId returns sessionId', async () => {
    await sm.getOrCreate('chat1');
    expect(sm.getSessionId('chat1')).toBe('sess-1');
  });

  it('rejects chatId with path traversal', async () => {
    await expect(sm.getOrCreate('../etc')).rejects.toThrow('Invalid chatId');
    await expect(sm.getOrCreate('chat/../../x')).rejects.toThrow('Invalid chatId');
  });

  it('evicts LRU when MAX_PROCS reached', async () => {
    // MAX_PROCS = 3
    await sm.getOrCreate('chat1');
    await sm.getOrCreate('chat2');
    await sm.getOrCreate('chat3');
    // This should evict chat1 (oldest)
    await sm.getOrCreate('chat4');
    expect(sm.getActiveChatIds()).not.toContain('chat1');
    expect(sm.getActiveChatIds()).toContain('chat4');
  });

  it('shutdown kills all sessions', async () => {
    await sm.getOrCreate('chat1');
    await sm.getOrCreate('chat2');
    await sm.shutdown();
    expect(sm.getActiveChatIds()).toHaveLength(0);
  });

  it('concurrent getOrCreate for same chatId returns same session', async () => {
    const [s1, s2] = await Promise.all([
      sm.getOrCreate('chat1'),
      sm.getOrCreate('chat1'),
    ]);
    expect(s1).toBe(s2);
    expect(provider.spawn).toHaveBeenCalledTimes(1);
  });
});
