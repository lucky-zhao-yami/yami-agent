# 需补偿退款交易处理手册

## 告警含义

退款状态异常（status=10/40/50）且网关有响应记录，需要人工补偿处理。

## 退款状态枚举

| 值 | 状态 | 说明 |
|----|------|------|
| 10 | 处理中 | 异常状态 |
| 40 | 失败 | 退款失败 |
| 50 | 异常 | 退款异常 |
| 60 | 成功 | 退款成功 |

---

## 监控 SQL

```sql
select count(*) from (
select 
    tab.purchase_id, 
    count(a.purchase_id) + count(b.purchase_id) + count(c.purchase_id) + count(d.purchase_id) + count(e.purchase_id) + count(f.purchase_id) + count(g.purchase_id) real_error_num
from (
    SELECT
        purchase_id, 
        count(IF(status=50 or status = 40 or status =10, 1, NULL)) error_num, 
        count(*) all_num, 
        GROUP_CONCAT(DISTINCT refund_ip) ips
    FROM
        yamibuy_payment.payment_refund 
    WHERE
        refund_dtm > {近期时间戳}
    group by purchase_id
) tab 
LEFT JOIN (
    -- Stripe 信用卡退款（排除争议订单）
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_card_stripe b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳}
    and (a.status=50 or a.status = 40 or a.status =10) 
    and LOCATE('charge_disputed', b.response) = 0
) a on tab.purchase_id = a.purchase_id
LEFT JOIN (
    -- 微信退款
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_wechat b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳} and (a.status=50 or a.status = 40 or a.status =10)
) b on tab.purchase_id = b.purchase_id
LEFT JOIN (
    -- UPI 退款
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_detail b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳} and (a.status=50 or a.status = 40 or a.status =10)
) c on tab.purchase_id = c.purchase_id
LEFT JOIN (
    -- Venmo 退款
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_venmo b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳} and (a.status=50 or a.status = 40 or a.status =10)
) d on tab.purchase_id = d.purchase_id
LEFT JOIN (
    -- PayPal 退款（排除超时限和争议案件）
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_paypal b 
    WHERE JSON_EXTRACT(b.response, '$.message') not in (
        'Refund Time Limit Exceeded',
        'PayPal Refund Transaction with an Open Case Not Allowed', 
        'Refund limit exceeded. Please try using an alternate payment method.\nPayPal Refund Transaction with an Open Case Not Allowed'
    ) 
    and a.refund_id = b.refund_id and refund_dtm > {时间戳} and (a.status=50 or a.status = 40 or a.status =10)
) e on tab.purchase_id = e.purchase_id
LEFT JOIN (
    -- Stripe ApplePay 退款（排除争议订单）
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_applepay_stripe b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳}
    and (a.status=50 or a.status = 40 or a.status =10)
    and LOCATE('charge_disputed', b.response) = 0
) f on tab.purchase_id = f.purchase_id
LEFT JOIN (
    -- 支付宝 Citcon 退款
    select a.purchase_id,b.* from yamibuy_payment.payment_refund a, yamibuy_payment.payment_refund_alipay_citcon b 
    WHERE a.refund_id = b.refund_id and refund_dtm > {时间戳} and (a.status=50 or a.status = 40 or a.status =10)
) g on tab.purchase_id = g.purchase_id
where 1 = 1
and LOCATE(',', ips) = 0   -- 排除重复请求（多IP）
GROUP BY tab.purchase_id
order by purchase_id desc
) tab2 where tab2.real_error_num > 0;
```

### 监控逻辑说明

1. **筛选异常退款**：status IN (10, 40, 50)
2. **排除重复请求**：`LOCATE(',', ips) = 0` 确保只有单一 IP
3. **排除特殊情况**：
   - Stripe: 排除 `charge_disputed`（争议订单不算失败）
   - PayPal: 排除超时限、有争议案件的退款
4. **关联网关详情表**：确认有网关响应记录才计入

---

## 排查步骤

### 1. 查看具体哪些 purchase_id 需要补偿

```sql
-- 在监控 SQL 基础上，改为查看明细
select 
    tab.purchase_id, 
    count(a.purchase_id) + count(b.purchase_id) + count(c.purchase_id) + count(d.purchase_id) + count(e.purchase_id) + count(f.purchase_id) + count(g.purchase_id) real_error_num
from (
    -- ... 同上 ...
) tab 
-- ... 同上 LEFT JOIN ...
where 1 = 1
and LOCATE(',', ips) = 0 
GROUP BY tab.purchase_id
HAVING real_error_num > 0
order by purchase_id desc;
```

### 2. 查看退款详情（用 purchase_id 索引）

```sql
SELECT r.refund_id, r.purchase_id, r.refund_amount, r.status, 
       SUBSTRING(r.refund_reason, 1, 50) as reason, 
       FROM_UNIXTIME(r.refund_dtm) as refund_time
FROM yamibuy_payment.payment_refund r
WHERE r.purchase_id IN ('{purchase_id1}', '{purchase_id2}')
  AND r.status IN (10, 40, 50)
ORDER BY r.purchase_id, r.refund_dtm DESC;
```

### 3. 查看网关响应（用 refund_id 索引）

```sql
-- UPI 退款详情
SELECT refund_id, response
FROM yamibuy_payment.payment_refund_detail
WHERE refund_id IN ('{refund_id1}', '{refund_id2}');

-- Stripe 信用卡退款详情
SELECT refund_id, response
FROM yamibuy_payment.payment_refund_card_stripe
WHERE refund_id = '{refund_id}';

-- PayPal 退款详情
SELECT refund_id, response
FROM yamibuy_payment.payment_refund_paypal
WHERE refund_id = '{refund_id}';
```

---

## 常见失败原因

### UPI (Citcon) 网关错误

```json
{"status":"fail","app":"citcon_upi","data":{"code":"4107","message":"gateway error"}}
```

**处理**：等网关恢复后重试退款

### Stripe 争议订单

```
Charge xxx has been charged back; cannot issue a refund.; code: charge_disputed
```

**处理**：不需要退款，用户已通过 chargeback 拿回款项，在 Stripe 后台处理争议

### PayPal 超时限

```
Refund Time Limit Exceeded
```

**处理**：已被监控排除，无需处理（超过退款时限无法退款）

### PayPal 有争议案件

```
PayPal Refund Transaction with an Open Case Not Allowed
```

**处理**：已被监控排除，等争议结案后再处理

### 502 网关超时

```
502 Bad Gateway
```

**处理**：直接重试退款

---

## 处理方式

1. **UPI 网关错误**：通过后台或 API 重试退款
2. **Stripe 争议**：在 Stripe Dashboard 处理争议，无需退款
3. **网络超时**：直接重试
4. **其他错误**：根据具体错误信息联系对应网关技术支持

---

## SQL 规范提醒

1. **使用索引字段查询**：
   - `purchase_id` - 有索引
   - `refund_id` - 有索引
   - `tx_id` - 有索引

2. **避免全表扫描**：
   ```sql
   -- ✅ 正确：用 purchase_id 查询
   WHERE purchase_id IN ('222658562', '222586312')
   
   -- ❌ 错误：用无索引字段
   WHERE refund_reason LIKE '%地址%'
   ```

3. **时间范围用时间戳**：
   ```sql
   WHERE refund_dtm > 1765607080  -- 直接用时间戳
   ```
