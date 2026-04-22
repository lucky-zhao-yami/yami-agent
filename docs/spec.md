# yami-agent 需求规格

## 项目概述

企业微信机器人 ↔ ACP Agent 桥接服务。接收企微消息，通过标准 ACP 协议转发给 AI Agent（Kiro / Claude Code / 其他），将 Agent 回复流式推送回企微。

**语言**: TypeScript  
**运行环境**: EC2 (Linux)  
**仓库位置**: `/mnt/d/code/yami/yami-agent`

## 功能需求

### FR-1: 企微 WebSocket 长连接

通过企微智能机器人 WebSocket API (`wss://openws.work.weixin.qq.com`) 建立长连接，收发消息。

- 单机器人，一个 bot_id + secret
- 心跳保活（30s 间隔，90s 无 pong 断开重连）
- 断线指数退避重连（1s → 2s → 4s → ... → 60s 上限）
- 入群欢迎语

### FR-2: 消息类型支持

| 类型 | 接收 | 回复 |
|------|------|------|
| 文本 | ✅ | ✅ (markdown stream) |
| 图片 | ✅ (AES 解密) | ❌ |
| 语音 | ✅ (企微自动转文字) | ❌ |
| 文件 | ✅ (下载到本地) | ❌ |
| mixed | ✅ (组合处理) | ❌ |

- 群聊仅响应 @机器人 的消息
- 回复使用企微 stream 模式（流式分段，1500 字切割）

### FR-3: ACP Agent 对接

通过标准 ACP 协议（`@agentclientprotocol/sdk`）对接 AI Agent。

- Agent 以子进程方式启动，stdin/stdout 走 JSON-RPC 2.0 (ndjson)
- 支持可插拔的 Agent 实现：
  - `kiro-cli acp --trust-all-tools [--agent <name>]`
  - `npx @zed-industries/claude-code-acp`
  - 其他任何 ACP 兼容 Agent
- 核心交互流程：`initialize` → `session/new` → `session/prompt` → 收 `session/update` chunks
- 支持 `session/cancel` 打断当前 prompt
- 自动处理 `session/request_permission`（trust-all 模式自动批准）

### FR-4: 会话隔离

- 每个单聊/群聊对应一个独立的 ACP 进程和 session
- 每个 chat 有独立的 session 目录：`{WORK_DIR}/sessions/{chatId}/`，用于存放记忆摘要和 Agent 生成的文件
- ACP 进程的 cwd 设为 `{WORK_DIR}`，使 Agent 能发现 `.kiro/` 下的 skill、MCP、steering 配置
- 记忆摘要文件（memory/*.md）也在同一目录下，对话原文由 ACP 进程自己存储
- 会话间完全隔离，互不影响
- 同一会话内多条消息**阻塞排队**，顺序处理，不打断当前正在处理的 prompt
- **冷启动反馈**：首条消息触发进程创建时，立即回复"🤔"占位符，Agent 回复后流式替换
- **进程崩溃恢复**：检测到 ACP 进程异常退出时，给用户回复错误提示，下次消息自动重建进程
- **Prompt 超时**：可配置超时时间（默认 5 分钟），超时后 cancel 并通知用户

### FR-5: 会话轮换

- 本地累计每个 session 的发送/接收文本字节数
- 当累计字节数达到 SESSION_SIZE_LIMIT（默认 2MB）时，自动创建新 session（`session/new`）
- 阈值可配置，按实际模型 context window 调整（200K tokens ≈ 600KB，2M tokens ≈ 6MB）
- 轮换前触发记忆总结（FR-6）

### FR-6: 记忆管理

- **定时总结**：每天凌晨 0 点，对所有有对话记录的 session 做总结
- **轮数总结**：每 N 轮（可配置，默认 30 轮）触发一次总结
- **轮换总结**：session 轮换时触发总结
- **总结执行者**：起一个临时 ACP 进程，将 session 文件路径（`~/.kiro/sessions/cli/{sessionId}.jsonl` 或对应 Agent 的 session 文件）传给它，让它自己读文件做摘要 + 知识提取，不在 prompt 中传递对话内容
- **存储**：按天存放到 `{WORK_DIR}/sessions/<chatId>/memory/YYYY-MM-DD.md`
- **保留策略**：最近 30 天保留原文，超过 30 天 gzip 压缩存档
- **上下文注入**：新 session 首条消息时，通过 MemoryManager 合并所有启用的 layer 的 recall 结果注入上下文

### FR-7: 进程池管理

- 最大进程数可配置（默认 10）
- LRU 淘汰：进程数达上限时淘汰最久未使用的
- 空闲超时：30 分钟无活动自动回收进程释放内存，记录 sessionId 供下次 `session/load` 恢复，不触发总结
- 预热池：启动时预创建 N 个空闲进程（可配置）

### FR-8: 看门狗

- 独立的 watchdog 进程监控主进程存活
- 主进程异常退出时自动重启
- 支持 systemd service 部署

### FR-9: 安全防护

- 提示词注入检测（正则匹配常见注入模式）
- 安全 preamble 注入（首条消息注入系统规则）
- 支持 full/safe 两种权限模式

### FR-10: HTTP API

- `POST /send` — 主动发送消息到企微（供外部调用）
- `GET /health` — 健康检查

### FR-11: 部署

- 代码仓库中存放 agent 定义、skill、MCP 配置的模板
- 提供交互式部署脚本（`scripts/deploy.sh`），引导用户：
  1. 指定工作空间目录（WORK_DIR）
  2. 选择要启用的 agent、skill、MCP
  3. 填写凭证（bot_id/secret、Google credentials 等）
  4. 脚本自动将选中的配置部署到 `{WORK_DIR}/.kiro/`，生成 config.json 和 .env
- 支持 systemd service 部署

### FR-12: 命令系统

用户发送以 `/` 开头的消息时，作为命令处理，不转发给 Agent。

| 命令 | 行为 |
|------|------|
| `/new` | 总结当前 session → 创建新 session → 注入摘要 → 重置计数器 |
| `/reset` | 总结压缩当前记忆 → 摘要移到 `memory/archive/` → 新 session（干净，不注入历史）→ archive 保留 30 天后自动删除 |
| `/restore` | 将 `memory/archive/` 里的摘要恢复回 `memory/`，下次 recall 可读取 |
| `/agent <name>` | 杀掉当前 agent 进程 → 起指定 agent 的新进程 → 新 session，不注入历史 |
| `/mode <mode>` | 切换当前 agent 的操作模式（如 ask/code/architect），不换进程不换 session，通过 ACP `setSessionMode` 实现 |
| `/switch <agent>` | 切换视角查看某个 agent 的上下文（多 agent 预留，当前回复"暂不支持"） |

- 命令解析在 Bridge 层，优先于消息转发
- 未知命令回复帮助信息

### FR-13: 多 Agent 协作（预留，当前不实现）

架构上预留以下扩展能力，当前版本只实现单 agent 模式：

- **入口 Agent**：每个 chat 有一个入口 agent（默认 orchestrator），用户消息始终先到它
- **工作流模板**：预定义的 XML 格式编排流程，存放在 `templates/workflows/`，定义步骤、每步使用的 agent、依赖关系
- **调度器**：程序逻辑（非 AI），解析 XML 工作流，按步骤依次调用各 agent 的 ACP 进程
- **视角切换**：执行过程中用户可 `/switch <agent>` 切到某个 agent 直接对话，工作流暂停等待
- **恢复执行**：用户切回入口 agent 后，工作流从暂停处继续

预留方式：ManagedSession 依赖 `IAgentRouter` 抽象而非直接依赖 `IAgentProcess`，当前实现 `SingleAgentRouter`（直接转发），后续实现 `WorkflowAgentRouter`（编排多 agent）。

## 非功能性要求

- **性能**：单条消息处理延迟 < 2s（不含 Agent 推理时间）
- **可靠性**：WebSocket 断线自动重连，进程崩溃自动恢复
- **可扩展性**：核心组件可插拔替换（Agent 实现、消息平台、记忆存储）

## 配置

通过 `config.json` + `.env` 配置：

```jsonc
// config.json — 单机器人配置
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
    "dm_someone": { "mode": "full", "agent": { "command": "...", "args": ["..."] } }
  },
  "memory": {
    "layers": [
      { "type": "conversation", "enabled": true }
    ]
  }
}
```

> **注意**：`chats` 中没有 `cwd` 字段。ACP 进程的 cwd 统一为 `{WORK_DIR}`（见 FR-4），session 目录 `{WORK_DIR}/sessions/{chatId}/` 用于存放记忆和生成文件。`config.json` 和 `.env` 由部署脚本生成（见 FR-11）。

```bash
# .env — 主服务 + 通用凭证
WORK_DIR=/mnt/d/workspace/all
MAX_PROCS=10
WARM_POOL_SIZE=1
IDLE_TIMEOUT=1800
PROMPT_TIMEOUT=300          # 单次 prompt 超时（秒），默认 5 分钟
SESSION_SIZE_LIMIT=2097152   # 2MB，按实际模型 context window 调整
MEMORY_SUMMARY_INTERVAL=30  # 每30轮总结
MEMORY_RECALL_DAYS=7        # recall 时读取最近几天的摘要
PORT=8900

# 通用凭证（继承给 ACP 子进程和 MCP server）
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# MCP server 专用凭证写在 .kiro/settings/mcp.json 的 env 字段里，不写在这里
```
