# Grafana 监控告警映射

## 告警列表

| 告警名称 | 涉及表 | 问题类型 |
|---------|--------|----------|
| UPI 网关退款失败 | fin_receivable, payment_refund, payment_charge, payment_refund_detail | 退款网关异常 |
| Stripe 网关退款失败 | fin_receivable, payment_refund, payment_charge, payment_refund_card_stripe, payment_refund_applepay_stripe | 退款网关异常 |
| Braintree 网关退款失败 | fin_receivable, payment_refund, payment_charge, payment_refund_paypal, payment_refund_venmo | 退款网关异常 |
| 退款异常：finance 退款参数有误 | fin_receivable, payment_refund, payment_charge | 退款参数错误 |
| 需补偿退款交易数量 | payment_refund, 各网关退款明细表 | 退款补偿 |
| 结算失败 | payment_charge, payment_attempts_log | 结算异常 |

---

## UPI 网关退款失败

**告警含义**：UPI 支付渠道（pay_provider: 12, 13, 14）的退款请求失败

**排查表**：
- `yamibuy_finance.fin_receivable` - 应收款记录，status=0 表示待处理
- `yamibuy_payment.payment_refund` - 退款主表，status!=60 表示未成功
- `yamibuy_payment.payment_charge` - 支付记录，关联 pay_provider
- `yamibuy_payment.payment_refund_detail` - UPI 退款响应详情

**关键字段**：
- `fin_receivable.status = 0` - 待处理的应收款
- `fin_receivable.count >= 1` - 已尝试次数
- `payment_charge.pay_provider in (12, 13, 14)` - UPI 渠道
- `payment_refund_detail.response` - 网关返回信息

**排查方向**：
1. 查看 payment_refund_detail.response 中的错误信息
2. 确认 UPI 网关服务状态
3. 检查退款金额是否超限

---

## Stripe 网关退款失败

**告警含义**：Stripe 支付渠道（pay_provider: 10, 11）的退款请求失败

**排查表**：
- `yamibuy_finance.fin_receivable` - 应收款记录
- `yamibuy_payment.payment_refund` - 退款主表
- `yamibuy_payment.payment_charge` - 支付记录
- `yamibuy_payment.payment_refund_card_stripe` - Stripe 信用卡退款详情
- `yamibuy_payment.payment_refund_applepay_stripe` - Stripe ApplePay 退款详情

**关键字段**：
- `payment_charge.pay_provider in (10, 11)` - Stripe 渠道
- `response` 中排除 `charge_disputed`（争议订单不算失败）

**排查方向**：
1. 查看 response 中的 Stripe 错误码
2. 检查是否为争议订单（charge_disputed）
3. 确认 Stripe API 状态

---

## Braintree 网关退款失败

**告警含义**：Braintree 支付渠道（PayPal/Venmo，pay_provider: 5, 7）的退款请求失败

**排查表**：
- `yamibuy_finance.fin_receivable` - 应收款记录
- `yamibuy_payment.payment_refund` - 退款主表
- `yamibuy_payment.payment_charge` - 支付记录
- `yamibuy_payment.payment_refund_paypal` - PayPal 退款详情
- `yamibuy_payment.payment_refund_venmo` - Venmo 退款详情

**关键字段**：
- `payment_charge.pay_provider in (5, 7)` - Braintree 渠道（5=PayPal, 7=Venmo）

**排查方向**：
1. 查看 PayPal/Venmo 的 response 错误信息
2. 检查是否超过退款时限
3. 确认 Braintree 网关状态

---

## 退款异常：finance 退款参数有误

**告警含义**：fin_receivable 有记录但 payment_refund 无对应记录，说明退款参数有问题

**排查表**：
- `yamibuy_finance.fin_receivable` - 应收款记录
- `yamibuy_payment.payment_refund` - 退款主表（c.rec_id is null 表示无匹配）

**关键条件**：
- `fin_receivable.status = 0` - 待处理
- `payment_refund.rec_id is null` - 无退款记录

**排查方向**：
1. 检查 fin_receivable.request_json 中的参数
2. 确认 order_id 和 purchase_id 是否正确关联
3. 检查是否为重复退款请求

---

## 需补偿退款交易数量

**告警含义**：退款状态异常（status=10/40/50）且网关有响应记录，需要人工补偿

**排查表**：
- `yamibuy_payment.payment_refund` - 退款主表
- `yamibuy_payment.payment_refund_card_stripe` - Stripe 信用卡
- `yamibuy_payment.payment_refund_applepay_stripe` - Stripe ApplePay
- `yamibuy_payment.payment_refund_wechat` - 微信
- `yamibuy_payment.payment_refund_detail` - UPI
- `yamibuy_payment.payment_refund_venmo` - Venmo
- `yamibuy_payment.payment_refund_paypal` - PayPal
- `yamibuy_payment.payment_refund_alipay_citcon` - 支付宝

**关键字段**：
- `payment_refund.status in (10, 40, 50)` - 异常状态
- `refund_ip` 单一（非重复请求）

**监控排除项**：
- Stripe: `charge_disputed`（争议订单不算失败）
- PayPal: `Refund Time Limit Exceeded`（超时限）
- PayPal: `PayPal Refund Transaction with an Open Case Not Allowed`（有争议案件）

**常见失败原因**：
- UPI 网关错误：`{"code":"4107","message":"gateway error"}`
- 502 网关超时
- Stripe 争议订单

**排查方向**：
1. 按 purchase_id 查看具体退款记录
2. 检查各网关 response 中的错误信息
3. UPI 错误等网关恢复后重试，争议订单在网关后台处理

**详细处理流程**：参见 [refund-compensation.md](refund-compensation.md)

---

## 结算失败

**告警含义**：支付成功但结算失败

**排查表**：
- `yamibuy_payment.payment_charge` - 支付记录
- `yamibuy_payment.payment_charge_order_log` - 结算日志（type=4 为结算响应）
- `yamibuy_payment.payment_attempts_log` - 支付尝试日志

**关键字段**：
- `payment_charge.settlement = 2` - 结算失败
- `payment_charge.charge_type = 1` - 正常支付
- `payment_charge.pay_status = 60` - 支付成功

**常见错误码（PayPal/Braintree）**：
- `4001` - 买家无法付款（余额不足/卡被拒/账户受限）
- `4002` - 授权过期
- `4003` - 交易被拒绝

**排查方向**：
1. 用 purchase_id 查询 payment_charge_order_log（type=4）获取网关响应
2. 查看 processorSettlementResponseCode 和 additionalProcessorResponse
3. 联系客户更换支付方式或人工处理订单

**详细处理流程**：参见 [settlement-failure.md](settlement-failure.md)
