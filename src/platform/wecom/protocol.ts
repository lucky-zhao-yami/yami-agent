/**
 * 企微智能机器人 WebSocket 协议类型定义
 * 参考: https://developer.work.weixin.qq.com/document/path/98230
 */

// ---- 基础消息结构 ----

export interface WsMessage {
  cmd?: string;
  headers?: WsHeaders;
  body?: Record<string, unknown>;
  errcode?: number;
  errmsg?: string;
}

export interface WsHeaders {
  req_id?: string;
  [key: string]: unknown;
}

// ---- 发送方信息 ----

export interface MsgFrom {
  userid: string;
  bot_userid?: string;
}

// ---- 各消息类型的 body 子结构 ----

export interface TextContent {
  content: string;
}

export interface ImageContent {
  media_id: string;
}

export interface VoiceContent {
  content?: string;
  media_id?: string;
}

export interface FileContent {
  media_id: string;
  file_name?: string;
}

export interface MsgItem {
  msgtype: string;
  text?: TextContent;
  image?: ImageContent;
  voice?: VoiceContent;
  file?: FileContent;
}

export interface MixedContent {
  msg_item: MsgItem[];
}

export interface MarkdownContent {
  content: string;
}

export interface TemplateCardContent {
  main_title?: { title?: string; desc?: string };
}

// ---- 引用消息 ----

export interface QuoteMessage {
  msgtype: string;
  text?: TextContent;
  mixed?: MixedContent;
  markdown?: MarkdownContent;
  template_card?: TemplateCardContent;
}

// ---- aibot_msg_callback body ----

export interface MsgCallbackBody {
  from: MsgFrom;
  chatid?: string;
  chat_type?: number;
  msgtype: string;
  text?: TextContent;
  image?: ImageContent;
  voice?: VoiceContent;
  file?: FileContent;
  mixed?: MixedContent;
  quote?: QuoteMessage;
}

// ---- aibot_event_callback body ----

export interface EventCallbackBody {
  chatid?: string;
  event?: { eventtype?: string; [key: string]: unknown };
}

// ---- 发送相关 ----

export interface StreamBody {
  id: string;
  finish: boolean;
  content: string;
}

export interface SendMsgBody {
  chatid: string;
  chat_type: number;
  msgtype: string;
  markdown: { content: string };
}
