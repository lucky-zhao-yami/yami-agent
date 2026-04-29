import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/types.ts',
        // 需要真实 WS/ACP 连接的模块，不适合单元测试
        'src/platform/wecom/WeComPlatform.ts',
        'src/agent/acp/AcpAgentProcess.ts',
        'src/agent/acp/AcpAgentProvider.ts',
        'src/memory/AcpMemoryRecycler.ts',
        'src/bridge/Bridge.ts',
        'src/session/SessionManager.ts',
        'src/session/ManagedSession.ts',
        'src/http/server.ts',
        'src/watchdog/watchdog.ts',
        'src/index.ts',
        'src/logger.ts',
      ],
    },
  },
});
