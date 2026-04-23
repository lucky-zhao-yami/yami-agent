---
inclusion: always
---

# 可用 Skills

以下 skills 可通过 `yami-ai-cli read` 命令按需加载。当用户要求执行相关任务时，请使用对应的 skill。

## 使用方式

- 调用: `yami-ai-cli read <skill-name>`（在终端中运行）
  - 多个 skill: `yami-ai-cli read skill-one,skill-two`
- skill 内容会输出详细的任务指令
- 输出中包含 Base directory，用于解析 skill 附带的资源文件（references/、scripts/、assets/）

## 注意事项

- 仅使用下方列出的 skills
- 不要重复加载已在上下文中的 skill

## Skills 列表

- **explore-knowledge-graph** — 当用户提问时自动触发，从知识图谱中检索相关的业务规则、服务关系、配置约定、代码位置、业务枚举、业务术语，为回答提供上下文。触发词：业务规则, 服务关系, 配置约定, 代码位置, 业务枚举, 业务术语, 知识图谱
- **account-password-query** — 当需要查询账号、密码、登录凭证、访问权限、数据库连接信息时使用。触发词：账号, 密码, 登录, 凭证, credentials, password
- **apollo-config-sync** — 当需要同步 Apollo 配置、拉取微服务配置、查看远程配置到本地时使用。触发词：apollo, 配置同步, 拉取配置, app.id
- **code-branch-diff** — 当需要对比分支代码差异、查看代码变更、分析提交记录、生成 diff 报告时使用。触发词：diff, 代码对比, 分支差异, git diff, 代码变更
- **code-module-analyzer** — 当需要分析代码模块、理解代码结构、追踪调用链、生成代码文档时使用。触发词：这段代码, 帮我看看, 分析一下, 这个模块, 什么意思, 怎么实现的, 代码分析
- **code-simplifier** — 当需要简化代码、重构代码、优化代码结构、提升代码可读性、清理冗余代码时使用。触发词：simplify, refactor, clean code, 代码简化, 重构, 代码优化
- **deep-research-agent** — 当需要进行深度研究、生成研究报告、文献调研、信息综合、系统性分析某个主题时使用。触发词：research, 深度研究, 报告生成, 研究项目, 文献调研
- **dev-doc-generator** — 当需要生成开发发布文档、查看多仓库代码变更、生成技术变更报告、准备上线文档时使用。触发词：dev doc, 开发文档, 发布文档, 代码变更, 技术文档
- **doc-coauthoring** — Guide users through a structured workflow for co-authoring documentation. Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content. This workflow helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Trigger when user mentions writing docs, creating proposals, drafting specs, or similar documentation tasks.
- **find-skills** — Helps users discover and install agent skills when they ask questions like "how do I do X", "find a skill for X", "is there a skill that can...", or express interest in extending capabilities. This skill should be used when the user is looking for functionality that might exist as an installable skill.
- **java-toolkit-guide** — >
- **manage-openproject** — >
- **mcp-builder** — Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK).
- **pr-create** — 当需要创建 PR、推送分支、提交代码到远程仓库时使用。触发词：pr, pull request, 创建pr, push pr, git push, 提交代码
- **pr-publish** — 当需要生成发布邮件、填写上线通知、查看 PR 合并记录、扫描 GitHub 仓库已合并 PR 时使用。触发词：发布邮件, 上线通知, PR合并, release, 发布TAG, 回滚TAG, Google Sheets 模板, gh pr list
- **query-kibana-logs** — >
- **save-db-knowledge** — 当回答用户的问题, 或者任务处理完成后，分析本次对话是否涉及数据库相关知识（表结构、枚举值定义、表关联关系、SQL示例、业务规则、查询意图），如有则保存到数据库知识图谱。触发词：保存表结构, 记录枚举值, 数据库知识, SQL知识, 表关系保存
- **save-knowledge-graph** — 当回答用户的问题, 或者任务处理完成后，分析本次对话是否涉及业务知识（业务规则、服务关系、配置约定、代码位置映射、业务枚举、业务术语），如有则保存到知识图谱。触发词：保存知识, 记录业务, 知识图谱, 业务沉淀
- **sql-query** — 当需要查询数据库、查看表结构、确认代码枚举值是否正确、搜索知识图谱时使用。触发词：sql, 数据库, 查询, mysql, 枚举, yamibuy, 业务数据
- **wirte-java-unit-test** — 当需要为 Java 代码编写 Spock 单元测试、Mock 测试、Groovy 测试时使用。触发词：spock, mock, unit test, 单元测试, java test, groovy test
- **yami-public-toolkit** — 当需要使用 Redis 缓存注解、接口限流、分布式锁、文件上传、AB测试等公共工具时使用。触发词：yami-public, 工具包, 缓存, 限流, 分布式锁, AB测试, 文件上传, CacheableRedis, RequestLimit, RedisLockClient, BatchTask, Segment, SpringEL, 算法
- **yamibuy-order-flow** — 当需要了解亚米网下单流程、订单状态流转、MQ 消息追踪、预占机制、风控流程、支付回调、订单落库时使用。触发词：亚米网, 订单流程, ec-so, central-so, ec-payment, RabbitMQ, 预占, 风控, order_status, shipping_status, pay_status, abnormal, persistence.order_v2, order.finish
