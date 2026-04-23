import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger.js';
import type { AppConfig } from '../config.js';
import type { AgentChunk, PromptContent } from '../agent/types.js';
import type { IncomingMessage, MixedItem, PlatformEvent, IMessagePlatform } from '../platform/types.js';
import type { WeComPlatform } from '../platform/wecom/WeComPlatform.js';
import type { SessionManager } from '../session/SessionManager.js';
import { StreamSegmenter } from '../platform/wecom/StreamSegmenter.js';
import { downloadMedia, saveMedia, isImage } from '../platform/wecom/media.js';
import { checkInjection } from './guard.js';
import { parseCommand, handleCommand } from './commands.js';

const log = getLogger('Bridge');

export class Bridge {
  constructor(
    private platform: IMessagePlatform,
    private sessionManager: SessionManager,
    private config: AppConfig,
  ) {
    this.platform.onMessage((msg) => this.handleMessage(msg));
    this.platform.onEvent((evt) => this.handleEvent(evt));
  }

  private async handleEvent(evt: PlatformEvent) {
    if (evt.type === 'enter_chat' && evt.reqId) {
      await this.platform.sendWelcome(evt.reqId, this.config.bot.welcome_msg);
    }
  }

  private async handleMessage(msg: IncomingMessage) {
    const { chatId, reqId, chatType } = msg;
    let streamId = '';

    try {
      const { text, content } = await this.extractContent(msg);
      if (!text && content.length === 0) return;

      if (text && checkInjection(text)) {
        const sid = randomUUID().replace(/-/g, '').slice(0, 16);
        await this.platform.sendStream(reqId, sid, '⚠️ 检测到异常指令，已忽略。', true);
        return;
      }

      const session = await this.sessionManager.getOrCreate(chatId);

      if (text) {
        const parsed = parseCommand(text);
        if (parsed) {
          await handleCommand({
            chatId,
            session,
            sessionManager: this.sessionManager,
            config: this.config,
            reply: (t) => this.platform.sendMessage(chatId, t, chatType),
          }, parsed.cmd, parsed.args);
          return;
        }
      }

      // Preamble is injected by ManagedSession.injectContext on firstMsg only

      // 🤔 cold start placeholder
      streamId = randomUUID().replace(/-/g, '').slice(0, 16);
      await this.platform.sendStream(reqId, streamId, '🤔', false).catch(() => {});

      const segmenter = new StreamSegmenter(this.platform, reqId, streamId, chatId, chatType);

      let accumulated = '';
      const onChunk = async (chunk: AgentChunk) => {
        if (chunk.type === 'text') {
          accumulated += chunk.text;
          await segmenter.feed(chunk.text);
        }
      };

      try {
        await session.send(content, onChunk);
        await segmenter.finish();
      } catch (sendErr) {
        segmenter.dispose(); // clean up flushTimer
        throw sendErr;
      }
    } catch (err) {
      log.error(err, `Error processing message for ${chatId}`);
      if (streamId) {
        await this.platform.sendStream(reqId, streamId, '❌ 处理消息时出错，请稍后重试', true).catch(() => {});
      } else {
        await this.platform.sendMessage(chatId, '❌ 处理消息时出错，请稍后重试', chatType).catch(() => {});
      }
    }
  }

  private async extractContent(msg: IncomingMessage): Promise<{ text: string; content: PromptContent[] }> {
    const parts: PromptContent[] = [];
    let text = '';

    if (msg.quote) {
      text += `[引用: ${msg.quote}]\n`;
    }

    if (msg.msgType === 'text' && msg.text) {
      text += msg.text;
      parts.push({ type: 'text', text });
    } else if (msg.msgType === 'mixed' && msg.items) {
      for (const item of msg.items) {
        const p = await this.processMixedItem(msg.chatId, item);
        if (p) parts.push(p);
      }
      text += parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ');
    } else if (msg.msgType === 'voice' && msg.text) {
      text += msg.text;
      parts.push({ type: 'text', text });
    } else if (msg.msgType === 'image' && msg.items?.[0]) {
      const p = await this.processMixedItem(msg.chatId, msg.items[0]);
      if (p) parts.push(p);
    } else if (msg.text) {
      text += msg.text;
      parts.push({ type: 'text', text });
    }

    return { text, content: parts };
  }

  private async processMixedItem(chatId: string, item: MixedItem): Promise<PromptContent | null> {
    if (item.type === 'text' && item.content) {
      return { type: 'text', text: item.content };
    }

    if (item.type === 'voice' && item.content) {
      return { type: 'text', text: `[语音转文字]: ${item.content}` };
    }

    if ((item.type === 'image' || item.type === 'file') && item.mediaId) {
      const data = await downloadMedia({ mediaId: item.mediaId }, this.platform);
      if (!data) return { type: 'text', text: `[${item.type === 'image' ? '图片' : '文件'}下载失败]` };

      const path = await saveMedia(
        this.config.env.WORK_DIR, chatId, data,
        item.type === 'image' ? 'images' : 'files',
      );

      if (item.type === 'image' && isImage(data)) {
        return { type: 'image', data: data.toString('base64'), mediaType: 'image/png' };
      }
      return { type: 'text', text: `[文件已保存: ${path}，请用文件读取工具查看]` };
    }

    return null;
  }

  async shutdown() {
    await this.sessionManager.shutdown();
  }
}
