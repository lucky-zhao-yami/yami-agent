# yami-agent

企微 AI Agent 桥接服务，通过 [ACP（Agent Client Protocol）](https://github.com/anthropics/agent-client-protocol) 对接任意 AI Agent（Kiro / Claude Code / Gemini CLI 等），将企业微信消息转发给 Agent 并流式回复。

## 架构

```
企微 WebSocket ←→ Bridge ←→ SessionManager ←→ ACP Agent Process
                    ↑              ↑
                 命令系统       记忆管理
              (/new /reset     (摘要/注入
               /agent /mode)    /压缩/归档)
```

**核心设计**：面向对象 + 可插拔架构，每个节点可替换实现。

| 抽象层 | 职责 | 当前实现 |
|--------|------|---------|
| `IMessagePlatform` | 消息平台 | WeComPlatform（企微 WS） |
| `IAgentProcess` | Agent 进程 | AcpAgentProcess（ACP stdio） |
| `IMemoryLayer` | 记忆存储 | ConversationMemoryLayer（会话摘要） |
| `IMemoryRecycler` | 记忆整理 | AcpMemoryRecycler（临时 ACP 做摘要） |
| `IAgentRouter` | Agent 路由 | SingleAgentRouter（单 Agent） |

## 功能

- **流式回复** — 边生成边发送，1500 字自动分段
- **会话隔离** — 每个单聊/群聊独立 ACP 进程 + session
- **消息排队** — 同一会话内串行处理，不交叉
- **记忆管理** — 按天摘要、自动压缩、30 天归档
- **会话轮换** — 字节数/轮数达阈值自动总结并新建 session
- **进程池** — LRU 淘汰 + 空闲回收 + 预热池
- **命令系统** — `/new` `/reset` `/restore` `/agent` `/mode`
- **安全防护** — 注入检测、路径遍历防护、Unicode 归一化
- **看门狗** — 独立进程监控，崩溃自动重启（指数退避）
- **HTTP API** — `/send` 主动推送、`/health` 健康检查

## 快速开始

```bash
# 安装依赖
npm install

# 编译
npm run build

# 配置
cp .env.example .env
# 编辑 .env 填写 WORK_DIR 等配置
# 创建 config.json（参考 docs/spec.md）

# 启动
npm start

# 开发模式（watch 编译）
npm run dev
```

## 配置

### 环境变量（.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `WORK_DIR` | 工作空间目录（ACP 进程 cwd） | — |
| `MAX_PROCS` | 最大并发 ACP 进程数 | 10 |
| `WARM_POOL_SIZE` | 预热进程池大小 | 1 |
| `IDLE_TIMEOUT` | 空闲回收超时（秒） | 1800 |
| `PROMPT_TIMEOUT` | 单次 prompt 超时（秒） | 300 |
| `SESSION_SIZE_LIMIT` | session 字节数阈值 | 2097152 |
| `MEMORY_SUMMARY_INTERVAL` | 每 N 轮触发摘要 | 30 |
| `MEMORY_RECALL_DAYS` | 记忆回溯天数 | 7 |
| `PORT` | HTTP API 端口 | 8900 |

### config.json

定义企微 bot 凭证、默认 Agent 命令、per-chat 覆盖等。详见 [docs/spec.md](docs/spec.md)。

## 一键部署

```bash
# 前置条件：安装 kiro-cli 并登录
scripts/deploy.sh --profile cs
```

按团队 profile（base/dev/cs）自动配置 Agent、Skill、MCP、Steering。详见 `scripts/` 目录。

## 项目结构

```
src/
├── agent/          # Agent 进程管理（ACP）
├── bridge/         # 消息路由、命令系统、安全防护
├── http/           # HTTP API（Fastify）
├── memory/         # 记忆层（摘要/回溯/压缩）
├── platform/       # 消息平台（企微 WS）
├── session/        # 会话管理（队列/轮换/进程池）
├── watchdog/       # 看门狗（独立进程监控）
├── config.ts       # 配置加载（Zod schema）
├── logger.ts       # 日志（pino）
├── utils.ts        # 工具函数
└── index.ts        # 入口（依赖注入组装）

docs/
├── spec.md         # 需求规格
├── design.md       # 架构设计
└── plan.md         # 实现计划

scripts/
├── deploy.sh       # 一键部署脚本
├── profiles.sh     # 团队 profile 定义
├── mcp-registry.json  # MCP 声明式配置
└── mcp-collectors.sh  # MCP 凭证收集引擎

templates/          # Agent/Skill/Steering/MCP 配置模板
```

## 文档

- [需求规格](docs/spec.md)
- [架构设计](docs/design.md)
- [实现计划](docs/plan.md)
