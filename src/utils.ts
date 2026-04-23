import { randomUUID } from 'node:crypto';

/** Generate a 16-char hex request ID (compatible with WeChat WS protocol) */
export function generateReqId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}
