---
name: "wecom-memory"
description: "长期记忆存储。当你不确定某个信息、需要回忆之前的对话内容、遇到不认识的人名/项目名/服务名、或者对话中出现了值得长期记住的新信息时使用。每次收到用户消息时，如果涉及具体的人、项目、服务、决策，都应该先搜索记忆获取上下文。"
---

# 长期记忆

全局共享的持久化记忆系统。所有会话、所有 Agent 共用同一个数据库。

## 架构

```
所有会话 / 所有 Agent
        ↓ 读写
wecom-sessions/_global/memory.db  ← 唯一数据库
```

- `chatid` 仅作为 `source_chatid` 记录写入来源，不影响数据库路径
- 通过 **命名空间 (ns)** 隔离不同用途的知识，避免检索噪音

## 命名空间 (ns)

| ns | 用途 | 存什么 |
|----|------|-------|
| `dev` | 开发知识（默认） | 规则、架构约定、编码规范、服务关系、业务规则 |
| `team` | 团队信息 | 人员、项目进展、职责分工 |
| `pref` | 用户偏好 | 沟通习惯、格式偏好 |

- save 时不传 ns 默认写入 `dev`
- search 时不传 ns 则搜索全部命名空间
- search 时传 ns 则只搜索该命名空间

## 什么时候该用

**主动搜索（收到消息时）**：
- 用户提到人名、项目名、服务名 → 先 search
- 用户问"之前说过什么" → search
- 你不确定某个信息 → search
- 搜索无结果时，坦诚告知"记忆中没有相关信息"

**主动保存（回复完成后）**：
- 新的重要事实（人员职责、技术决策、用户偏好、项目进展）
- 用户纠正了你的错误认知 → save_entity 更新
- 建立了新的关联 → save_relation

**不需要保存的**：闲聊、临时调试、一次性查询

## 调用方式

记忆系统运行在 `http://127.0.0.1:8901`，通过 curl 调用：

### search — 搜索记忆

```bash
curl -s -X POST http://127.0.0.1:8901/search -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"query": "关键词"}}'

# 限定命名空间
curl -s -X POST http://127.0.0.1:8901/search -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"query": "ec-so-service", "ns": "dev"}}'
```

每次只搜一个关键词。需要搜多个就调多次。

### save_entity — 保存/更新实体

```bash
curl -s -X POST http://127.0.0.1:8901/save_entity -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"type": "person", "name": "张三", "description": "后端开发，负责订单服务", "ns": "team"}}'

# 保存开发规则（ns 默认 dev，可省略）
curl -s -X POST http://127.0.0.1:8901/save_entity -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"type": "rule", "name": "Feign调用必须RetryUtil包装", "description": "Service 层调用外部 Feign 接口时，必须用 RetryUtil 包装，禁止裸调。", "properties": {"category": "编码规范", "scope": "global"}}}'
```

类型：person / service / project / tool / config / decision / preference / rule

已存在的实体会自动归档旧版本。可加 `"reason": "更新原因"`。

### save_relation — 保存关系

```bash
curl -s -X POST http://127.0.0.1:8901/save_relation -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"from_name": "张三", "relation": "负责", "to_name": "订单服务", "ns": "team"}}'
```

### delete_entity — 删除实体

```bash
curl -s -X POST http://127.0.0.1:8901/delete_entity -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"name": "过时的规则"}}'
```

### get_history — 查看实体变更历史

```bash
curl -s -X POST http://127.0.0.1:8901/get_history -H 'Content-Type: application/json' \
  -d '{"chatid": "{chatid}", "args": {"entity_name": "订单服务"}}'
```

## chatid 规则

- 企微场景：chatid 从消息上下文中获取（格式如 `dm_userid` 或群聊 chatid）
- 命令行场景：固定使用 `cli_default`

## SOP Agent 集成

每个 Agent 在启动和收尾时使用记忆：

**启动协议**：
```bash
curl -s -X POST http://127.0.0.1:8901/search -H 'Content-Type: application/json' \
  -d '{"chatid": "sop_{task_id}", "args": {"query": "ec-so-service", "ns": "dev"}}'
```

**收尾协议**：
```bash
curl -s -X POST http://127.0.0.1:8901/save_entity -H 'Content-Type: application/json' \
  -d '{"chatid": "sop_{task_id}", "args": {"type": "rule", "name": "规则名", "description": "规则内容", "ns": "dev"}}'
```
