# 结算失败处理手册

## 告警条件

```sql
payment_charge.settlement = 2      -- 结算失败
AND payment_charge.pay_status = 60 -- 支付成功
AND payment_charge.charge_type = 1 -- 正常支付
```

## settlement 状态枚举

| 值 | 状态 | 说明 |
|----|------|------|
| 0 | NO | 未结算 |
| 1 | YES | 已结算 |
| 2 | FAIL | 结算失败 |
| 3 | CANCEL | 取消 |

---

## 排查步骤

### 1. 查询最近结算失败记录

```sql
-- 使用 charge_dtm 范围 + rec_id 排序，避免全表扫描
SELECT c.tx_id, c.purchase_id, c.amount, c.pay_provider, 
       c.settlement, FROM_UNIXTIME(c.charge_dtm) as charge_time
FROM Yamibuy_Payment.payment_charge c
WHERE c.settlement = 2 AND c.pay_status = 60 AND c.charge_type = 1
  AND c.charge_dtm >= UNIX_TIMESTAMP('2026-01-22')
ORDER BY c.rec_id DESC
LIMIT 20;
```

### 2. 查看结算失败日志（用索引字段 purchase_id）

```sql
SELECT rec_id, order_id, tx_id, type, content, FROM_UNIXTIME(in_dtm) as log_time
FROM Yamibuy_Payment.payment_charge_order_log 
WHERE purchase_id = '{purchase_id}'  -- purchase_id 有索引
  AND type = 4                       -- type=4 是结算响应
ORDER BY rec_id DESC 
LIMIT 10;
```

### 3. 日志 type 字段含义

| type | 含义 |
|------|------|
| 2 | 取消订单 |
| 3 | 订单取消中 |
| 4 | 结算响应 |
| 5 | 异常信息 |

---

## 常见失败原因

### PayPal 错误码 4001

**错误信息**：
```
processorSettlementResponseCode: "4001"
processorSettlementResponseText: "Settlement Declined"
additionalProcessorResponse: "Payer cannot pay for this transaction. Please contact the payer to find other ways to pay for this transaction."
```

**含义**：买家 PayPal 账户无法完成扣款

**可能原因**：
- PayPal 余额不足
- 关联的银行卡/信用卡被拒绝
- PayPal 账户受限或被冻结

**交易状态流转**：
```
AUTHORIZED → SUBMITTED_FOR_SETTLEMENT → SETTLING → SETTLEMENT_DECLINED
```

### 其他常见错误码

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| 4001 | 买家无法付款 | 联系客户更换支付方式 |
| 4002 | 授权过期 | 需要客户重新下单 |
| 4003 | 交易被拒绝 | 联系 PayPal 客服 |

---

## 处理方案

### 1. 联系客户

通知用户 PayPal 付款失败，建议：
- 检查 PayPal 账户状态和余额
- 更换付款方式重新下单

### 2. 订单处理

结算失败后系统会尝试取消订单，但可能因状态问题失败：
- 状态为 `SETTLEMENT_DECLINED` 时无法 void
- 需要人工处理订单状态

### 3. 财务处理

- 确认款项未实际到账
- 记录损失金额
- 必要时发起争议或联系 PayPal

---

## SQL 查询规范（重要）

### 必须遵循的原则

1. **优先使用主键或索引字段**
   - `rec_id` - 主键
   - `purchase_id` - 有索引
   - `tx_id` - 有索引
   - `order_id` - 有索引

2. **避免全表扫描**
   ```sql
   -- ❌ 错误：无索引条件
   SELECT * FROM payment_charge WHERE settlement = 2;
   
   -- ✅ 正确：先用时间范围缩小，再用主键排序
   SELECT * FROM payment_charge 
   WHERE settlement = 2 AND charge_dtm >= UNIX_TIMESTAMP('2026-01-22')
   ORDER BY rec_id DESC LIMIT 20;
   ```

3. **子查询避免 LIMIT**
   ```sql
   -- ❌ 错误：MySQL 不支持 LIMIT 在 IN 子查询中
   SELECT * FROM table1 WHERE id IN (SELECT id FROM table2 LIMIT 10);
   
   -- ✅ 正确：先查出 ID 列表，再用 IN
   SELECT * FROM table1 WHERE id IN ('id1', 'id2', 'id3');
   ```

4. **关联查询用索引字段**
   ```sql
   -- ✅ 正确：purchase_id 有索引
   SELECT * FROM payment_charge_order_log WHERE purchase_id = '222586638';
   
   -- ❌ 避免：content 无索引
   SELECT * FROM payment_charge_order_log WHERE content LIKE '%error%';
   ```

5. **时间范围查询优化**
   ```sql
   -- 如果 charge_dtm 有索引，直接用
   WHERE charge_dtm >= UNIX_TIMESTAMP('2026-01-22')
   
   -- 如果没有索引，用主键范围代替
   -- 先查边界：
   SELECT MIN(rec_id) FROM payment_charge WHERE charge_dtm >= UNIX_TIMESTAMP('2026-01-22');
   -- 再用主键查：
   WHERE rec_id >= {min_rec_id}
   ```

### 常用索引字段参考

| 表名 | 索引字段 |
|------|----------|
| payment_charge | rec_id(PK), tx_id, purchase_id |
| payment_refund | rec_id(PK), refund_id, tx_id, purchase_id |
| payment_charge_order | rec_id(PK), order_id, purchase_id, tx_id |
| payment_charge_order_log | rec_id(PK), order_id, purchase_id |
| payment_attempts_log | rec_id(PK), tx_id |
