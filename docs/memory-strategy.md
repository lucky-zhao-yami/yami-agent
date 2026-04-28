# 记忆策略分离设计

> 状态: 待实现  
> 创建: 2026-04-28  
> 修订: v3 — 事件驱动总结 + Skill 注入 + 首条兜底

## 核心思路

| 职责 | 谁负责 | 怎么做 |
|------|--------|--------|
| **存储** | IMemoryLayer | 不变，可插拔 |
| **总结触发** | 事件驱动 + ISummarizeStrategy | 事件源和策略双向独立扩展 |
| **首条注入** | 代码硬逻辑 | preamble + 摘要概要 + Skill 提示 |
| **后续注入** | Agent + Skill | Agent 主动调 /recall 端点 |

```
总结（写）：事件驱动，策略可配置
  事件源 ──▶ ISummarizeStrategy[] ──▶ MemoryManager.summarize()

注入（读）：两层
  首条消息 ──▶ 代码强制注入摘要概要（兜底，保证 Agent 知道有历史）
  后续消息 ──▶ Agent 自主通过 /recall 端点获取（Skill 引导）
```

## 一、总结触发（事件驱动）

### 事件定义

```typescript
type MemoryEvent =
  | { type: 'message_processed'; turns: number; bytes: number }
  | { type: 'timer_tick'; now: number }
  | { type: 'command'; command: 'new' | 'reset' }
  | { type: 'session_idle_recycle' };
```

### 策略接口

```typescript
interface ISummarizeStrategy {
  readonly name: string;
  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null;
  onSummarized(): void;
}

interface SessionMemoryState {
  turns: number;
  bytes: number;
  lastSummarizeTime: number;
  sessionStartTime: number;
}
```

### 事件总线

```typescript
class MemoryEventBus {
  constructor(private strategies: ISummarizeStrategy[]) {}

  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    for (const s of this.strategies) {
      const result = s.check(event, state);
      if (result) return result;
    }
    return null;
  }

  notifySummarized(): void {
    for (const s of this.strategies) s.onSummarized();
  }
}
```

### 内置策略

| 策略 | 响应事件 | 返回 |
|------|---------|------|
| TurnBasedStrategy | `message_processed` | turns % N === 0 → `'summarize'` |
| SizeBasedStrategy | `message_processed` | bytes >= limit → `'rotate'` |
| IntervalStrategy | `timer_tick` | 距上次总结 >= N 分钟 → `'summarize'` |
| CommandStrategy | `command` | new/reset → `'rotate'` |

### 事件源

| 事件源 | 发什么事件 | 位置 |
|--------|-----------|------|
| ManagedSession.send() | `message_processed` | 每条消息处理完后 |
| 定时器 (60s interval) | `timer_tick` | index.ts，替代原 scheduleDailyCron |
| commands.ts /new /reset | `command` | 命令处理时 |
| SessionManager.cleanupIdle() | `session_idle_recycle` | 空闲回收时 |

### 配置

```jsonc
{
  "memory": {
    "layers": [
      { "type": "conversation", "enabled": true }
    ],
    "summarize": [
      { "type": "turn", "interval": 30 },
      { "type": "size", "limit": 2097152 },
      { "type": "interval", "minutes": 60 },
      { "type": "command" }
    ]
  }
}
```

默认值（不配置时，复刻当前行为）：

```jsonc
{
  "summarize": [
    { "type": "turn", "interval": 30 },
    { "type": "size", "limit": 2097152 },
    { "type": "command" }
  ]
}
```

## 二、记忆注入

### 首条消息：代码强制注入（兜底）

新 session 的第一条消息，ManagedSession 强制注入：

```
[preamble — 安全规则]

[摘要概要 — MemoryManager.recall() 的结果]

如需查看更多历史或搜索特定话题，使用 memory-recall skill。

[用户消息]
```

这保证 Agent 在新 session 开始时：
1. 知道安全规则
2. 知道之前聊过什么（摘要概要）
3. 知道怎么获取更多历史（Skill 提示）

代码逻辑简单，不需要策略模式：

```typescript
// ManagedSession.send() 中
if (this.firstMsg) {
  content = [
    { type: 'text', text: getPreamble(mode) },
    { type: 'text', text: await memoryManager.recall(chatId) },
    { type: 'text', text: '如需查看更多历史，使用 memory-recall skill。\n\n' },
    ...content,
  ];
  this.firstMsg = false;
}
```

### 后续消息：Agent 自主调用

Agent 通过 memory-recall Skill 主动获取记忆：

```
Agent 觉得需要历史 → 执行 curl localhost:8900/recall?chatId=xxx
                    → 拿到各 Layer 合并的结果
                    → 自己决定用哪些
```

### /recall 端点

```typescript
// server.ts 新增
app.get('/recall', async (req) => {
  const chatId = req.query.chatId as string;
  const query = req.query.query as string | undefined;
  const result = await memoryManager.recall(chatId, query);
  return { ok: true, content: result };
});
```

### recall 返回格式

各 Layer 的结果按来源标记，Agent 自己取舍：

```markdown
## 来源: 对话摘要 (最近7天)

### 2026-04-28
用户讨论了订单退款问题...

### 2026-04-27
用户询问了物流状态...

## 来源: 语义搜索 (未来)

[相关对话片段]
```

### memory-recall Skill

```
.kiro/skills/memory-recall/SKILL.md

告诉 Agent：
- 什么时候用：需要回顾历史对话、用户提到之前讨论过的事情
- 怎么用：curl localhost:8900/recall?chatId={chatId}
- 可选参数：query=关键词（语义搜索，未来支持）
```

## 三、新增/改动文件

### 新增

```
src/memory/
├── events.ts                   # MemoryEvent + MemoryEventBus
├── strategies/
│   ├── types.ts                # ISummarizeStrategy + SessionMemoryState
│   ├── TurnBasedStrategy.ts
│   ├── SizeBasedStrategy.ts
│   ├── IntervalStrategy.ts
│   └── CommandStrategy.ts
└── strategyFactory.ts          # 从配置创建策略实例

templates/skills/memory-recall/
└── SKILL.md                    # Agent 用的记忆查询 Skill
```

### 改动

| 文件 | 改动 |
|------|------|
| `ManagedSession.ts` | 删除 shouldSummarize()，改为 eventBus.check()；injectContext() 简化为 preamble + recall + skill 提示 |
| `index.ts` | 删除 scheduleDailyCron，改为 60s 定时器发 timer_tick |
| `commands.ts` | /new /reset 通过 eventBus 发 command 事件 |
| `server.ts` | 新增 GET /recall 端点 |
| `config.ts` | 新增 summarize 配置解析 |

### 不变

| 文件 | 原因 |
|------|------|
| `MemoryManager.ts` | 接口不变，recall/summarize/save/cleanup 都不改 |
| `ConversationMemoryLayer.ts` | 纯存储，不受策略影响 |
| `AcpMemoryRecycler.ts` | 纯执行，不受策略影响 |
| `memory/types.ts` | IMemoryLayer/IMemoryRecycler 接口不变 |

## 四、实现路线

1. 定义 MemoryEvent + ISummarizeStrategy + MemoryEventBus
2. 实现 4 个总结策略 + strategyFactory
3. 重构 ManagedSession：eventBus 替代硬编码，injectContext 简化
4. 重构 index.ts：定时器发 timer_tick
5. 新增 GET /recall 端点
6. 编写 memory-recall SKILL.md
7. 补测试
