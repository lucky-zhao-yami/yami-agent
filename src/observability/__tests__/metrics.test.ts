import { describe, it, expect, beforeEach } from 'vitest';
import { registry, messagesTotal, messagesProcessed, messageDuration, sessionsActive, wsConnected, injectionBlocked, agentSpawns, agentKills, sessionRotations, sessionSummarizations, wsReconnects, streamConflicts, sessionsWarmPool } from '../metrics.js';

beforeEach(async () => {
  registry.resetMetrics();
});

describe('metrics', () => {
  it('messagesTotal increments with label', async () => {
    messagesTotal.inc({ chat_type: 'dm' });
    messagesTotal.inc({ chat_type: 'group' });
    messagesTotal.inc({ chat_type: 'group' });
    const val = await registry.getSingleMetricAsString('yami_messages_total');
    expect(val).toContain('chat_type="dm"} 1');
    expect(val).toContain('chat_type="group"} 2');
  });

  it('messagesProcessed tracks status labels', async () => {
    messagesProcessed.inc({ status: 'ok' });
    messagesProcessed.inc({ status: 'ok' });
    messagesProcessed.inc({ status: 'timeout' });
    const val = await registry.getSingleMetricAsString('yami_messages_processed_total');
    expect(val).toContain('status="ok"} 2');
    expect(val).toContain('status="timeout"} 1');
  });

  it('messageDuration records histogram', async () => {
    messageDuration.observe(1.5);
    messageDuration.observe(0.3);
    const val = await registry.getSingleMetricAsString('yami_message_duration_seconds');
    expect(val).toContain('_count 2');
  });

  it('sessionsActive gauge can set and read', async () => {
    sessionsActive.set(5);
    const val = await registry.getSingleMetricAsString('yami_sessions_active');
    expect(val).toContain('5');
  });

  it('wsConnected gauge toggles', async () => {
    wsConnected.set(1);
    let val = await registry.getSingleMetricAsString('yami_ws_connected');
    expect(val).toContain('1');
    wsConnected.set(0);
    val = await registry.getSingleMetricAsString('yami_ws_connected');
    expect(val).toContain('0');
  });

  it('injectionBlocked counter increments', async () => {
    injectionBlocked.inc();
    injectionBlocked.inc();
    const val = await registry.getSingleMetricAsString('yami_injection_blocked_total');
    expect(val).toContain('2');
  });

  it('agentSpawns tracks reason label', async () => {
    agentSpawns.inc({ reason: 'new' });
    agentSpawns.inc({ reason: 'warm' });
    const val = await registry.getSingleMetricAsString('yami_agent_spawns_total');
    expect(val).toContain('reason="new"} 1');
    expect(val).toContain('reason="warm"} 1');
  });

  it('agentKills tracks reason label', async () => {
    agentKills.inc({ reason: 'idle' });
    agentKills.inc({ reason: 'lru' });
    const val = await registry.getSingleMetricAsString('yami_agent_kills_total');
    expect(val).toContain('reason="idle"} 1');
    expect(val).toContain('reason="lru"} 1');
  });

  it('sessionRotations increments', async () => {
    sessionRotations.inc();
    const val = await registry.getSingleMetricAsString('yami_session_rotations_total');
    expect(val).toContain('1');
  });

  it('sessionSummarizations tracks trigger label', async () => {
    sessionSummarizations.inc({ trigger: 'strategy' });
    const val = await registry.getSingleMetricAsString('yami_session_summarizations_total');
    expect(val).toContain('trigger="strategy"} 1');
  });

  it('wsReconnects increments', async () => {
    wsReconnects.inc();
    const val = await registry.getSingleMetricAsString('yami_ws_reconnects_total');
    expect(val).toContain('1');
  });

  it('streamConflicts increments', async () => {
    streamConflicts.inc();
    const val = await registry.getSingleMetricAsString('yami_stream_conflicts_total');
    expect(val).toContain('1');
  });

  it('sessionsWarmPool gauge works', async () => {
    sessionsWarmPool.set(3);
    sessionsWarmPool.dec();
    const val = await registry.getSingleMetricAsString('yami_sessions_warm_pool');
    expect(val).toContain('2');
  });

  it('/metrics endpoint format contains HELP and TYPE', async () => {
    messagesTotal.inc({ chat_type: 'dm' });
    const output = await registry.metrics();
    expect(output).toContain('# HELP yami_messages_total');
    expect(output).toContain('# TYPE yami_messages_total counter');
  });
});
