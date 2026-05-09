# yami-agent

## 状态

- 分支 `feature/agentflow-connector` 已提交，代码审查未完成（session 中断）

## 关键决策

- AgentFlow 平台作为第二个 IMessagePlatform 实现，与 WeComPlatform 平行
- 通过独立的 Bridge 实例接入共享的 SessionManager
- 启用方式：`AGENTFLOW_ENABLED=true` 环境变量，零侵入现有代码
- chatId 映射规则：`af_{taskNodeId}`，用于隔离 AgentFlow 会话
- 输出收集：buffer 模式（非流式），finish 时一次性发 session_result

## 坑点 / 审查发现（待确认）

- `chatToTaskNode` 和 `outputBuffers` 只在 finish 时清理 outputBuffers，chatToTaskNode 从不清理 → 潜在内存泄漏
- `resume_session` 和 `start_session` 逻辑完全相同，未利用 `sessionId` 做会话恢复
- Bridge 内部 StreamSegmenter 会对 AgentFlow 平台多次调用 sendStream（中间 finish=false），AgentFlowPlatform.sendStream 会把所有中间内容都 push 到 buffer，这是正确的
- `cancel_session` 只打日志，未实际取消正在运行的 agent session
- Bridge 的 `🤔` 占位符会被 sendStream 过滤掉（`if (content === "🤔") return`），设计正确

## 待办

- [ ] 完成 AgentFlow connector 代码审查（上次 session 中断）
- [ ] 确认 chatToTaskNode 内存泄漏问题是否需要修复（建议在 sendResult 后清理）
- [ ] 确认 cancel_session 是否需要实际实现（调用 sessionManager.removeSession）
- [ ] resume_session 是否应该复用已有 session 而非创建新的

## 需要用户支持

- 无（纯代码审查任务，可自主完成）
