import type { AgentConfig } from '../config.js';
import type { MemoryEventBus } from '../memory/events.js';

/** ManagedSession 实例的配置参数。 */
export interface ManagedSessionOptions {
  chatId: string;
  agentConfig: AgentConfig;
  mode: 'full' | 'safe';
  workDir: string;
  promptTimeout: number;
  /** 首条消息注入摘要的最大字数。 */
  injectionMaxChars: number;
  /** 记忆事件总线，驱动总结策略。 */
  eventBus: MemoryEventBus;
}
