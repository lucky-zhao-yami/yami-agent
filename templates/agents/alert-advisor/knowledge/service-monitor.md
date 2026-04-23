# 服务日志监控

## 概述

`yamibuy_fp.service_monitor` 是基于 ES 日志的关键字监控系统，通过匹配日志中的关键字来触发告警。

## 表结构

### service_monitor（监控规则表）
| 字段 | 说明 |
|------|------|
| monitor_id | 主键 |
| group_name | 分组：default/dev_real_time/real_time |
| title | 告警标题 |
| service_index | ES 索引（对应服务日志） |
| keyword | 匹配关键字（JSON数组，AND关系） |
| keyword_exclude | 排除关键字 |
| log_expire_time | 日志查询时间范围（P30D=30天） |
| threshold | 告警阈值 |
| status | 启用状态：1=启用 |

### service_monitor_log（监控记录表）
| 字段 | 说明 |
|------|------|
| rec_id | 主键 |
| monitor_id | 关联监控规则 |
| value | 匹配到的日志数量 |
| in_dtm | 记录时间（Unix毫秒） |

## 监控分组

| 分组 | 说明 | 数量 |
|------|------|------|
| default | 常规监控，定时检查 | 53 |
| dev_real_time | 开发实时监控 | 26 |
| real_time | 生产实时监控 | 5 |

## ES 索引与服务映射

| ES 索引 | 服务 |
|---------|------|
| k8s-ec-payment-service-log-* | EC 支付服务 |
| k8s-ec-so-service-log-* | EC 订单服务 |
| k8s-ec-so-job-service-log-* | EC 订单 Job |
| k8s-ec-customer-service-log-* | EC 客户服务 |
| k8s-job-ec-customer-service-log-* | EC 客户 Job |
| k8s-central-payment-service-log-* | Central 支付服务 |
| k8s-job-central-so-log-* | Central 订单 Job |
| k8s-job-central-so-service-log-* | Central 订单服务 Job |
| k8s-job-central-so-job-log-* | Central 订单 Job |

## 常见告警类型

### 支付类
| 告警 | 关键字 | 说明 |
|------|--------|------|
| 支付网关出问题 | messageId: 130001 | 网关异常 |
| cvv/账单地址/过期时间错误 | messageId: 10068 | 用户输入错误 |
| 支付非cvv错误 | messageId: 10069 | 其他支付失败 |
| Apple支付错误 | messageId: 10070 | ApplePay 异常 |
| Stripe添加卡失败 | messageId: 10024 | 添卡失败 |
| 超时支付交易失败 | messageId: 99999 | 超时 |
| Venmo/PayPal 欺诈交易 | Fraud Suspected | 风控拦截 |
| UPI 网关出错 | gateway error | UPI 异常 |

### 订单类
| 告警 | 关键字 | 说明 |
|------|--------|------|
| 下载发票异常 | messageId: 40010 | 发票生成失败 |
| 订单迁移失败 | 迁移失败，回滚SQL | 数据迁移异常 |
| 物流状态无法匹配 | undefined | 物流状态映射缺失 |

### 系统类
| 告警 | 关键字 | 说明 |
|------|--------|------|
| 线程池任务有风险 | Thread Pool Minor | 线程池压力 |
| Communications link failure | DB 连接异常 | 数据库连接问题 |
| 等待落库超时 | 等待落库超时 | 订单落库延迟 |

### 资源类
| 告警 | 关键字 | 说明 |
|------|--------|------|
| ZeroBounce API余额不足 | 余额不足500 | 邮箱验证额度 |
| Bouncer余额不足 | 余额不足500 | 邮箱验证额度 |

---

## 排查思路

### 1. 确认告警详情

```sql
-- 查看告警规则
SELECT * FROM yamibuy_fp.service_monitor WHERE title LIKE '%告警关键字%';

-- 查看最近触发记录
SELECT l.*, m.title, m.keyword 
FROM yamibuy_fp.service_monitor_log l 
JOIN yamibuy_fp.service_monitor m ON l.monitor_id = m.monitor_id 
WHERE m.title LIKE '%告警关键字%'
ORDER BY l.in_dtm DESC LIMIT 20;
```

### 2. 定位日志

根据 `service_index` 确定服务，去 ES/Kibana 搜索对应关键字：
- 时间范围：告警 in_dtm 前后
- 索引：service_index 字段值
- 关键字：keyword 字段值

### 3. 分析原因

**支付类告警**：
1. 查看具体错误码和 response
2. 检查支付网关状态
3. 确认是用户问题还是系统问题

**订单类告警**：
1. 查看订单状态和流转
2. 检查依赖服务状态
3. 确认数据一致性

**系统类告警**：
1. 检查服务资源使用（CPU/内存）
2. 检查数据库连接池
3. 检查外部依赖响应时间

### 4. 处理建议

| 告警类型 | 处理方式 |
|---------|---------|
| 网关异常 | 联系网关方/切换备用通道 |
| 用户输入错误 | 观察趋势，超阈值才处理 |
| 欺诈交易 | 检查风控规则 |
| DB连接异常 | 检查连接池/重启服务 |
| 线程池压力 | 扩容/优化任务 |
| 余额不足 | 充值 |
