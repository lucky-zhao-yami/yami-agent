import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConversationMemoryLayer } from '../ConversationMemoryLayer.js';
import type { EnvConfig } from '../../config.js';

let workDir: string;
let layer: ConversationMemoryLayer;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'yami-test-'));
  layer = new ConversationMemoryLayer({ WORK_DIR: workDir, MEMORY_RECALL_DAYS: 7 } as EnvConfig);
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('ConversationMemoryLayer', () => {
  it('recall returns empty string for missing dir', async () => {
    expect(await layer.recall('nonexistent')).toBe('');
  });

  it('onSummary writes to YYYY-MM-DD.md', async () => {
    await layer.onSummary('chat1', '2026-04-28', 'Test summary');
    const memDir = join(workDir, 'sessions', 'chat1', 'memory');
    const files = await readdir(memDir);
    expect(files).toContain('2026-04-28.md');
    const content = await readFile(join(memDir, '2026-04-28.md'), 'utf-8');
    expect(content).toContain('Test summary');
  });

  it('recall reads recent .md files within recallDays', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await layer.onSummary('chat1', today, 'Today summary');
    const result = await layer.recall('chat1');
    expect(result).toContain('Today summary');
    expect(result).toContain(today);
  });

  it('recall ignores files older than recallDays', async () => {
    // Write a file dated 30 days ago
    const old = new Date();
    old.setDate(old.getDate() - 30);
    const oldDate = old.toISOString().slice(0, 10);
    await layer.onSummary('chat1', oldDate, 'Old summary');

    const result = await layer.recall('chat1');
    expect(result).not.toContain('Old summary');
  });

  it('recall respects maxChars, newest first', async () => {
    const today = new Date();
    const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(today); d2.setDate(d2.getDate() - 2);
    const date0 = today.toISOString().slice(0, 10);
    const date1 = d1.toISOString().slice(0, 10);
    const date2 = d2.toISOString().slice(0, 10);

    await layer.onSummary('chat1', date2, 'Day 2 summary content here');
    await layer.onSummary('chat1', date1, 'Day 1 summary content here');
    await layer.onSummary('chat1', date0, 'Today summary content here');

    // With a small maxChars, only the newest file(s) should be included
    const result = await layer.recall('chat1', undefined, 80);
    expect(result).toContain(date0);
    // date2 should be excluded due to maxChars
    expect(result).not.toContain(date2);
  });

  it('recall without maxChars returns all recent files', async () => {
    const today = new Date();
    const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
    const date0 = today.toISOString().slice(0, 10);
    const date1 = d1.toISOString().slice(0, 10);

    await layer.onSummary('chat1', date1, 'Yesterday');
    await layer.onSummary('chat1', date0, 'Today');

    const result = await layer.recall('chat1');
    expect(result).toContain(date0);
    expect(result).toContain(date1);
  });

  it('cleanup compresses files older than 30 days', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    const oldDate = old.toISOString().slice(0, 10);
    await layer.onSummary('chat1', oldDate, 'Ancient summary');

    await layer.cleanup('chat1');

    const memDir = join(workDir, 'sessions', 'chat1', 'memory');
    const files = await readdir(memDir);
    expect(files).not.toContain(`${oldDate}.md`);
    expect(files).toContain(`${oldDate}.md.gz`);
  });

  it('cleanup does not compress recent files', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await layer.onSummary('chat1', today, 'Recent summary');

    await layer.cleanup('chat1');

    const memDir = join(workDir, 'sessions', 'chat1', 'memory');
    const files = await readdir(memDir);
    expect(files).toContain(`${today}.md`);
    expect(files).not.toContain(`${today}.md.gz`);
  });
});
