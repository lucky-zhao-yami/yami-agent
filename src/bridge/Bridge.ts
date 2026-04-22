import pino from 'pino';
import type { AppConfig } from '../config.js';
import type { AgentChunk, PromptContent } from '../agent/types.js';
import type { IncomingMessage, PlatformEvent } from '../platform/types.js';
import type { WeComPlatform } from '../platform/wecom/WeComPlatform.js';
import type { SessionManager } from '../session/SessionManager.js';
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
    const { chatId, text, reqId } = msg;
    if (!text?.trim()) return;

    try {
      const session = await this.sessionManager.getOrCreate(chatId);

      // Command interception
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

      // Send 🤔 placeholder on cold start
      await this.platform.sendMessage(chatId, '🤔').catch(() => {});

      // Stream response
      let streamId: string | null = null;
      try {
        streamId = await this.platform.streamOpen(chatId, reqId);
      } catch {
        log.info('streamOpen failed, falling back to sendMessage');
      }

      let accumulated = '';
      const content: PromptContent[] = [{ type: 'text', text }];

      const onChunk = async (chunk: AgentChunk) => {
        if (chunk.type === 'text') {
          accumulated += chunk.text;
          if (streamId) await this.platform.streamPush(streamId, accumulated).catch(() => {});
        }
      };

      await session.send(content, onChunk);

      if (streamId) {
        await this.platform.streamClose(streamId).catch(() => {});
      } else if (accumulated) {
        await this.platform.sendMessage(chatId, accumulated);
      }
    } catch (err) {
      log.error(err, `Error processing message for ${chatId}`);
      await this.platform.sendMessage(chatId, '❌ 处理消息时出错，请稍后重试').catch(() => {});
    }
  }

  async shutdown() {
    await this.sessionManager.shutdown();
  }
}
