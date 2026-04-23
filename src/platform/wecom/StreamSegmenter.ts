/**
 * 企微流式分段器
 * 企微 stream 是替换式：每次发当前 segment 的累计全文
 * 1500 字切割，换行处优先切割，表格续接
 */
import { randomUUID } from 'node:crypto';
import { getLogger } from '../../logger.js';
import type { WeComPlatform } from './WeComPlatform.js';

const log = getLogger('StreamSegmenter');

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
    private reqId: string,
    streamId: string,
    private chatId: string,
    private chatType: number,
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

    // Check 6000 conflict — degrade to sendMessage
    if (this.platform.failedReqIds.has(this.reqId)) {
      this.platform.failedReqIds.delete(this.reqId);
      if (this.fullText && this.chatId) {
        await this.platform.sendMessage(this.chatId, this.fullText, this.chatType);
      }
      this.finished = true;
      return;
    }

    if (!this.finished && this.segText) {
      await this.platform.sendStream(this.reqId, this.streamId, this.segText, true);
      this.finished = true;
    }
  }

  get text(): string { return this.fullText; }

  private async flush(): Promise<void> {
    this.clearTimer();
    while (this.buf) {
      const space = this.limit - this.segText.length;
      if (this.buf.length <= space) {
        this.segText += this.buf;
        this.buf = '';
        await this.platform.sendStream(this.reqId, this.streamId, this.segText, false);
      } else {
        let cut = space;
        const nl = this.buf.lastIndexOf('\n', space);
        if (nl > 0) cut = nl + 1;

        this.segText += this.buf.slice(0, cut);
        this.buf = this.buf.slice(cut);

        const tableHeader = extractTableHeader(this.segText);

        // Finish current segment
        await this.platform.sendStream(this.reqId, this.streamId, this.segText, true);

        // New segment with new stream_id
        this.streamId = randomUUID().replace(/-/g, '').slice(0, 16);
        this.segText = '';

        // Table continuation
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
