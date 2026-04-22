/**
 * 企微流式分段器
 * 企微 stream 是替换式：每次发当前 segment 的累计全文
 * 1500 字切割，换行处优先切割，表格续接
 */
import pino from 'pino';
import type { WeComPlatform } from './WeComPlatform.js';

const log = pino({ name: 'StreamSegmenter' });

const SEGMENT_LIMIT = 1500;
const FLUSH_INTERVAL = 2000;

export class StreamSegmenter {
  private segText = '';
  private fullText = '';
  private buf = '';
  private finished = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private streamId: string;

  constructor(
    private platform: WeComPlatform,
    private chatId: string,
    streamId: string,
    private limit = SEGMENT_LIMIT,
    private flushInterval = FLUSH_INTERVAL,
  ) {
    this.streamId = streamId;
  }

  async feed(delta: string): Promise<void> {
    this.buf += delta;
    this.fullText += delta;
    if (this.segText.length + this.buf.length >= this.limit) {
      await this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        if (this.buf) this.flush().catch(e => log.error(e, 'delayed flush failed'));
      }, this.flushInterval);
    }
  }

  async finish(): Promise<void> {
    this.clearTimer();
    if (this.buf) await this.flush();
    if (!this.finished && this.segText) {
      try {
        await this.platform.sendStream(this.chatId, this.streamId, this.segText, true);
      } catch {
        // 6000 conflict fallback
        log.info('stream finish failed, falling back to sendMessage');
        if (this.fullText) await this.platform.sendMessage(this.chatId, this.fullText);
      }
      this.finished = true;
    }
  }

  /** Fallback: return full accumulated text for sendMessage degradation */
  get text(): string { return this.fullText; }

  private async flush(): Promise<void> {
    this.clearTimer();
    while (this.buf) {
      const space = this.limit - this.segText.length;
      if (this.buf.length <= space) {
        this.segText += this.buf;
        this.buf = '';
        try {
          await this.platform.sendStream(this.chatId, this.streamId, this.segText, false);
        } catch {
          log.info('stream push failed, will degrade on finish');
        }
      } else {
        let cut = space;
        const nl = this.buf.lastIndexOf('\n', space);
        if (nl > 0) cut = nl + 1;

        this.segText += this.buf.slice(0, cut);
        this.buf = this.buf.slice(cut);

        const tableHeader = extractTableHeader(this.segText);

        try {
          await this.platform.sendStream(this.chatId, this.streamId, this.segText, true);
        } catch {
          log.info('stream segment close failed, falling back to sendMessage');
          if (this.fullText) await this.platform.sendMessage(this.chatId, this.fullText);
          this.finished = true;
          return;
        }

        // New segment
        this.streamId = randomId();
        this.segText = '';

        // Table continuation: prepend header to next segment
        if (tableHeader && this.buf && this.buf.trimStart().startsWith('|')) {
          this.segText = tableHeader;
        }
      }
    }
  }

  private clearTimer(): void {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
  }
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 18);
}

/**
 * Extract the last markdown table header (title + separator) from text.
 * Only returns header if text ends mid-table.
 */
function extractTableHeader(text: string): string {
  const lines = text.trimEnd().split('\n');
  if (!lines.length || !lines[lines.length - 1].trim().startsWith('|')) return '';

  let tableStart = lines.length - 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const s = lines[i].trim();
    if (s.startsWith('|')) { tableStart = i; }
    else if (!s) { continue; }
    else { break; }
  }

  if (tableStart + 1 < lines.length) {
    const h1 = lines[tableStart].trim();
    const h2 = lines[tableStart + 1].trim();
    if (h1.startsWith('|') && h2.startsWith('|') && h2.includes('---')) {
      return h1 + '\n' + h2 + '\n';
    }
  }
  return '';
}
