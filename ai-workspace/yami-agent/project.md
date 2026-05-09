# yami-agent

## 状态

- 分支 `feature/agentflow-connector`：AgentFlow 基础连接已完成（审查+修复），企微卡片交互提交功能实现中（4/8 步完成）

## 关键决策

- AgentFlow 平台作为第二个 IMessagePlatform 实现，与 WeComPlatform 平行
- 通过独立的 Bridge 实例接入共享的 SessionManager
- 启用方式：`AGENTFLOW_ENABLED=true` 环境变量，零侵入现有代码
- chatId 映射规则：`af_{taskNodeId}`，用于隔离 AgentFlow 会话（reqId === chatId 是设计约束）
- 输出收集：buffer 模式（非流式），finish 时一次性发 session_result
- resume_session 当前不恢复上下文，prompt 中已包含足够信息
- cancel_session 只清理本地 map，由 SessionManager idle cleanup 自动回收
- connect() 加 10s 超时兜底
- `/submit` 命令通过企微 `button_interaction` 模板卡片实现工作流选择
- 卡片点击回调通过 `__card_click__:{taskId}:{key}` 伪消息传递给 Bridge
- ManagedSession 新增 `lastOutput` 属性，用于获取最近一次 AI 回复内容作为提交内容
- pendingSubmits Map 存储待确认的提交上下文，5 分钟过期自动清理

## 坑点

- chatToTaskNode 必须在 finish 时清理，否则长期运行会内存泄漏
- outputBuffers.delete 必须在分支判断之前执行，确保无论哪条路径都清理
- connect() 的 resolve 只能调用一次：timeout 和 onOpen 互斥
- WeComPlatform 的 chatId 在单聊时有 `dm_` 前缀，发送时需 replace 掉
- template_card_event 回调中 userId 字段可能是 `from_user` 或 `userid`，需兼容

## 待办

- [ ] Bridge.ts：添加 `setAgentFlowPlatform()`、`pendingSubmits` Map、`handleCardClick()` 方法
- [ ] commands.ts：添加 `/submit` 命令（发送模板卡片、缓存 pendingSubmits）
- [ ] index.ts：调用 `bridge.setAgentFlowPlatform(agentflowPlatform)` 接线
- [ ] `npm run build` 验证编译通过
- [ ] 合并 feature/agentflow-connector 分支到 main
- [ ] 部署后验证 AgentFlow 连接稳定性和卡片交互流程

## 需要用户支持

- 无
