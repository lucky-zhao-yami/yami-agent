---
inclusion: manual
---

# 支付与退款问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为支付/退款排查类问题：
- 支付失败、扣款、重复扣款、被扣款、银行卡、信用卡、绑卡、添加银行卡、绑卡失败、无法添加卡
- 退款、退款失败、退款未到账、退款异常
- stripe、paypal、微信支付、支付宝、venmo、apple pay
- CVC、银行拒付、拒付、charge back、争议
- 支付成功没订单、扣款没订单、pending
- 盗刷、刷单、异常扣款、不明扣款、卡被盗用、银行卡被扣
- 售后风险、关联账户、pay_by_id、支付账户关联、多账号共用支付
- 授信、授权、capture、取消授权、未扣款、hold、pending扣款、部分扣款

## 常用数据库表
- `yamibuy_so`.`so_order_purchase_record` - 用户支付记录（根据 user_id 查询）
- `yamibuy_payment`.`payment_charge` - 支付状态表（根据 purchase_id 查询）
- `yamibuy_payment`.`payment_charge_order` - 按订单维度的授信/capture 记录（时间戳单位为毫秒）
- `yamibuy_payment`.`payment_charge_order_log` - 授信操作日志（content 字段含 Stripe 完整响应 JSON）
- `yamibuy_payment`.`payment_refund` - 退款记录表（根据 purchase_id 查询）
- `yamibuy_payment`.`payment_refund_paypal` - PayPal 退款详情
- `yamibuy_payment`.`payment_charge_card_stripe` - Stripe 信用卡支付详情（tx_id 和 charge_response）
- `yamibuy_payment`.`payment_profile_card` - 用户绑定的银行卡信息（tail=卡尾号, exp_year=过期年, exp_month=过期月）
- `yamibuy_payment`.`payment_attempts_log` - 支付尝试日志（customer_id=用户ID, error_code=失败原因）
- `yamibuy_master`.`xysc_order_info` - 订单基本信息（含 purchase_id）
- `yamibuy_finance`.`fin_receivable` - 财务应退账款主表
- `yamibuy_finance`.`fin_receivable_detail` - 财务应退账款明细
- `yamibuy_crm`.`crm_risk_user` - 风险用户标记表（reason=风险原因, is_deleted=0 表示生效中）

> 字段枚举值见 `.kiro/skills/enum-values.md`，解释字段时先查速查表（如 `payment_charge.pay_status`），无需重复查表结构。

## 常用查询

以下 SQL 在多个场景中重复使用，各场景以编号引用。

**[Q1] 查支付尝试日志（按 user_id）**
```sql
SELECT rec_id, purchase_id, tx_id, status, error_code,
       FROM_UNIXTIME(in_dtm) AS attempt_time
FROM yamibuy_payment.payment_attempts_log WHERE customer_id = 'user_id' ORDER BY rec_id DESC LIMIT 20;
```

**[Q2] 查退款记录（按 purchase_id）**
```sql
SELECT refund_id, purchase_id, refund_amount, status, refund_reason,
       FROM_UNIXTIME(refund_dtm) AS refund_time
FROM yamibuy_payment.payment_refund WHERE purchase_id = 'purchase_id';
```

**[Q3] 查支付记录（按 purchase_id）**
```sql
SELECT purchase_id, amount, pay_provider, pay_status, transaction_id,
       FROM_UNIXTIME(charge_dtm) AS charge_time
FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';
```

**[Q4] 查订单基本信息（按 user_id 查最近订单）**
```sql
SELECT order_id, order_sn, purchase_id, order_status, order_amount,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE user_id = user_id ORDER BY add_time DESC LIMIT 10;
```

## 排查场景

### 场景零：添加银行卡失败
触发条件：客人反馈无法添加银行卡、绑卡失败、添加卡片报错、重复填写银行卡信息、每次下单都要重新输入卡信息

```
1. 通过邮箱获取 user_id
2. 查用户是否为风险用户（风险用户在 createCardSecret 阶段即被拦截，不会创建 SetupIntent）
3. 查用户操作时间段内的完整日志链路（不限定级别和关键词，通盘审查）：
   a. ec-payment-service 全量日志（search.py -s ec-payment -k "user_id" -t 时间范围）
   b. ec-so-service 全量日志（search.py -s ec-so -k "user_id" -t 时间范围）
   
   审查要点（非限定清单，根据日志实际内容判断）：
   - 还原用户完整操作时间线：购物车 → 结算页 → 绑卡/选卡 → 支付的全链路
   - 关注任何异常信号：error/warn 日志、非预期的响应内容、请求链路中断、接口返回失败等
   - 绑卡相关参考关键词：创建clientSecret、SetupIntent、风险用户、setup_failed、添加卡失败
   - 结算相关参考关键词：profileId（为空=无已保存卡）、select（false=未选中已保存卡）
   
   ⚠️ 禁止只查 error 级别或只查预设关键词就下结论，必须通读该时间段内的全量日志
   ↓
   ec-payment-service 日志中无任何该用户记录？
   ├─ 是 → 请求未到达后端，检查前端/网络问题
   └─ 否 →
         日志中有"风险用户，不返回凭证"？
         ├─ 有 → 被风控拦截（crm_risk_user，reason=1 为临时邮箱注册），联系风控确认
         └─ 无 →
               日志中有"创建clientSecret"？
               ├─ 无 → canUseStripe 返回 false（Stripe 开关/白名单问题），或前端未发起请求
               └─ 有 → SetupIntent 已创建，继续查看结果
                     ↓
                     日志中有 setup_intent.setup_failed？
                     ├─ 有 → 查 lastSetupError 的 code 和 declineCode：
                     │     ├─ card_declined + generic_decline → 发卡行拒绝，常见于境内借记卡未开通境外交易
                     │     └─ 其他 declineCode → 根据 Stripe 错误码文档定位
                     │     → 建议客户联系发卡银行确认卡片权限，或更换支持境外消费的信用卡
                     └─ 无 → 查是否有"添加卡失败，code:"日志，根据 code 定位原因
```

```sql
-- 查用户是否为风险用户
SELECT rec_id, user_id, reason, is_deleted, FROM_UNIXTIME(in_dtm) AS marked_time
FROM yamibuy_crm.crm_risk_user WHERE user_id = 'user_id' AND is_deleted = 0;
```

### 场景一：支付失败
触发条件：客人反馈支付失败（任意支付方式）

```
1. 通过邮箱获取 user_id
2. 查支付尝试日志定位原因
   ↓
   有记录且 error_code 有值？
   ├─ 有 → 根据 pay_provider 解读 error_code（枚举值见 enum-values.md）
   └─ 无 error_code → 查 response_data 或 notify_data 字段获取网关原始响应
```

查支付尝试日志 → 见 [Q1]（额外关注 method_id、gateway_id 字段可按需添加）

### 场景二：支付成功但没有订单（扣款没订单）
触发条件：客人反馈被扣款但没有订单号

排查路径与 cs-order.md 场景三（订单号查询）一致，按该场景的第一步→第二步→第三步执行。核心结论：
- 订单存在 → 客人没找到，引导查询
- 支付成功但订单未落库，已自动退款 → 告知到账时间
- 支付成功但订单未落库，未自动退款 → 需人工处理退款

### 场景三：重复扣款
触发条件：客人反馈被扣了两次款

```
1. 通过邮箱获取 user_id
2. 查用户最近的订单、支付记录和支付尝试日志
   ↓
   该用户近期有几笔支付成功的记录？
   ├─ 只有一笔 → 用户看到的"两笔"可能是：
   │       - 一笔扣款 + 一笔退款处理中
   │       - 银行 pending/hold 记录（非实际扣款，授信模式常见）
   │       → 告知客服让用户联系银行确认
   └─ 多笔 → 查 payment_refund 确认是否已自动退款，未退款需人工处理
   
   数据库无法确定原因时 → 查日志（search.py -s ec-payment -k "user_id值" -t 7d）
```

```sql
-- 查用户最近订单 → 见 [Q4]

-- 查支付记录 → 见 [Q3]

-- 查支付尝试日志 → 见 [Q1]

-- 查退款记录 → 见 [Q2]（本场景无需 refund_reason 字段）
```

### 场景四：退款问题（未到账 / 失败 / 无退款记录）
触发条件：客人反馈退款未到账、退款失败、取消订单后未收到退款

```
1. 通过邮箱获取 user_id，查订单、退款记录和支付记录
   ↓
   payment_refund 有退款记录？
   ├─ 有 → 查 status：
   │     ├─ status=60 → 已退款，告知到账时间（信用卡3-5工作日，PayPal参考官网）
   │     ├─ status=40（异常）→ 系统异常，可重试退款，查日志确认异常原因（search.py -s ec-payment -k "purchase_id值" -t 7d）
   │     ├─ status=10（初始化）→ 退款尚未执行，查日志确认是否卡在队列中（search.py -s ec-payment -k "purchase_id值" -t 7d）
   │     └─ status=50（失败）→ 查 refund_reason 字段 + 日志定位原因（search.py -s ec-payment -k "purchase_id值" -t 7d）
   │           ⚠️ 注意检查支付时间与退款时间间隔：Braintree 信用卡 capture 后超过 180 天、微信支付超过 1 年，渠道会直接拒绝退款（详见 cs-rma.md 场景五）
   │
   └─ 无记录 → 查 payment_charge.charge_type 判断是否授信模式：
         ├─ charge_type=0（普通）→ 无退款记录属于异常，查日志定位（search.py -s ec-payment -k "purchase_id值" -t 7d）
         └─ charge_type=1（授信）→ 查 payment_charge_order.status：
               ├─ status=50（已取消授权）→ 未实际扣款，无退款记录正常，银行 hold 金额 3-7 工作日自动释放
               ├─ status=60（已 capture）→ 已实际扣款，应有退款记录，无记录为异常，查日志确认原因（search.py -s ec-payment -k "purchase_id值" -t 7d）
               ├─ status=51（取消中）→ 等待处理，稍后再查
               └─ status=40（失败）→ 授权失败，理论上未扣款，查日志确认原因（search.py -s ec-payment -k "purchase_id值" -t 7d）
```

```sql
-- 查订单状态（按订单号）
SELECT order_id, order_sn, purchase_id, order_status, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查退款记录 → 见 [Q2]

-- 查支付记录（确认 pay_provider 和 charge_type）
SELECT purchase_id, amount, pay_provider, pay_status, charge_type, settlement, transaction_id
FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';

-- 无退款记录且 charge_type=1 时，查授信订单状态（时间戳单位毫秒需除以1000）
SELECT rec_id, order_id, purchase_id, amount, status, auth_type,
       FROM_UNIXTIME(auth_dtm/1000) AS auth_time,
       FROM_UNIXTIME(submit_dtm/1000) AS capture_time,
       FROM_UNIXTIME(cancel_dtm/1000) AS cancel_time
FROM yamibuy_payment.payment_charge_order WHERE order_id = 订单ID;
```

### 场景五：盗刷 / 异常扣款 / 银行卡被多次扣款
触发条件：客人反馈被盗刷、不明扣款、需要根据金额/时间/卡号查订单

```
第一步：确认客人本账号扣款情况
1. 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
2. 并行查询：绑定银行卡 + 近期支付记录 + kibana 支付尝试日志
3. 根据 purchase_id 并行查询：支付详情 + 对应订单 + 退款记录
   ↓
   所有扣款都是正常订单？（判断标准：每笔成功扣款都能在 xysc_order_info 找到对应订单，且订单是该用户本人下的）
   ├─ 是 → 进入第二步排查其他账号
   └─ 否（有扣款无对应订单 / 订单非本人 / 金额不符）→ 直接汇总异常扣款，建议冻结账号

第二步：排查绑定同一张卡的其他账号
1. 通过 fingerprint 查所有绑定该卡的账号
2. 对关联账号执行 `python scripts/get-userid.py "" "user_id"` 查邮箱
   - 如果返回 NOT_FOUND → 该账号可能已删除，需查 `xysc_users_delete` 表确认
   ↓
   只有客人本人绑定了该卡？
   ├─ 是 → 扣款都是客人自己下的单，告知客人确认自己的订单记录
   └─ 否（多个账号）→ 查可疑账号的近期支付记录 + 日志（search.py -s ec-payment -k "user_id值" -t 7d）
         ↓
         异常信号：绑卡后密集下单 / 多次失败后成功 / 注册时间新但消费异常 / 账号已删除但卡仍活跃
         ├─ 有异常 → 该账号存在异常，建议冻结可疑账号，并建议客人联系发卡银行挂失换卡
         └─ 无异常 → 告知客人联系发卡银行挂失换卡

数据库无法确定原因时 → 查日志（search.py -s ec-payment -k "user_id值" -t 7d）
```

```sql
-- 查绑定银行卡（含 fingerprint）
SELECT rec_id, profile_id, user_id, card_type, tail, exp_year, exp_month, fingerprint, status,
       FROM_UNIXTIME(in_dtm) AS created
FROM yamibuy_payment.payment_profile_card WHERE user_id = 'user_id';

-- 查近期支付记录
SELECT purchase_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE user_id = 'user_id' ORDER BY in_dtm DESC;

-- 查支付尝试日志（含 pay_by_id 支付指纹）
SELECT rec_id, purchase_id, tx_id, pay_by_id, status, error_code, FROM_UNIXTIME(in_dtm) AS attempt_time
FROM yamibuy_payment.payment_attempts_log WHERE customer_id = 'user_id' ORDER BY rec_id DESC LIMIT 20;

-- 通过 fingerprint 查所有绑定该卡的账号
SELECT rec_id, user_id, card_type, tail, exp_year, exp_month, fingerprint, status,
       FROM_UNIXTIME(in_dtm) AS created
FROM yamibuy_payment.payment_profile_card WHERE fingerprint = 'fingerprint值';

-- 根据金额+时间查支付记录（无卡信息时）
SELECT purchase_id, amount, pay_provider, pay_status, FROM_UNIXTIME(charge_dtm) AS charge_time
FROM yamibuy_payment.payment_charge
WHERE amount = '金额' AND charge_dtm > UNIX_TIMESTAMP('起始时间') AND charge_dtm < UNIX_TIMESTAMP('结束时间');

-- 关联账号通过 get-userid.py 查不到时（NOT_FOUND），查已删除账号表
SELECT user_id, email, mobile_phone, parent_id, FROM_UNIXTIME(reg_time) AS reg_time
FROM yamibuy_master.xysc_users_delete WHERE user_id = 可疑user_id;
```

### 场景六：资产预占未返还（积分/礼卡/优惠券）
触发条件：支付取消后资产没返还（未支付成功的场景，资产被预占）

积分、礼卡、优惠券在下单时预占，支付取消后 15 分钟内自动返还。

```
1. 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
2. 查支付预占记录确认支付状态
   ↓
   so_order_purchase_record.status？
   ├─ status=0（已预占）→ 支付未完成，资产仍被预占中，等待支付完成或超时自动释放
   ├─ status=1（超时取消）/ status=2（主动取消）→ 资产应已返还
   │     ├─ 取消时间距今 < 15 分钟 → 正常延迟，等待自动返还
   │     └─ 取消时间距今 > 15 分钟仍未返还 → 按资产类型排查：
   │           ├─ 积分 → 查日志（search.py -s ec-so -k "user_id值" -t 7d）
   │           ├─ 礼卡 → 查 xysc_egift_log 确认是否有 reason_flag=2 的退回记录，没退回记录，查日志（search.py -s ec-so -k "purchase_id值" -t 7d）
   │           └─ 优惠券 → 查 mkt_coupon_code.status 是否恢复为 10（可用），没恢复，查日志（search.py -s ec-so -k "purchase_id值" -t 7d）
   └─ status=3（支付成功）→ 资产已消费，不会返还，属于正常
```

```sql
-- 查支付预占记录
SELECT purchase_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE user_id = 'user_id' ORDER BY in_dtm DESC LIMIT 10;

-- 礼卡：查使用和退回流水
SELECT rec_id, card_id, order_id, use_amount, reason_flag, FROM_UNIXTIME(log_time) AS op_time
FROM yamibuy_master.xysc_egift_log WHERE order_id = order_id ORDER BY log_time;

-- 优惠券：查状态是否恢复
SELECT coupon_code, status, FROM_UNIXTIME(use_time) AS use_time
FROM yamibuy_mkt.mkt_coupon_code WHERE user_id = user_id ORDER BY use_time DESC LIMIT 10;
```

### 场景七：售后风险 - 支付账户（pay_by_id）关联多账号排查
触发条件：订单售后风险标记为 HIGH，提示"本单支付账户id有多个邮箱账户使用过"

```
1. 通过邮箱获取 user_id
2. 查 payment_attempts_log 获取 pay_by_id
3. 通过 pay_by_id 查所有关联账号
4. 批量执行脚本 `python scripts/get-userid.py "" "user_id"` 查关联账号邮箱（xysc_users.email 已脱敏不可用）
5. 对已删除账号查 xysc_users_delete 表
   ↓
   风险信号：
   - 同一支付账户被多个不相关账号使用
   - 关联账号之间存在邀请关系（parent_id）
   - 关联账号中有已删除账号
   - 短时间内密集下单后取消/退款
```

```sql
-- 查 pay_by_id
SELECT rec_id, customer_id, purchase_id, tx_id, pay_by_id, status, error_code,
       FROM_UNIXTIME(in_dtm) AS attempt_time
FROM yamibuy_payment.payment_attempts_log WHERE customer_id = 'user_id' ORDER BY rec_id DESC;

-- 查关联账号
SELECT customer_id FROM yamibuy_payment.payment_attempts_log
WHERE pay_by_id = 'pay_by_id' GROUP BY customer_id;

-- 查已删除账号
SELECT user_id, email, mobile_phone, parent_id, FROM_UNIXTIME(reg_time) AS reg_time
FROM yamibuy_master.xysc_users_delete WHERE user_id = 已删除的user_id;
```

### 场景八：退款是否到账综合排查（礼卡/积分/现金/优惠券）
触发条件：订单取消/RMA 退款后，各资产是否退回到账（已支付成功的场景）

```
1. 通过订单号查 xysc_order_info 获取 purchase_id 和各资产使用情况
2. 查 fin_receivable 确认退款 job 是否已执行
   ↓
   fin_receivable.status = 1（已处理）？
   ├─ 否（status=0 待处理）→ 退款 job 尚未执行，各项资产均未退回，请用户等待 
   └─ 是 → 查 fin_receivable_detail + 各资产表 + 日志（search.py -s ec-payment / ec-so），按资产类型逐项判断：
         ├─ 现金（amount_type=1）→ payment_refund.status=60？
         │     ├─ 是 → 已退款，告知到账时间
         │     └─ 否 → 查日志定位原因（search.py -s ec-payment -k "purchase_id值" -t 7d）
         ├─ 礼卡（amount_type=2）→ xysc_egift_log 有 reason_flag=2 的退回记录？
         │     ├─ 是 → 已退回，查 xysc_egift_card 确认当前余额
         │     └─ 否 → 未退回，查日志定位原因（search.py -s ec-so -k "order_id值" -t 7d）
         ├─ 积分（amount_type=3）→ 退款时退回积分账户（crm_point reason_third=1004002）
         │     注意：下单赠送积分（reason_third=1004001）RMA/整单取消时扣回，补偿退款通常不扣回
         └─ 优惠券（不在 fin_receivable 中）→ mkt_coupon_code.status=10？
               ├─ 是 → 已恢复可用
               └─ 否 → 未恢复，查日志（search.py -s ec-so -k "order_id值" -t 7d）
```

退款执行顺序：退礼卡 → 退积分 → 退现金（优惠券由 central-so-service 单独处理）

注意：fin_receivable.status 与 payment_refund.status 可能不同步，fin_receivable 由退款 job 更新，payment_refund 由支付网关回调更新。两者状态不一致时以 payment_refund 为准（反映实际退款结果）。

```sql
-- 查订单基本信息（含资产使用详情）
SELECT order_id, order_sn, user_id, purchase_id, gift_card_money, integral, integral_money,
       bonus, bonus_id, order_amount, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查财务退款总览和明细
SELECT r.receivable_no, r.reference_type, r.order_id, r.amount, r.status,
       d.amount_type, d.amount_value, d.memo
FROM yamibuy_finance.fin_receivable r
LEFT JOIN yamibuy_finance.fin_receivable_detail d ON r.receivable_no = d.receivable_no
WHERE r.order_id = 主单order_id ORDER BY r.in_dtm, d.amount_type;

-- 查现金退款状态 → 见 [Q2]

-- 查礼卡退回流水（reason_flag=1 使用，reason_flag=2 退回）+ 当前状态
SELECT l.card_id, l.use_amount, l.reason_flag, FROM_UNIXTIME(l.log_time) AS op_time,
       c.card_amount, c.use_amount AS card_used, (c.card_amount - c.use_amount) AS available_balance
FROM yamibuy_master.xysc_egift_log l
LEFT JOIN yamibuy_master.xysc_egift_card c ON l.card_id = c.card_id
WHERE l.order_id = order_id ORDER BY l.log_time;

-- 查优惠券状态
SELECT coupon_code, status, FROM_UNIXTIME(use_time) AS use_time
FROM yamibuy_mkt.mkt_coupon_code WHERE user_id = user_id ORDER BY use_time DESC LIMIT 10;
```




### 场景九：地址修改费支付查询
触发条件：客户反馈支付了地址修改费但系统查不到订单，或通过网页链接（www.yami.com/cn/goods.php?id=2107）支付后无记录

```
1. 通过邮箱获取 user_id
2. 查该用户名下是否有包含地址修改费商品（goods_id=2107）的订单
3. 查该用户在对应时间段内是否有 $17 金额的支付记录
   ↓
   用户名下有地址修改费订单？
   ├─ 有 → 正常流程，查订单状态和支付状态
   └─ 无 → 客户可能未登录账户就支付了
         ↓
         查 payment_charge 中对应时间段所有 $17 的支付记录，逐一比对
         ├─ 找到匹配的 → 确认关联的 user_id，可能是游客账户或其他账户
         └─ 未找到 → 支付可能走了老版 PHP 网站的独立支付通道（不经过新支付系统）
               → 建议客户提供银行扣款凭证（时间、金额、卡尾号），通过 Stripe Dashboard 反查
```

注意事项：
- 地址修改费商品 goods_id=2107，固定价格 $17.00
- 客户通过 www.yami.com/cn/goods.php?id=2107 链接支付时，如果未登录账户，订单不会关联到客户的 user_id
- 老版 PHP 网站的支付可能不经过新支付系统（payment_charge 表），需要通过 Stripe/PayPal 后台直接查询

```sql
-- 查用户名下是否有地址修改费订单
SELECT oi.order_id, oi.order_sn, oi.user_id, oi.order_status, oi.order_amount, FROM_UNIXTIME(oi.add_time) AS order_time
FROM yamibuy_master.xysc_order_goods og
JOIN yamibuy_master.xysc_order_info oi ON og.order_id = oi.order_id
WHERE og.goods_id = 2107 AND oi.user_id = user_id;

-- 查指定时间段内所有地址修改费订单（用于反查）
SELECT oi.order_id, oi.order_sn, oi.user_id, oi.order_status, oi.order_amount, oi.pay_id, oi.source_flag, FROM_UNIXTIME(oi.add_time) AS order_time
FROM yamibuy_master.xysc_order_goods og
JOIN yamibuy_master.xysc_order_info oi ON og.order_id = oi.order_id
WHERE og.goods_id = 2107 AND oi.add_time > UNIX_TIMESTAMP('起始时间') AND oi.add_time < UNIX_TIMESTAMP('结束时间')
ORDER BY oi.add_time;

-- 查指定时间段内所有 $17 的支付记录（用于反查）
SELECT purchase_id, amount, pay_provider, pay_status, transaction_id, platform, FROM_UNIXTIME(charge_dtm) AS charge_time
FROM yamibuy_payment.payment_charge
WHERE amount = '17.00' AND charge_dtm > UNIX_TIMESTAMP('起始时间') AND charge_dtm < UNIX_TIMESTAMP('结束时间')
ORDER BY charge_dtm;
```
