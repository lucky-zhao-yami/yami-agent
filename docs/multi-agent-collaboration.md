# 多 Agent 协作设计

> 状态: 设计阶段，未实现  
> 创建: 2026-04-28

## 概述

yami-agent 的多 Agent 协作分为两层：

| 层级 | 范围 | 通信方式 | 调度模型 | 状态 |
|------|------|---------|---------|------|
| 第一层 | Bot 内部多 Agent 编排 | 进程间直接调用 | 同步，共享内存 | 已预留接口 (IAgentRouter) |
| 第二层 | 跨部门 Bot 协作 | OpenProject Issue | 异步，消息驱动 | 本文档设计 |

```
第一层（Bot 内部）                    第二层（跨 Bot）
┌──────────────────────┐            ┌──────────────────────┐
│  WorkflowAgentRouter  │            │  OpenProject Issue    │
│                      │            │                      │
│  Architect → Coder   │  ────────▶ │  CS Bot → Dev Bot    │
│  → Reviewer          │  "超出我的  │  Dev Bot → Ops Bot   │
│                      │   能力边界" │                      │
│  同步、同一进程池     │            │  异步、跨机器跨部门   │
└──────────────────────┘            └──────────────────────┘
```

## 第一层：Bot 内部多 Agent 编排

### 现有预留

ManagedSession 依赖 `IAgentRouter` 抽象，当前实现 `SingleAgentRouter`（1:1 转发）。

```
ManagedSession
  └── IAgentRouter (抽象)
        ├── SingleAgentRouter (当前) — 单 Agent，直接转发 prompt
        └── WorkflowAgentRouter (未来) — 多 Agent，按工作流编排
```

### WorkflowAgentRouter 设计

```typescript
// 工作流定义（XML 或 JSON）
interface WorkflowStep {
  name: string;           // "architect" | "coder" | "reviewer"
  agent: string;          // Agent 名称，对应 agents/ 目录下的定义
  dependsOn?: string[];   // 依赖的前置步骤
  input: string;          // prompt 模板，可引用前置步骤的输出
}

// WorkflowAgentRouter 内部管理多个 ACP 进程
// 按 dependsOn 拓扑排序执行，无依赖的步骤可并行
// 用户可通过 /switch <agent> 切到某个 Agent 直接对话（工作流暂停）
```

### 适用场景

- SOP 开发流程：PM → API Designer → Architect → Coder → QA → Reviewer
- 代码审查：Coder 写完 → Reviewer 审查 → REJECT 则回到 Coder
- 文档生成：读代码 → 生成接口文档 + 测试文档

---

## 第二层：跨 Bot 协作

### 架构

```
                      OpenProject
                 ┌─────────────────┐
                 │ project:         │
                 │ bot-collaboration│
                 │                 │
                 │ Issue #101      │
                 │ from: cs-bot    │
                 │ to: dev-bot     │
                 │ status: open    │
                 └────────┬────────┘
                          │
            ┌─────────────┼─────────────┐
            │  webhook/轮询│             │
            ▼             ▼             ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │  CS Bot   │  │  Dev Bot  │  │  Ops Bot  │
      │  客服部门  │  │  开发部门  │  │  运维部门  │
      │  EC2-B    │  │  EC2-A    │  │  EC2-C    │
      └──────────┘  └──────────┘  └──────────┘
```

### 核心思想

每个部门有自己的 yami-agent 实例（不同的 Agent 配置、Skill、Steering）。当一个 Bot 发现问题超出自己的能力边界时，通过 OpenProject 创建 Issue 委托给其他部门的 Bot。

**为什么用 OP 而不是消息队列**：
- OP 已有完整的 Issue 生命周期（New → In Progress → Done / Rejected）
- 有评论系统，Bot 之间可以在 Issue 上追问和补充信息
- 有权限控制，可以限制谁能给谁提什么类型的 Issue
- 人类可以随时介入查看和干预
- 我们已有 OP MCP，不需要额外开发

### Issue 协议

#### OP 字段映射

| OP 字段 | 用途 | 说明 |
|---------|------|------|
| `project` | 固定项目 | `bot-collaboration` |
| `type` | Issue 类型 | Bug / Task / Deploy / Query |
| `subject` | 标题 | 简短描述任务 |
| `assignee` | 目标 Bot | 每个 Bot 对应一个 OP 用户 |
| `description` | 结构化任务描述 | 见下方模板 |
| `status` | 生命周期 | New → In Progress → Done / Rejected |
| `custom_field: source_bot` | 发起方 Bot ID | 用于结果回传路由 |
| `custom_field: callback_chat` | 回传目标 | 企微 chatId，结果发到哪个群 |
| `custom_field: priority` | 紧急程度 | normal / urgent |

#### Issue 描述模板

Bot 创建 Issue 时使用结构化 markdown，方便接收方 Bot 解析：

```markdown
## 上下文
<!-- 发起方 Bot 排查过程中收集的信息 -->
- 来源: 用户 @张三 在企微群 group_xxx 反馈
- 订单号: #12345
- 现象: 退款金额应为 $50，实际退了 $30
- 已排查: 查了数据库和日志，定位到 RefundService.calculate() 逻辑有误

## 请求
<!-- 具体要做什么 -->
定位并修复 ec-so-service 的退款金额计算逻辑

## 附件
<!-- 相关日志、截图、SQL 结果等 -->
- 错误日志: [Kibana 链接]
- 相关代码: ec-so-service/RefundService.java:L120

## 约束
<!-- 权限边界、时间要求、注意事项 -->
- 不要直接修改数据库
- 修复后需要在 QC 环境验证

## 回传要求
<!-- 完成后需要回传什么信息 -->
- PR 链接
- 修复说明（给客服同学看的，非技术语言）
```

#### 结果回传

目标 Bot 完成后，在 Issue 评论中回写结果，并更新 status：

```markdown
## 处理结果
- 状态: 已修复
- PR: https://github.com/yamibuy/ec-so-service/pull/123
- 原因: 退款计算时未考虑优惠券抵扣部分
- 修复说明: 退款金额现在会正确扣除优惠券已抵扣的部分，不会多退

## 后续
- 需要部署到 QC 验证（已提 Deploy Issue #102 给 Ops Bot）
```

### 各 Bot 新增模块

```
yami-agent/src/
└── collaboration/
    ├── types.ts              # BotIssue, IssueTemplate, Permission 类型
    ├── IssueWatcher.ts       # 监听分配给自己的新 Issue
    ├── IssueDispatcher.ts    # 解析 Issue → 组装 prompt → 交给内部 Agent
    └── IssueClient.ts        # 创建 Issue 给其他 Bot
```

#### IssueWatcher

```
定时轮询 OP（或接收 webhook）
  → 查询 assignee=自己 且 status=New 的 Issue
  → 交给 IssueDispatcher 处理
  → 更新 status 为 In Progress
```

轮询间隔可配置（默认 60s），urgent 类型的 Issue 可以通过 webhook 实时触发。

#### IssueDispatcher

```
收到 Issue
  → 解析 description 中的结构化信息
  → 根据 Issue type 选择处理策略:
    - Bug → 走 SOP 流程（分析 → 修复 → 测试 → PR）
    - Deploy → 调用部署 Skill
    - Query → 查询后直接回复
  → 处理完成 → 在 Issue 评论中回写结果
  → 更新 status 为 Done
  → 如果有 callback_chat → 通过 HTTP API 发消息到企微群
```

#### IssueClient

```
Agent 处理过程中发现需要其他部门协助
  → 检查权限表（能不能给目标 Bot 提这个类型的 Issue）
  → 用 OP MCP 创建 Issue
  → 返回 Issue ID 给调用方
  → 可选: 注册 watcher 等待结果回传
```

### 权限控制

每个 Bot 的 config 中定义允许的协作关系：

```jsonc
// config.json
{
  "collaboration": {
    "bot_id": "cs-bot",
    "op_user_id": 15,
    "op_project": "bot-collaboration",
    "poll_interval": 60,
    
    // 我能给谁提什么类型的 Issue
    "can_create": {
      "dev-bot": ["Bug", "Query"],
      "ops-bot": ["Query"]
    },
    
    // 我能处理什么类型的 Issue
    "can_handle": ["Query"],
    
    // 结果回传方式
    "callback": {
      "type": "wecom",  // 通过企微消息回传
      "default_chat": "group_cs_internal"
    }
  }
}
```

### 完整场景示例

#### 场景 1：CS Bot 发现 Bug → Dev Bot 修复

```
1. 用户在企微问 CS Bot："订单 #12345 退款少了"

2. CS Bot 内部排查（第一层，单 Agent）：
   → 查数据库: 退款金额确实不对
   → 查日志: RefundService.calculate() 逻辑有误
   → 判断: 这是代码 bug，超出我的能力

3. CS Bot 通过 IssueClient 创建 OP Issue：
   → type=Bug, assignee=dev-bot
   → description 包含排查结果、日志链接、订单号

4. CS Bot 回复用户：
   "已确认是退款计算的技术问题，已提交给开发团队处理（Issue #101），
    修复后会通知您。"

5. Dev Bot 的 IssueWatcher 发现 Issue #101：
   → IssueDispatcher 解析 → 走 SOP 流程
   → 分析代码 → 修复 → 提 PR #67
   → 回写 Issue: status=Done, 评论包含 PR 链接和修复说明

6. CS Bot 的 IssueWatcher 发现 #101 变为 Done：
   → 读取评论中的修复说明
   → 回复企微群：
     "退款问题已修复（优惠券抵扣部分之前没算进去），
      等部署后会自动生效。"
```

#### 场景 2：Dev Bot 需要部署 → Ops Bot 执行

```
1. Dev Bot 修完 bug，需要部署到 QC 验证

2. Dev Bot 通过 IssueClient 创建 OP Issue：
   → type=Deploy, assignee=ops-bot
   → description: 部署 ec-so-service 分支 fix/refund-calc 到 QC

3. Ops Bot 的 IssueWatcher 发现 Issue #102：
   → 调用 idp-deploy Skill 部署
   → 等待部署完成
   → 回写 Issue: status=Done, 评论包含部署结果

4. Dev Bot 收到通知 → 继续后续流程（跑集成测试等）
```

#### 场景 3：Issue 被拒绝

```
1. CS Bot 给 Dev Bot 提了一个 Bug Issue

2. Dev Bot 分析后发现不是 bug，是用户操作问题：
   → 回写 Issue: status=Rejected
   → 评论: "这不是 bug，用户使用了过期优惠券，退款金额是正确的。
            建议引导用户查看优惠券使用规则。"

3. CS Bot 收到 Rejected 通知：
   → 读取拒绝原因
   → 回复企微群：
     "经开发团队确认，退款金额是正确的。您使用的优惠券已过期，
      不参与退款计算。如有疑问可以查看优惠券使用规则。"
```

### 人类介入

OP 的优势是人类可以随时介入：

- **查看进度**：打开 OP 看所有 Bot 之间的 Issue 流转
- **干预处理**：手动修改 assignee（转给人类处理）、添加评论补充信息
- **审批机制**：某些高风险操作（如生产部署）可以设置为需要人类审批后 Bot 才执行
- **事后审计**：所有 Bot 的协作记录都在 OP 上，可追溯

### 与现有系统的关系

| 组件 | 角色 | 改动 |
|------|------|------|
| yami-agent | 每个部门的 Bot 实例 | 新增 collaboration/ 模块 |
| OpenProject | Issue 平台 | 新建 bot-collaboration 项目，为每个 Bot 创建 OP 用户 |
| OP MCP | 操作 OP 的工具 | 已有，无需改动 |
| 企微 | 用户交互入口 + 结果回传 | 无改动 |
| wecom-bridge HTTP API | Bot 间消息回传 | 已有 /send 接口，无需改动 |

---

## 实现路线

### Phase 1：基础设施（跨 Bot 协作）

1. OP 上创建 `bot-collaboration` 项目和 Bot 用户
2. 实现 `collaboration/types.ts` — Issue 协议类型定义
3. 实现 `IssueClient.ts` — 创建 Issue（复用 OP MCP）
4. 实现 `IssueWatcher.ts` — 轮询 OP 新 Issue
5. 实现 `IssueDispatcher.ts` — 解析 Issue → 交给 Agent
6. config.json 增加 collaboration 配置段

### Phase 2：场景落地

1. CS Bot + Dev Bot 联调：CS 提 Bug → Dev 修复 → 回传
2. Dev Bot + Ops Bot 联调：Dev 提 Deploy → Ops 执行 → 回传
3. 完善错误处理：Issue 超时、Bot 不可用、重试机制

### Phase 3：Bot 内部多 Agent（第一层）

1. 实现 `WorkflowAgentRouter`
2. 工作流模板定义（XML/JSON）
3. /switch 命令支持视角切换
4. 与第二层打通：WorkflowRouter 执行中发现需要外部协助 → IssueClient

### Phase 4：增强

1. OP webhook 替代轮询（实时性）
2. Issue 优先级队列
3. Bot 能力发现（Bot 注册自己能处理的 Issue 类型）
4. 协作链路追踪（一个用户问题触发的所有 Issue 串联）
5. 仪表盘：各 Bot 的 Issue 处理量、平均耗时、拒绝率
