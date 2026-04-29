import { describe, it, expect } from 'vitest';
import { getChatConfig, type AppConfig } from '../config.js';

// 直接构造 AppConfig 测试 getChatConfig，不依赖文件系统
function makeConfig(overrides: Record<string, unknown> = {}): AppConfig {
  return {
    bot: {
      bot_id: 'b', secret: 's', welcome_msg: '👋',
      agent: { command: 'echo', args: [] },
      chats: { default: { mode: 'full' as const } },
      memory: {
        layers: [{ type: 'conversation', enabled: true }],
        injectionMaxChars: 2000,
        ...overrides,
      },
    },
    env: {
      WORK_DIR: '/tmp', MAX_PROCS: 10, WARM_POOL_SIZE: 1,
      IDLE_TIMEOUT: 1800, PROMPT_TIMEOUT: 300,
      SESSION_SIZE_LIMIT: 2097152, MEMORY_SUMMARY_INTERVAL: 30,
      MEMORY_RECALL_DAYS: 7, PORT: 8900,
    },
  } as AppConfig;
}

describe('getChatConfig', () => {
  it('returns default config for unknown chatId', () => {
    const config = makeConfig();
    const chat = getChatConfig(config, 'unknown');
    expect(chat.mode).toBe('full');
    expect(chat.agent.command).toBe('echo');
  });

  it('returns specific chat config when matched', () => {
    const config = makeConfig();
    config.bot.chats['dm_vip'] = { mode: 'safe' };
    const chat = getChatConfig(config, 'dm_vip');
    expect(chat.mode).toBe('safe');
  });

  it('uses per-chat agent override', () => {
    const config = makeConfig();
    config.bot.chats['special'] = { mode: 'full', agent: { command: 'npx', args: ['claude'] } };
    const chat = getChatConfig(config, 'special');
    expect(chat.agent.command).toBe('npx');
    expect(chat.agent.args).toEqual(['claude']);
  });

  it('falls back to bot agent when chat has no agent override', () => {
    const config = makeConfig();
    const chat = getChatConfig(config, 'default');
    expect(chat.agent.command).toBe('echo');
  });
});

describe('memory config', () => {
  it('default injectionMaxChars is 2000', () => {
    const config = makeConfig();
    expect(config.bot.memory.injectionMaxChars).toBe(2000);
  });

  it('custom injectionMaxChars', () => {
    const config = makeConfig({ injectionMaxChars: 5000 });
    expect(config.bot.memory.injectionMaxChars).toBe(5000);
  });

  it('summarize config is optional', () => {
    const config = makeConfig();
    expect(config.bot.memory.summarize).toBeUndefined();
  });

  it('summarize config is passed through', () => {
    const config = makeConfig({
      summarize: [
        { type: 'turn', interval: 20 },
        { type: 'size', limit: 5000 },
      ],
    });
    expect(config.bot.memory.summarize).toHaveLength(2);
    expect(config.bot.memory.summarize![0]).toEqual({ type: 'turn', interval: 20 });
  });
});
