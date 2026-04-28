/**
 * 企微消息解析 — 从 WS body 解析为 IncomingMessage
 */
import type { IncomingMessage, MixedItem } from '../types.js';
import type { MsgCallbackBody, MsgItem, QuoteMessage } from './protocol.js';

export function parseMsgCallback(botId: string, rid: string, body: Record<string, unknown>): IncomingMessage | null {
  const b = body as unknown as MsgCallbackBody;
  const userId = b.from?.userid || '';
  const botUserId = b.from?.bot_userid || '';

  // Ignore bot's own messages to prevent infinite loop
  if (botUserId || userId === botId) return null;

  let chatId = b.chatid || '';
  if (!chatId) chatId = `dm_${userId}`;
  const chatType = b.chat_type ?? (chatId.startsWith('dm_') ? 1 : 2);
  const msgType = b.msgtype || 'text';

  const { text, items } = parseContent(msgType, b);
  const quote = parseQuote(b.quote);

  return {
    chatId,
    userId,
    msgType: msgType as IncomingMessage['msgType'],
    text: text || undefined,
    items,
    quote,
    reqId: rid,
    chatType,
  };
}

function parseContent(msgType: string, b: MsgCallbackBody): { text: string; items?: MixedItem[] } {
  switch (msgType) {
    case 'text': {
      let text = b.text?.content || '';
      // Strip @bot prefix in group messages
      if (text.startsWith('@')) {
        const spaceIdx = text.indexOf(' ');
        if (spaceIdx > 0) text = text.slice(spaceIdx + 1);
      }
      return { text };
    }
    case 'mixed':
      return parseMixed(b.mixed?.msg_item || []);
    case 'image':
      return { text: '', items: [{ type: 'image', mediaId: b.image?.media_id || '' }] };
    case 'voice':
      return { text: b.voice?.content || '' };
    case 'file':
      return { text: '', items: [{ type: 'file', mediaId: b.file?.media_id || '' }] };
    default:
      return { text: '' };
  }
}

function parseMixed(msgItems: MsgItem[]): { text: string; items: MixedItem[] } {
  const items: MixedItem[] = [];
  let text = '';

  for (const m of msgItems) {
    switch (m.msgtype) {
      case 'text': {
        const c = m.text?.content || '';
        items.push({ type: 'text', content: c });
        text += c;
        break;
      }
      case 'image':
        items.push({ type: 'image', mediaId: m.image?.media_id || '' });
        break;
      case 'voice': {
        const c = m.voice?.content || '';
        items.push({ type: 'voice', content: c });
        text += c;
        break;
      }
      case 'file':
        items.push({ type: 'file', mediaId: m.file?.media_id || '' });
        break;
    }
  }
  return { text, items };
}

function parseQuote(q: QuoteMessage | undefined): string | undefined {
  if (!q) return undefined;

  switch (q.msgtype) {
    case 'text':
      return q.text?.content || undefined;
    case 'mixed': {
      const text = (q.mixed?.msg_item || [])
        .filter(i => i.msgtype === 'text')
        .map(i => i.text?.content || '')
        .filter(Boolean).join(' ');
      return text || undefined;
    }
    case 'markdown':
      return q.markdown?.content || undefined;
    case 'template_card': {
      const title = q.template_card?.main_title?.title || '';
      const desc = q.template_card?.main_title?.desc || '';
      return [title, desc].filter(Boolean).join(': ') || undefined;
    }
    default:
      return undefined;
  }
}
