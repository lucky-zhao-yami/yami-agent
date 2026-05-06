---
inclusion: auto
---

# 查询执行规则

当排查过程中需要执行查询操作时，遵循以下规则。

## Central API 自动查询规则
- 当客服提供了邮箱需要查 user_id 时，直接执行脚本：`python scripts/get-userid.py "邮箱"`，禁止用 xysc_users.email 查（脱敏数据查不到）
- 当已获得 user_id 需要查真实邮箱时，执行脚本：`python scripts/get-userid.py "" "user_id"`
- 脚本自动处理 token 获取和缓存（12小时有效期），无需手动拼接 API 请求
- 只有在脚本执行失败时，才回退到让客服去 Central 后台手动查询
- 脚本实现细节见 `.kiro/skills/central-login.md` 和 `.kiro/skills/api-fetch.md`

## SQL 查询规则
- 所有 SQL 查询通过 MCP SQL 工具自动执行，禁止将 SQL 语句以文本形式输出给客服让其手动执行
- 只有在 MCP SQL 工具执行失败时，按以下优先级执行备用方案：

### 备用方案一：命令行 MySQL 直连（优先）
连接信息从 `.kiro/settings/mcp.json` 中读取，禁止在本文件中硬编码。

执行步骤：
1. 用 `readFile` 读取 `.kiro/settings/mcp.json`，从 `mcpServers.sql-query.env` 中提取 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`
2. 用提取到的值拼接 MySQL 命令执行

```powershell
# 步骤1：读取 mcp.json 解析连接信息
$cfg = Get-Content '.kiro/settings/mcp.json' -Raw | ConvertFrom-Json
$env = $cfg.mcpServers.'sql-query'.env
$host = $env.DB_HOST; $port = $env.DB_PORT; $user = $env.DB_USER; $pwd = $env.DB_PASSWORD

# 步骤2：执行查询
$result = mysql -h $host -P $port -u $user -p$pwd --ssl-mode=DISABLED 数据库名 -e "SQL语句\G" 2>$null; $result
```

注意事项：
- 必须加 `--ssl-mode=DISABLED`，否则 SSL 连接报错
- 用 `\G` 格式输出避免宽表截断
- 用 `2>$null` 过滤密码警告
- ⚠️ 禁止在规则文件中明文写入数据库密码
- 如果 mcp.json 中的 key 名称不是 `sql-query`，需根据实际 key 调整

### 备用方案二：提供 SQL 给客服
- 命令行也不可用时，才将 SQL 提供给客服或转发给 Moc/Wheat 执行

## Kibana 日志查询规则
- 排查问题时使用 `query-kibana-logs` skill 的 `search.py` 脚本查询 Kibana 日志
- 脚本路径：`.kiro/skills/query-kibana-logs/scripts/search.py`
- 常用命令：
  - 按服务+关键词：`python .kiro/skills/query-kibana-logs/scripts/search.py -s 服务名 -k "关键词" -t 7d`
  - 按订单号：`python .kiro/skills/query-kibana-logs/scripts/search.py -o 订单号`
  - 按日志级别：`python .kiro/skills/query-kibana-logs/scripts/search.py -s 服务名 --level error -t 1h`
  - 精确搜索（purchase_id 等）：`python .kiro/skills/query-kibana-logs/scripts/search.py -s payment -k "purchase_id值" -t 7d`
- 数据库查询和 Kibana 日志查询的交叉验证原则见 `cs-global-config.md` 排查纪律
- 根据业务领域选择对应索引：

| 业务领域 | 索引 |
|---------|------|
| 客户/邀请/验证码/个人信息 | `search.py -s ec-customer` |
| 奖励发放/风控 | `search.py -s central-customer` |
| 订单流程 | `search.py -s ec-so` |
| 订单邮件/发货通知 | `search.py -s ec-so-job` |
| 发货流程 | `search.py -s central-so` |
| 支付 | `search.py -s ec-payment` |
| 跟买/砍单/活动 | `search.py -s ec-activity` |
| 优惠券/营销活动 | `search.py -s ec-mkt` |

### Kibana 搜索策略（必须严格遵守）
1. **第一次搜索：只用邮箱或 user_id**，先看全量日志还原用户完整操作流程
2. 从全量日志中提取 trace ID（格式：`[服务名,traceId,spanId]`），用 trace ID 追踪完整调用链
3. 重点关注 **WARN 和 ERROR** 级别（WARN 中也有关键报错如密码错误、Token 无效等）
4. **禁止第一次搜索就加 "login"/"error"/"fail" 等过滤词**，会漏掉关键日志
5. 当 user_id 搜索结果被高频操作挤占时，改用 purchase_id 或 transaction_id 精确搜索特定交易的日志
6. 禁止因 size 不够就标注"日志已超保留期"，应先尝试缩小搜索范围或加大 size

## 分级查询路径（规则未覆盖时）
按以下顺序逐级查询，找到答案即停止（每级都需同步查日志交叉验证）：

**1. 查阅 wiki 文档**
- 订单相关 → `src/ec-so-service/wiki/`
- 支付相关 → `src/ec-payment-service/wiki/`
- 退换货相关 → `src/ec-rma-service/wiki/`, `src/central-rma-service/wiki/`
- 客户/账户相关 → `src/ec-customer-service/wiki/`

**2. 查询数据库**
根据业务领域选择对应数据库/服务。

**3. 查阅源码**
- 代码仓库路径：读取 `.kiro/workspace.json` 中的 repositories 列表获取所有仓库绝对路径
- 使用 grep 或 code 工具时必须指定绝对路径
- 优先读 mapper XML → service 层 → rest 层
- 回答时注明答案来源是代码逻辑，建议用户确认是否补充到业务文档
