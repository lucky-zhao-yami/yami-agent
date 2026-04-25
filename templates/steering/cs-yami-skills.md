---
inclusion: manual
---

# 可用 Skills（客服排查相关）

以下 skills 可通过直接读取文件方式加载。当排查过程中需要执行相关任务时，使用对应的 skill。

## 使用方式

- 直接读取：`readFile .kiro/skills/<skill-name>.md`
- skill 内容包含详细的调用方式和参数说明

## 注意事项

- 仅使用下方列出的 skills
- 不要重复加载已在上下文中的 skill

## Skills 列表

- **central-login** — 自动登录 Central 后台获取 API token，供后续 API 调用使用。文件路径：`.kiro/skills/central-login.md`
- **api-fetch** — 通过 Central API 查询用户信息（邮箱查 user_id、user_id 查邮箱等），解决 xysc_users 表脱敏问题。文件路径：`.kiro/skills/api-fetch.md`
- **kibana-log** — 查询 Kibana 日志，支持多个业务索引（ec-customer、ec-so、ec-payment 等）。文件路径：`.kiro/skills/kibana-log.md`
- **sql-query** — 当需要查询数据库、查看表结构、确认代码枚举值是否正确、搜索知识图谱时使用。触发词：sql, 数据库, 查询, mysql, 枚举, yamibuy, 业务数据
