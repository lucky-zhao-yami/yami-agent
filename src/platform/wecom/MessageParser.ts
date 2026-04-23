/**
 * 企微消息解析 — 从 WS body 解析为 IncomingMessage
 */
import type { IncomingMessage, MixedItem } from '../types.js';

export function parseMsgCallback(botId: string, rid: string, body: Record<string, unknown>): IncomingMessage | null {
  const from = (body['from'] as Record<string, unknown>) || {};
  const userId = (from['userid'] as string) || '';
  const botUserId = (from['bot_userid'] as string) || '';

  // Ignore bot's own messages to prevent infinite loop
  if (botUserId || userId === botId) return null;

  let chatId = (body['chatid'] as string) || '';
  if (!chatId) chatId = `dm_${userId}`;
  const chatType = (body['chat_type'] as number) || (chatId.startsWith('dm_') ? 1 : 2);
  const msgType = (body['msgtype'] as string) || 'text';

  const { text, items } = parseContent(msgType, body);
  const quote = parseQuote(body);

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

function parseContent(msgType: string, body: Record<string, unknown>): { text: string; items?: MixedItem[] } {
  switch (msgType) {
    case 'text': {
      const obj = body['text'] as Record<string, unknown> | undefined;
      return { text: (obj?.['content'] as string) || '' };
    }
    case 'mixed':
      return parseMixed(body);
    case 'image': {
      const img = body['image'] as Record<string, unknown> | undefined;
      return { text: '', items: [{ type: 'image', mediaId: (img?.['media_id'] as string) || '' }] };
    }
    case 'voice': {
      const voice = body['voice'] as Record<string, unknown> | undefined;
      return { text: (voice?.['content'] as string) || '' };
    }
    case 'file': {
      const file = body['file'] as Record<string, unknown> | undefined;
      return { text: '', items: [{ type: 'file', mediaId: (file?.['media_id'] as string) || '' }] };
    }
    default:
      return { text: '' };
  }
}

function parseMixed(body: Record<string, unknown>): { text: string; items: MixedItem[] } {
  const mixed = body['mixed'] as Record<string, unknown> | undefined;
  const msgItems = (mixed?.['msg_item'] as Record<string, unknown>[]) || [];
  const items: MixedItem[] = [];
  let text = '';

  for (const m of msgItems) {
    const t = (m['msgtype'] as string) || 'text';
    if (t === 'text') {
      const c = ((m['text'] as Record<string, unknown>)?.['content'] as string) || '';
      items.push({ type: 'text', content: c });
      text += c;
    } else if (t === 'image') {
      items.push({ type: 'image', mediaId: ((m['image'] as Record<string, unknown>)?.['media_id'] as string) || '' });
    } else if (t === 'voice') {
      const c = ((m['voice'] as Record<string, unknown>)?.['content'] as string) || '';
      items.push({ type: 'voice', content: c });
      text += c;
    } else if (t === 'file') {
      items.push({ type: 'file', mediaId: ((m['file'] as Record<string, unknown>)?.['media_id'] as string) || '' });
    }
  }
  return { text, items };
}

function parseQuote(body: Record<string, unknown>): string | undefined {
  const quoteObj = body['quote'] as Record<string, unknown> | undefined;
  if (!quoteObj) return undefined;

  const qt = (quoteObj['msgtype'] as string) || '';
  if (qt === 'text') {
    return ((quoteObj['text'] as Record<string, unknown>)?.['content'] as string) || undefined;
  }
  if (qt === 'mixed') {
    const qMixed = quoteObj['mixed'] as Record<string, unknown> | undefined;
    const qItems = (qMixed?.['msg_item'] as Record<string, unknown>[]) || [];
    const text = qItems
      .filter(i => (i['msgtype'] as string) === 'text')
      .map(i => ((i['text'] as Record<string, unknown>)?.['content'] as string) || '')
      .filter(Boolean).join(' ');
    return text || undefined;
  }
  if (qt === 'markdown') {
    return ((quoteObj['markdown'] as Record<string, unknown>)?.['content'] as string) || undefined;
  }
  return undefined;
}
