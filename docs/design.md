# yami-agent 架构设计

## 设计原则

**面向对象 + 抽象类**：每个核心组件定义 abstract class，具体实现继承并可替换。  
**关注点分离**：消息平台、Agent 协议、记忆存储、进程管理各自独立。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     yami-agent                          │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐  │
│  │  Platform     │    │  Bridge      │    │  Agent    │  │
│  │  (WeComBot)   │───▶│  (Router)    │───▶│  (ACP)   │  │
│  │              │◀───│              │◀───│           │  │
│  └──────────────┘    └──────┬───────┘    └───────────┘  │
│                             │                           │
│                    ┌────────┴────────┐                   │
│                    │                 │                   │
│               ┌────▼─────┐   ┌──────▼──────┐            │
│               │  Session  │   │   Memory    │            │
│               │  Manager  │   │   Manager   │            │
│               └──────────┘   └─────────────┘            │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                   │
│  │  Watchdog     │    │  HTTP API    │                   │
│  └──────────────┘    └──────────────┘                   │
└─────────────────────────────────────────────────────────┘
```

## 面向对象架构

### 类图总览

```
                        ┌─────────────┐
                        │    App      │  组装所有组件，启动服务
                        └──────┬──────┘
                               │ 持有
          ┌────────────────────┼────────────────────┐
          │                    │                    │
  ┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
  │ IMessagePlatform│  │    Bridge      │  │  HttpServer    │
  └───────┬────────┘  └───────┬────────┘  └────────────────┘
          │                   │ 依赖
  ┌───────▼────────┐  ┌───────▼────────┐
  │ WeComPlatform   │  │ SessionManager │
  └────────────────┘  └───────┬────────┘
                              │ 管理 N 个
                      ┌───────▼────────┐
                      │ ManagedSession  │
                      └───────┬────────┘
                              │ 持有
              ┌───────────────┼───────────────┐
              │               │               │
      ┌───────▼──────┐ ┌─────▼────────┐ ┌────▼─────────┐
      │ IAgentRouter  │ │MemoryManager │ │ MessageQueue │
      └───────┬──────┘ └─────┬────────┘ └──────────────┘
              │               │ 编排 N 个
      ┌───────▼────────┐ ┌─────▼──────────────┐
      │SingleAgentRouter│ │  IMemoryLayer      │ (按配置顺序)
      └───────┬────────┘ └─────┬──────────────┘
              │ 持有            │
      ┌───────▼──────┐   ┌─────┼──────────┐
      │AcpAgentProcess│   │         │          │
      └──────────────┘   │         │          │
                    ┌─────┘         │          └─────┐
             ┌──────────────┐ ┌────────┐ ┌─────────────┐
             │ Conversation │ │ Vector │ │ Knowledge   │
             │ MemoryLayer  │ │ Layer  │ │ Base Layer  │
             └──────────────┘ └────────┘ └─────────────┘
                                          (后续扩展)

      ┌────────────────┐  ┌──────────────────┐
      │ IAgentProvider  │  │ IMemoryRecycler   │
      └───────┬────────┘  └───────┬──────────┘
      ┌───────▼────────┐  ┌───────▼──────────┐
      │AcpAgentProvider │  │AcpMemoryRecycler  │
      └────────────────┘  └──────────────────┘
```

### 核心抽象与实现

#### 1. IMessagePlatform — 消息平台

```typescript
// src/platform/types.ts

interface IncomingMessage {
  chatId: string;           // 单聊: "dm_{userId}", 群聊: 企微 chatid
  userId: string;
  msgType: 'text' | 'image' | 'voice' | 'file' | 'mixed';
  text?: string;
  items?: MixedItem[];      // mixed 消息的子项
  quote?: string;           // 引用消息内容
  reqId: string;            // 企微 req_id，用于流式回复
}

interface PlatformEvent {
  type: 'enter_chat' | 'disconnected';
  chatId?: string;
  reqId: string;
}

abstract class IMessagePlatform {
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;
  abstract onEvent(handler: (evt: PlatformEvent) => Promise<void>): void;

  // 回复
  abstract sendStream(chatId: string, streamId: string, content: string, finish: boolean): Promise<void>;
  abstract sendMessage(chatId: string, content: string): Promise<void>;

  // 媒体
  abstract getMedia(mediaId: string): Promise<Buffer | null>;
}
```

**实现**：`WeComPlatform extends IMessagePlatform`  
**替换场景**：接入飞书、Slack → 新建 `FeishuPlatform extends IMessagePlatform`

#### 2. IAgentProvider / IAgentProcess — Agent 抽象

```typescript
// src/agent/types.ts

interface AgentSpawnOptions {
  command: string;       // "kiro-cli" | "npx"
  args: string[];        // ["acp", "--trust-all-tools"] | ["@zed-industries/claude-code-acp"]
  cwd: string;           // 工作空间目录（WORK_DIR）
  env?: Record<string, string>;
}

type PromptContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: string };

type AgentChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; title: string; status: string }
  | { type: 'done'; stopReason: string };

abstract class IAgentProcess {
  abstract readonly sessionId: string | null;
  abstract readonly alive: boolean;

  abstract initialize(): Promise<void>;
  abstract createSession(cwd: string): Promise<string>;
  abstract loadSession(sessionId: string): Promise<void>;
  abstract prompt(sessionId: string, content: PromptContent[]): AsyncIterable<AgentChunk>;
  abstract cancel(sessionId: string): Promise<void>;
  abstract kill(): Promise<void>;
}

abstract class IAgentProvider {
  abstract spawn(options: AgentSpawnOptions): Promise<IAgentProcess>;
}
```

**实现**：`AcpAgentProvider extends IAgentProvider`，`AcpAgentProcess extends IAgentProcess`  
**替换场景**：对接 claude-code → 只需换 `AgentSpawnOptions` 的 command/args；对接非 ACP 协议 → 新建 `XxxAgentProvider extends IAgentProvider`

#### 3. 记忆层 — 插件化 Layer 架构

统一的 `IMemoryLayer` 接口，每种存储介质实现自己的 layer。通过配置决定启用哪些、加载顺序。`MemoryManager` 编排所有 layer。

```
┌─────────────────────────────────────────────────┐
│               MemoryManager                      │
│  recall(chatId, query) → 合并各 layer            │
│  save(chatId, entry)   → 广播给各 layer          │
└────┬──────────────┬──────────────┬──────────────┘
     │              │              │
┌────▼────────┐ ┌───▼────────┐ ┌──▼───────────────┐
│ Conversation │ │   Vector   │ │  KnowledgeBase   │  ← 后续扩展
│ MemoryLayer  │ │   Layer    │ │     Layer        │
└──────────────┘ └────────────┘ └──────────────────┘
```

```typescript
// src/memory/types.ts

interface HistoryEntry {
  user: string;
  assistant: string;
  timestamp: number;
  bytes: number;
}

/** 统一的记忆 layer 接口 */
abstract class IMemoryLayer {
  abstract readonly name: string;

  /** 保存一轮对话（写入） */
  abstract save(chatId: string, entry: HistoryEntry): Promise<void>;

  /** 检索相关上下文（读取），返回注入 prompt 的文本 */
  abstract recall(chatId: string, query?: string): Promise<string>;

  /** 接收摘要（可选，不需要的 layer 不用 override） */
  async onSummary(chatId: string, date: string, summary: string): Promise<void> {}

  /** 清理过期数据（可选） */
  async cleanup(chatId: string): Promise<void> {}
}

/** 记忆回收器 — 触发总结压缩 */
abstract class IMemoryRecycler {
  abstract summarize(chatId: string, sessionId: string): Promise<string>;
}
```

**MemoryManager — 编排层**：

```typescript
// src/memory/MemoryManager.ts

class MemoryManager {
  constructor(
    private layers: IMemoryLayer[],  // 按配置顺序排列
    private recycler: IMemoryRecycler,
  ) {}

  /** 获取注入 prompt 的上下文（按顺序调用各 layer，合并结果） */
  async recall(chatId: string, query?: string): Promise<string> {
    const parts: string[] = [];
    for (const layer of this.layers) {
      const context = await layer.recall(chatId, query);
      if (context) parts.push(context);
    }
    return parts.join('\n\n');
  }

  /** 每轮对话结束后，广播给所有 layer */
  async save(chatId: string, entry: HistoryEntry): Promise<void> {
    await Promise.all(this.layers.map(p => p.save(chatId, entry)));
  }

  /** 触发总结 → 广播给所有 layer */
  async summarize(chatId: string, sessionId: string): Promise<void> {
    const summary = await this.recycler.summarize(chatId, sessionId);
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(this.layers.map(p => p.onSummary(chatId, today, summary)));
  }

  /** 清理所有 layer */
  async cleanup(chatId: string): Promise<void> {
    await Promise.all(this.layers.map(p => p.cleanup(chatId)));
  }
}
```

**当前实现**：

| Layer | 说明 | save | recall | onSummary |
|-------|------|------|--------|-----------|
| `ConversationMemoryLayer` | 会话摘要 | 空实现（对话原文由 ACP session 自己存） | 读 memory/*.md 摘要拼接为上下文 | 写入 memory/YYYY-MM-DD.md |

**后续扩展**（加 layer 不改现有代码）：

| Layer | 说明 | save | recall | onSummary |
|-------|------|------|--------|-----------|
| `VectorMemoryLayer` | 向量检索 | embedding 后存入向量库 | 语义搜索相关对话 | 空 |
| `KnowledgeBaseMemoryLayer` | 企业知识库 | 提取业务实体存入知识库 | 检索相关业务知识 | 空 |

**配置**：

```jsonc
// config.json
{
  "memory": {
    "layers": [
      { "type": "conversation", "enabled": true },
      { "type": "vector", "enabled": false },
      { "type": "knowledge_base", "enabled": false, "endpoint": "..." }
    ]
  }
}
```

**组装**：

```typescript
// src/index.ts
const layers: IMemoryLayer[] = config.memory.layers
  .filter(p => p.enabled)
  .map(p => createLayer(p));  // 工厂方法按 type 创建对应实现

const memoryManager = new MemoryManager(layers, recycler);
```

#### 4. IAgentRouter — Agent 路由（多 agent 预留）

ManagedSession 不直接持有 IAgentProcess，而是通过 IAgentRouter 间接访问。当前实现 SingleAgentRouter，后续可扩展为 WorkflowAgentRouter。

```typescript
// src/agent/types.ts

abstract class IAgentRouter {
  /** 处理一条消息，返回流式回复 */
  abstract handle(content: PromptContent[]): AsyncIterable<AgentChunk>;

  /** 切换 agent（单 agent 模式下：杀旧起新） */
  abstract switchAgent(agentName: string): Promise<void>;

  /** 切换操作模式（通过 ACP setSessionMode） */
  abstract setMode(mode: string): Promise<void>;

  /** 获取可用模式列表 */
  abstract readonly availableModes: string[];

  /** 获取当前 sessionId（用于总结、loadSession） */
  abstract readonly sessionId: string | null;

  abstract readonly alive: boolean;
  abstract createSession(): Promise<string>;
  abstract loadSession(sessionId: string): Promise<void>;
  abstract kill(): Promise<void>;
}
```

**当前实现**：`SingleAgentRouter` — 包装一个 IAgentProcess，handle 直接调 prompt，switchAgent 杀旧起新。

**后续扩展**：`WorkflowAgentRouter` — 解析 XML 工作流，管理多个 IAgentProcess，支持视角切换和暂停/恢复。

#### 5. IStreamWriter — 流式输出

```typescript
// src/platform/types.ts

abstract class IStreamWriter {
  abstract write(chunk: string): Promise<void>;
  abstract finish(): Promise<void>;
}
```

**实现**：`WeComStreamWriter extends IStreamWriter`（内含 StreamSegmenter 分段逻辑）  
**替换场景**：Slack 的流式回复方式不同 → `SlackStreamWriter extends IStreamWriter`

### 组装（依赖注入）

```typescript
// src/index.ts — 组装所有组件

const config = loadConfig();

const platform: IMessagePlatform = new WeComPlatform(config.bot);
const agentProvider: IAgentProvider = new AcpAgentProvider();

// 记忆：按配置启用 layer
const layers: IMemoryLayer[] = config.memory.layers
  .filter(p => p.enabled)
  .map(p => createLayer(p));
const recycler: IMemoryRecycler = new AcpMemoryRecycler(agentProvider);
const memoryManager = new MemoryManager(layers, recycler);

const sessionManager = new SessionManager(agentProvider, memoryManager, config);
const bridge = new Bridge(platform, sessionManager, config);

await platform.connect();
```

**替换 Agent 只需改一行**：
```typescript
// 从 kiro 换成 claude code，只改 config.json 的 agent.command/args
// 如果是非 ACP 协议，改这一行：
const agentProvider: IAgentProvider = new SomeOtherProvider();
```

**加知识库只需加配置**：
```jsonc
// config.json 加一行
{ "type": "knowledge_base", "enabled": true, "endpoint": "https://kb.yamibuy.com/api" }
```

### 各类职责边界

| 类 | 知道什么 | 不知道什么 |
|----|---------|-----------|
| `WeComPlatform` | 企微 WS 协议、消息格式 | Agent、session、记忆 |
| `AcpAgentProcess` | ACP JSON-RPC 协议 | 企微、记忆、消息排队 |
| `ManagedSession` | 消息排队、字节追踪、轮换触发 | 企微协议、ACP 协议、记忆存储细节 |
| `SingleAgentRouter` | 包装单个 IAgentProcess，转发 prompt | 多 agent 编排 |
| `SessionManager` | 进程池管理、LRU、空闲清理 | 具体消息内容 |
| `Bridge` | 消息路由、安全检查、编排 | 具体协议实现 |
| `MemoryManager` | layer 编排顺序、合并结果 | 各 layer 内部存储方式 |
| `ConversationMemoryLayer` | memory/*.md 摘要读写、gzip 压缩 | 其他 layer、Agent、对话原文 |
| `AcpMemoryRecycler` | 如何起临时 ACP 进程做总结 | 存储细节 |

## 目录结构

```
yami-agent/
├── src/
│   ├── index.ts                    # 入口
│   ├── config.ts                   # 配置加载
│   │
│   ├── platform/                   # 消息平台层
│   │   ├── types.ts                # IMessagePlatform 接口
│   │   └── wecom/
│   │       ├── WeComPlatform.ts    # 企微 WebSocket 实现
│   │       ├── StreamSegmenter.ts  # 流式分段
│   │       └── media.ts           # 媒体下载/解密
│   │
│   ├── agent/                      # Agent 层
│   │   ├── types.ts                # IAgentProvider, IAgentProcess 接口
│   │   └── acp/
│   │       ├── AcpAgentProvider.ts # ACP 协议实现
│   │       └── AcpAgentProcess.ts  # 单个 ACP 进程管理
│   │
│   ├── session/                    # 会话管理层
│   │   ├── types.ts                # ISessionManager 接口
│   │   ├── SessionManager.ts       # 进程池 + LRU + 预热
│   │   ├── ManagedSession.ts       # 单个会话（消息队列 + 轮换）
│   │   └── MessageQueue.ts         # per-session 阻塞队列
│   │
│   ├── memory/                     # 记忆层
│   │   ├── types.ts                # IMemoryLayer, IMemoryRecycler
│   │   ├── MemoryManager.ts        # 编排层：按配置顺序调用各 layer
│   │   ├── ConversationMemoryLayer.ts  # 会话摘要层（memory/*.md 读写 + gzip）
│   │   └── AcpMemoryRecycler.ts    # 回收器：起临时 ACP 进程做总结
│   │
│   ├── bridge/                     # 桥接层（路由 + 编排）
│   │   ├── Bridge.ts               # 消息路由：platform msg → session → agent
│   │   └── guard.ts                # 注入检测 + preamble
│   │
│   ├── http/                       # HTTP API
│   │   └── server.ts               # /send, /health
│   │
│   └── watchdog/                   # 看门狗
│       └── watchdog.ts             # 独立进程，监控主进程
│
├── templates/                      # 部署模板
│   ├── agents/                     # agent 定义模板
│   ├── skills/                     # skill 模板
│   ├── steering/                   # steering 规则模板
│   └── settings.json.template      # MCP 配置模板
│
├── scripts/
│   └── deploy.sh                   # 交互式部署脚本
│
├── config.json.example
├── .env.example
├── package.json
├── tsconfig.json
└── docs/
    ├── spec.md
    ├── design.md
    └── plan.md
```

## 数据流

### 正常消息处理

```
企微 WS 消息
  → WeComPlatform.onMessage()
  → Bridge.handleMessage()
    → guard.checkInjection()
    → SessionManager.getOrCreate(chatId)
      → AcpAgentProcess.spawn(cwd={WORK_DIR})
    → ManagedSession.enqueue(message)
      → MessageQueue 排队（同一 session 串行）
      → AcpAgentProcess.prompt()
        → 收 agent_message_chunk
        → StreamSegmenter.feed(chunk)
          → WeComPlatform.sendStream()
      → ManagedSession.trackBytes(bytes) + trackTurns()
        → 超过字节阈值? → triggerRotation()
        → 超过轮数阈值? → triggerSummarize()
```

### Session 轮换

```
ManagedSession.trackBytes() 检测到 >= 2MB
  → memoryManager.summarize(chatId, sessionId)
    → recycler 起临时 ACP 进程做总结
    → 广播 saveSummary 给所有 layer
  → AcpAgentProcess.createSession(cwd)  // 新 session
  → 重置字节计数器
```

### 空闲回收与恢复

```
SessionManager.cleanupIdle() 检测到空闲 > 30min
  → 记录 sessionId 到 {sessionDir}/last_session_id
  → 杀进程，不触发总结

用户回来 → SessionManager.getOrCreate(chatId)
  → 新建 ACP 进程
  → loadSession(lastSessionId)  // 完整恢复 ACP 上下文
```

### 每日记忆整理

```
定时器（每天 0:00）
  → 遍历所有 chatId 的 session 目录
  → memoryManager.summarize(chatId, sessionId)
  → memoryManager.cleanup(chatId)
```

## 关键设计决策

### 1. 为什么用 `@agentclientprotocol/sdk` 而不是自己实现 JSON-RPC

- 官方 SDK 已处理好 ndjson stream 解析、类型校验、错误处理
- 协议版本升级时只需更新 SDK 版本
- `ClientSideConnection` 类直接提供 `initialize`/`newSession`/`prompt` 等方法

### 2. 消息队列为什么放在 ManagedSession 而不是全局

- 需求要求"同一会话内阻塞排队"，不同会话可以并行
- per-session 队列天然满足这个需求
- 全局队列会导致不同用户互相阻塞

### 3. Session 轮换阈值

阈值是可配置的 `SESSION_SIZE_LIMIT`，默认 2MB。

参考换算：
- 200K tokens 模型 → 建议 ~600KB
- 1M tokens 模型 → 建议 ~3MB  
- 2M tokens 模型 → 建议 ~6MB

直接用 `Buffer.byteLength(text, 'utf-8')` 累计字节数，不需要精确 token 计算。字节数比 token 数更容易准确追踪，阈值本身就是估算值。

### 4. 部署目录结构

```
{WORK_DIR}/                              # 工作空间根目录（ACP 进程的 cwd）
├── .kiro/                               # Agent 配置（部署脚本生成）
│   ├── steering/                        # steering 规则
│   ├── skills/                          # 启用的 skills
│   ├── settings.json                    # MCP server 配置等
│   └── agents/                          # agent 定义
├── sessions/                            # per-chat 会话目录
│   ├── dm_UserA/                        # 单聊
│   │   ├── last_session_id              # 最近的 ACP sessionId
│   │   └── memory/                      # 记忆摘要
│   │       ├── 2026-04-21.md
│   │       ├── 2026-04-20.md
│   │       └── 2026-03-20.md.gz         # 超过30天，已压缩
│   └── wruzpoCAAAxxxx/                  # 群聊
│       ├── last_session_id
│       └── memory/
├── config.json                          # 机器人配置（部署脚本生成）
└── .env                                 # 环境变量（部署脚本生成）
```

ACP 进程的 `cwd` 设为 `{WORK_DIR}`，使 Agent 能发现 `.kiro/` 下的 skill、MCP、steering 配置。所有 chat 共享同一套 Agent 配置。对话原文由 ACP 进程自己存储（如 kiro 存在 `~/.kiro/sessions/cli/{sessionId}.jsonl`），我们只在 session 目录下存摘要。

### 5. 代码仓库结构

```
yami-agent/                              # 代码仓库
├── src/                                 # 源码
├── templates/                           # 部署模板
│   ├── agents/                          # agent 定义模板
│   ├── skills/                          # skill 模板
│   ├── steering/                        # steering 规则模板
│   └── settings.json.template           # MCP 配置模板
├── scripts/
│   └── deploy.sh                        # 交互式部署脚本
├── config.json.example
├── .env.example
└── docs/
```

部署脚本从 `templates/` 复制选中的配置到 `{WORK_DIR}/.kiro/`，引导填写凭证生成 config.json 和 .env。

### 6. 环境变量与凭证传递

**三条传递路径**：

```
1. 主进程 → ACP 子进程（自动继承）
   .env → dotenv → process.env → spawn kiro-cli（继承 env）

2. ACP 进程 → Skill（无需额外处理）
   Skill 是 SKILL.md 文档，Agent 通过 execute_bash 执行 curl 命令
   execute_bash 在 ACP 进程内执行，自动继承其 env

3. ACP 进程 → MCP Server（通过 mcp.json 配置）
   kiro 根据 .kiro/settings/mcp.json 启动 MCP server 子进程
   每个 MCP server 有独立的 env 字段，凭证直接写在里面
   也支持 ${VAR} 占位符引用 ACP 进程的 process.env
```

**凭证存放位置**：

| 凭证类型 | 存放位置 | 原因 |
|---------|---------|------|
| 主服务配置（bot_id/secret） | `.env` + `config.json` | 主进程直接使用 |
| MCP server 凭证（DB密码、API key） | `.kiro/settings/mcp.json` 的 `env` 字段 | kiro 按 MCP 配置传递给各 server |
| 通用凭证（GOOGLE_APPLICATION_CREDENTIALS） | `.env`（主进程继承给 ACP，ACP 继承给 MCP） | 多处使用 |

**部署脚本**负责将凭证写入正确的位置：MCP 相关的写进 mcp.json，通用的写进 .env。

### 7. Watchdog 实现

独立的 Node.js 脚本，通过 `child_process.spawn` 启动主进程，监听 `exit` 事件自动重启。同时提供 systemd service 文件作为备选。

```typescript
// watchdog.ts — 独立入口
const child = spawn('node', ['dist/index.js'], { stdio: 'inherit' });
child.on('exit', (code) => {
  log(`主进程退出 code=${code}, ${delay}s 后重启`);
  setTimeout(() => restart(), delay);
});
```

## 依赖

| 包 | 用途 |
|----|------|
| `@agentclientprotocol/sdk` | ACP 协议 SDK |
| `ws` | WebSocket 客户端（企微长连接） |
| `fastify` | HTTP 服务（/send, /health） |
| `dotenv` | 环境变量 |
| `pino` | 日志 |
| `zod` | 配置校验 |

## 实现计划

详见 [plan.md](./plan.md)。
