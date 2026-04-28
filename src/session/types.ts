import type { AgentConfig } from '../config.js';

/** ManagedSession 实例的配置参数。 */
export interface ManagedSessionOptions {
  chatId: string;
  agentConfig: AgentConfig;
  mode: 'full' | 'safe';
  workDir: string;
  sessionSizeLimit: number;
  promptTimeout: number;
  memorySummaryInterval: number;
}
