import type { AgentConfig } from '../config.js';

export interface ManagedSessionOptions {
  chatId: string;
  agentConfig: AgentConfig;
  mode: 'full' | 'safe';
  workDir: string;
  sessionSizeLimit: number;
  promptTimeout: number;
  memorySummaryInterval: number;
}
