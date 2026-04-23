import { readdir, readFile, appendFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { getLogger } from '../logger.js';
import { IMemoryLayer, type HistoryEntry } from './types.js';
import type { EnvConfig } from '../config.js';

const log = getLogger('ConversationMemoryLayer');

export class ConversationMemoryLayer extends IMemoryLayer {
  readonly name = 'conversation';
  private recallDays: number;
  private workDir: string;

  constructor(env: EnvConfig) {
    super();
    this.recallDays = env.MEMORY_RECALL_DAYS;
    this.workDir = env.WORK_DIR;
  }

  async save(_chatId: string, _entry: HistoryEntry): Promise<void> {
    // ACP session stores raw conversation; no-op here
  }

  async recall(chatId: string): Promise<string> {
    const memDir = this.memoryDir(chatId);
    let files: string[];
    try {
      files = await readdir(memDir);
    } catch {
      return '';
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.recallDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;
    const mdFiles = files
      .filter(f => datePattern.test(f) && f.slice(0, 10) >= cutoffStr)
      .sort();

    if (mdFiles.length === 0) return '';

    const parts: string[] = [];
    for (const f of mdFiles) {
      const content = await readFile(join(memDir, f), 'utf-8');
      if (content.trim()) parts.push(`## ${f.replace('.md', '')}\n${content.trim()}`);
    }
    return parts.length ? `# 历史对话摘要\n\n${parts.join('\n\n')}` : '';
  }

  async onSummary(chatId: string, date: string, summary: string): Promise<void> {
    const memDir = this.memoryDir(chatId);
    await mkdir(memDir, { recursive: true });
    const filePath = join(memDir, `${date}.md`);
    await appendFile(filePath, `\n\n---\n\n${summary}`, 'utf-8');
    log.info(`Wrote summary for ${chatId} on ${date}`);
  }

  async cleanup(chatId: string): Promise<void> {
    const memDir = this.memoryDir(chatId);
    let files: string[];
    try {
      files = await readdir(memDir);
    } catch {
      return;
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const f of files) {
      if (!f.endsWith('.md') || f >= `${cutoffStr}.md`) continue;
      const src = join(memDir, f);
      const dst = join(memDir, `${f}.gz`);
      try {
        await pipeline(createReadStream(src), createGzip(), createWriteStream(dst));
        await unlink(src);
        log.info(`Compressed ${f} for ${chatId}`);
      } catch (e) {
        log.error(e, `Failed to compress ${f}`);
      }
    }
  }

  private memoryDir(chatId: string): string {
    return join(this.workDir, 'sessions', chatId, 'memory');
  }
}
