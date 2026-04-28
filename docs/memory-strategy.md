# 记忆策略分离设计

> 状态: 设计阶段，未实现  
> 创建: 2026-04-28

## 问题

当前记忆系统的三个职责耦合在一起：

| 职责 | 当前位置 | 问题 |
|------|---------|------|
| **存储**（存什么、怎么存） | IMemoryLayer | ✅ 已抽象，可插拔 |
| **总结触发**（什么时候总结） | ManagedSession.send() 硬编码 | ❌ 加新策略要改 ManagedSession |
| **注入决策**（什么时候注入、注入什么） | ManagedSession.injectContext() 硬编码 firstMsg | ❌ 只支持首条消息注入 |

## 目标

**Layer 只管存储，Strategy 只管决策，ManagedSession 只管执行。**

三者通过配置组合，互不依赖：

```
config.json
  └── memory
        ├── layers: [...]           ← 存储后端（不变）
        ├── summarize: [...]        ← 总结触发策略（新增）
        └── injection: { ... }      ← 注入决策策略（新增）
```

## 架构

```
ManagedSession
  │
  │  每条消息 → 问 ISummarizeStrategy[]: 要不要总结？
  │  每条消息 → 问 IInjectionStrategy: 要不要注入上下文？
  │
  ├── ISummarizeStrategy[]        ← 什么时候触发总结
  │     ├── TurnBasedStrategy          每 N 轮
  │     ├── SizeBasedStrategy          字节超限（触发轮换）
  │     ├── TimeBasedStrategy          距上次总结超过 N 分钟
  │     └── (未来) TopicChangeStrategy  检测话题切换
  │
  ├── IInjectionStrategy          ← 什么时候注入、注入什么
  │     ├── FirstMessageStrategy       仅首条消息（当前行为）
  │     ├── PeriodicStrategy           每 N 轮重新注入最新摘要
  │     └── (未来) OnDemandStrategy     Agent 主动请求时注入
  │
  ├── MemoryManager               ← 编排 Layer（不变）
  │     └── IMemoryLayer[]        ← 纯存储（不变）
  │
  └── IMemoryRecycler             ← 执行总结（不变）
```

## 接口定义

### ISummarizeStrategy

```typescript
/** 总结触发策略 — 决定什么时候该触发记忆总结。 */
interface ISummarizeStrategy {
  readonly name: string;

  /**
   * 每条消息处理完后调用。
   * 返回 true 表示应该触发总结。
   */
  shouldSummarize(context: SummarizeContext): boolean;

  /** 总结完成后调用，重置内部状态。 */
  onSummarized(): void;
}

interface SummarizeContext {
  turns: number;           // 当前 session 累计轮数
  bytes: number;           // 当前 session 累计字节数
  lastSummarizeTime: number; // 上次总结的时间戳
  sessionStartTime: number;  // session 创建时间
}
```

### IInjectionStrategy

```typescript
/** 注入决策策略 — 决定什么时候注入上下文、注入什么。 */
interface IInjectionStrategy {
  readonly name: string;

  /**
   * 每条消息发送前调用。
   * 返回需要 prepend 的内容，空数组表示不注入。
   */
  getInjection(context: InjectionContext): Promise<PromptContent[]>;
}

interface InjectionContext {
  chatId: string;
  turns: number;            // 当前 session 累计轮数
  isFirstMessage: boolean;  // 是否是 session 的首条消息
  mode: 'full' | 'safe';   // 安全模式
  memoryManager: MemoryManager;
}
```

## 内置策略实现

### 总结触发策略

#### TurnBasedStrategy

```typescript
// 每 N 轮触发一次总结
class TurnBasedStrategy implements ISummarizeStrategy {
  constructor(private interval: number) {}

  shouldSummarize(ctx: SummarizeContext): boolean {
    return ctx.turns > 0 && ctx.turns % this.interval === 0;
  }
}
```

#### SizeBasedStrategy

```typescript
// 字节超限时触发总结 + 轮换
class SizeBasedStrategy implements ISummarizeStrategy {
  constructor(private limit: number) {}

  shouldSummarize(ctx: SummarizeContext): boolean {
    return ctx.bytes >= this.limit;
  }
  // 注意：这个策略触发后，ManagedSession 还需要执行 rotate()
  // 通过 shouldRotate 标记区分
  get shouldRotate(): boolean { return true; }
}
```

#### TimeBasedStrategy

```typescript
// 距上次总结超过 N 分钟时触发
class TimeBasedStrategy implements ISummarizeStrategy {
  constructor(private intervalMs: number) {}

  shouldSummarize(ctx: SummarizeContext): boolean {
    return Date.now() - ctx.lastSummarizeTime >= this.intervalMs;
  }
}
```

### 注入决策策略

#### FirstMessageStrategy（当前行为）

```typescript
// 仅 session 首条消息注入 preamble + 记忆
class FirstMessageStrategy implements IInjectionStrategy {
  async getInjection(ctx: InjectionContext): Promise<PromptContent[]> {
    if (!ctx.isFirstMessage) return [];

    const parts: PromptContent[] = [];
    parts.push({ type: 'text', text: getPreamble(ctx.mode) });

    const memory = await ctx.memoryManager.recall(ctx.chatId);
    if (memory) {
      parts.push({ type: 'text', text: `<context>\n${memory}\n</context>\n\n以上是之前对话的历史摘要，请参考。\n\n` });
    }
    return parts;
  }
}
```

#### PeriodicStrategy

```typescript
// 首条消息注入全量，之后每 N 轮注入增量摘要
class PeriodicStrategy implements IInjectionStrategy {
  constructor(private interval: number) {}

  async getInjection(ctx: InjectionContext): Promise<PromptContent[]> {
    if (ctx.isFirstMessage) {
      // 首条：preamble + 全量记忆
      const parts: PromptContent[] = [];
      parts.push({ type: 'text', text: getPreamble(ctx.mode) });
      const memory = await ctx.memoryManager.recall(ctx.chatId);
      if (memory) {
        parts.push({ type: 'text', text: `<context>\n${memory}\n</context>\n\n` });
      }
      return parts;
    }

    if (ctx.turns > 0 && ctx.turns % this.interval === 0) {
      // 每 N 轮：只注入最新摘要（今天的）
      const memory = await ctx.memoryManager.recall(ctx.chatId);
      if (memory) {
        return [{ type: 'text', text: `<context_update>\n${memory}\n</context_update>\n\n以上是最新的对话摘要更新。\n\n` }];
      }
    }

    return [];
  }
}
```

## ManagedSession 改造

改造前：

```typescript
// 硬编码在 send() 中
async send(content, onChunk) {
  const finalContent = this.firstMsg ? await this.injectContext(content) : content;
  this.firstMsg = false;
  // ... 执行 prompt ...
  if (this.shouldSummarize()) await this.triggerSummarize();
  if (this.bytes >= this.opts.sessionSizeLimit) await this.rotate();
}
```

改造后：

```typescript
async send(content, onChunk) {
  // 注入决策：问 strategy 要不要注入
  const injection = await this.injectionStrategy.getInjection({
    chatId: this.chatId,
    turns: this.turns,
    isFirstMessage: this.firstMsg,
    mode: this.opts.mode,
    memoryManager: this.memoryManager,
  });
  const finalContent = [...injection, ...content];
  this.firstMsg = false;

  // ... 执行 prompt ...

  // 总结决策：问每个 strategy 要不要总结
  const ctx = { turns: this.turns, bytes: this.bytes, ... };
  for (const strategy of this.summarizeStrategies) {
    if (strategy.shouldSummarize(ctx)) {
      await this.triggerSummarize();
      strategy.onSummarized();
      if ('shouldRotate' in strategy && strategy.shouldRotate) {
        await this.rotate();
      }
      break; // 一次只触发一个
    }
  }
}
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
      { "type": "time", "intervalMinutes": 60 }
    ],
    "injection": {
      "type": "periodic",
      "interval": 10
    }
  }
}
```

不配置时使用默认值（当前行为）：

```jsonc
{
  "summarize": [
    { "type": "turn", "interval": 30 },
    { "type": "size", "limit": 2097152 }
  ],
  "injection": { "type": "firstMessage" }
}
```

## 向后兼容

- 不配置 `summarize` 和 `injection` 时，行为和当前完全一致
- Layer 接口不变，现有 ConversationMemoryLayer 不需要改
- MemoryManager 接口不变
- 只有 ManagedSession 的内部实现需要重构

## 实现路线

1. **Phase 1**: 定义 ISummarizeStrategy / IInjectionStrategy 接口
2. **Phase 2**: 实现 TurnBased / SizeBased / FirstMessage（复刻当前行为）
3. **Phase 3**: 重构 ManagedSession，从硬编码改为策略驱动
4. **Phase 4**: 实现 TimeBased / Periodic 新策略
5. **Phase 5**: config.json 解析 + 策略工厂
