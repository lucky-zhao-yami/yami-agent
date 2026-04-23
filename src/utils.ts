import { randomUUID } from 'node:crypto';

/** Generate a 16-char hex request ID (compatible with WeChat WS protocol) */
export function generateReqId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Simple async queue for bridging push-based callbacks to async iteration */
export class AsyncQueue<T> {
  private buffer: T[] = [];
  private waiter: ((v: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: undefined as unknown as T, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }
        return new Promise(resolve => { this.waiter = resolve; });
      },
    };
  }
}
