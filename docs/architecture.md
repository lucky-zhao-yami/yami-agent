# yami-agent 架构文档

> 企业微信机器人 ↔ ACP Agent 桥接服务  
> 最后更新: 2026-04-28 | 代码: 2609 行 | 测试: 463 行 / 54 用例

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
│               └──────────┘   └─────────────┘                │
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
  │  MessageParser ── 企微协议解析为 IncomingMessage
  │  media.ts ── 图片 AES 解密、文件下载保存
  ▼
桥接层 (bridge/)
  │  Bridge ── 消息路由、注入检测、命令拦截、冷启动占位
  │  guard.ts ── 提示词注入正则检测 + full/safe preamble
  │  commands.ts ── /new /reset /restore /agent /mode /switch
  ▼
会话层 (session/)
  │  SessionManager ── 进程池、LRU 淘汰、空闲清理、预热池
  │  ManagedSession ── 消息排队、字节/轮数追踪、上下文注入、轮换
  │  MessageQueue ── per-session 串行队列 + 超时控制
  ▼
Agent 层 (agent/)
  │  SingleAgentRouter ── 包装 IAgentProcess，转发 prompt
  │  AcpAgentProcess ── ACP JSON-RPC 通信、session 生命周期
  │  AcpAgentProvider ── Agent 进程工厂
  ▼
记忆层 (memory/)
  │  MemoryManager ── 编排多个 Layer + Recycler
  │  ConversationMemoryLayer ── memory/*.md 读写 + gzip 压缩
  │  AcpMemoryRecycler ── 临时 ACP 进程做摘要
```

## 核心抽象

| 抽象类 | 职责 | 当前实现 | 扩展方向 |
|--------|------|---------|---------|
| `IMessagePlatform` | 消息平台连接和收发 | `WeComPlatform` | FeishuPlatform, SlackPlatform |
| `IAgentProcess` | 单个 Agent 子进程管理 | `AcpAgentProcess` | 非 ACP 协议的 Agent |
| `IAgentProvider` | Agent 进程工厂 | `AcpAgentProvider` | — |
| `IAgentRouter` | Agent 路由（单/多 Agent） | `SingleAgentRouter` | WorkflowAgentRouter (多 Agent 编排) |
| `IMemoryLayer` | 记忆存储后端 | `ConversationMemoryLayer` | VectorMemoryLayer, KnowledgeBaseLayer |
| `IMemoryRecycler` | 会话摘要生成 | `AcpMemoryRecycler` | 轻量 LLM API 方案 |

## 数据流

### 正常消息处理

```
企微 WS 消息
  → WeComPlatform.onRawMessage()
    → MessageParser.parseMsgCallback()  // 解析 + 过滤 bot 自身消息
  → Bridge.handleMessage()
    → guard.checkInjection()            // 注入检测
    → parseCommand()                    // 命令拦截 (/new, /reset, ...)
    → SessionManager.getOrCreate()      // 获取或创建会话
    → platform.sendStream(🤔)           // 冷启动占位
    → ManagedSession.send()
      → MessageQueue 排队（同一 chat 串行）
      → injectContext()                 // 首条消息注入 preamble + 记忆
      → SingleAgentRouter.handle()
        → AcpAgentProcess.prompt()      // ACP JSON-RPC
          → yield AgentChunk (text/tool_call/done)
      → StreamSegmenter.feed()          // 1500 字分段流式回复
      → memoryManager.save()            // 广播给所有 Layer
      → 检查轮数总结 / 字节轮换
```

### 会话轮换

```
ManagedSession 检测到 bytes ≥ SESSION_SIZE_LIMIT (默认 2MB)
  → memoryManager.summarize()
    → AcpMemoryRecycler: spawn 临时进程 → 读 session .jsonl → 生成摘要
    → ConversationMemoryLayer.onSummary() → 写入 memory/YYYY-MM-DD.md
  → router.createSession()  // 新 ACP session
  → 重置 bytes/turns 计数器, firstMsg=true
```

### 空闲回收与恢复

```
SessionManager.cleanupIdle() (每 60s)
  → 超过 IDLE_TIMEOUT (默认 30min) 的会话
    → ManagedSession.recycle()
      → 写 last_session_id 到磁盘
      → kill 进程（不触发总结）

用户回来
  → SessionManager.getOrCreate()
    → spawn 新进程
    → loadSession(lastSessionId)  // 完整恢复 ACP 上下文
    → 失败则 fallback 到 createSession + recall 注入摘要
```

### 每日定时任务 (0:00 Asia/Shanghai)

```
dailySummarizeAndCleanup()
  → 活跃 session: 用 live sessionId 总结
  → 非活跃 session: 用磁盘上的 last_session_id 总结
  → cleanup: gzip 超过 30 天的 memory/*.md
  → 清理超过 30 天的 archive 文件
```

## 目录结构

```
yami-agent/
├── src/
│   ├── index.ts                          # 入口：组装依赖、启动服务、定时任务
│   ├── config.ts                         # zod 配置校验 (config.json + .env)
│   ├── logger.ts                         # pino 日志
│   ├── utils.ts                          # generateReqId, AsyncQueue
│   │
│   ├── platform/
│   │   ├── types.ts                      # IMessagePlatform, IStreamWriter
│   │   └── wecom/
│   │       ├── protocol.ts               # 企微 WS 协议类型定义
│   │       ├── WeComPlatform.ts           # WS 连接、心跳、重连、收发
│   │       ├── MessageParser.ts           # 消息解析 (text/mixed/image/voice/file/quote)
│   │       ├── StreamSegmenter.ts         # 流式分段 (1500字/换行/表格续接)
│   │       └── media.ts                   # 媒体下载、AES 解密、保存
│   │
│   ├── agent/
│   │   ├── types.ts                      # IAgentProcess, IAgentProvider, IAgentRouter
│   │   ├── SingleAgentRouter.ts          # 单 Agent 路由
│   │   └── acp/
│   │       ├── AcpAgentProcess.ts        # ACP 子进程 (stdin/stdout ndjson)
│   │       └── AcpAgentProvider.ts       # Agent 工厂
│   │
│   ├── session/
│   │   ├── types.ts                      # ManagedSessionOptions
│   │   ├── SessionManager.ts             # 进程池 + LRU + 预热 + 空闲清理
│   │   ├── ManagedSession.ts             # 消息排队 + 字节追踪 + 轮换 + 记忆
│   │   └── MessageQueue.ts              # per-session 串行队列
│   │
│   ├── memory/
│   │   ├── types.ts                      # IMemoryLayer, IMemoryRecycler
│   │   ├── MemoryManager.ts              # Layer 编排器
│   │   ├── ConversationMemoryLayer.ts    # 文件摘要层 (memory/*.md + gzip)
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
│   └── architecture.md                   # 架构文档（本文件，反映实际实现）
│
├── scripts/
│   └── deploy.sh                         # 交互式部署脚本
│
├── templates/                            # 部署模板 (agents/skills/steering)
├── package.json
└── tsconfig.json
```

## 配置

### config.json (机器人配置)

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
    "layers": [{ "type": "conversation", "enabled": true }]
  }
}
```

### .env (环境变量)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `WORK_DIR` | `/mnt/d/workspace/all` | 工作空间根目录，ACP 进程的 cwd |
| `MAX_PROCS` | `10` | 最大并发 Agent 进程数 |
| `WARM_POOL_SIZE` | `1` | 启动时预热的空闲进程数 |
| `IDLE_TIMEOUT` | `1800` | 空闲超时（秒），超时后回收进程 |
| `PROMPT_TIMEOUT` | `300` | 单次 prompt 超时（秒） |
| `SESSION_SIZE_LIMIT` | `2097152` | 会话轮换阈值（字节，默认 2MB） |
| `MEMORY_SUMMARY_INTERVAL` | `30` | 每 N 轮触发一次记忆总结 |
| `MEMORY_RECALL_DAYS` | `7` | recall 时读取最近几天的摘要 |
| `PORT` | `8900` | HTTP API 端口 |
| `API_KEY` | (可选) | /send 接口的 Bearer token |

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

## 部署

```bash
# 1. 构建
npm run build

# 2. 通过 watchdog 启动（异常自动重启）
node dist/watchdog/watchdog.js

# 3. 或直接启动
node dist/index.js

# 4. systemd service（生产环境）
# 见 deploy.sh 自动生成的 yami-agent.service
```

### 运行时目录结构

```
{WORK_DIR}/
├── .kiro/                    # Agent 配置（deploy.sh 生成）
│   ├── agents/               # Agent 定义
│   ├── skills/               # Skill 模板
│   ├── steering/             # Steering 规则
│   └── settings/             # MCP 配置
├── sessions/                 # per-chat 会话目录
│   ├── dm_UserA/
│   │   ├── last_session_id   # 最近的 ACP sessionId
│   │   └── memory/
│   │       ├── 2026-04-28.md
│   │       ├── 2026-04-27.md
│   │       ├── 2026-03-28.md.gz  # 超过 30 天，已压缩
│   │       └── archive/          # /reset 归档的摘要
│   └── group_chatid/
│       ├── last_session_id
│       └── memory/
├── config.json
└── .env
```

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
