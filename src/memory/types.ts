/** 一轮对话记录（用户消息 + 助手回复）。 */
export interface HistoryEntry {
  user: string;
  assistant: string;
  timestamp: number;
  /** user + assistant 文本的 UTF-8 总字节数。 */
  bytes: number;
}

/**
 * 记忆层抽象 — 可插拔的对话历史存储后端。
 * MemoryManager 按配置顺序编排多个 layer。
 *
 * 当前: ConversationMemoryLayer（基于文件的摘要）。
 * 未来: VectorMemoryLayer、KnowledgeBaseMemoryLayer。
 */
export abstract class IMemoryLayer {
  abstract readonly name: string;
  /** 持久化一轮对话。每次 Agent 回复后调用。 */
  abstract save(chatId: string, entry: HistoryEntry): Promise<void>;
  /** 检索上下文，注入到下一次 prompt 中。maxChars 限制返回字数。 */
  abstract recall(chatId: string, query?: string, maxChars?: number): Promise<string>;
  /** 接收回收器生成的摘要。需要持久化的 layer 覆写此方法。 */
  async onSummary(_chatId: string, _date: string, _summary: string): Promise<void> {}
  /** 清理过期数据（如 gzip 超过 30 天的文件）。 */
  async cleanup(_chatId: string): Promise<void> {}
}

/**
 * 记忆回收器抽象 — 从 ACP session 文件生成摘要。
 * 启动临时 Agent 进程读取并总结 session 内容。
 */
export abstract class IMemoryRecycler {
  /** 总结指定 session 的对话内容，返回 markdown 文本。 */
  abstract summarize(chatId: string, sessionId: string): Promise<string>;
}
