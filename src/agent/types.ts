/** ACP Agent 子进程启动参数。 */
export interface AgentSpawnOptions {
  /** 可执行命令（如 "kiro-cli"、"npx"）。 */
  command: string;
  /** 命令参数（如 ["acp", "--trust-all-tools"]）。 */
  args: string[];
  /** 工作目录 — Agent 在此发现 .kiro/ 配置。 */
  cwd: string;
  /** 额外环境变量，继承给子进程。 */
  env?: Record<string, string>;
}

/** 发送给 Agent 的 prompt 内容块。 */
export type PromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

/** Agent 流式响应的数据块。 */
export type AgentChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; title: string; status: string }
  | { type: 'done'; stopReason: string };

/**
 * ACP Agent 进程抽象 — 管理单个 Agent 子进程。
 * 通过 JSON-RPC 处理会话生命周期（创建/恢复/prompt/取消）。
 */
export abstract class IAgentProcess {
  /** 当前 ACP session ID，无活跃会话时为 null。 */
  abstract readonly sessionId: string | null;
  /** 子进程是否仍在运行。 */
  abstract readonly alive: boolean;

  /** 初始化 ACP 连接（握手）。 */
  abstract initialize(): Promise<void>;
  /** 在指定工作目录创建新会话。 */
  abstract createSession(cwd: string): Promise<string>;
  /** 按 ID 恢复之前保存的会话。 */
  abstract loadSession(sessionId: string): Promise<void>;
  /** 发送 prompt 并 yield 流式响应块。 */
  abstract prompt(sessionId: string, content: PromptContent[]): AsyncIterable<AgentChunk>;
  /** 取消正在进行的 prompt。 */
  abstract cancel(sessionId: string): Promise<void>;
  /** 杀掉子进程（SIGTERM → 5s 后 SIGKILL）。 */
  abstract kill(): Promise<void>;
}

/** Agent 进程工厂。 */
export abstract class IAgentProvider {
  /** 创建并初始化一个新的 Agent 进程。 */
  abstract spawn(options: AgentSpawnOptions): Promise<IAgentProcess>;
}

/**
 * Agent 路由抽象 — ManagedSession 和 IAgentProcess 之间的间接层。
 * 当前实现: SingleAgentRouter（1:1 包装）。
 * 未来扩展: WorkflowAgentRouter（多 Agent 编排）。
 */
export abstract class IAgentRouter {
  /** 将 prompt 路由到活跃 Agent，yield 响应块。 */
  abstract handle(content: PromptContent[]): AsyncIterable<AgentChunk>;
  /** 杀掉当前 Agent，用指定名称/参数启动新的。 */
  abstract switchAgent(agentName: string, spawnOpts?: AgentSpawnOptions): Promise<void>;
  /** 切换 Agent 操作模式（如 ask/code/architect）。 */
  abstract setMode(mode: string): Promise<void>;
  /** 当前 Agent 支持的操作模式列表。 */
  abstract readonly availableModes: string[];
  /** 当前 ACP session ID。 */
  abstract readonly sessionId: string | null;
  /** 底层 Agent 进程是否存活。 */
  abstract readonly alive: boolean;
  /** 取消正在进行的 prompt。 */
  abstract cancel(sessionId: string): Promise<void>;
  /** 在当前 Agent 进程上创建新会话。 */
  abstract createSession(): Promise<string>;
  /** 在当前 Agent 进程上恢复已保存的会话。 */
  abstract loadSession(sessionId: string): Promise<void>;
  /** 杀掉底层 Agent 进程。 */
  abstract kill(): Promise<void>;
}
