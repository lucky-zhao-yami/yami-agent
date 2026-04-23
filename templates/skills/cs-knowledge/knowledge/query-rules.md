---
inclusion: manual
---

# 查询执行规则

当排查过程中需要执行查询操作时，遵循以下规则。

## Central API 自动查询规则
- 当客服提供了邮箱需要查 user_id 时，先读取 `.kiro/skills/central-login.md` 和 `.kiro/skills/api-fetch.md` 获取调用方式，用 PowerShell 执行 Invoke-RestMethod 自动查询，禁止用 xysc_users.email 查（脱敏数据查不到）
- 当已获得 user_id 需要查真实邮箱时，同样调用 Central API 接口 2，禁止让客服手动去 Central 后台查询
- 只有在 Central API 调用失败时，才回退到让客服去 Central 后台手动查询

## SQL 查询规则
- 所有 SQL 查询通过 MCP SQL 工具自动执行，禁止将 SQL 语句以文本形式输出给客服让其手动执行
- 只有在 MCP SQL 工具执行失败时，才将 SQL 提供给客服或转发给 Moc/Wheat 执行

## Kibana 日志查询规则
- 数据库查询无法定位原因时，主动读取 `.kiro/skills/kibana-log.md` 获取调用方式，查询 Kibana 日志
- 根据业务领域选择对应索引：
  - 客户/邀请/验证码 → `k8s-ec-customer-service-log-*`
  - 奖励发放/风控 → `k8s-central-customer-service-log-*`
  - 订单流程 → `k8s-ec-so-service-log-*`
  - 订单邮件/发货通知 → `k8s-ec-so-job-service-log-*`
  - 发货流程 → `k8s-central-so-service-log-*`
  - 支付 → `k8s-ec-payment-service-log-*`
- 搜索关键词根据排查上下文自动构造（user_id、订单号、邮箱、purchase_id 等）
- 只要数据库查不到原因就主动查日志辅助排查

## 分级查询路径（规则未覆盖时）
按以下顺序逐级查询，找到答案即停止：

**4-1：查阅 wiki 文档**
- 订单相关 → `src/ec-so-service/wiki/`
- 支付相关 → `src/ec-payment-service/wiki/`
- 退换货相关 → `src/ec-rma-service/wiki/`, `src/central-rma-service/wiki/`
- 客户/账户相关 → `src/ec-customer-service/wiki/`
- 其他服务暂无 wiki，直接进入 4-2

**4-2：查询数据库**
根据业务领域选择对应服务：
- 订单 → `ec-so-service` / `central-so-service`
- 客户/账户 → `ec-customer-service` / `central-customer-service`
- 支付 → `ec-payment-service` / `central-payment-service`
- 优惠券 → 数据库 `yamibuy_mkt`
- 退换货 → `ec-rma-service` / `central-rma-service`
- 税务 → `ec-tax-service`

**4-3：查阅源码**
- 优先读 mapper XML → service 层 → rest 层
- 回答时注明答案来源是代码逻辑，建议用户确认是否补充到业务文档
