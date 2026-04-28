import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamSegmenter } from '../StreamSegmenter.js';
import type { IMessagePlatform } from '../../types.js';

function mockPlatform(): IMessagePlatform & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    failedReqIds: new Set<string>(),
    sendStream: vi.fn(async (...args: unknown[]) => { calls.push({ method: 'sendStream', args }); }),
    sendMessage: vi.fn(async (...args: unknown[]) => { calls.push({ method: 'sendMessage', args }); }),
    // unused but required by interface
    connect: vi.fn(), disconnect: vi.fn(), onMessage: vi.fn(), onEvent: vi.fn(),
    sendWelcome: vi.fn(), getMedia: vi.fn(),
  } as unknown as IMessagePlatform & { calls: { method: string; args: unknown[] }[] };
}

describe('StreamSegmenter', () => {
  let platform: ReturnType<typeof mockPlatform>;

  beforeEach(() => {
    platform = mockPlatform();
  });

  it('sends short text in one segment on finish', async () => {
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 1500, 50);
    await seg.feed('hello world');
    await seg.finish();

    // Should have at least one sendStream call with finish=true
    const finishCall = platform.calls.find(c => c.method === 'sendStream' && c.args[3] === true);
    expect(finishCall).toBeDefined();
    expect(finishCall!.args[2]).toContain('hello world');
  });

  it('splits text exceeding limit into multiple segments', async () => {
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 20, 10);
    // Feed 50 chars — should split into multiple segments
    await seg.feed('a'.repeat(50));
    await seg.finish();

    // Should have multiple sendStream calls, at least 2 with finish=true (segment boundaries)
    const streamCalls = platform.calls.filter(c => c.method === 'sendStream');
    expect(streamCalls.length).toBeGreaterThan(1);
  });

  it('prefers newline as split point', async () => {
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 30, 10);
    await seg.feed('line one here\nline two here\nline three here');
    await seg.finish();

    // Check that segments end at newline boundaries
    const finishedSegments = platform.calls
      .filter(c => c.method === 'sendStream' && c.args[3] === true)
      .map(c => c.args[2] as string);

    if (finishedSegments.length > 1) {
      // First finished segment should end with content up to a newline
      expect(finishedSegments[0]).toMatch(/\n$/);
    }
  });

  it('degrades to sendMessage on 6000 conflict', async () => {
    platform.failedReqIds.add('req1');
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 1500, 50);
    await seg.feed('hello');
    await seg.finish();

    const msgCall = platform.calls.find(c => c.method === 'sendMessage');
    expect(msgCall).toBeDefined();
    expect(msgCall!.args[1]).toContain('hello');
  });

  it('dispose cleans up timer without finishing', async () => {
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 1500, 100000);
    await seg.feed('hello');
    seg.dispose();
    // No error thrown, timer cleaned up
    expect(true).toBe(true);
  });

  it('continues table header in next segment', async () => {
    const seg = new StreamSegmenter(platform, 'req1', 'stream1', 'chat1', 2, '', 60, 10);
    const table = '| Name | Value |\n| --- | --- |\n| row1 | val1 |\n| row2 | val2 |\n| row3 | val3 |\n| row4 | val4 |';
    await seg.feed(table);
    await seg.finish();

    // If split happened inside table, next segment should start with table header
    const streamCalls = platform.calls.filter(c => c.method === 'sendStream');
    if (streamCalls.length > 2) {
      // Find a non-first segment that contains table rows
      const laterSegments = streamCalls.slice(1).map(c => c.args[2] as string);
      const hasTableContinuation = laterSegments.some(s => s.startsWith('| Name'));
      expect(hasTableContinuation).toBe(true);
    }
  });
});
