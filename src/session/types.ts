import type { AgentConfig } from '../config.js';

/** Configuration for a ManagedSession instance. */
export interface ManagedSessionOptions {
  chatId: string;
  agentConfig: AgentConfig;
  mode: 'full' | 'safe';
  workDir: string;
  sessionSizeLimit: number;
  promptTimeout: number;
  memorySummaryInterval: number;
}
