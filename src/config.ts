import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';

const AgentConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string()).optional(),
});

const ChatConfigSchema = z.object({
  mode: z.enum(['full', 'safe']).default('full'),
  agent: AgentConfigSchema.optional(),
});

const MemoryLayerSchema = z.object({
  type: z.string(),
  enabled: z.boolean(),
  endpoint: z.string().optional(),
});

const BotConfigSchema = z.object({
  bot_id: z.string(),
  secret: z.string(),
  welcome_msg: z.string().default('👋 你好！'),
  agent: AgentConfigSchema,
  chats: z.record(ChatConfigSchema).default({ default: { mode: 'full' } }),
  memory: z.object({
    layers: z.array(MemoryLayerSchema).default([{ type: 'conversation', enabled: true }]),
  }).default({ layers: [{ type: 'conversation', enabled: true }] }),
});

const EnvConfigSchema = z.object({
  WORK_DIR: z.string().default('/mnt/d/workspace/all'),
  MAX_PROCS: z.coerce.number().default(10),
  WARM_POOL_SIZE: z.coerce.number().default(1),
  IDLE_TIMEOUT: z.coerce.number().default(1800),
  PROMPT_TIMEOUT: z.coerce.number().default(300),
  SESSION_SIZE_LIMIT: z.coerce.number().default(2097152),
  MEMORY_SUMMARY_INTERVAL: z.coerce.number().default(30),
  MEMORY_RECALL_DAYS: z.coerce.number().default(7),
  PORT: z.coerce.number().default(8900),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ChatConfig = z.infer<typeof ChatConfigSchema>;
export type BotConfig = z.infer<typeof BotConfigSchema>;
export type EnvConfig = z.infer<typeof EnvConfigSchema>;

export interface AppConfig {
  bot: BotConfig;
  env: EnvConfig;
}

export function loadConfig(): AppConfig {
  const workDir = process.env['WORK_DIR'] || '/mnt/d/workspace/all';
  const configPath = resolve(workDir, 'config.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  const bot = BotConfigSchema.parse(raw);
  const env = EnvConfigSchema.parse(process.env);
  return { bot, env };
}

export function getChatConfig(config: AppConfig, chatId: string): ChatConfig & { agent: AgentConfig } {
  const chat = config.bot.chats[chatId] ?? config.bot.chats['default'] ?? { mode: 'full' as const };
  return { ...chat, agent: chat.agent ?? config.bot.agent };
}
