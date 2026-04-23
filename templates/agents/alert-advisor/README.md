# Alert Advisor Agent

告警分析 Agent，用于分析 Grafana 监控异常并给出处理建议。

## 功能

- 分析退款网关告警（UPI/Stripe/Braintree）
- 分析服务日志监控告警（service_monitor）
- 提供排查思路和处理建议

## 安装

1. 将整个 `alert-advisor` 目录复制到 `.kiro/agents/` 下
2. 将 `agent.json` 复制到 `.kiro/agents/alert-advisor.json`
3. 修改 `config.yaml` 中的数据库连接信息

## 目录结构

```
alert-advisor/
├── README.md           # 说明文档
├── agent.json          # Agent 配置
├── config.yaml         # 数据库配置
├── prompt.md           # Agent 提示词
└── knowledge/          # 知识库
    ├── grafana-alerts.md    # Grafana 告警映射
    ├── payment-schema.md    # 支付退款表结构
    ├── service-monitor.md   # 服务日志监控
    └── troubleshooting.md   # 故障排查手册
```

## 使用方式

```
@alert-advisor UPI 网关退款失败告警了
@alert-advisor 支付网关出问题 告警触发
@alert-advisor Stripe 退款失败，帮我分析一下
```

## 数据源

需要访问以下数据库：
- yamibuy_finance（退款应收款）
- yamibuy_payment（支付退款）
- yamibuy_fp（服务监控）
- yamibuy_master（订单）
