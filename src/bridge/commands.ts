import pino from 'pino';
import type { ManagedSession } from '../session/ManagedSession.js';
import type { SessionManager } from '../session/SessionManager.js';

const log = pino({ name: 'Commands' });

export interface CommandContext {
  chatId: string;
  session: ManagedSession;
  sessionManager: SessionManager;
  reply: (text: string) => Promise<void>;
}

type CommandHandler = (ctx: CommandContext, args: string) => Promise<void>;

const commands: Record<string, CommandHandler> = {
  '/new': async (ctx) => {
    // Phase 3: memoryManager.summarize() before rotate
    await ctx.session.rotate();
    await ctx.reply('✅ 新会话已创建');
  },

  '/reset': async (ctx) => {
    // Phase 3: memoryManager.summarize() + archive memory files
    await ctx.session.rotate();
    await ctx.reply('✅ 会话已重置');
  },

  '/restore': async (ctx) => {
    // Phase 3: move memory/archive/*.md back to memory/
    await ctx.reply('⚠️ restore 功能将在 Phase 3 实现');
  },

  '/agent': async (ctx, args) => {
    if (!args.trim()) { await ctx.reply('用法: /agent <name>'); return; }
    await ctx.reply(`🔄 切换 Agent 到 ${args.trim()}...`);
    // switchAgent is on the router inside ManagedSession — need to expose or go through session
    await ctx.reply('⚠️ agent 切换将在后续版本完善');
  },

  '/mode': async (ctx, args) => {
    if (!args.trim()) { await ctx.reply('用法: /mode <mode>'); return; }
    await ctx.reply(`⚠️ mode 切换将在 ACP SDK 支持后启用`);
  },

  '/switch': async (ctx) => {
    await ctx.reply('⚠️ 暂不支持，多 agent 模式开发中');
  },
};

const HELP = `可用命令:
/new — 新建会话（保留记忆）
/reset — 重置会话（清除记忆）
/restore — 恢复已归档的记忆
/agent <name> — 切换 Agent
/mode <mode> — 切换操作模式
/switch <agent> — 多 Agent 切换（开发中）`;

export function parseCommand(text: string): { cmd: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { cmd: trimmed.toLowerCase(), args: '' };
  return { cmd: trimmed.slice(0, spaceIdx).toLowerCase(), args: trimmed.slice(spaceIdx + 1) };
}

export async function handleCommand(ctx: CommandContext, cmd: string, args: string): Promise<void> {
  const handler = commands[cmd];
  if (handler) {
    log.info(`Executing command ${cmd} for ${ctx.chatId}`);
    await handler(ctx, args);
  } else {
    await ctx.reply(HELP);
  }
}
