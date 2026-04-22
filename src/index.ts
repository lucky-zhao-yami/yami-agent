import pino from 'pino';
import { loadConfig } from './config.js';
import { WeComPlatform } from './platform/wecom/WeComPlatform.js';
import { AcpAgentProvider } from './agent/acp/AcpAgentProvider.js';
import { SessionManager } from './session/SessionManager.js';
import { Bridge } from './bridge/Bridge.js';

const log = pino({ name: 'yami-agent' });

async function main() {
  const config = loadConfig();
  log.info(`Starting yami-agent, WORK_DIR=${config.env.WORK_DIR}`);

  const platform = new WeComPlatform(config.bot);
  const agentProvider = new AcpAgentProvider();
  // Phase 3: inject memoryManager as 3rd arg
  const sessionManager = new SessionManager(agentProvider, config);
  const bridge = new Bridge(platform, sessionManager, config);

  await platform.connect();
  log.info('yami-agent started');

  const shutdown = async () => {
    log.info('Shutting down...');
    await bridge.shutdown();
    await platform.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error(err, 'Fatal error');
  process.exit(1);
});
