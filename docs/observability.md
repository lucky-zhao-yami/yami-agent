# 可观测性设计

> 状态: 设计阶段，未实现  
> 创建: 2026-04-28

## 目标

让每个 yami-agent 实例的运行状态可量化、可查询、可告警。多实例（CS Bot / Dev Bot / Ops Bot）统一监控。

## 架构

```
yami-agent (每个实例)          已有基础设施
┌──────────────────┐
│  GET /metrics     │─── scrape ──▶ Prometheus ──▶ Grafana Dashboard
│  (Prometheus fmt) │                                   │
│                   │                             Alerting Rules
│  GET /status      │                                   │
│  (JSON 详情)      │                             企微 Webhook
└──────────────────┘                             (告警推送给负责人)

无 Prometheus 时的 fallback:
┌──────────────────┐
│  内置定时推送      │─── 每 5min ──▶ 企微 Webhook (摘要报告)
│  (MetricsPusher)  │─── 异常时 ──▶ 企微 Webhook (告警)
└──────────────────┘
```

## 指标设计

### 消息处理

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_messages_total` | Counter | `chat_type` (dm/group) | 收到的消息总数 |
| `yami_messages_processed_total` | Counter | `status` (ok/error/timeout/injection) | 处理完成的消息数 |
| `yami_message_duration_seconds` | Histogram | — | 消息处理耗时（收到→回复完成，不含 Agent 排队等待） |
| `yami_message_queue_depth` | Gauge | — | 当前所有 session 的排队消息总数 |

### Agent 进程

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_sessions_active` | Gauge | — | 活跃 session 数 |
| `yami_sessions_warm_pool` | Gauge | — | 预热池空闲进程数 |
| `yami_agent_spawns_total` | Counter | `reason` (new/restore/warm) | Agent 进程创建次数 |
| `yami_agent_kills_total` | Counter | `reason` (idle/lru/switch/shutdown) | Agent 进程销毁次数 |
| `yami_agent_crashes_total` | Counter | — | Agent 进程异常退出次数 |

### 会话管理

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_session_rotations_total` | Counter | — | 会话轮换次数（字节超限） |
| `yami_session_summarizations_total` | Counter | `trigger` (turn/rotation/daily/command) | 记忆总结触发次数 |
| `yami_session_bytes` | Histogram | — | 会话轮换时的累计字节数分布 |

### 平台连接

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_ws_connected` | Gauge | — | WS 连接状态（1=连接, 0=断开） |
| `yami_ws_reconnects_total` | Counter | — | WS 重连次数 |
| `yami_ws_uptime_seconds` | Gauge | — | 当前连接持续时间 |
| `yami_stream_segments_total` | Counter | — | 流式分段发送次数 |
| `yami_stream_conflicts_total` | Counter | — | 6000 errcode 冲突次数 |

### 安全

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_injection_blocked_total` | Counter | — | 注入攻击拦截次数 |

### 系统

| 指标名 | 类型 | 标签 | 说明 |
|--------|------|------|------|
| `yami_uptime_seconds` | Gauge | — | 进程运行时间 |
| `yami_memory_bytes` | Gauge | `type` (rss/heapUsed/heapTotal) | 内存使用 |

## API 设计

### GET /metrics

Prometheus 文本格式，供 Prometheus scrape：

```
# HELP yami_messages_total Total messages received
# TYPE yami_messages_total counter
yami_messages_total{chat_type="dm"} 142
yami_messages_total{chat_type="group"} 358

# HELP yami_sessions_active Current active sessions
# TYPE yami_sessions_active gauge
yami_sessions_active 7
...
```

### GET /status

JSON 格式，供人工查看和调试，返回每个 session 的详细状态：

```json
{
  "uptime": 86400,
  "ws": {
    "connected": true,
    "uptimeSeconds": 3600,
    "reconnects": 2
  },
  "sessions": [
    {
      "chatId": "group_xxx",
      "alive": true,
      "bytes": 524288,
      "turns": 15,
      "lastActive": "2026-04-28T14:30:00Z",
      "queueDepth": 0,
      "sessionId": "abc-123"
    }
  ],
  "warmPool": 1,
  "memory": {
    "rss": 134217728,
    "heapUsed": 67108864
  }
}
```

## 告警规则

### Grafana Alerting（有 Prometheus 时）

| 规则 | 条件 | 严重程度 | 通知 |
|------|------|---------|------|
| Agent 连续崩溃 | `rate(yami_agent_crashes_total[5m]) > 0.1` | 🔴 Critical | 企微群 + 负责人 |
| WS 断线 | `yami_ws_connected == 0 持续 > 3min` | 🔴 Critical | 企微群 + 负责人 |
| 消息处理超时率高 | `rate(yami_messages_processed_total{status="timeout"}[10m]) / rate(yami_messages_processed_total[10m]) > 0.1` | 🟡 Warning | 企微群 |
| 内存使用过高 | `yami_memory_bytes{type="rss"} > 1GB` | 🟡 Warning | 企微群 |
| 进程池满 | `yami_sessions_active >= MAX_PROCS 持续 > 10min` | 🟡 Warning | 企微群 |
| 注入攻击频繁 | `rate(yami_injection_blocked_total[1h]) > 10` | ℹ️ Info | 企微群 |

### 内置 fallback（无 Prometheus 时）

MetricsPusher 模块定时检查阈值，直接推企微 webhook：

```
每 5 分钟: 推送摘要报告（消息量、活跃 session、内存）
异常触发: Agent 崩溃 / WS 断线 / 内存超限 → 立即推送告警
```

推送格式（企微 markdown）：

```markdown
📊 **yami-agent 状态报告** (cs-bot @ EC2-B)

⏱ 运行: 2d 3h | 🔌 WS: 已连接 3h
📨 消息: 最近5min 12条 | 总计 1,234条
🤖 会话: 活跃 5 / 上限 10 | 预热池 1
💾 内存: 256MB RSS
⚠️ 错误: 超时 2 | 崩溃 0 | 注入拦截 1
```

告警格式：

```markdown
🚨 **yami-agent 告警** (cs-bot @ EC2-B)

类型: Agent 进程连续崩溃
详情: 5分钟内崩溃 3 次
最近错误: SIGKILL (OOM)
建议: 检查内存使用，考虑增加 MAX_PROCS 或减少 SESSION_SIZE_LIMIT
```

## 实现方案

### 新增文件

```
src/
└── observability/
    ├── metrics.ts          # 指标定义（prom-client Registry）
    ├── collectors.ts       # 各模块的指标收集点
    └── pusher.ts           # 企微 webhook 定时推送（fallback）
```

### 指标收集点（在现有代码中埋点）

| 位置 | 收集什么 |
|------|---------|
| `Bridge.handleMessage()` | messages_total++, 开始计时 |
| `Bridge.doHandleMessage()` 结束 | message_duration 记录, processed_total++ |
| `guard.checkInjection()` 命中 | injection_blocked_total++ |
| `SessionManager.doCreate()` | agent_spawns_total++, sessions_active 更新 |
| `SessionManager.evictLRU()` | agent_kills_total{reason=lru}++ |
| `SessionManager.cleanupIdle()` | agent_kills_total{reason=idle}++ |
| `ManagedSession.rotate()` | session_rotations_total++ |
| `ManagedSession.triggerSummarize()` | session_summarizations_total++ |
| `WeComPlatform.connect()` | ws_connected=1, ws_uptime 重置 |
| `WeComPlatform.reconnectLoop()` | ws_reconnects_total++, ws_connected=0 |
| `StreamSegmenter.flush()` | stream_segments_total++ |
| `WeComPlatform.onRawMessage()` 6000 | stream_conflicts_total++ |
| `AcpAgentProcess` exit 非正常 | agent_crashes_total++ |

### 依赖

| 包 | 用途 |
|------|------|
| `prom-client` | Prometheus 指标库（Registry, Counter, Gauge, Histogram） |

### 配置

```jsonc
// config.json 新增
{
  "observability": {
    "enabled": true,
    "metricsPath": "/metrics",     // Prometheus scrape 路径
    "statusPath": "/status",       // JSON 状态查询路径
    "pusher": {
      "enabled": true,             // 无 Prometheus 时启用
      "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx",
      "intervalMinutes": 5,        // 定时报告间隔
      "alertThresholds": {
        "crashesPerMinute": 0.1,
        "wsDownSeconds": 180,
        "memoryBytes": 1073741824,
        "timeoutRate": 0.1
      }
    }
  }
}
```

## 多实例监控

每个 Bot 实例在指标中携带 `instance` 标签（由 Prometheus 自动添加）和 `bot` 标签（配置中指定）：

```
yami_messages_total{bot="cs-bot", chat_type="dm"} 142
yami_messages_total{bot="dev-bot", chat_type="group"} 58
```

Grafana Dashboard 按 `bot` 标签筛选，一个看板看所有 Bot。

## 实现路线

1. **Phase 1**: metrics.ts 定义所有指标 + /metrics 端点 + 各模块埋点
2. **Phase 2**: /status 端点（JSON 详情）
3. **Phase 3**: pusher.ts 企微 webhook 推送（fallback）
4. **Phase 4**: Grafana Dashboard 模板 + 告警规则配置
