---
name: "sql-query"
description: "当需要查询数据库、查看表结构、确认字段类型和枚举值、验证数据时使用。触发词：sql, 数据库, 查询, mysql, 枚举, 表结构, 字段"
---

# 数据库查询

支持多环境的只读数据库查询能力。

## 环境配置

| 环境 | Host | .my.cnf 段 | 用途 |
|------|------|-----------|------|
| **生产从库**（默认） | rds.g3-slave.yamibuy.net | `[client]` | 查现有表结构、确认字段、验证数据 |
| **UAT** | eks-uat-8-cluster...rds.amazonaws.com | `[client_uat]` | UAT 环境测试数据 |
| **DEV** | eks-dev-8-cluster...rds.amazonaws.com | `[client_dev]` | 开发环境测试数据 |
| **GQC** | eks-gqc-8-cluster...rds.amazonaws.com | `[client_gqc]` | GQC 测试环境数据 |

凭据统一存储在 `~/.my.cnf`，不要在命令或对话中暴露密码。

## 方式一：MCP 工具（推荐，默认连生产从库）

### 可用工具

| 工具 | 用途 |
|------|------|
| `execute_sql_query` | 执行 SELECT 查询（分页） |
| `export_query_result` | 导出查询结果为 CSV |
| `get_table_schema` | 获取表结构 |
| `list_tables` | 列出所有表 |
| `search_graph` | 搜索数据库知识图谱 |
| `get_related` | 获取表的关联信息（字段、枚举值） |

### 关键规则

- **表名格式**：必须使用 `database.table` 格式（如 `yamibuy_so.ec_order`）
- **时间戳**：数据库时间字段单位是秒（UNIX timestamp）
- **只读**：仅支持 SELECT/SHOW/DESCRIBE
- **分页**：不要自行添加 LIMIT，由工具自动处理

### 标准查询流程

```
1. search_graph("关键词")     → 找到相关表
2. get_related("表名", depth=2) → 获取字段、枚举值
3. get_table_schema("表名")    → 确认字段类型和索引
4. execute_sql_query("SQL")    → 执行查询
```

## 方式二：mysql 命令行（查测试环境时使用）

当需要查询非生产环境时，通过 execute_bash 执行 mysql 命令：

```bash
# 生产从库（默认，~/.my.cnf [client] 段）
mysql -e "SELECT ..." yamibuy_so

# UAT 环境
mysql --defaults-group-suffix=_uat -e "SELECT ..." yamibuy_so

# DEV 环境
mysql --defaults-group-suffix=_dev -e "SELECT ..." yamibuy_so

# GQC 环境
mysql --defaults-group-suffix=_gqc -e "SELECT ..." yamibuy_so
```

凭据存储在 `~/.my.cnf` 中，不要在命令中包含明文密码。

## 常用数据库

| 数据库 | 内容 |
|--------|------|
| yamibuy_master | 主库（商品、供应商等） |
| yamibuy_so | 订单相关 |
| yamibuy_payment | 支付相关 |
| yamibuy_customer | 客户相关 |
| yamibuy_rma | 退货相关 |

## SOP 中的使用场景

| Phase | Agent | 用途 | 环境 |
|-------|-------|------|------|
| Phase 2 | Architect | 查现有表结构，设计 DDL | 生产从库 |
| Phase 3 | Coder | 确认字段类型、枚举值，写 Mapper XML | 生产从库 |
| Phase 3 | Reviewer | 验证 SQL 性能，检查索引 | 生产从库 |
| Phase 3.5 | QA | 验证测试数据，确认集成测试结果 | 测试环境 |
