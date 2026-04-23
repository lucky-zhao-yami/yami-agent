import pino from 'pino';

const root = pino({ name: 'yami-agent' });

export function getLogger(module: string) {
  return root.child({ module });
}
