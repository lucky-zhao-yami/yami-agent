# yami-agent 实现计划

## Phase 1: 项目骨架 + 核心链路

目标：一条消息能从企微进来，经过 ACP Agent 处理，流式回复回企微。

### Task 1.1: 项目初始化

- [ ] `package.json` — 依赖：`@agentclientprotocol/sdk`, `ws`, `fastify`, `dotenv`, `pino`, `zod`
- [ ] `tsconfig.json` — target ES2022, module NodeNext, strict
- [ ] `.env.example`
- [ ] `.gitignore`
- [ ] 创建目录结构骨架（空的 index.ts 占位）

### Task 1.2: 配置系统

文件：`src/config.ts`

- [ ] 用 zod 定义配置 schema：
  - `BotConfig` — bot_id, secret, welcome_msg, agent(command/args/env), chats
  - `ChatConfig` — mode(full/safe), agent(可选覆盖，per-chat 可指定不同 Agent)
  - `EnvConfig` — WORK_DIR, MAX_PROCS, WARM_POOL_SIZE, IDLE_TIMEOUT, SESSION_SIZE_LIMIT, MEMORY_SUMMARY_INTERVAL, PORT
- [ ] 加载 `config.json` + `.env`，校验后导出 typed config
- [ ] `getChatConfig(chatId)` — 按 chatId 查找配置，fallback 到 default

### Task 1.3: 接口定义（抽象类）

所有核心组件用 abstract class 定义，具体实现继承。

文件：各模块的 `types.ts`

- [ ] `src/platform/types.ts` — `abstract class IMessagePlatform`、`abstract class IStreamWriter`、`IncomingMessage`、`PlatformEvent`
- [ ] `src/agent/types.ts` — `abstract class IAgentProvider`、`abstract class IAgentProcess`、`abstract class IAgentRouter`、`AgentSpawnOptions`、`AgentChunk`、`PromptContent`
- [ ] `src/memory/types.ts` — `abstract class IMemoryLayer`、`abstract class IMemoryRecycler`、`HistoryEntry`
- [ ] `src/session/types.ts` — `ManagedSessionOptions`

每个 abstract class 定义完整的方法签名和属性，实现类只需 extends 并实现 abstract 方法。

### Task 1.4: ACP Agent 进程

文件：`src/agent/acp/AcpAgentProcess.ts`

- [ ] 用 `child_process.spawn` 启动 Agent 子进程
- [ ] 用 `@agentclientprotocol/sdk` 的 `ClientSideConnection` + `ndJsonStream` 建立连接
- [ ] 实现 `Client` 接口：
  - `sessionUpdate` — 收集 `agent_message_chunk`，yield 给调用方
  - `requestPermission` — trust-all 模式自动选第一个 allow 选项
  - `readTextFile` / `writeTextFile` — 直接读写文件系统
- [ ] 实现 `IAgentProcess`：
  - `initialize()` — 调用 `connection.initialize()`
  - `createSession(cwd)` — 调用 `connection.newSession()`，返回 sessionId
  - `loadSession(sessionId)` — 调用 `connection.loadSession()`，恢复之前的完整上下文
  - `prompt(sessionId, content)` — 调用 `connection.prompt()`，返回 AsyncIterable<AgentChunk>
  - `cancel(sessionId)` — 发送 cancel notification
  - `kill()` — 杀进程树（process group）
  - `alive` getter — 检查进程 returncode

文件：`src/agent/acp/AcpAgentProvider.ts`

- [ ] 实现 `IAgentProvider.spawn(options)` — 创建 AcpAgentProcess 并 initialize

### Task 1.5: 企微 WebSocket 平台

文件：`src/platform/wecom/WeComPlatform.ts`

- [ ] 单机器人，一个 WebSocket 连接 `wss://openws.work.weixin.qq.com`
- [ ] 认证：`aibot_subscribe`（bot_id + secret）
- [ ] 心跳：30s ping，90s 无 pong 断开
- [ ] 断线重连：指数退避 1s → 60s
- [ ] 消息回调分发：`aibot_msg_callback` → `onMessage`
- [ ] 事件回调：`aibot_event_callback` → `onEvent`（enter_chat 欢迎语）
- [ ] 发送方法：
  - `sendStream(chatId, streamId, content, finish)` — 流式回复
  - `sendMessage(chatId, content)` — 主动推送 markdown
  - `getMedia(mediaId)` — 下载媒体文件
- [ ] 发送频率控制：两次推送间隔 ≥ 2s

### Task 1.6: Bridge 路由（最简版）

文件：`src/bridge/Bridge.ts`

- [ ] 接收 `IncomingMessage`
- [ ] 提取 chatId、userId、文本内容
- [ ] 群聊过滤：只处理 @机器人 的消息
- [ ] 立即回复"🤔"占位符（冷启动反馈）
- [ ] Phase 1 暂时用一个简单的 `Map<chatId, IAgentProcess>` 管理进程，Phase 2 替换为 SessionManager
- [ ] 调用 `agent.prompt()`，收集 chunks
- [ ] 通过 `platform.sendStream()` 流式回复
- [ ] 异常处理：进程崩溃或超时时回复错误提示给用户

### Task 1.7: 入口 + 依赖注入组装

文件：`src/index.ts`

- [ ] 加载配置
- [ ] Phase 1 最简组装（不含 SessionManager/Memory，Phase 2/3 再加）：
  ```
  platform = new WeComPlatform(config)
  agentProvider = new AcpAgentProvider()
  bridge = new Bridge(platform, agentProvider, config)
  ```
- [ ] 最终完整组装（Phase 2/3 完成后）：
  ```
  platform = new WeComPlatform(config)
  agentProvider = new AcpAgentProvider()
  layers = [new ConversationMemoryLayer(config)]
  recycler = new AcpMemoryRecycler(agentProvider)
  memoryManager = new MemoryManager(layers, recycler)
  sessionManager = new SessionManager(agentProvider, memoryManager, config)  // 内部创建 SingleAgentRouter
  bridge = new Bridge(platform, sessionManager, config)
  ```
- [ ] 启动 WebSocket 连接
- [ ] 手动测试：企微发文本消息 → 收到流式回复

**Phase 1 验收标准**：企微发一条文本消息，Agent 流式回复显示在企微中。

---

## Phase 2: 会话管理

目标：会话隔离、消息排队、进程池管理。

### Task 2.1: 消息队列

文件：`src/session/MessageQueue.ts`

- [ ] per-session 异步队列
- [ ] `enqueue(task)` — 加入队列
- [ ] 内部 worker：串行取出任务执行，前一个完成后才处理下一个
- [ ] prompt 超时：超过 PROMPT_TIMEOUT 后自动 cancel 并回复超时提示

### Task 2.2: ManagedSession

文件：`src/session/ManagedSession.ts`

- [ ] 持有一个 `IAgentRouter` + `MessageQueue`
- [ ] `send(text, onChunk)` — 加入队列，等待执行
- [ ] 字节追踪：累计发送+接收的 UTF-8 字节数
- [ ] 轮数追踪：累计 prompt 次数
- [ ] 轮换检测：字节数 ≥ SESSION_SIZE_LIMIT（默认 2MB）时触发 `rotate()`
- [ ] `rotate()` — 触发记忆总结 → `agent.createSession()` 创建新 session → 重置字节和轮数计数器
- [ ] 轮数总结和轮换总结互斥：总结后重置两个计数器，避免短时间内重复总结
- [ ] `lastActive` 时间戳，用于空闲检测
- [ ] `recycle()` — 记录 sessionId → 杀进程（不触发总结，通过 loadSession 恢复）

### Task 2.3: SessionManager（进程池）

文件：`src/session/SessionManager.ts`

- [ ] `Map<chatId, ManagedSession>` 管理所有活跃会话
- [ ] `getOrCreate(chatId, config)`:
  - 已存在且 alive → 返回
  - 已存在但进程已死（被空闲回收过）→ 新建进程 → 尝试 `loadSession(lastSessionId)` 恢复完整上下文 → 若 Agent 不支持 loadSession 则 fallback 到 `createSession` + `memoryManager.recall()` 注入摘要
  - 不存在 → 检查是否超过 MAX_PROCS → 超过则 LRU 淘汰 → 创建新的
- [ ] LRU 淘汰：按 lastActive 排序，淘汰最久未使用的（先 recycle 再删除）
- [ ] `cleanupIdle()` — 定时调用（60s 间隔），清理超过 IDLE_TIMEOUT 的会话
  - 记录 sessionId 到磁盘（`{sessionDir}/last_session_id`），供下次 loadSession 恢复
  - 杀进程释放内存，不触发总结
- [ ] `shutdown()` — 优雅关闭所有会话
- [ ] 预热池（可选）：启动时预创建 WARM_POOL_SIZE 个空闲进程

### Task 2.4: 更新 Bridge

文件：`src/bridge/Bridge.ts`

- [ ] 替换 Phase 1 的直接创建逻辑，改用 `SessionManager.getOrCreate()`
- [ ] 消息通过 `ManagedSession.send()` 发送（自动排队）

### Task 2.5: 命令系统

文件：`src/bridge/commands.ts`

- [ ] 命令解析：消息以 `/` 开头时拦截，不转发给 Agent
- [ ] `/new` — 调用 `memoryManager.summarize()` → `router.createSession()` → 注入摘要 → 重置计数器
- [ ] `/reset` — 调用 `memoryManager.summarize()` → 移动 `memory/*.md` 到 `memory/archive/` → 新 session（不注入历史）
- [ ] `/restore` — 将 `memory/archive/*.md` 移回 `memory/`
- [ ] `/agent <name>` — 调用 `router.switchAgent(agentName)`（杀旧起新，不注入历史）
- [ ] `/mode <mode>` — 调用 ACP `setSessionMode(mode)`，切换当前 agent 的操作模式（ask/code/architect 等），可用模式从 session 创建时的 `availableModes` 获取
- [ ] `/switch <agent>` — 当前回复"暂不支持，多 agent 模式开发中"（预留）
- [ ] 未知命令 → 回复帮助信息
- [ ] archive 清理：每日定时任务中清理超过 30 天的 archive 文件

文件：更新 `src/bridge/Bridge.ts`

- [ ] 消息处理前先检查是否为命令，是则交给 commands 处理

### Task 2.6: SingleAgentRouter

文件：`src/agent/SingleAgentRouter.ts`

- [ ] 实现 `IAgentRouter`
- [ ] 包装一个 `IAgentProcess`，handle 直接调 prompt
- [ ] `switchAgent(name)` — 杀掉当前进程 → 用 agentProvider 起指定 agent 的新进程 → createSession（由 `/agent` 命令触发）

**Phase 2 验收标准**：
- 同一个群连发 3 条消息，按顺序处理（不并发）
- 不同群的消息并行处理
- 超过 MAX_PROCS 时旧会话被淘汰

---

## Phase 3: 记忆

目标：对话历史持久化、定时总结、会话轮换时总结、30 天压缩。

### Task 3.1: ConversationMemoryLayer

文件：`src/memory/ConversationMemoryLayer.ts`

- [ ] 实现 `IMemoryLayer`
- [ ] `save()` — 空实现（对话原文由 ACP session 自己存储）
- [ ] `recall(chatId)` — 读取 `{WORK_DIR}/sessions/{chatId}/memory/*.md` 最近 N 天的摘要（N 可配置，默认 7 天），拼接为上下文字符串
- [ ] `onSummary(chatId, date, summary)` — 写入 `{WORK_DIR}/sessions/{chatId}/memory/YYYY-MM-DD.md`
- [ ] `cleanup(chatId)` — 超过 30 天的 .md 文件 gzip 压缩

### Task 3.2: AcpMemoryRecycler

文件：`src/memory/AcpMemoryRecycler.ts`

- [ ] `summarize(chatId, sessionId)`:
  - 定位 session 文件路径（如 `~/.kiro/sessions/cli/{sessionId}.jsonl`）
  - 起临时 ACP 进程（通过构造时注入的 agentProvider.spawn）
  - 发送 RECYCLE_PROMPT，只包含 session 文件路径，让 Agent 自己用文件读取工具读内容
  - 收集回复，提取总结部分
  - 杀掉临时进程
- [ ] RECYCLE_PROMPT 模板：指示 Agent 读取指定文件、总结要点、提取知识

### Task 3.3: MemoryManager

文件：`src/memory/MemoryManager.ts`

- [ ] 构造时注入 `IMemoryLayer[]`（按配置顺序）+ `IMemoryRecycler`
- [ ] `recall(chatId)` — 按顺序调用各 layer.recall()，合并结果
- [ ] `save(chatId, entry)` — 广播给所有 layer
- [ ] `summarize(chatId, sessionId)` — 调用 recycler → 广播 onSummary 给所有 layer
- [ ] `cleanup(chatId)` — 广播给所有 layer

### Task 3.4: 总结触发集成

文件：更新 `ManagedSession.ts`, `src/index.ts`

- [ ] **轮数总结**：ManagedSession 每 N 轮调用 memoryManager.summarize
- [ ] **轮换总结**：ManagedSession.rotate() 中先 summarize 再创建新 session
- [ ] **定时总结**：index.ts 中设置定时器，每天 0:00 扫描 `{WORK_DIR}/sessions/` 下有 `last_session_id` 的子目录，调用 summarize

### Task 3.5: 上下文注入

文件：更新 `ManagedSession.ts`

- [ ] 首条消息时（firstMsg 标记）：
  - 调用 `memoryManager.recall(chatId)` 获取合并后的上下文
  - 拼接 preamble + 上下文 + 用户消息
  - 作为 prompt 发送

### Task 3.6: 30 天压缩定时任务

文件：更新 `src/index.ts`

- [ ] 每天 0:00 总结完成后，调用 `memoryManager.cleanup(chatId)`

**Phase 3 验收标准**：
- 手动触发总结后，memory 目录下生成 .md 摘要文件
- 新 session 首条消息包含历史摘要上下文
- 超过 30 天的摘要被 gzip 压缩

---

## Phase 4: 完善

目标：多媒体、流式分段、安全、HTTP API、看门狗。

### Task 4.1: 流式分段

文件：`src/platform/wecom/StreamSegmenter.ts`

- [ ] 企微 stream 是替换式，每次发当前 segment 的累计全文
- [ ] 1500 字切割，换行处优先切割
- [ ] 表格续接：切割点在 markdown 表格中间时，下一段补表头
- [ ] flush 间隔 2s（企微 30 条/分钟限制）
- [ ] 6000 冲突降级：stream 失败时降级为 sendMessage

### Task 4.2: 多媒体消息

文件：`src/platform/wecom/media.ts`

- [ ] `downloadMedia(mediaInfo, platform)` — 通过 `platform.getMedia()` 下载
- [ ] `isImage(data)` — 检查 magic bytes
- [ ] `aesDecryptImage(data, aesKey)` — 企微图片 AES 解密
- [ ] `saveMedia(chatId, data, type)` — 保存到 `sessions/<chatId>/media/`

文件：更新 `src/bridge/Bridge.ts`

- [ ] 处理 mixed 消息：遍历 msg_item，分别处理 text/image/voice/file
- [ ] 图片 → 下载解密保存 → 提示 Agent 用文件读取工具查看
- [ ] 语音 → 直接取企微转写的文字 → 作为文本处理
- [ ] 文件 → 下载保存 → 提示 Agent 用文件读取工具查看

### Task 4.3: 安全防护

文件：`src/bridge/guard.ts`

- [ ] `checkInjection(text)` — 正则匹配注入模式（从现有 Python 代码迁移）
- [ ] `getPreamble(mode)` — 返回 full/safe 模式的系统指令
- [ ] Bridge 中集成：消息先过注入检测，首条消息注入 preamble

### Task 4.4: HTTP API

文件：`src/http/server.ts`

- [ ] Fastify 服务
- [ ] `POST /send` — `{ chatId, content }` → 主动发消息
- [ ] `GET /health` — 返回进程池状态、WebSocket 连接状态

### Task 4.5: 看门狗

文件：`src/watchdog/watchdog.ts`

- [ ] 独立入口（`node dist/watchdog/watchdog.js`）
- [ ] spawn 主进程，监听 exit 事件
- [ ] 异常退出时延迟重启（指数退避）
- [ ] 正常退出（code 0）不重启

### Task 4.6: 部署脚本

文件：`scripts/deploy.sh`

- [ ] 交互式引导：
  1. 指定 WORK_DIR
  2. 选择要启用的 agent、skill、MCP
  3. 填写 bot_id、secret、Google credentials 等凭证
- [ ] 从 `templates/` 复制选中的配置到 `{WORK_DIR}/.kiro/`
- [ ] 生成 `{WORK_DIR}/config.json` 和 `{WORK_DIR}/.env`
- [ ] 生成 systemd service 文件（`yami-agent.service`）
- [ ] 构建项目（npm run build）

文件：`templates/`

- [ ] `templates/agents/` — agent 定义模板
- [ ] `templates/skills/` — skill 模板
- [ ] `templates/steering/` — steering 规则模板
- [ ] `templates/settings.json.template` — MCP 配置模板

### Task 4.7: 引用消息支持

文件：更新 `src/bridge/Bridge.ts`

- [ ] 提取引用消息内容（text/mixed/markdown/template_card）
- [ ] 拼接到用户消息中：`[userId](引用: xxx): 消息内容`

**Phase 4 验收标准**：
- 长回复自动分段显示
- 发送图片/语音/文件，Agent 能处理
- 注入攻击被拦截
- `/send` API 能主动推送消息
- 杀掉主进程后 watchdog 自动重启
