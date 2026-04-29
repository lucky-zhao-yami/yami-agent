import { describe, it, expect, vi } from 'vitest';
import { parseCommand, handleCommand, type CommandContext } from '../commands.js';

function mockContext(overrides: Partial<CommandContext> = {}): CommandContext & { replies: string[] } {
  const replies: string[] = [];
  return {
    chatId: 'chat1',
    session: {
      rotate: vi.fn(),
      switchAgent: vi.fn(),
      workDir: '/tmp',
    } as any,
    sessionManager: {} as any,
    config: {
      bot: { agent: { command: 'echo', args: [] } , chats: {} },
      env: { WORK_DIR: '/tmp' },
    } as any,
    reply: vi.fn(async (t: string) => { replies.push(t); }),
    replies,
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('parses command with args', () => {
    expect(parseCommand('/agent kiro-cli')).toEqual({ cmd: '/agent', args: 'kiro-cli' });
  });

  it('parses command without args', () => {
    expect(parseCommand('/new')).toEqual({ cmd: '/new', args: '' });
  });

  it('returns null for non-command text', () => {
    expect(parseCommand('hello world')).toBeNull();
  });

  it('converts command to lowercase', () => {
    expect(parseCommand('/NEW')).toEqual({ cmd: '/new', args: '' });
  });

  it('preserves args case', () => {
    expect(parseCommand('/agent MyAgent')).toEqual({ cmd: '/agent', args: 'MyAgent' });
  });

  it('returns null for empty string', () => {
    expect(parseCommand('')).toBeNull();
  });

  it('handles command with multiple spaces in args', () => {
    expect(parseCommand('/mode ask code')).toEqual({ cmd: '/mode', args: 'ask code' });
  });
});

describe('handleCommand', () => {
  it('/new calls session.rotate and replies', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/new', '');
    expect(ctx.session.rotate).toHaveBeenCalled();
    expect(ctx.replies[0]).toContain('新会话');
  });

  it('/reset calls session.rotate and replies with archive count', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/reset', '');
    expect(ctx.session.rotate).toHaveBeenCalled();
    expect(ctx.replies[0]).toContain('已重置');
  });

  it('/restore replies with info when no archive', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/restore', '');
    expect(ctx.replies[0]).toContain('没有可恢复');
  });

  it('/agent without name replies usage', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/agent', '');
    expect(ctx.replies[0]).toContain('用法');
  });

  it('/agent with name calls switchAgent', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/agent', 'kiro-cli');
    expect(ctx.session.switchAgent).toHaveBeenCalled();
    expect(ctx.replies).toContainEqual(expect.stringContaining('切换'));
  });

  it('/mode replies not yet supported', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/mode', 'ask');
    expect(ctx.replies[0]).toContain('ACP SDK');
  });

  it('/switch replies not supported', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/switch', 'other');
    expect(ctx.replies[0]).toContain('暂不支持');
  });

  it('unknown command replies help', async () => {
    const ctx = mockContext();
    await handleCommand(ctx, '/unknown', '');
    expect(ctx.replies[0]).toContain('可用命令');
  });

  it('command error replies with error message', async () => {
    const ctx = mockContext();
    (ctx.session.rotate as any).mockRejectedValue(new Error('boom'));
    await handleCommand(ctx, '/new', '');
    expect(ctx.replies).toContainEqual(expect.stringContaining('命令执行失败'));
  });
});
