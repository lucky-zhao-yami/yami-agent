export interface HistoryEntry {
  user: string;
  assistant: string;
  timestamp: number;
  bytes: number;
}

export abstract class IMemoryLayer {
  abstract readonly name: string;
  abstract save(chatId: string, entry: HistoryEntry): Promise<void>;
  abstract recall(chatId: string, query?: string): Promise<string>;
  async onSummary(_chatId: string, _date: string, _summary: string): Promise<void> {}
  async cleanup(_chatId: string): Promise<void> {}
}

export abstract class IMemoryRecycler {
  abstract summarize(chatId: string, sessionId: string): Promise<string>;
}
