# 记忆策略分离设计

> 状态: 设计阶段  
> 创建: 2026-04-28  
> 修订: v2 — 事件驱动架构

## 问题

当前记忆系统的三个职责耦合在 ManagedSession 中：

| 职责 | 当前位置 | 问题 |
|------|---------|------|
| **存储** | IMemoryLayer | ✅ 已抽象，可插拔 |
| **总结触发** | ManagedSession.send() 硬编码 + index.ts cron | ❌ 只有两个入口，加新触发方式要改多处代码 |
| **注入决策** | ManagedSession.injectContext() 硬编码 firstMsg | ❌ 只支持首条消息注入 |

## 设计：事件驱动

**核心思想：事件源和策略双向独立扩展。**

```
事件源（谁触发）              策略（怎么决策）            执行（做什么）
┌──────────────────┐
│ ManagedSession    │─ message_processed ─▶┐
│ (消息处理完成)    │                      │
├──────────────────┤                      │  ┌─────────────────────┐
│ Timer             │─ timer_tick ────────▶├─▶│ ISummarizeStrategy[] │──▶ MemoryManager.summarize()
│ (定时器)          │                      │  └─────────────────────┘
├──────────────────┤                      │
│ Commands          │─ command ───────────▶│  ┌─────────────────────┐
│ (/new /reset)     │                      ├─▶│ IInjectionStrategy   │──▶ prepend to prompt
├──────────────────┤                      │  └─────────────────────┘
│ SessionManager    │─ session_recycle ───▶│
│ (空闲回收/LRU)    │                      │
└──────────────────┘                      │
  (未来随便加)                              │
  │ Agent 主动请求   │─ agent_request ────▶┘
```

**加新事件源**：不改任何 Strategy。  
**加新策略**：不改任何事件源。  
**加新存储后端**：不改 Strategy 也不改事件源。

## 事件定义

```typescript
/** 记忆系统事件 — 任何组件都可以发出。 */
type MemoryEvent =
  | { type: 'message_processed'; turns: number; bytes: number; elapsedMs: number }
  | { type: 'timer_tick'; now: number }
  | { type: 'command'; command: 'new' | 'reset' }
  | { type: 'session_idle_recycle' }
  | { type: 'before_message'; turns: number; isFirstMessage: boolean };
```

前四种驱动总结决策，最后一种驱动注入决策。未来加 `agent_request`、`topic_change` 等只需扩展联合类型。

## 策略接口

### ISummarizeStrategy

```typescript
/** 总结触发策略 — 纯决策，无状态依赖，不持有定时器。 */
interface ISummarizeStrategy {
  readonly name: string;

  /**
   * 收到事件后决策。
   * 返回值：
   *   'summarize' — 触发总结
   *   'rotate'    — 触发总结 + 创建新 session
   *   null        — 不触发
   */
  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null;

  /** 总结完成后调用，可重置内部计数。 */
  onSummarized(): void;
}

/** Strategy 做决策时需要的 session 状态（只读）。 */
interface SessionMemoryState {
  turns: number;
  bytes: number;
  lastSummarizeTime: number;
  sessionStartTime: number;
}
```

### IInjectionStrategy

```typescript
/** 注入决策策略 — 决定什么时候注入、注入什么。 */
interface IInjectionStrategy {
  readonly name: string;

  /**
   * 收到事件后决策。
   * 返回需要 prepend 到 prompt 的内容，空数组表示不注入。
   */
  check(event: MemoryEvent, context: InjectionContext): Promise<PromptContent[]>;
}

interface InjectionContext {
  chatId: string;
  mode: 'full' | 'safe';
  memoryManager: MemoryManager;
}
```

## 事件总线

轻量实现，不引入外部依赖：

```typescript
/** 记忆事件总线 — 连接事件源和策略。 */
class MemoryEventBus {
  constructor(
    private summarizeStrategies: ISummarizeStrategy[],
    private injectionStrategy: IInjectionStrategy,
    private memoryManager: MemoryManager,
  ) {}

  /** 发出事件，检查所有总结策略。返回需要执行的动作。 */
  checkSummarize(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null {
    for (const s of this.summarizeStrategies) {
      const result = s.check(event, state);
      if (result) return result;
    }
    return null;
  }

  /** 发出事件，检查注入策略。返回需要 prepend 的内容。 */
  async checkInjection(event: MemoryEvent, context: InjectionContext): Promise<PromptContent[]> {
    return this.injectionStrategy.check(event, context);
  }

  /** 通知所有策略总结已完成。 */
  notifySummarized(): void {
    for (const s of this.summarizeStrategies) s.onSummarized();
  }
}
```

## 内置策略

### 总结策略

| 策略 | 响应事件 | 逻辑 |
|------|---------|------|
| `TurnBasedStrategy` | `message_processed` | turns % interval === 0 → summarize |
| `SizeBasedStrategy` | `message_processed` | bytes >= limit → rotate |
| `IntervalStrategy` | `timer_tick` | now - lastSummarizeTime >= interval → summarize |
| `CommandStrategy` | `command` | command === 'new' → rotate; command === 'reset' → rotate |

### 注入策略

| 策略 | 响应事件 | 逻辑 |
|------|---------|------|
| `FirstMessageStrategy` | `before_message` | isFirstMessage → preamble + recall |
| `PeriodicStrategy` | `before_message` | isFirstMessage → 全量; 每 N 轮 → 增量 recall |

## 事件源

### 消息处理（ManagedSession）

```typescript
// send() 中
// 发送前
const injection = await this.eventBus.checkInjection(
  { type: 'before_message', turns: this.turns, isFirstMessage: this.firstMsg },
  { chatId: this.chatId, mode: this.opts.mode, memoryManager: this.memoryManager }
);

// 发送后
const action = this.eventBus.checkSummarize(
  { type: 'message_processed', turns: this.turns, bytes: this.bytes, elapsedMs: ... },
  this.getMemoryState()
);
if (action === 'rotate') await this.rotate();
else if (action === 'summarize') await this.triggerSummarize();
```

### 定时器（index.ts）

```typescript
// 替代原来的 scheduleDailyCron
// 每 60s 对所有 session 发 timer_tick
setInterval(() => {
  for (const [chatId, session] of sessions) {
    const action = session.eventBus.checkSummarize(
      { type: 'timer_tick', now: Date.now() },
      session.getMemoryState()
    );
    if (action) session.triggerSummarize();
  }
}, 60_000);
```

### 命令（commands.ts）

```typescript
// /new 命令
const action = session.eventBus.checkSummarize(
  { type: 'command', command: 'new' },
  session.getMemoryState()
);
// action 一定是 'rotate'（CommandStrategy 保证）
```

### 空闲回收（SessionManager）

```typescript
// cleanupIdle() 中
session.eventBus.checkSummarize(
  { type: 'session_idle_recycle' },
  session.getMemoryState()
);
```

## 配置

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
    ],
    "injection": {
      "type": "periodic",
      "interval": 10
    }
  }
}
```

不配置时默认值（复刻当前行为）：

```jsonc
{
  "summarize": [
    { "type": "turn", "interval": 30 },
    { "type": "size", "limit": 2097152 }
  ],
  "injection": { "type": "firstMessage" }
}
```

## 新增文件

```
src/memory/
├── types.ts                    # 现有，不变
├── MemoryManager.ts            # 现有，不变
├── ConversationMemoryLayer.ts  # 现有，不变
├── AcpMemoryRecycler.ts        # 现有，不变
├── events.ts                   # 新增：MemoryEvent 类型 + MemoryEventBus
├── strategies/
│   ├── types.ts                # 新增：ISummarizeStrategy + IInjectionStrategy
│   ├── TurnBasedStrategy.ts    # 新增
│   ├── SizeBasedStrategy.ts    # 新增
│   ├── IntervalStrategy.ts     # 新增
│   ├── CommandStrategy.ts      # 新增
│   ├── FirstMessageStrategy.ts # 新增
│   └── PeriodicStrategy.ts     # 新增
└── strategyFactory.ts          # 新增：从配置创建策略实例
```

## 改动文件

| 文件 | 改动 |
|------|------|
| `ManagedSession.ts` | 删除硬编码的 shouldSummarize/injectContext，改为通过 eventBus 决策 |
| `session/types.ts` | ManagedSessionOptions 增加 eventBus |
| `index.ts` | 删除 scheduleDailyCron，改为通用定时器发 timer_tick |
| `commands.ts` | /new /reset 通过 eventBus 发 command 事件 |
| `config.ts` | 增加 summarize/injection 配置解析 |

## 向后兼容

- 不配置 `summarize` 和 `injection` 时，使用默认策略，行为和当前完全一致
- Layer 接口不变
- MemoryManager 接口不变
- 对外 API（/send /health）不变

## 实现路线

1. 定义 MemoryEvent + ISummarizeStrategy + IInjectionStrategy + MemoryEventBus
2. 实现 4 个总结策略 + 2 个注入策略
3. 实现 strategyFactory（从配置创建策略）
4. 重构 ManagedSession 使用 eventBus
5. 重构 index.ts 定时器 + commands.ts
6. 补测试
