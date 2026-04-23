# 支付退款表结构

## 数据库：yamibuy_finance

### fin_receivable（应收款/退款请求表）
| 字段 | 说明 |
|------|------|
| rec_id | 主键 |
| order_id | 订单ID |
| status | 状态：0=待处理 |
| count | 重试次数 |
| request_json | 请求参数JSON |
| in_dtm | 创建时间（Unix时间戳） |

---

## 数据库：yamibuy_payment

### payment_charge（支付记录表）
| 字段 | 说明 |
|------|------|
| purchase_id | 支付ID（主键） |
| pay_provider | 支付渠道 |
| pay_status | 支付状态：60=成功 |
| charge_type | 支付类型：1=正常支付 |
| settlement | 结算状态：2=失败 |
| charge_dtm | 支付时间（Unix时间戳） |

**pay_provider 渠道映射**：
| 值 | 渠道 |
|----|------|
| 5 | PayPal (Braintree) |
| 7 | Venmo (Braintree) |
| 10 | Stripe 信用卡 |
| 11 | Stripe ApplePay |
| 12 | UPI |
| 13 | UPI |
| 14 | UPI |

### payment_refund（退款主表）
| 字段 | 说明 |
|------|------|
| refund_id | 退款ID（主键） |
| rec_id | 关联 fin_receivable |
| purchase_id | 关联 payment_charge |
| tx_id | 交易ID |
| refund_amount | 退款金额 |
| refund_reason | 退款原因 |
| status | 退款状态 |
| refund_dtm | 退款时间（Unix时间戳） |
| refund_ip | 请求IP |

**status 状态映射**：
| 值 | 说明 |
|----|------|
| 10 | 处理中/异常 |
| 40 | 失败 |
| 50 | 异常 |
| 60 | 成功 |

### payment_refund_detail（UPI 退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | 网关响应JSON |

### payment_refund_card_stripe（Stripe 信用卡退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | Stripe 响应JSON |

### payment_refund_applepay_stripe（Stripe ApplePay 退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | Stripe 响应JSON |

### payment_refund_paypal（PayPal 退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | PayPal 响应JSON |

**常见 PayPal 错误**：
- `Refund Time Limit Exceeded` - 超过退款时限
- `PayPal Refund Transaction with an Open Case Not Allowed` - 有争议案件

### payment_refund_venmo（Venmo 退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | Venmo 响应JSON |

### payment_refund_wechat（微信退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | 微信响应JSON |

### payment_refund_alipay_citcon（支付宝退款详情）
| 字段 | 说明 |
|------|------|
| refund_id | 关联 payment_refund |
| response | 支付宝响应JSON |

### payment_attempts_log（支付尝试日志）
| 字段 | 说明 |
|------|------|
| purchase_id | 关联 payment_charge |
| ... | 支付尝试详情 |

---

## 表关联关系

```
fin_receivable (order_id)
    ↓
xysc_order_info (order_id → purchase_id)
    ↓
payment_charge (purchase_id)
    ↓
payment_refund (purchase_id)
    ↓
payment_refund_xxx (refund_id) -- 各网关退款详情表
```
