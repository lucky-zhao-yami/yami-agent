# yami-agent 架构文档

> 企业微信机器人 ↔ ACP Agent 桥接服务  
> 最后更新: 2026-04-29 | 代码: ~3000 行 | 测试: 66 用例

## 一句话描述

接收企微消息，通过标准 ACP 协议转发给 AI Agent（Kiro / Claude Code / 其他），将 Agent 回复流式推送回企微。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        yami-agent                           │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  WeComPlatform│    │    Bridge     │    │ AcpAgentProcess│ │
│  │  (WS 长连接)  │───▶│  (消息路由)   │───▶│  (ACP 子进程)  │ │
│  │              │◀───│              │◀───│               │  │
│  └──────────────┘    └──────┬───────┘    └───────────────┘  │
│                             │                               │
│                    ┌────────┴────────┐                       │
│                    │                 │                       │
│               ┌────▼─────┐   ┌──────▼──────┐                │
│               │ Session   │   │   Memory    │                │
│               │ Manager   │   │   Manager   │                │
│               │ (进程池)  │   │ (记忆编排)  │                │
│               └──────────┘   └──────┬──────┘                │
│                                     │                       │
│                              ┌──────▼──────┐                │
│                              │ EventBus +   │                │
│                              │ Strategies   │                │
│                              │ (总结触发)   │                │
│                              └─────────────┘                │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │  Watchdog     │    │  HTTP API    │                       │
│  │  (独立进程)   │    │  (Fastify)   │                       │
│  └──────────────┘    └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## 分层架构

```
消息平台层 (platform/)
  │  WeComPlatform ── WS 连接、心跳、重连、收发消息
  │  StreamSegmenter ── 1500 字分段、表格续接、6000 降级
  │  MessageParser ── 企微协议解析为 IncomingMessage（完整类型定义）
  │  media.ts ── 图片 AES 解密、文件下载保存
  ▼
桥接层 (bridge/)
  │  Bridge ── 消息路由、注入检测、命令拦截、冷启动占位
  │  guard.ts ── 提示词注入正则检测 + full/safe preamble
  │  commands.ts ── /new /reset /restore /agent /mode /switch
  ▼
会话层 (session/)
  │  SessionManager ── 进程池、LRU 淘汰、空闲清理、预热池
  │  ManagedSession ── 消息排队、事件驱动总结、首条兜底注入
  │  MessageQueue ── per-session 串行队列 + 超时控制 + cancel
  ▼
Agent 层 (agent/)
  │  SingleAgentRouter ── 包装 IAgentProcess，转发 prompt
  │  AcpAgentProcess ── ACP JSON-RPC 通信、session 生命周期
  │  AcpAgentProvider ── Agent 进程工厂
  ▼
记忆层 (memory/)
  │  MemoryEventBus ── 连接事件源和总结策略
  │  ISummarizeStrategy ── 总结触发决策（可配置、可扩展）
  │  MemoryManager ── 编排多个 Layer + Recycler
  │  ConversationMemoryLayer ── memory/*.md 读写 + maxChars 截断 + gzip
  │  AcpMemoryRecycler ── 临时 ACP 进程做摘要
```

## 核心抽象

| 抽象 | 职责 | 当前实现 | 扩展方向 |
|------|------|---------|---------|
| `IMessagePlatform` | 消息平台连接和收发 | `WeComPlatform` | FeishuPlatform, SlackPlatform |
| `IAgentProcess` | 单个 Agent 子进程管理 | `AcpAgentProcess` | 非 ACP 协议的 Agent |
| `IAgentProvider` | Agent 进程工厂 | `AcpAgentProvider` | — |
| `IAgentRouter` | Agent 路由（单/多 Agent） | `SingleAgentRouter` | WorkflowAgentRouter (多 Agent 编排) |
| `IMemoryLayer` | 记忆存储后端 | `ConversationMemoryLayer` | VectorMemoryLayer, KnowledgeBaseLayer |
| `IMemoryRecycler` | 会话摘要生成 | `AcpMemoryRecycler` | 轻量 LLM API 方案 |
| `ISummarizeStrategy` | 总结触发决策 | TurnBased / SizeBased / Interval | TopicChange, TokenCount |

## 记忆系统

### 设计原则

**Layer 只管存储，Strategy 只管决策，ManagedSession 只管执行。**

```
总结（写）：事件驱动，策略可配置
  事件源 ──▶ MemoryEventBus ──▶ ISummarizeStrategy[] ──▶ MemoryManager.summarize()

注入（读）：两层
  首条消息 ──▶ 代码强制注入摘要概要（兜底，字数截断）
  后续消息 ──▶ Agent 自主通过 memory-recall Skill 按需获取
```

### 事件驱动总结

```
事件源                          策略                        执行
┌─────────────────┐
│ ManagedSession   │─ message_processed ─▶┐
│ (消息处理完成)   │                      │
├─────────────────┤                      │  ┌─────────────────────┐
│ Timer (60s)      │─ timer_tick ────────▶├─▶│ ISummarizeStrategy[] │──▶ summarize/rotate
│ (定时器)         │                      │  └─────────────────────┘
├─────────────────┤                      │
│ SessionManager   │─ session_idle ──────▶┘
│ (空闲回收)       │
└─────────────────┘
  加新事件源：不改任何 Strategy
  加新策略：不改任何事件源
```

### 内置总结策略

| 策略 | 响应事件 | 行为 |
|------|---------|------|
| `TurnBasedStrategy(N)` | `message_processed` | 每 N 轮 → summarize |
| `SizeBasedStrategy(limit)` | `message_processed` | 字节超限 → rotate（总结+新session） |
| `IntervalStrategy(minutes)` | `timer_tick` | 距上次总结超 N 分钟 → summarize |

### 记忆注入

**首条消息（代码兜底）**：preamble + 摘要概要（从最新往前填，不超过 `injectionMaxChars`）+ Skill 提示。

**后续消息（Agent 自主）**：Agent 通过 memory-recall Skill 读取 `sessions/{chatId}/memory/*.md` 文件。

## 数据流

### 正常消息处理

```
企微 WS 消息
  → WeComPlatform.onRawMessage()
    → MessageParser.parseMsgCallback()
  → Bridge.handleMessage()
    → guard.checkInjection()
    → parseCommand()
    → SessionManager.getOrCreate()
    → platform.sendStream(🤔)
    → ManagedSession.send()
      → MessageQueue 排队
      → 首条消息: injectContext() → preamble + recall(maxChars) + skill 提示
      → SingleAgentRouter.handle() → AcpAgentProcess.prompt()
      → StreamSegmenter.feed() → 流式回复
      → memoryManager.save()
      → eventBus.check(message_processed) → 策略决策 → summarize/rotate/无
```

### 定时总结

```
index.ts 定时器 (每 60s)
  → 遍历所有活跃 session
  → session.eventBus.check(timer_tick)
    → IntervalStrategy: 距上次总结超 N 分钟? → summarize
```

### 每日清理 (0:00 Asia/Shanghai)

```
dailyCleanup()
  → memoryManager.cleanup(): gzip 超过 30 天的 memory/*.md
  → 删除超过 30 天的 archive 文件
```

### 空闲回收与恢复

```
SessionManager.cleanupIdle() (每 60s)
  → 超过 IDLE_TIMEOUT 的会话 → recycle (写 last_session_id → kill)

用户回来 → getOrCreate()
  → spawn → loadSession(lastSessionId) → 失败则 createSession
```

## 目录结构

```
yami-agent/
├── src/
│   ├── index.ts                          # 入口：组装依赖、timer_tick、每日清理
│   ├── config.ts                         # zod 配置校验 (config.json + .env)
│   ├── logger.ts                         # pino 日志
│   ├── utils.ts                          # generateReqId, AsyncQueue
│   │
│   ├── platform/
│   │   ├── types.ts                      # IMessagePlatform, IStreamWriter
│   │   └── wecom/
│   │       ├── protocol.ts               # 企微 WS 协议完整类型定义
│   │       ├── WeComPlatform.ts           # WS 连接、心跳、重连、收发
│   │       ├── MessageParser.ts           # 消息解析 (类型安全，无手动断言)
│   │       ├── StreamSegmenter.ts         # 流式分段 (1500字/换行/表格续接)
│   │       └── media.ts                   # 媒体下载、AES 解密、保存
│   │
│   ├── agent/
│   │   ├── types.ts                      # IAgentProcess, IAgentProvider, IAgentRouter
│   │   ├── SingleAgentRouter.ts          # 单 Agent 路由 (含 cancel)
│   │   └── acp/
│   │       ├── AcpAgentProcess.ts        # ACP 子进程 (stdin/stdout ndjson)
│   │       └── AcpAgentProvider.ts       # Agent 工厂
│   │
│   ├── session/
│   │   ├── types.ts                      # ManagedSessionOptions (含 eventBus)
│   │   ├── SessionManager.ts             # 进程池 + LRU + 预热 + 空闲清理
│   │   ├── ManagedSession.ts             # 消息排队 + 事件驱动总结 + 首条兜底注入
│   │   └── MessageQueue.ts              # per-session 串行队列 + 超时 cancel
│   │
│   ├── memory/
│   │   ├── types.ts                      # IMemoryLayer, IMemoryRecycler
│   │   ├── events.ts                     # MemoryEvent, ISummarizeStrategy, MemoryEventBus
│   │   ├── strategies/
│   │   │   ├── TurnBasedStrategy.ts      # 每 N 轮总结
│   │   │   ├── SizeBasedStrategy.ts      # 字节超限轮换
│   │   │   └── IntervalStrategy.ts       # 定时总结
│   │   ├── strategyFactory.ts            # 从配置创建策略实例
│   │   ├── MemoryManager.ts              # Layer 编排器
│   │   ├── ConversationMemoryLayer.ts    # 文件摘要层 (maxChars 截断 + gzip)
│   │   └── AcpMemoryRecycler.ts          # 临时 ACP 进程做摘要
│   │
│   ├── bridge/
│   │   ├── Bridge.ts                     # 消息路由中枢
│   │   ├── commands.ts                   # 命令系统 (/new /reset /agent ...)
│   │   └── guard.ts                      # 注入检测 + preamble
│   │
│   ├── http/
│   │   └── server.ts                     # POST /send, GET /health, POST /shutdown
│   │
│   └── watchdog/
│       └── watchdog.ts                   # 独立进程，异常退出指数退避重启
│
├── docs/
│   ├── spec.md                           # 需求规格
│   ├── design.md                         # 设计文档（开发前）
│   ├── plan.md                           # 实现计划
│   ├── architecture.md                   # 架构文档（本文件）
│   ├── memory-strategy.md                # 记忆策略分离设计
│   ├── multi-agent-collaboration.md      # 多 Agent 协作设计
│   └── observability.md                  # 可观测性设计
│
├── templates/
│   ├── skills/memory-recall/SKILL.md     # Agent 自主查记忆的 Skill
│   └── ...                               # 其他部署模板
│
├── scripts/
│   └── deploy.sh                         # 交互式部署脚本
├── package.json
└── tsconfig.json
```

## 配置

### config.json

```jsonc
{
  "bot_id": "xxx",
  "secret": "xxx",
  "welcome_msg": "👋 你好！",
  "agent": {
    "command": "kiro-cli",
    "args": ["acp", "--trust-all-tools"],
    "env": {}
  },
  "chats": {
    "default": { "mode": "full" },
    "dm_someone": { "mode": "safe" }
  },
  "memory": {
    "layers": [{ "type": "conversation", "enabled": true }],
    "summarize": [
      { "type": "turn", "interval": 30 },
      { "type": "size", "limit": 2097152 },
      { "type": "interval", "minutes": 60 }
    ],
    "injectionMaxChars": 2000
  }
}
```

### .env

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WORK_DIR` | `/mnt/d/workspace/all` | 工作空间根目录，ACP 进程的 cwd |
| `MAX_PROCS` | `10` | 最大并发 Agent 进程数 |
| `WARM_POOL_SIZE` | `1` | 启动时预热的空闲进程数 |
| `IDLE_TIMEOUT` | `1800` | 空闲超时（秒），超时后回收进程 |
| `PROMPT_TIMEOUT` | `300` | 单次 prompt 超时（秒） |
| `MEMORY_RECALL_DAYS` | `7` | recall 时读取最近几天的摘要 |
| `PORT` | `8900` | HTTP API 端口 |
| `API_KEY` | (可选) | /send 接口的 Bearer token |

> `SESSION_SIZE_LIMIT` 和 `MEMORY_SUMMARY_INTERVAL` 已迁移到 config.json 的 `memory.summarize` 策略配置中。

## 安全机制

| 层级 | 机制 | 实现 |
|------|------|------|
| 输入过滤 | 提示词注入检测 | `guard.ts` — 16 条正则（中英文），清除零宽字符后匹配 |
| 权限隔离 | full/safe 模式 | `guard.ts` — safe 模式禁用 execute_bash/fs_write |
| 文件安全 | 写入路径限制 | `AcpAgentProcess.handleWriteFile` — 只允许写 WORK_DIR 内 |
| 路径安全 | chatId 遍历防护 | `SessionManager.getOrCreate` — 拒绝含 `/\..` 的 chatId |
| API 安全 | /send 接口认证 | `server.ts` — timing-safe Bearer token 比较 |

## 命令系统

| 命令 | 行为 |
|------|------|
| `/new` | 总结当前 session → 创建新 session → 保留记忆（下次注入） |
| `/reset` | 总结 → 移动 memory/*.md 到 archive/ → 新 session（不注入历史） |
| `/restore` | 将 archive/*.md 移回 memory/（下次对话时注入） |
| `/agent <name>` | 杀掉当前 Agent → 启动指定 Agent → 新 session |
| `/mode <mode>` | 切换操作模式（待 ACP SDK 支持 setSessionMode） |
| `/switch <agent>` | 多 Agent 切换（预留，当前回复"暂不支持"） |

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@agentclientprotocol/sdk` | ^0.19.1 | ACP 协议 SDK |
| `ws` | ^8.18.0 | WebSocket 客户端（企微长连接） |
| `fastify` | ^5.3.3 | HTTP 服务 (/send, /health) |
| `dotenv` | ^16.5.0 | 环境变量 |
| `pino` | ^9.6.0 | 结构化日志 |
| `zod` | ^3.24.4 | 配置校验 |
| `vitest` | ^4.1.5 | 单元测试 (dev) |

## 测试

```bash
npm test              # 运行所有测试
npm run test:watch    # watch 模式
```

| 测试文件 | 用例数 | 覆盖模块 |
|---------|--------|---------|
| MessageParser.test.ts | 15 | 消息解析、bot 过滤、@前缀、mixed、引用 |
| guard.test.ts | 17 | 注入检测（中英文）、零宽字符、preamble |
| commands.test.ts | 7 | 命令解析、大小写、空参数 |
| MessageQueue.test.ts | 3 | 串行执行、超时、失败恢复 |
| StreamSegmenter.test.ts | 6 | 分段、换行切割、表格续接、6000 降级 |
| ConversationMemoryLayer.test.ts | 6 | recall、onSummary、cleanup、gzip |
| strategies.test.ts | 12 | TurnBased、SizeBased、Interval、EventBus、Factory |

## 相关设计文档

| 文档 | 内容 | 状态 |
|------|------|------|
| [memory-strategy.md](./memory-strategy.md) | 记忆策略分离（事件驱动总结 + Skill 注入） | ✅ 已实现 |
| [multi-agent-collaboration.md](./multi-agent-collaboration.md) | 两层多 Agent 协作（Bot 内部 + 跨 Bot OP Issue） | 📝 设计阶段 |
| [observability.md](./observability.md) | 可观测性（Prometheus metrics + 企微告警） | 📝 设计阶段 |
