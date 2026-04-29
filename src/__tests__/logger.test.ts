import { describe, it, expect } from 'vitest';
import { getLogger } from '../logger.js';

describe('logger', () => {
  it('returns a child logger with module name', () => {
    const log = getLogger('test-module');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
  });
});
