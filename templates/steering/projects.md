# 项目工作空间协议

## 工作空间位置
`/mnt/d/workspace/all/ai-workspace/`

## 读取协议

当用户提到 OP 编号、项目名称、或要继续/恢复/回到/接着做之前的工作时：

1. 读取 `ai-workspace/README.md` 获取活跃项目列表
2. 找到对应项目目录，读取 `project.md` 了解项目全貌
3. 读取 `sessions/` 下最近 2 个会话摘要了解最新进展
4. 基于以上信息恢复上下文，开始工作

## 写入协议

### 新项目启动时
1. 创建 `ai-workspace/{OP-ID}/` 目录
2. 创建 `project.md`（模板见下方）
3. 创建 `sessions/` 目录
4. 更新 `ai-workspace/README.md` 的活跃项目表

### 会话归档（全自动）
后台服务 `kiro-session-archiver` 监听会话结束，自动：
1. 记录 session ID 到 `ai-workspace/.session_index.json`
2. 调 Knowledge Agent 读取会话原始对话，判断涉及哪个项目
3. Knowledge Agent 更新对应项目的 `project.md` 和知识图谱

全程无需人工介入。

### 恢复上下文
正常情况下 conversation summary 已经够用。如果需要回溯更早的对话细节：
1. 读 `ai-workspace/.session_index.json` 找到历史 session ID
2. 通过 `~/.kiro/sessions/cli/{session_id}.jsonl` 读取原始对话

### 项目完成时
更新 `ai-workspace/README.md`，将项目从"活跃项目"移到"已完成项目"

## project.md 模板

```markdown
# {OP-ID} {项目名称}

## 状态: {开发中 / 测试中 / 已上线 / 已关闭}

## 概述
{一两句话说明做什么、为什么做}

## 涉及服务与分支
| 服务 | 分支 | 改动范围 |
|------|------|---------|

## 关键技术决策
{为什么选择这个方案，而不是其他方案}

## 已知坑点
{踩过的坑，避免重复}

## Bug 修复记录
{修过的 bug 编号和简述}

## 关联项目
{前置依赖、后续项目}
```

## 会话摘要模板

```markdown
# Session YYYY-MM-DD

## 主要工作
{做了什么}

## 关键决策
{为什么这么做}

## 关键文件
{改了/创建了哪些文件}

## 待做
{下次要继续什么}
```
