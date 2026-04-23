---
name: grafana-query
description: Grafana 监控查询工具。查询告警规则及其监控 SQL、查看当前触发的告警、搜索 Dashboard 面板、直接查询数据源。当收到 Grafana 告警或需要排查监控问题时使用。
---

# Grafana 告警分析

查询 Grafana 告警规则、Dashboard 面板、数据源，辅助分析监控告警。

## 使用场景

- 收到 Grafana 告警，需要查看告警对应的监控 SQL
- 排查告警触发原因，直接查询数据源验证数据
- 查看当前正在触发的告警
- 搜索 Dashboard 面板配置

## 快速使用

### 查看告警规则及 SQL
```
帮我查一下 Grafana 上所有告警规则
```

### 按关键词搜索告警
```
查一下 Braintree 相关的告警规则和 SQL
```

### 查看当前触发的告警
```
Grafana 上现在有哪些告警在触发？
```

### 搜索 Dashboard
```
搜索 payment 相关的 Dashboard
```

### 查看 Dashboard 面板的 SQL
```
查看 Payment 数据监控 Dashboard 的所有面板和 SQL
```

### 直接查询数据源
```
用 MySQL-G3 数据源执行这个 SQL: SELECT count(*) FROM yamibuy_payment.payment_refund WHERE status = 50
```

## 脚本工具

脚本位于 `scripts/grafana.py`，无需额外依赖。

```bash
# 列出所有告警规则
python3 scripts/grafana.py alert-rules

# 按关键词筛选告警规则
python3 scripts/grafana.py alert-rules -k "Braintree"

# 查看当前触发的告警
python3 scripts/grafana.py firing

# 列出所有数据源
python3 scripts/grafana.py datasources

# 搜索 Dashboard
python3 scripts/grafana.py search-dashboard "payment"

# 查看 Dashboard 面板及 SQL
python3 scripts/grafana.py dashboard-panels f2e5194d-ff2d-4b4b-8413-24ccf058fbe0

# 查询数据源（执行 SQL）
python3 scripts/grafana.py query fb3fdd0b-4d1c-4735-a4b4-4c9b2c799353 "SELECT count(*) FROM yamibuy_payment.payment_refund WHERE status=50"
```

## 常用数据源

| UID | 名称 | 类型 |
|-----|------|------|
| `fb3fdd0b-4d1c-4735-a4b4-4c9b2c799353` | MySQL-G3 | mysql |
| `ee80fd88-ca77-4ace-bd78-4f92e8cb5f32` | MySQL-DEV | mysql |
| `e5d387b4-d827-4009-a82f-74227d83d9cb` | MYSQL-GQC | mysql |
| `b582c9d2-6376-4532-85de-978c6686c8a9` | Prometheus | prometheus |

## 常用 Dashboard

| UID | 名称 |
|-----|------|
| `f2e5194d-ff2d-4b4b-8413-24ccf058fbe0` | Payment 数据监控 |
| `r8er3UJmk` | Payment |
| `fwgAIUAZk` | 支付监控-Payment |

## 告警分析流程

收到告警时，建议按以下步骤分析：

1. **找到告警规则** — 用 `alert-rules -k` 按关键词搜索，或用 `search-dashboard` + `dashboard-panels` 找到面板 SQL
2. **理解监控逻辑** — 阅读 SQL，理解告警触发条件和阈值
3. **查询实时数据** — 用 `query` 命令执行 SQL（可修改 SQL 查看具体记录）
4. **结合日志排查** — 配合 kibana-logs skill 查看相关服务日志
