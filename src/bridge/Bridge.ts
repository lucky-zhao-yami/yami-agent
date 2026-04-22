import pino from 'pino';
import type { AppConfig } from '../config.js';
import { getChatConfig } from '../config.js';
import type { AgentChunk, PromptContent } from '../agent/types.js';
import type { IncomingMessage, MixedItem, PlatformEvent } from '../platform/types.js';
import type { WeComPlatform } from '../platform/wecom/WeComPlatform.js';
import type { SessionManager } from '../session/SessionManager.js';
import { StreamSegmenter } from '../platform/wecom/StreamSegmenter.js';
import { downloadMedia, saveMedia, isImage, aesDecryptImage } from '../platform/wecom/media.js';
import { checkInjection, getPreamble } from './guard.js';
import { parseCommand, handleCommand } from './commands.js';

const log = pino({ name: 'Bridge' });

export class Bridge {
  constructor(
    private platform: WeComPlatform,
    private sessionManager: SessionManager,
    private config: AppConfig,
  ) {
    this.platform.onMessage((msg) => this.handleMessage(msg));
    this.platform.onEvent((evt) => this.handleEvent(evt));
  }

  private async handleEvent(evt: PlatformEvent) {
    if (evt.type === 'enter_chat' && evt.chatId) {
      await this.platform.sendMessage(evt.chatId, this.config.bot.welcome_msg);
    }
  }

  private async handleMessage(msg: IncomingMessage) {
    const { chatId, reqId } = msg;

    try {
      // Build content from message (text, mixed, quote)
      const { text, content } = await this.extractContent(msg);
      if (!text && content.length === 0) return;

      // Task 4.3: injection check
      if (text && checkInjection(text)) {
        await this.platform.sendMessage(chatId, '⚠️ 检测到异常指令，已忽略。');
        return;
      }

      const session = await this.sessionManager.getOrCreate(chatId);

      // Command interception
      if (text) {
        const parsed = parseCommand(text);
        if (parsed) {
          await handleCommand({
            chatId,
            session,
            sessionManager: this.sessionManager,
            reply: (t) => this.platform.sendMessage(chatId, t),
          }, parsed.cmd, parsed.args);
          return;
        }
      }

      // Task 4.3: inject preamble on first message
      const chatConfig = getChatConfig(this.config, chatId);
      const preamble = getPreamble(chatConfig.mode);
      const finalContent: PromptContent[] = [
        { type: 'text', text: preamble },
        ...content,
      ];

      // Stream response with segmenter
      let segmenter: StreamSegmenter | null = null;
      try {
        const streamId = await this.platform.streamOpen(chatId, reqId);
        segmenter = new StreamSegmenter(this.platform, chatId, streamId);
      } catch {
        log.info('streamOpen failed, falling back to sendMessage');
      }

      let accumulated = '';
      const onChunk = async (chunk: AgentChunk) => {
        if (chunk.type === 'text') {
          accumulated += chunk.text;
          if (segmenter) await segmenter.feed(chunk.text);
        }
      };

      await session.send(finalContent, onChunk);

      if (segmenter) {
        await segmenter.finish();
      } else if (accumulated) {
        await this.platform.sendMessage(chatId, accumulated);
      }
    } catch (err) {
      log.error(err, `Error processing message for ${chatId}`);
      await this.platform.sendMessage(chatId, '❌ 处理消息时出错，请稍后重试').catch(() => {});
    }
  }

  /**
   * Extract text + PromptContent[] from incoming message.
   * Handles text, mixed (image/voice/file), and quoted messages.
   */
  private async extractContent(msg: IncomingMessage): Promise<{ text: string; content: PromptContent[] }> {
    const parts: PromptContent[] = [];
    let text = '';

    // Task 4.7: prepend quote
    if (msg.quote) {
      text += `[引用: ${msg.quote}]\n`;
    }

    if (msg.msgType === 'text' && msg.text) {
      text += msg.text;
      parts.push({ type: 'text', text });
    } else if (msg.msgType === 'mixed' && msg.items) {
      // Task 4.2: process mixed items
      for (const item of msg.items) {
        const p = await this.processMixedItem(msg.chatId, item);
        if (p) parts.push(p);
      }
      // Extract text from parts for injection check
      text += parts.filter(p => p.type === 'text').map(p => (p as { text: string }).text).join(' ');
    } else if (msg.msgType === 'voice' && msg.text) {
      // Voice: use WeChat STT text
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
