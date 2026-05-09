import { readdir, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getLogger } from '../logger.js';
import type { ManagedSession } from '../session/ManagedSession.js';
import type { SessionManager } from '../session/SessionManager.js';
import type { AppConfig } from '../config.js';

import type { IMessagePlatform } from '../platform/types.js';

const log = getLogger('Commands');

export interface CommandContext {
  chatId: string;
  chatType: number;
  session: ManagedSession;
  sessionManager: SessionManager;
  config: AppConfig;
  reply: (text: string) => Promise<void>;
  platform: IMessagePlatform;
  agentflowPlatform: any;
  pendingSubmits: Map<string, { chatId: string; sessionId: string | null; timestamp: number }>;
}

const HELP = `可用命令:
/new — 新建会话（保留记忆）
/reset — 重置会话（归档记忆）
/restore — 恢复已归档的记忆
/agent <name> — 切换 Agent
/mode <mode> — 切换操作模式
/submit — 提交上次回复到 AgentFlow
/switch <agent> — 多 Agent 切换（开发中）`;

export function parseCommand(text: string): { cmd: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { cmd: trimmed.toLowerCase(), args: '' };
  return { cmd: trimmed.slice(0, spaceIdx).toLowerCase(), args: trimmed.slice(spaceIdx + 1) };
}

export async function handleCommand(ctx: CommandContext, cmd: string, args: string): Promise<void> {
  log.info(`Executing command ${cmd} for ${ctx.chatId}`);
  try {
    switch (cmd) {
      case '/new': return await cmdNew(ctx);
      case '/reset': return await cmdReset(ctx);
      case '/restore': return await cmdRestore(ctx);
      case '/agent': return await cmdAgent(ctx, args);
      case '/mode': return await cmdMode(ctx, args);
      case '/submit': return await cmdSubmit(ctx);
      case '/switch': return await ctx.reply('⚠️ 暂不支持，多 agent 模式开发中');
      default: return await ctx.reply(HELP);
    }
  } catch (e) {
    log.error(e, `Command ${cmd} failed`);
    await ctx.reply(`❌ 命令执行失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function cmdNew(ctx: CommandContext): Promise<void> {
  await ctx.session.rotate();
  await ctx.reply('✅ 新会话已创建，历史摘要已保留');
}

async function cmdReset(ctx: CommandContext): Promise<void> {
  // Summarize first
  await ctx.session.rotate();

  // Move memory/*.md to memory/archive/
  const memDir = join(ctx.session.workDir, 'sessions', ctx.chatId, 'memory');
  const archiveDir = join(memDir, 'archive');
  await mkdir(archiveDir, { recursive: true });

  let moved = 0;
  try {
    const files = await readdir(memDir);
    for (const f of files) {
      if (f.endsWith('.md')) {
        await rename(join(memDir, f), join(archiveDir, f));
        moved++;
      }
    }
  } catch { /* empty memory dir */ }

  await ctx.reply(`✅ 会话已重置，${moved} 个摘要已归档（30 天后自动清理）`);
}

async function cmdRestore(ctx: CommandContext): Promise<void> {
  const memDir = join(ctx.session.workDir, 'sessions', ctx.chatId, 'memory');
  const archiveDir = join(memDir, 'archive');

  let restored = 0;
  try {
    const files = await readdir(archiveDir);
    for (const f of files) {
      if (f.endsWith('.md')) {
        await rename(join(archiveDir, f), join(memDir, f));
        restored++;
      }
    }
  } catch { /* no archive */ }

  if (restored > 0) {
    await ctx.reply(`✅ 已恢复 ${restored} 个摘要，下次对话时将注入历史上下文`);
  } else {
    await ctx.reply('ℹ️ 没有可恢复的归档摘要');
  }
}

async function cmdAgent(ctx: CommandContext, args: string): Promise<void> {
  const name = args.trim();
  if (!name) { await ctx.reply('用法: /agent <name>\n示例: /agent kiro-cli'); return; }

  // Look up agent config from chats config, or build from name
  const agentCfg = ctx.config.bot.chats[name]?.agent ?? ctx.config.bot.agent;
  const spawnOpts = {
    command: agentCfg.command,
    args: agentCfg.args,
    cwd: ctx.config.env.WORK_DIR,
    env: agentCfg.env,
  };

  await ctx.reply(`🔄 切换 Agent 到 ${name}...`);
  await ctx.session.switchAgent(name, spawnOpts);
  await ctx.reply(`✅ 已切换到 ${name}`);
}

async function cmdMode(ctx: CommandContext, args: string): Promise<void> {
  const mode = args.trim();
  if (!mode) { await ctx.reply('用法: /mode <mode>\n可用模式取决于当前 Agent'); return; }
  await ctx.reply(`⚠️ mode 切换将在 ACP SDK 支持 setSessionMode 后启用`);
}

async function cmdSubmit(ctx: CommandContext): Promise<void> {
  if (!ctx.agentflowPlatform) {
    await ctx.reply('AgentFlow 平台未启用');
    return;
  }
  const workflows = ctx.agentflowPlatform.workflows;
  if (workflows.length === 0) {
    await ctx.reply('平台上没有可用的工作流');
    return;
  }

  const taskId = `submit_${ctx.chatId}_${Date.now()}`;

  if ('sendTemplateCard' in ctx.platform) {
    await (ctx.platform as any).sendTemplateCard(ctx.chatId, ctx.chatType, {
      title: '提交到 AgentFlow',
      desc: '选择要使用的工作流：',
      buttons: workflows.map((w: any) => ({ text: w.name, key: `submit_wf_${w.id}`, style: 1 })),
      taskId,
    });
  } else {
    const list = workflows.map((w: any, i: number) => `${i + 1}. ${w.name}`).join('\n');
    await ctx.reply(`选择工作流：\n${list}`);
  }

  ctx.pendingSubmits.set(taskId, {
    chatId: ctx.chatId,
    sessionId: ctx.session.sessionId,
    timestamp: Date.now(),
  });
}
