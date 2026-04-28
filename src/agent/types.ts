/** Options for spawning an ACP agent subprocess. */
export interface AgentSpawnOptions {
  /** Executable command (e.g. "kiro-cli", "npx"). */
  command: string;
  /** Command arguments (e.g. ["acp", "--trust-all-tools"]). */
  args: string[];
  /** Working directory — agent discovers .kiro/ config here. */
  cwd: string;
  /** Extra environment variables inherited by the subprocess. */
  env?: Record<string, string>;
}

/** Content block sent to an agent prompt. */
export type PromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

/** Streamed chunk from an agent response. */
export type AgentChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; title: string; status: string }
  | { type: 'done'; stopReason: string };

/**
 * Abstract ACP agent process — manages a single agent subprocess.
 * Handles session lifecycle (create/load/prompt/cancel) over JSON-RPC.
 */
export abstract class IAgentProcess {
  /** Current ACP session ID, or null if no session is active. */
  abstract readonly sessionId: string | null;
  /** Whether the subprocess is still running. */
  abstract readonly alive: boolean;

  /** Initialize the ACP connection (handshake). */
  abstract initialize(): Promise<void>;
  /** Create a new session with the given working directory. */
  abstract createSession(cwd: string): Promise<string>;
  /** Restore a previously saved session by ID. */
  abstract loadSession(sessionId: string): Promise<void>;
  /** Send a prompt and yield streamed response chunks. */
  abstract prompt(sessionId: string, content: PromptContent[]): AsyncIterable<AgentChunk>;
  /** Cancel an in-progress prompt. */
  abstract cancel(sessionId: string): Promise<void>;
  /** Kill the subprocess (SIGTERM → SIGKILL after 5s). */
  abstract kill(): Promise<void>;
}

/** Factory for spawning agent processes. */
export abstract class IAgentProvider {
  /** Spawn and initialize a new agent process. */
  abstract spawn(options: AgentSpawnOptions): Promise<IAgentProcess>;
}

/**
 * Abstract agent router — indirection layer between ManagedSession and IAgentProcess.
 * Current implementation: SingleAgentRouter (1:1 wrapper).
 * Future: WorkflowAgentRouter (multi-agent orchestration).
 */
export abstract class IAgentRouter {
  /** Route a prompt to the active agent, yielding response chunks. */
  abstract handle(content: PromptContent[]): AsyncIterable<AgentChunk>;
  /** Kill current agent, spawn a new one with the given name/options. */
  abstract switchAgent(agentName: string, spawnOpts?: AgentSpawnOptions): Promise<void>;
  /** Switch the agent's operation mode (e.g. ask/code/architect). */
  abstract setMode(mode: string): Promise<void>;
  /** Available operation modes from the current agent. */
  abstract readonly availableModes: string[];
  /** Current ACP session ID. */
  abstract readonly sessionId: string | null;
  /** Whether the underlying agent process is alive. */
  abstract readonly alive: boolean;
  /** Cancel an in-progress prompt. */
  abstract cancel(sessionId: string): Promise<void>;
  /** Create a fresh session on the current agent process. */
  abstract createSession(): Promise<string>;
  /** Restore a saved session on the current agent process. */
  abstract loadSession(sessionId: string): Promise<void>;
  /** Kill the underlying agent process. */
  abstract kill(): Promise<void>;
}
