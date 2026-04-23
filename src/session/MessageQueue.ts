import { getLogger } from '../logger.js';

const log = getLogger('MessageQueue');

type Task<T> = () => Promise<T>;

interface QueueItem<T = unknown> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export class MessageQueue {
  private queue: QueueItem[] = [];
  private running = false;

  constructor(private promptTimeout: number) {}

  enqueue<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task: task as Task<unknown>, resolve: resolve as (v: unknown) => void, reject });
      if (!this.running) this.drain();
    });
  }

  private async drain() {
    this.running = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await this.withTimeout(item.task);
        item.resolve(result);
      } catch (err) {
        log.error(err, 'Task failed');
        item.reject(err);
      }
    }
    this.running = false;
  }

  private withTimeout<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Prompt timeout')), this.promptTimeout * 1000);
      task().then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }
}
