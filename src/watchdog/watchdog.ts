/**
 * 看门狗 — 独立入口，spawn 主进程并监控
 * 异常退出指数退避重启，正常退出(code 0)不重启
 *
 * Usage: node dist/watchdog/watchdog.js
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_DELAY = 2000;
const MAX_DELAY = 60_000;

let delay = BASE_DELAY;
let child: ChildProcess | null = null;

function timestamp(): string {
  return new Date().toISOString();
}

function start(): void {
  const distDir = dirname(fileURLToPath(import.meta.url));
  const entry = join(distDir, '..', 'index.js');

  console.log(`[${timestamp()}] watchdog: starting main process: ${entry}`);
  child = spawn(process.execPath, [entry], { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    console.log(`[${timestamp()}] watchdog: main process exited code=${code} signal=${signal}`);
    child = null;

    if (code === 0) {
      console.log(`[${timestamp()}] watchdog: clean exit, not restarting`);
      process.exit(0);
    }

    console.log(`[${timestamp()}] watchdog: restarting in ${delay}ms`);
    setTimeout(() => {
      start();
      delay = Math.min(delay * 2, MAX_DELAY);
    }, delay);
  });

  // Reset delay on successful run (>30s alive)
  setTimeout(() => { delay = BASE_DELAY; }, 30_000);
}

// Forward signals to child
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[${timestamp()}] watchdog: received ${sig}, forwarding to child`);
    child?.kill(sig);
  });
}

start();
