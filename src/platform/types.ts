export interface MixedItem {
  type: 'text' | 'image' | 'voice' | 'file';
  content?: string;
  mediaId?: string;
}

export interface IncomingMessage {
  chatId: string;
  userId: string;
  msgType: 'text' | 'image' | 'voice' | 'file' | 'mixed';
  text?: string;
  items?: MixedItem[];
  quote?: string;
  reqId: string;
  chatType: number; // 1=单聊, 2=群聊
}

export interface PlatformEvent {
  type: 'enter_chat' | 'disconnected';
  chatId?: string;
  reqId: string;
}

export abstract class IMessagePlatform {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  abstract onEvent(handler: (evt: PlatformEvent) => Promise<void>): void;
  abstract sendStream(reqId: string, streamId: string, content: string, finish: boolean): Promise<void>;
  abstract sendMessage(chatId: string, content: string, chatType?: number): Promise<void>;
  abstract sendWelcome(reqId: string, text: string): Promise<void>;
  abstract getMedia(mediaId: string): Promise<Buffer | null>;
}

export abstract class IStreamWriter {
  abstract write(chunk: string): Promise<void>;
  abstract finish(): Promise<void>;
}
