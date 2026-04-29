# 知识图谱数据模型

## 实体类型 (8 种)

| 类型 | 说明 | 命名格式 | 示例 |
|------|------|----------|------|
| Database | 数据库实例 | `{数据库名}` | `yamibuy_payment` |
| Table | 数据表 | `{数据库}.{表名}` | `yamibuy_payment.payment_charge` |
| Column | 字段 | `{数据库}.{表名}.{字段名}` | `yamibuy_payment.payment_charge.pay_status` |
| EnumValue | 枚举值 | `{数据库}.{表名}.{字段名}={值}` | `yamibuy_payment.payment_charge.pay_status=60` |
| BusinessRule | 业务规则 | `rule_{描述}` | `rule_微信支付provider值` |
| SQLExample | SQL 示例 | `example_{描述}` | `example_查询支付失败率` |
| Intent | 查询意图 | `intent_{描述}` | `intent_支付分析` |
| Keyword | 关键词 | `keyword_{词}` | `keyword_微信` |

## 关系类型 (9 种)

| 关系类型 | 含义 | 典型用法 |
|----------|------|----------|
| `contains` | 包含 | Database → Table |
| `has_column` | 拥有字段 | Table → Column |
| `has_enum` | 拥有枚举值 | Column → EnumValue |
| `joins_with` | 关联（外键） | Column → Column |
| `uses_table` | 使用表 | Intent → Table |
| `has_keyword` | 关联关键词 | Intent → Keyword |
| `has_rule` | 关联规则 | Intent → BusinessRule |
| `has_example` | 关联示例 | Intent → SQLExample |
| `described_by` | 被规则描述 | Table → BusinessRule |
