import { describe, it, expect } from 'vitest';
import { parseMsgCallback } from '../MessageParser.js';

const BOT_ID = 'test-bot';

function makeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from: { userid: 'user1' },
    chatid: 'group123',
    chat_type: 2,
    msgtype: 'text',
    text: { content: 'hello' },
    ...overrides,
  };
}

describe('parseMsgCallback', () => {
  it('filters bot own messages by bot_userid', () => {
    const body = makeBody({ from: { userid: 'user1', bot_userid: 'bot1' } });
    expect(parseMsgCallback(BOT_ID, 'req1', body)).toBeNull();
  });

  it('filters bot own messages by userId === botId', () => {
    const body = makeBody({ from: { userid: BOT_ID } });
    expect(parseMsgCallback(BOT_ID, 'req1', body)).toBeNull();
  });

  it('parses text message', () => {
    const msg = parseMsgCallback(BOT_ID, 'req1', makeBody());
    expect(msg).not.toBeNull();
    expect(msg!.chatId).toBe('group123');
    expect(msg!.userId).toBe('user1');
    expect(msg!.msgType).toBe('text');
    expect(msg!.text).toBe('hello');
    expect(msg!.chatType).toBe(2);
    expect(msg!.reqId).toBe('req1');
  });

  it('strips @bot prefix in group text', () => {
    const body = makeBody({ text: { content: '@BotName what is this' } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.text).toBe('what is this');
  });

  it('falls back to dm_{userId} when no chatId', () => {
    const body = makeBody({ chatid: undefined, chat_type: undefined });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.chatId).toBe('dm_user1');
    expect(msg!.chatType).toBe(1);
  });

  it('infers chatType=1 for dm_ prefix', () => {
    const body = makeBody({ chatid: 'dm_user1', chat_type: undefined });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.chatType).toBe(1);
  });

  it('parses mixed message with text + image', () => {
    const body = makeBody({
      msgtype: 'mixed',
      mixed: {
        msg_item: [
          { msgtype: 'text', text: { content: 'look at this' } },
          { msgtype: 'image', image: { media_id: 'img123' } },
        ],
      },
    });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.msgType).toBe('mixed');
    expect(msg!.items).toHaveLength(2);
    expect(msg!.items![0]).toEqual({ type: 'text', content: 'look at this' });
    expect(msg!.items![1]).toEqual({ type: 'image', mediaId: 'img123' });
  });

  it('parses voice message content', () => {
    const body = makeBody({ msgtype: 'voice', voice: { content: 'transcribed text' } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.text).toBe('transcribed text');
  });

  it('parses image message media_id', () => {
    const body = makeBody({ msgtype: 'image', image: { media_id: 'media456' } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.items).toEqual([{ type: 'image', mediaId: 'media456' }]);
  });

  it('parses file message media_id', () => {
    const body = makeBody({ msgtype: 'file', file: { media_id: 'file789' } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.items).toEqual([{ type: 'file', mediaId: 'file789' }]);
  });

  it('parses text quote', () => {
    const body = makeBody({ quote: { msgtype: 'text', text: { content: 'quoted text' } } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.quote).toBe('quoted text');
  });

  it('parses markdown quote', () => {
    const body = makeBody({ quote: { msgtype: 'markdown', markdown: { content: '**bold**' } } });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.quote).toBe('**bold**');
  });

  it('parses mixed quote (text parts joined)', () => {
    const body = makeBody({
      quote: {
        msgtype: 'mixed',
        mixed: { msg_item: [
          { msgtype: 'text', text: { content: 'part1' } },
          { msgtype: 'image', image: { media_id: 'x' } },
          { msgtype: 'text', text: { content: 'part2' } },
        ] },
      },
    });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.quote).toBe('part1 part2');
  });

  it('parses template_card quote', () => {
    const body = makeBody({
      quote: { msgtype: 'template_card', template_card: { main_title: { title: 'Card Title', desc: 'Card Desc' } } },
    });
    const msg = parseMsgCallback(BOT_ID, 'req1', body);
    expect(msg!.quote).toBe('Card Title: Card Desc');
  });

  it('returns undefined quote when no quote', () => {
    const msg = parseMsgCallback(BOT_ID, 'req1', makeBody());
    expect(msg!.quote).toBeUndefined();
  });
});
