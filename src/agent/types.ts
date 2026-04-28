export interface AgentSpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export type PromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

export type AgentChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; title: string; status: string }
  | { type: 'done'; stopReason: string };

export abstract class IAgentProcess {
  abstract readonly sessionId: string | null;
  abstract readonly alive: boolean;

  abstract initialize(): Promise<void>;
  abstract createSession(cwd: string): Promise<string>;
  abstract loadSession(sessionId: string): Promise<void>;
  abstract prompt(sessionId: string, content: PromptContent[]): AsyncIterable<AgentChunk>;
  abstract cancel(sessionId: string): Promise<void>;
  abstract kill(): Promise<void>;
}

export abstract class IAgentProvider {
  abstract spawn(options: AgentSpawnOptions): Promise<IAgentProcess>;
}

export abstract class IAgentRouter {
  abstract handle(content: PromptContent[]): AsyncIterable<AgentChunk>;
  abstract switchAgent(agentName: string, spawnOpts?: AgentSpawnOptions): Promise<void>;
  abstract setMode(mode: string): Promise<void>;
  abstract readonly availableModes: string[];
  abstract readonly sessionId: string | null;
  abstract readonly alive: boolean;
  abstract cancel(sessionId: string): Promise<void>;
  abstract createSession(): Promise<string>;
  abstract loadSession(sessionId: string): Promise<void>;
  abstract kill(): Promise<void>;
}
