import { randomUUID } from 'node:crypto';
import { getLogger } from '../logger.js';
import type { AppConfig } from '../config.js';
import type { AgentChunk, PromptContent } from '../agent/types.js';
import type { IncomingMessage, MixedItem, PlatformEvent, IMessagePlatform } from '../platform/types.js';
import type { SessionManager } from '../session/SessionManager.js';
import { StreamSegmenter } from '../platform/wecom/StreamSegmenter.js';
import { messagesTotal, messagesProcessed, messageDuration, injectionBlocked } from '../observability/metrics.js';
import { downloadMedia, saveMedia, isImage } from '../platform/wecom/media.js';
import { checkInjection } from './guard.js';
import { parseCommand, handleCommand } from './commands.js';

const log = getLogger('Bridge');

/**
 * 消息路由中枢 — 连接消息平台和 Agent 会话。
 * 负责: 消息提取、注入检测、命令解析、冷启动占位（🤔）、
 * 通过 StreamSegmenter 流式回复、per-chatId 串行锁。
 */
export class Bridge {
  private streamLocks = new Map<string, Promise<void>>();
  private agentflowPlatform: any = null;
  readonly pendingSubmits = new Map<string, { chatId: string; sessionId: string | null; timestamp: number }>();

  constructor(
    private platform: IMessagePlatform,
    private sessionManager: SessionManager,
    private config: AppConfig,
  ) {
    this.platform.onMessage((msg) => this.handleMessage(msg));
    this.platform.onEvent((evt) => this.handleEvent(evt));
    // Cleanup expired pendingSubmits every 60s
    setInterval(() => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of this.pendingSubmits) {
        if (v.timestamp < cutoff) this.pendingSubmits.delete(k);
      }
    }, 60_000);
  }

  setAgentFlowPlatform(platform: any): void { this.agentflowPlatform = platform; }
  getAgentFlowPlatform(): any { return this.agentflowPlatform; }

  private async handleEvent(evt: PlatformEvent) {
    if (evt.type === 'enter_chat' && evt.reqId) {
      await this.platform.sendWelcome(evt.reqId, this.config.bot.welcome_msg);
    }
  }

  private async handleMessage(msg: IncomingMessage) {
    const { chatId } = msg;
    // Per-chatId stream lock: serialize from 🤔 to finish to prevent interleaving
    const prev = this.streamLocks.get(chatId) ?? Promise.resolve();
    const current = prev.then(() => this.doHandleMessage(msg)).catch(() => {});
    this.streamLocks.set(chatId, current);
  }

  private async doHandleMessage(msg: IncomingMessage) {
    const { chatId, reqId, chatType } = msg;
    const startTime = Date.now();
    messagesTotal.inc({ chat_type: chatType === 1 ? 'dm' : 'group' });
    let streamId = '';

    try {
      const { text, content } = await this.extractContent(msg);
      if (!text && content.length === 0) return;

      // Handle card click callbacks
      if (text && text.startsWith('__card_click__:')) {
        const [, taskId, key] = text.split(':');
        await this.handleCardClick(chatId, chatType, taskId, key);
        return;
      }

      if (text && checkInjection(text)) {
        injectionBlocked.inc();
        messagesProcessed.inc({ status: 'injection' });
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
            chatType,
            session,
            sessionManager: this.sessionManager,
            config: this.config,
            reply: (t) => this.platform.sendMessage(chatId, t, chatType),
            platform: this.platform,
            agentflowPlatform: this.agentflowPlatform,
            pendingSubmits: this.pendingSubmits,
          }, parsed.cmd, parsed.args);
          return;
        }
      }

      // Preamble is injected by ManagedSession.injectContext on firstMsg only

      // 🤔 cold start placeholder
      streamId = randomUUID().replace(/-/g, '').slice(0, 16);
      await this.platform.sendStream(reqId, streamId, '🤔', false).catch(() => {});

      const segmenter = new StreamSegmenter(this.platform, reqId, streamId, chatId, chatType);

      const onChunk = async (chunk: AgentChunk) => {
        if (chunk.type === 'text') {
          await segmenter.feed(chunk.text);
        }
      };

      try {
        await session.send(content, onChunk);
        await segmenter.finish();
        messagesProcessed.inc({ status: 'ok' });
        messageDuration.observe((Date.now() - startTime) / 1000);

        // 自动检测文档链接，发送 workflow 选择卡片
        const output = session.lastOutput;
        if (output.includes('docs.google.com/document') && this.agentflowPlatform) {
          const workflows = this.agentflowPlatform.workflows;
          if (workflows.length > 0) {
            const taskId = `submit_${chatId}_${Date.now()}`;
            if ('sendTemplateCard' in this.platform) {
              await (this.platform as any).sendTemplateCard(chatId, chatType, {
                title: '提交到开发流程',
                desc: '选择要使用的工作流：',
                buttons: workflows.map((w: any) => ({ text: w.name, key: `submit_wf_${w.id}`, style: 1 })),
                taskId,
              });
              this.pendingSubmits.set(taskId, { chatId, sessionId: session.sessionId, timestamp: Date.now() });
            }
          }
        }
      } catch (sendErr) {
        segmenter.dispose();
        throw sendErr;
      }
    } catch (err) {
      const status = err instanceof Error && err.message === 'Prompt timeout' ? 'timeout' : 'error';
      messagesProcessed.inc({ status });
      messageDuration.observe((Date.now() - startTime) / 1000);
      log.error(err, `Error processing message for ${chatId}`);

      // 进程死了就立即清理，下条消息会自动重建
      const session = this.sessionManager.getSession(chatId);
      if (session && !session.alive) {
        log.info(`Agent process dead for ${chatId}, removing session for auto-recovery`);
        await this.sessionManager.removeSession(chatId);
      }

      if (streamId) {
        await this.platform.sendStream(reqId, streamId, '❌ 处理消息时出错，请稍后重试', true).catch(() => {});
      } else {
        await this.platform.sendMessage(chatId, '❌ 处理消息时出错，请稍后重试', chatType).catch(() => {});
      }
    }
  }

  private async handleCardClick(chatId: string, chatType: number, taskId: string, key: string): Promise<void> {
    if (!key.startsWith('submit_wf_')) return;
    const workflowId = key.replace('submit_wf_', '');
    const pending = this.pendingSubmits.get(taskId);
    if (!pending) return;
    this.pendingSubmits.delete(taskId);

    const session = this.sessionManager.getSession(pending.chatId);
    const lastOutput = session?.lastOutput ?? '';
    if (!lastOutput) {
      await this.platform.sendMessage(chatId, '❌ 没有可提交的内容', chatType);
      return;
    }

    this.agentflowPlatform?.submitIssue({
      sessionId: session?.sessionId ?? '',
      title: lastOutput.split('\n')[0].slice(0, 50) || 'New Issue',
      content: lastOutput,
      source: { type: 'wecom', userId: chatId, chatId },
      workflowId,
    });
    await this.platform.sendMessage(chatId, '✅ 已提交到 AgentFlow 平台，任务开始执行', chatType);
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
