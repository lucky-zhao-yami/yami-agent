import { describe, it, expect } from 'vitest';
import { isImage, detectMediaType } from '../media.js';

describe('isImage', () => {
  it('detects JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(8).fill(0)]);
    expect(isImage(buf)).toBe(true);
  });

  it('detects PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(8).fill(0)]);
    expect(isImage(buf)).toBe(true);
  });

  it('detects GIF', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, ...Array(8).fill(0)]);
    expect(isImage(buf)).toBe(true);
  });

  it('detects WEBP', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(isImage(buf)).toBe(true);
  });

  it('returns false for non-image', () => {
    const buf = Buffer.from('hello world');
    expect(isImage(buf)).toBe(false);
  });

  it('returns false for short buffer', () => {
    const buf = Buffer.from([0xff, 0xd8]);
    expect(isImage(buf)).toBe(false);
  });
});

describe('detectMediaType', () => {
  it('detects JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, ...Array(10).fill(0)]);
    expect(detectMediaType(buf)).toBe('image/jpeg');
  });

  it('detects GIF', () => {
    const buf = Buffer.from([0x47, 0x49, ...Array(10).fill(0)]);
    expect(detectMediaType(buf)).toBe('image/gif');
  });

  it('defaults to PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(10).fill(0)]);
    expect(detectMediaType(buf)).toBe('image/png');
  });
});
