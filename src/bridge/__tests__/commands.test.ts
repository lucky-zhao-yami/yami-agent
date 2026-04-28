import { describe, it, expect } from 'vitest';
import { parseCommand } from '../commands.js';

describe('parseCommand', () => {
  it('parses command with args', () => {
    expect(parseCommand('/agent kiro-cli')).toEqual({ cmd: '/agent', args: 'kiro-cli' });
  });

  it('parses command without args', () => {
    expect(parseCommand('/new')).toEqual({ cmd: '/new', args: '' });
  });

  it('returns null for non-command text', () => {
    expect(parseCommand('hello world')).toBeNull();
  });

  it('converts command to lowercase', () => {
    expect(parseCommand('/NEW')).toEqual({ cmd: '/new', args: '' });
  });

  it('preserves args case', () => {
    expect(parseCommand('/agent MyAgent')).toEqual({ cmd: '/agent', args: 'MyAgent' });
  });

  it('returns null for empty string', () => {
    expect(parseCommand('')).toBeNull();
  });

  it('handles command with multiple spaces in args', () => {
    expect(parseCommand('/mode ask code')).toEqual({ cmd: '/mode', args: 'ask code' });
  });
});
