/** A component of a mixed message (text + image + voice + file). */
export interface MixedItem {
  type: 'text' | 'image' | 'voice' | 'file';
  /** Text or voice transcription content. */
  content?: string;
  /** Media ID for image/file downloads. */
  mediaId?: string;
}

/** Parsed incoming message from the messaging platform. */
export interface IncomingMessage {
  /** Chat identifier. DM: `dm_{userId}`, Group: platform chatId. */
  chatId: string;
  /** Sender's user ID. */
  userId: string;
  msgType: 'text' | 'image' | 'voice' | 'file' | 'mixed';
  /** Extracted text content (for text/voice messages). */
  text?: string;
  /** Sub-items for mixed/image/file messages. */
  items?: MixedItem[];
  /** Quoted/replied message text, if any. */
  quote?: string;
  /** Platform request ID, used for stream replies. */
  reqId: string;
  /** 1 = DM, 2 = group chat. */
  chatType: number;
}

/** Platform-level event (user entering chat, disconnection, etc.). */
export interface PlatformEvent {
  type: 'enter_chat' | 'disconnected';
  chatId?: string;
  reqId: string;
}

/**
 * Abstract messaging platform interface.
 * Implementations handle connection, message dispatch, and media retrieval
 * for a specific platform (e.g. WeCom, Slack, Feishu).
 */
export abstract class IMessagePlatform {
  /** Establish connection to the platform. */
  abstract connect(): Promise<void>;
  /** Gracefully disconnect. */
  abstract disconnect(): Promise<void>;
  /** Register handler for incoming user messages. */
  abstract onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  /** Register handler for platform events (enter_chat, etc.). */
  abstract onEvent(handler: (evt: PlatformEvent) => Promise<void>): void;
  /** Send a streaming reply segment. Set `finish=true` for the last segment. */
  abstract sendStream(reqId: string, streamId: string, content: string, finish: boolean): Promise<void>;
  /** Send a standalone markdown message to a chat. */
  abstract sendMessage(chatId: string, content: string, chatType?: number): Promise<void>;
  /** Send a welcome message in response to an enter_chat event. */
  abstract sendWelcome(reqId: string, text: string): Promise<void>;
  /** Download media by ID. Returns raw bytes or null on failure. */
  abstract getMedia(mediaId: string): Promise<Buffer | null>;
  /** Request IDs that received 6000 errcode (stream conflict). */
  abstract readonly failedReqIds: Set<string>;
}

/**
 * Abstract stream writer for sending chunked output to the platform.
 * @see StreamSegmenter for the WeCom implementation.
 */
export abstract class IStreamWriter {
  /** Append a text chunk to the current stream. */
  abstract write(chunk: string): Promise<void>;
  /** Finalize the stream, sending any buffered content. */
  abstract finish(): Promise<void>;
}
