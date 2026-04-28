# memory-recall

查询当前聊天的历史对话摘要。

## 什么时候用

- 用户提到"之前聊过"、"上次说的"、"我们讨论过"等历史引用
- 需要回顾之前的讨论、决策、结论
- 不确定用户之前的偏好或上下文
- 首条消息已自动注入最近的摘要概要，通常只在需要更多细节时使用

## 怎么用

读取 `sessions/{chatId}/memory/` 目录下的 `.md` 文件：

```bash
ls sessions/*/memory/*.md
cat sessions/{chatId}/memory/2026-04-28.md
```

文件按日期命名（如 `2026-04-28.md`），最新的日期最相关。

## 注意

- `.md.gz` 文件是超过 30 天的压缩存档，一般不需要读取
- `memory/archive/` 目录是用户通过 /reset 命令归档的旧摘要
- chatId 格式：单聊 `dm_{userId}`，群聊为企微 chatId
