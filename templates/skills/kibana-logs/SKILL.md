---
name: kibana-logs
inclusion: auto
description: Elasticsearch/Kibana 日志查询工具，用于搜索 Yamibuy 微服务日志。支持按服务、关键词、订单号、错误级别等条件查询。
---

# Kibana 日志查询

查询 Yamibuy 微服务的 Elasticsearch 日志。

## 使用场景

- 排查线上问题时查看服务日志
- 追踪订单处理流程
- 查找错误和异常
- 分析服务调用链路

## 快速使用

### 列出可用服务
```
帮我列出所有可用的日志服务
```

### 搜索日志
```
搜索 ec-so-service 最近1小时包含 "shipping" 的日志
```

### 按订单号查询
```
查一下订单 2026020337619 的相关日志
```

### 查看错误日志
```
查看 central-rma-service 最近30分钟的错误日志
```

## 时间范围格式

### 相对时间
- `15m` - 15分钟
- `1h` - 1小时  
- `24h` - 24小时
- `7d` - 7天

### 绝对时间段（北京时间）
- `2026-03-03 10:00:00` - 精确到秒
- `2026-03-03 10:00` - 精确到分
- `2026-03-03` - 精确到天（从当天 00:00:00 开始）

指定 `start_time` 后，`end_time` 可选，不填则查到当前时间。

## 注意事项

### 时区问题
日志中打印的时间是 **UTC 时间**，而 `search_logs` 工具的 `start_time`/`end_time` 参数使用**北京时间（UTC+8）**。搜索时必须将日志中的 UTC 时间 +8 小时转换为北京时间，否则会搜不到结果。

例如：日志显示 `2026-04-09 02:07:48`（UTC），搜索时应使用 `start_time: 2026-04-09 10:07:00`（北京时间）。

### traceId 链路追踪
日志格式为 `[服务名,traceId,spanId]`，例如 `[ec-so,5ca1d982bc64d9e2ac7af249fa02311d,a282d660e58047bc]`。

搜索完整调用链路时，使用 `traceId,spanId` 作为关键词（不含服务名前缀），例如：
```
keyword: 5ca1d982bc64d9e2ac7af249fa02311d,a282d660e58047bc
```

## 常用服务列表

### Central 服务
- `central-so-service` - 销售订单服务
- `central-rma-service` - 退货服务
- `central-customer-service` - 客户服务
- `central-payment-service` - 支付服务
- `central-fp-service` - FP服务

### EC 服务
- `ec-so-service` - EC销售订单服务
- `ec-rma-service` - EC退货服务
- `ec-customer-service` - EC客户服务
- `ec-payment-service` - EC支付服务

## 脚本工具

使用 Python 脚本查询日志，脚本位于 `scripts/search.py`。

```bash
# 列出服务
python3 scripts/search.py --list-services

# 搜索日志（相对时间）
python3 scripts/search.py -s ec-so-service -k "shipping" -t 1h -l 50

# 搜索日志（绝对时间段）
python3 scripts/search.py -s ec-so-service -k "shipping" --start "2026-03-03 10:00" --end "2026-03-03 12:00"

# 按订单号搜索
python3 scripts/search.py -o 2026020337619 -t 7d

# 按订单号搜索（指定时间段）
python3 scripts/search.py -o 2026020337619 --start "2026-03-01" --end "2026-03-03"

# 搜索错误
python3 scripts/search.py -s central-rma-service -e -t 1h
```

### 参数说明

| 参数 | 简写 | 说明 |
|------|------|------|
| `--service` | `-s` | 服务名 |
| `--keyword` | `-k` | 搜索关键词 |
| `--order` | `-o` | 订单号 |
| `--errors` | `-e` | 只搜索错误日志 |
| `--time-range` | `-t` | 相对时间范围 (15m/1h/24h/7d)，与 --start 二选一 |
| `--start` | | 开始时间，北京时间 (YYYY-MM-DD HH:MM:SS) |
| `--end` | | 结束时间，北京时间，不填则到当前 |
| `--limit` | `-l` | 返回条数 (默认 50) |
| `--list-services` | | 列出所有服务 |
