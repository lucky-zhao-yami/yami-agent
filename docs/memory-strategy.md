# 记忆策略分离设计

> 状态: 待实现  
> 创建: 2026-04-28  
> 修订: v4 — review 修正

## 核心思路

| 职责 | 谁负责 | 怎么做 |
|------|--------|--------|
| **存储** | IMemoryLayer | 不变，可插拔 |
| **总结触发** | 事件驱动 + ISummarizeStrategy | 事件源和策略双向独立扩展 |
| **首条注入** | 代码硬逻辑 | preamble + 摘要概要（字数截断）+ Skill 提示 |
| **后续注入** | Agent + Skill | Agent 直接读 memory/*.md 文件，未来通过 /recall 端点 |

## 一、总结触发（事件驱动）

### 事件定义

```typescript
type MemoryEvent =
  | { type: 'message_processed'; turns: number; bytes: number }
  | { type: 'timer_tick'; now: number }
  | { type: 'session_idle_recycle' };
```

> /new /reset 命令保持直接调用 session.rotate()，不走事件总线。
> 等有实际需求（如配置 /new 只总结不轮换）再加 CommandStrategy。

### 策略接口

```typescript
interface ISummarizeStrategy {
  readonly name: string;

  /**
   * 收到事件后决策。
   * 返回 'summarize' | 'rotate' | null
   */
  check(event: MemoryEvent, state: SessionMemoryState): 'summarize' | 'rotate' | null;

  /** 总结完成后重置内部状态。 */
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
| TurnBasedStrategy(N) | `message_processed` | turns % N === 0 → `'summarize'` |
| SizeBasedStrategy(limit) | `message_processed` | bytes >= limit → `'rotate'` |
| IntervalStrategy(minutes) | `timer_tick` | now - lastSummarizeTime >= minutes → `'summarize'` |

### 事件源

| 事件源 | 发什么事件 | 位置 |
|--------|-----------|------|
| ManagedSession.send() | `message_processed` | 每条消息处理完后 |
| 定时器 (60s) | `timer_tick` | index.ts，替代原 scheduleDailyCron |
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
      { "type": "interval", "minutes": 60 }
    ],
    "injectionMaxChars": 2000
  }
}
```

默认值（不配置时，复刻当前行为）：

```jsonc
{
  "summarize": [
    { "type": "turn", "interval": 30 },
    { "type": "size", "limit": 2097152 }
  ],
  "injectionMaxChars": 2000
}
```

## 二、记忆注入

### 首条消息：代码强制注入（兜底）

新 session 的第一条消息，ManagedSession 强制注入：

```
[preamble — 安全规则]

[摘要概要 — 从最新日期往前填，不超过 injectionMaxChars]

如需查看更多历史，读取 sessions/{chatId}/memory/ 目录下的 .md 文件。

[用户消息]
```

**字数截断逻辑**：从最新的 .md 文件开始往前加，累计字数超过 `injectionMaxChars` 就停止。保证最新的一定在，总量可控。

```typescript
// ConversationMemoryLayer.recall() 改造
async recall(chatId: string, maxChars?: number): Promise<string> {
  // 读取 memory/*.md，按日期倒序
  // 从最新开始累加，超过 maxChars 停止
  let total = 0;
  const parts: string[] = [];
  for (const f of mdFiles.reverse()) {  // 最新在前
    const content = await readFile(join(memDir, f), 'utf-8');
    if (maxChars && total + content.length > maxChars) break;
    parts.unshift(`## ${f.replace('.md', '')}\n${content.trim()}`);
    total += content.length;
  }
  return parts.length ? `# 历史对话摘要\n\n${parts.join('\n\n')}` : '';
}
```

### 后续消息：Agent 自主

**短期**：Skill 教 Agent 直接读文件。Agent 的 cwd 是 WORK_DIR，`sessions/{chatId}/memory/*.md` 可直接 fs_read。零开发。

**未来**：加 VectorLayer 等非文件存储后，新增 `/recall` 端点（带认证），Skill 改为调 HTTP。Agent 不感知 Layer 变化。

### memory-recall Skill

```markdown
# memory-recall

## 什么时候用
- 用户提到"之前聊过"、"上次说的"等历史引用
- 需要回顾之前的讨论、决策、结论
- 不确定用户之前的偏好或上下文

## 怎么用
读取 sessions/{chatId}/memory/ 目录下的 .md 文件。
文件按日期命名（如 2026-04-28.md），最新的日期最相关。

## 注意
- 首条消息已自动注入最近的摘要概要，通常不需要额外查询
- .md.gz 文件是超过 30 天的压缩存档，一般不需要读取
```

## 三、文件变更

### 新增

```
src/memory/
├── events.ts                   # MemoryEvent 类型 + MemoryEventBus
├── strategies/
│   ├── types.ts                # ISummarizeStrategy + SessionMemoryState
│   ├── TurnBasedStrategy.ts
│   ├── SizeBasedStrategy.ts
│   └── IntervalStrategy.ts
└── strategyFactory.ts          # 从配置创建策略实例

templates/skills/memory-recall/
└── SKILL.md
```

### 改动

| 文件 | 改动 |
|------|------|
| `ManagedSession.ts` | 删除 shouldSummarize()，改为 eventBus.check()；injectContext() 简化 |
| `ConversationMemoryLayer.ts` | recall() 增加 maxChars 参数，从最新往前截断 |
| `MemoryManager.ts` | recall() 透传 maxChars |
| `memory/types.ts` | IMemoryLayer.recall() 签名加 maxChars? |
| `index.ts` | 删除 scheduleDailyCron，改为 60s 定时器发 timer_tick |
| `config.ts` | 新增 summarize + injectionMaxChars 配置 |

### 不变

| 文件 | 原因 |
|------|------|
| `AcpMemoryRecycler.ts` | 纯执行，不受策略影响 |
| `Bridge.ts` | 不涉及记忆逻辑 |
| `commands.ts` | /new /reset 保持直接调用 rotate() |

## 四、实现路线

1. 定义 MemoryEvent + ISummarizeStrategy + MemoryEventBus
2. 实现 3 个总结策略 + strategyFactory
3. ConversationMemoryLayer.recall() 加 maxChars 截断
4. 重构 ManagedSession：eventBus + 简化 injectContext
5. 重构 index.ts 定时器
6. config.ts 加配置解析
7. 编写 memory-recall SKILL.md
8. 补测试
