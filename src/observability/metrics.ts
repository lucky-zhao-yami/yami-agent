/**
 * 可观测性 — Prometheus 指标定义。
 * 各模块通过 import { metrics } from './metrics.js' 使用。
 */
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'yami_' });

// ---- 消息处理 ----

export const messagesTotal = new Counter({
  name: 'yami_messages_total',
  help: '收到的消息总数',
  labelNames: ['chat_type'] as const,
  registers: [registry],
});

export const messagesProcessed = new Counter({
  name: 'yami_messages_processed_total',
  help: '处理完成的消息数',
  labelNames: ['status'] as const,  // ok / error / timeout / injection
  registers: [registry],
});

export const messageDuration = new Histogram({
  name: 'yami_message_duration_seconds',
  help: '消息处理耗时（收到→回复完成）',
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

// ---- Agent 进程 ----

export const sessionsActive = new Gauge({
  name: 'yami_sessions_active',
  help: '活跃 session 数',
  registers: [registry],
});

export const sessionsWarmPool = new Gauge({
  name: 'yami_sessions_warm_pool',
  help: '预热池空闲进程数',
  registers: [registry],
});

export const agentSpawns = new Counter({
  name: 'yami_agent_spawns_total',
  help: 'Agent 进程创建次数',
  labelNames: ['reason'] as const,  // new / restore / warm
  registers: [registry],
});

export const agentKills = new Counter({
  name: 'yami_agent_kills_total',
  help: 'Agent 进程销毁次数',
  labelNames: ['reason'] as const,  // idle / lru / switch / shutdown
  registers: [registry],
});

export const agentCrashes = new Counter({
  name: 'yami_agent_crashes_total',
  help: 'Agent 进程异常退出次数',
  registers: [registry],
});

// ---- 会话管理 ----

export const sessionRotations = new Counter({
  name: 'yami_session_rotations_total',
  help: '会话轮换次数',
  registers: [registry],
});

export const sessionSummarizations = new Counter({
  name: 'yami_session_summarizations_total',
  help: '记忆总结触发次数',
  labelNames: ['trigger'] as const,  // turn / size / interval / command
  registers: [registry],
});

// ---- 平台连接 ----

export const wsConnected = new Gauge({
  name: 'yami_ws_connected',
  help: 'WS 连接状态（1=连接, 0=断开）',
  registers: [registry],
});

export const wsReconnects = new Counter({
  name: 'yami_ws_reconnects_total',
  help: 'WS 重连次数',
  registers: [registry],
});

export const streamConflicts = new Counter({
  name: 'yami_stream_conflicts_total',
  help: '6000 errcode 冲突次数',
  registers: [registry],
});

// ---- 安全 ----

export const injectionBlocked = new Counter({
  name: 'yami_injection_blocked_total',
  help: '注入攻击拦截次数',
  registers: [registry],
});
