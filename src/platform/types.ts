/** 混合消息的子项（文本/图片/语音/文件）。 */
export interface MixedItem {
  type: 'text' | 'image' | 'voice' | 'file';
  /** 文本内容或语音转写文字。 */
  content?: string;
  /** 图片/文件的媒体 ID，用于下载。 */
  mediaId?: string;
}

/** 从消息平台解析出的用户消息。 */
export interface IncomingMessage {
  /** 聊天标识。单聊: `dm_{userId}`，群聊: 平台 chatId。 */
  chatId: string;
  /** 发送者用户 ID。 */
  userId: string;
  msgType: 'text' | 'image' | 'voice' | 'file' | 'mixed';
  /** 提取的文本内容（文本/语音消息）。 */
  text?: string;
  /** 混合/图片/文件消息的子项列表。 */
  items?: MixedItem[];
  /** 引用/回复的消息文本。 */
  quote?: string;
  /** 平台请求 ID，用于流式回复。 */
  reqId: string;
  /** 1 = 单聊, 2 = 群聊。 */
  chatType: number;
}

/** 平台级事件（用户入群、断线等）。 */
export interface PlatformEvent {
  type: 'enter_chat' | 'disconnected';
  chatId?: string;
  reqId: string;
}

/**
 * 消息平台抽象接口。
 * 实现类负责特定平台（企微/飞书/Slack）的连接、消息收发和媒体下载。
 */
export abstract class IMessagePlatform {
  /** 建立平台连接。 */
  abstract connect(): Promise<void>;
  /** 优雅断开连接。 */
  abstract disconnect(): Promise<void>;
  /** 注册用户消息处理器。 */
  abstract onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  /** 注册平台事件处理器（入群等）。 */
  abstract onEvent(handler: (evt: PlatformEvent) => Promise<void>): void;
  /** 发送流式回复片段。最后一段设 `finish=true`。 */
  abstract sendStream(reqId: string, streamId: string, content: string, finish: boolean): Promise<void>;
  /** 发送独立 markdown 消息到聊天。 */
  abstract sendMessage(chatId: string, content: string, chatType?: number): Promise<void>;
  /** 响应入群事件发送欢迎语。 */
  abstract sendWelcome(reqId: string, text: string): Promise<void>;
  /** 按 ID 下载媒体文件，返回原始字节或 null。 */
  abstract getMedia(mediaId: string): Promise<Buffer | null>;
  /** 收到 6000 errcode（流冲突）的请求 ID 集合。 */
  abstract readonly failedReqIds: Set<string>;
}

/**
 * 流式输出抽象接口。
 * @see StreamSegmenter 企微实现。
 */
export abstract class IStreamWriter {
  /** 追加文本块到当前流。 */
  abstract write(chunk: string): Promise<void>;
  /** 结束流，发送缓冲区中的剩余内容。 */
  abstract finish(): Promise<void>;
}
