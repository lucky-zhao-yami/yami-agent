---
inclusion: auto
---

# 支付与退款问�?- 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为支�?退款排查类问题�?- 支付失败、扣款、重复扣款、被扣款、银行卡、信用卡
- 退款、退款失败、退款未到账、退款异�?- stripe、paypal、微信支付、支付宝、venmo、apple pay
- CVC、银行拒付、拒付、charge back、争�?- 支付成功没订单、扣款没订单、pending
- 盗刷、刷单、异常扣款、不明扣款、卡被盗用、银行卡被扣
- 售后风险、关联账户、pay_by_id、支付账户关联、多账号共用支付
- 授信、授权、capture、取消授权、未扣款、hold、pending扣款、部分扣�?
## 常用数据库表
- `yamibuy_so`.`so_order_purchase_record` - 用户支付记录（根�?user_id 查询�?- `yamibuy_payment`.`payment_charge` - 支付状态表（根�?purchase_id 查询；charge_type=1 表示授信模式，settlement_amount 为实际结算金额）
- `yamibuy_payment`.`payment_charge_order` - 按订单维度的授信/capture 记录（order_id、amount、status、auth_type；关键字段：auth_dtm=授权时间、submit_dtm=capture时间、cancel_dtm=取消授权时间，时间戳单位为毫秒）
- `yamibuy_payment`.`payment_charge_order_log` - 授信操作日志（type�?=capture成功�?=取消授权�?=取消中�?=失败；content 字段�?Stripe 完整响应 JSON�?- `yamibuy_payment`.`payment_refund` - 退款记录表（根�?purchase_id 查询�?- `yamibuy_payment`.`payment_refund_paypal` - PayPal 退款详�?- `yamibuy_payment`.`payment_charge_card_stripe` - Stripe 信用卡支付详情（tx_id �?charge_response�?- `yamibuy_payment`.`payment_profile_card` - 用户绑定的银行卡信息（tail=卡尾号, exp_year=过期年, exp_month=过期月, cvv_response_code=CVC验证结果, avs_response_code=地址验证结果, status=状态：0=已删除, 10=初始化, 50=注册失败, 60=注册成功）
- `yamibuy_payment`.`payment_attempts_log` - 支付尝试日志（customer_id=用户ID, error_code=失败原因如incorrect_cvc/card_declined, status=状�? response_data=完整响应�?- `yamibuy_master`.`xysc_order_info` - 订单基本信息（含 purchase_id�?
- `yamibuy_finance`.`fin_receivable` - 财务应退账款主表（reference_type：1=全单取消 2=手动退款 3=补偿/RMA退款；status：0=待处理 1=已完成）
- `yamibuy_finance`.`fin_receivable_detail` - 财务应退账款明细（amount_type：1=现金 2=礼卡 3=积分）
## 常用工具
- Stripe 后台：https://dashboard.stripe.com/dashboard（Renee 有账号）
- Central 支付记录查询：https://central.yamibuy.net/so/index.html?v=#/so/customerPaymentCharge
- Kibana ec-payment-service 日志：索�?`k8s-ec-payment-service-log-*`

## 排查场景

### 场景一：支付失�?触发条件：客人反馈支付失败、银行卡无法使用、提示更换支付方�?
排查步骤�?1. 根据邮箱�?Central 查到 user_id
2. 查询用户支付记录�?   ```sql
   SELECT * FROM `yamibuy_so`.`so_order_purchase_record` WHERE `user_id` = 'user_id' ORDER BY in_dtm DESC LIMIT 20;
   ```
3. 根据 purchase_id 查询支付状态：
   ```sql
   SELECT * FROM `yamibuy_payment`.`payment_charge` WHERE `purchase_id` = 'purchase_id';
   ```
4. 查询支付尝试日志，获取具体失败原因：
   ```sql
   SELECT rec_id, purchase_id, tx_id, status, error_code, FROM_UNIXTIME(in_dtm) as attempt_time FROM yamibuy_payment.payment_attempts_log WHERE customer_id = 'user_id' ORDER BY rec_id DESC;
   ```
   error_code 常见值：`incorrect_cvc`（CVC错误）、`card_declined`（银行拒付）�?5. 如果�?Stripe 支付，可�?Stripe 后台根据邮箱搜索查看拦截原因
5. 常见失败原因�?   - CVC 验证不通过（即�?CVC 正确，Stripe 有时也会返回不通过�?   - 银行拒付（需联系发卡银行�?   - 支付网关异常（如 PayPal 网关问题，建议稍后重试）
6. 如果 CVC 正确但被 Stripe 拦截，确认是用户本人的卡后，可找 Phoebe 加入白名�?
### 场景 1.1：银行卡有效期不符导致支付失�?触发条件：顾客反�?CVC 错误，发卡银行告知亚米保存的有效期与实际不符

排查步骤�?1. 通过 Central 后台用邮箱搜索获�?user_id
2. 查询用户绑定的银行卡信息�?   ```sql
   SELECT rec_id, profile_id, user_id, card_type, head, tail, exp_year, exp_month, status, FROM_UNIXTIME(in_dtm) as created, FROM_UNIXTIME(edit_dtm) as edited FROM yamibuy_payment.payment_profile_card WHERE user_id = 'user_id' AND status = 60;
   ```
3. 核对 exp_year �?exp_month 是否与顾客实际卡片有效期一�?4. 如果不一致，建议顾客在亚米账户中删除该银行卡，重新添加并确认有效期填写正�?5. 也可�?`yamibuy_master.xysc_user_profile` 表（旧系统卡信息，同样有 exp_year、exp_month 字段�?
### 场景二：支付成功但没有订单（扣款没订单）
触发条件：客人反馈被扣款但没有订单号

排查步骤�?1. 根据邮箱查到 user_id
2. 查询用户支付记录�?   ```sql
   SELECT * FROM `yamibuy_so`.`so_order_purchase_record` WHERE `user_id` = 'user_id' ORDER BY in_dtm DESC LIMIT 20;
   ```
3. 拿到 purchase_id 后查 Kibana ec-payment-service 日志
4. 在订单表确认订单是否生成�?   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_order_info` WHERE `purchase_id` = 'purchase_id';
   ```
5. 在退款表确认是否已自动退款：
   ```sql
   SELECT * FROM `yamibuy_payment`.`payment_refund` WHERE `purchase_id` = 'purchase_id';
   ```
6. 常见原因�?   - 支付成功时临时订单已取消，系统会自动退�?   - 数据库连接超时导致订单落库失败（已基本修复）
   - 用户在扫码付款过程中点了关闭，系统会自动退�?7. 如果系统未自动退款，需�?Phoebe 手动调用退款接�?
### 场景三：重复扣款
触发条件：客人反馈被扣了两次�?
排查步骤�?1. 根据订单号在 Central 查询用户邮箱
2. �?Stripe 后台根据邮箱查询支付记录，确认是否真的有重复扣款
3. 也可查询数据库：
   ```sql
   SELECT * FROM `yamibuy_payment`.`payment_charge` WHERE `purchase_id` = 'purchase_id';
   ```
4. 大多数情况下 Stripe 只有一次扣款，用户看到�?两笔"可能是：
   - 一笔是扣款，一笔是退款处理中
   - 银行�?pending 记录（并非实际扣款）
5. 如果确认只有一次扣款，回复客服让用户联系银行确�?6. 如果确实重复扣款，检查退款表是否已自动退�?
### 场景四：退款未到账
触发条件：客人反馈取消订单后未收到退�?
排查步骤�?1. Central 查询订单状态，确认是否已退�?2. 如果 Central 显示已退款，�?Stripe 后台查询退款记�?3. Stripe 退款成功后，点�?查看详情"获取收单行参考号�?ARN)
4. �?ARN 截图发给客服，让客人联系银行根据 ARN 查询退款状�?5. 退款到账时间参考：
   - Stripe/信用卡：3-5 个工作日
   - PayPal：参�?https://www.paypal.com/c2/cshelp/article/where-is-my-refund-help130
   - 微信支付：订单超过一年无法退�?
### 场景五：退款失�?触发条件：退款操作失败、退款异�?
排查步骤�?1. 查询退款记录：
   ```sql
   SELECT * FROM `yamibuy_payment`.`payment_refund` WHERE `purchase_id` = 'purchase_id';
   ```
2. 如果�?PayPal，查�?PayPal 退款详情：
   ```sql
   SELECT * FROM `yamibuy_payment`.`payment_refund_paypal` WHERE `refund_id` = 'refund_id';
   ```
3. 常见退款失败原因：
   - 微信支付订单超过一年，无法退�?   - PayPal 用户开启了争议(dispute)，无法退款，需用户联系银行
   - 交易有争议且亚米获胜，不会自动退款；如需退款需�?Phoebe 单独调用接口
   - 退款金额超过可退金额（用户同时发起了银行争议和网站退款）

### 场景 5.1：订单取消后无退款记录（授信模式�?触发条件：客人反馈取消订单后未收到退款，�?`payment_refund` 表中无退款记�?
背景知识�?- Stripe 信用卡支付支�?*先授权后扣款（capture_method=manual�?*模式，即授信模式
- 下单�?Stripe 对信用卡进行授权（authorize），冻结对应金额，但不实际扣�?- 发货时才进行 capture（实际扣款）
- 如果订单在发货前取消，只需释放授权（cancel authorization），不需要退�?- `payment_charge.charge_type=1` 表示该笔支付使用了授信模�?
排查步骤�?1. 查询订单基本信息，确�?purchase_id�?   ```sql
   SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status, order_amount, FROM_UNIXTIME(add_time) AS order_time FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单�?;
   ```
2. 查询支付主表，确认是否为授信模式�?   ```sql
   SELECT purchase_id, amount, settlement_amount, pay_status, charge_type, settlement, transaction_id FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';
   ```
   - `charge_type=1`：授信模�?   - `settlement_amount`：实际结算（capture）金额，可能小于授权总金�?`amount`
3. 查询按订单维度的授信状态（注意：时间戳单位为毫秒，需除以 1000）：
   ```sql
   SELECT rec_id, order_id, purchase_id, amount, status, auth_type, FROM_UNIXTIME(auth_dtm/1000) AS auth_time, FROM_UNIXTIME(submit_dtm/1000) AS capture_time, FROM_UNIXTIME(cancel_dtm/1000) AS cancel_time FROM yamibuy_payment.payment_charge_order WHERE order_id = 订单ID;
   ```
   - `status=50`：已取消授权（未实际扣款�?   - `status=60`：已 capture（已实际扣款�?   - `submit_dtm` 有值：说明�?capture
   - `cancel_dtm` 有值：说明已取消授�?4. 查询授信操作日志确认操作详情�?   ```sql
   SELECT rec_id, order_id, type, content, FROM_UNIXTIME(in_dtm/1000) AS log_time FROM yamibuy_payment.payment_charge_order_log WHERE order_id = 订单ID ORDER BY rec_id;
   ```
   - `type=1`：capture 成功
   - `type=2`：取消授�?   - `type=3`：取消中
   - `type=4`：失�?   - `content` 字段�?Stripe 完整响应 JSON，可查看 `amountReceived`（实际扣款）�?`amountRefunded`（释放金额）

常见场景分析�?- **合并支付拆单场景**：多个订单共用一�?purchase_id，Stripe 一次性授权总金额。部分订单取消时，取消的订单释放授权（status=50），发货的订�?capture（status=60）。Stripe 会在 capture 时自动对�?capture 部分�?partial_capture refund（reason=`partial_capture`），这不是真正的退�?- **全部取消场景**：所有订单都取消，全部授权释放，settlement_amount=0
- **客户看到�?退�?**：银行账单上的授�?hold（pending）会在授权释放后 3-7 个工作日自动消失，不同银行释放时间不�?
结论模板�?- 如果 `payment_charge_order.status=50` �?`cancel_dtm` 有值：订单在发货前取消，授权已释放，未实际扣款，`payment_refund` 无记录是正确的。银行卡上的 hold 金额会自动释放，建议客户联系发卡银行确认释放状�?- 如果 `payment_charge_order.status=60`（已 capture）：订单已实际扣款，取消后应走正常退款流程，`payment_refund` 应有记录，无记录则为异常

### 场景六：盗刷 / 异常扣款 / 银行卡被多次扣款
触发条件：客人反馈被盗刷、银行卡被多次扣款、不明扣款、需要根据金�?时间/卡号查订�?
排查步骤�?
#### 第一步：确认客人本账号的扣款情况
1. 通过邮箱获取 user_id（Central API 自动查询�?2. 查询客人绑定的银行卡，确认涉事卡尾号�?   ```sql
   SELECT rec_id, profile_id, user_id, card_type, tail, exp_year, exp_month, status, FROM_UNIXTIME(in_dtm) AS created FROM yamibuy_payment.payment_profile_card WHERE user_id = 'user_id';
   ```
3. 查询客人近期支付记录�?   ```sql
   SELECT purchase_id, status, FROM_UNIXTIME(in_dtm) AS pay_time FROM yamibuy_so.so_order_purchase_record WHERE user_id = 'user_id' ORDER BY in_dtm DESC;
   ```
4. 根据 purchase_id 查询支付详情（金额、状态、支付方式）�?   ```sql
   SELECT purchase_id, amount, pay_provider, pay_status, transaction_id, FROM_UNIXTIME(charge_dtm) AS charge_time FROM yamibuy_payment.payment_charge WHERE purchase_id IN ('purchase_id1', 'purchase_id2') ORDER BY charge_dtm DESC;
   ```
5. 根据 purchase_id 查询对应订单，确认是否为正常下单�?   ```sql
   SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status, goods_amount, order_amount, FROM_UNIXTIME(add_time) AS order_time FROM yamibuy_master.xysc_order_info WHERE purchase_id IN ('purchase_id1', 'purchase_id2') ORDER BY add_time DESC;
   ```
6. 查询是否有退款记录：
   ```sql
   SELECT purchase_id, refund_amount, status, FROM_UNIXTIME(refund_dtm) AS refund_time FROM yamibuy_payment.payment_refund WHERE purchase_id IN ('purchase_id1', 'purchase_id2');
   ```

#### 第二步：排查绑定同一张卡的其他账号（关键步骤�?如果客人本账号的扣款都是正常订单，需要继续排查是否有其他账号盗用了该卡：
1. 通过卡尾号查询所有绑定该卡的账号�?   ```sql
   SELECT rec_id, user_id, card_type, tail, exp_year, exp_month, status, FROM_UNIXTIME(in_dtm) AS created FROM yamibuy_payment.payment_profile_card WHERE tail = '卡尾�?;
   ```
2. 对比卡信息（card_type + exp_year + exp_month）筛选出与客人同一张卡的账号：
   - 同卡类型 + 同有效期 = 高度疑似同一张卡
   - 不同卡类型或不同有效�?= 可能是不同的卡碰巧尾号相�?3. 查询这些可疑账号的近期支付记录：
   ```sql
   SELECT r.user_id, r.purchase_id, r.status, FROM_UNIXTIME(r.in_dtm) AS pay_time, c.amount, c.pay_provider, c.pay_status, c.transaction_id
   FROM yamibuy_so.so_order_purchase_record r
   LEFT JOIN yamibuy_payment.payment_charge c ON r.purchase_id = c.purchase_id
   WHERE r.user_id IN (可疑user_id列表) ORDER BY r.in_dtm DESC;
   ```
4. 重点关注以下异常信号�?   - 绑卡时间与客人反馈被扣款时间接近
   - 绑卡后短时间内密集下�?   - 多次支付失败（pay_status=50）后成功支付
   - 账号注册时间较新但消费频率异常高

#### 第三步：汇总结�?1. 列出客人本账号的正常扣款笔数和金�?2. 列出其他可疑账号的扣款笔数和金额，标注异常信�?3. 建议处理方案�?   - 如确认盗刷：冻结可疑账号，协助客人在 Stripe 后台核实并处理退�?   - 建议客人联系发卡银行挂失换卡
   - 如需进一步确认，可在 Stripe 后台根据可疑账号�?transaction_id 查看支付详情

#### 补充：根据金�?时间查订单（无卡尾号时）
如果客人只提供了扣款金额和时间，没有卡尾号：
1. 根据金额和时间范围查询支付记录：
   ```sql
   SELECT purchase_id, amount, pay_provider, pay_status, FROM_UNIXTIME(charge_dtm) AS charge_time FROM yamibuy_payment.payment_charge WHERE amount = '金额' AND charge_dtm > UNIX_TIMESTAMP('起始时间') AND charge_dtm < UNIX_TIMESTAMP('结束时间');
   ```
2. 根据 purchase_id 查订单和用户信息
3. 也可通过 Kibana 搜索 transaction_id 查找订单

### 场景七：积分预占（支付取消后积分不可用）
触发条件：客人反馈积分无法使用、支付取消后积分没返�?
排查步骤�?1. 查询用户支付记录确认是否有预占订单：
   ```sql
   SELECT * FROM `yamibuy_so`.`so_order_purchase_record` WHERE `user_id` = 'user_id' ORDER BY in_dtm DESC LIMIT 10;
   ```
2. 积分预占 15 分钟后会自动返还
3. 如果取消支付后积分未立即返还，是因为预占释放有短暂延�?
### 场景八：售后风险 - 支付账户（pay_by_id）关联多账号排查
触发条件：订单售后风险标记为 HIGH，提�?本单支付账户id有多个邮箱账户使用过"

排查步骤�?1. 通过邮箱获取 user_id（Central API 自动查询�?2. 查询该用户的支付尝试记录，获�?pay_by_id�?   ```sql
   SELECT rec_id, customer_id, purchase_id, tx_id, pay_by_id, status, error_code, FROM_UNIXTIME(in_dtm) AS attempt_time FROM yamibuy_payment.payment_attempts_log WHERE customer_id = 'user_id' ORDER BY rec_id DESC;
   ```
3. �?pay_by_id 查询所有关联的账号�?   ```sql
   SELECT customer_id FROM yamibuy_payment.payment_attempts_log WHERE pay_by_id = 'pay_by_id�? GROUP BY customer_id;
   ```
4. 批量查询关联账号的邮箱（通过 Central API �?user_id 查询，xysc_users �?email 字段已脱敏不可用�?5. 对于已删除的账号，查询已删除用户表：
   ```sql
   SELECT user_id, email, mobile_phone, parent_id, FROM_UNIXTIME(reg_time) AS reg_time FROM yamibuy_master.xysc_users_delete WHERE user_id = 已删除的user_id;
   ```
   注意：已删除用户�?email 字段也可能已脱敏，手机号字段可能未脱�?6. 查询涉事订单信息�?   ```sql
   SELECT order_id, order_sn, user_id, purchase_id, order_status, shipping_status, pay_status, goods_amount, order_amount, FROM_UNIXTIME(add_time) AS order_time FROM yamibuy_master.xysc_order_info WHERE order_sn IN ('订单�?', '订单�?');
   ```
7. 汇总分析：
   - 列出 pay_by_id 关联的所有账号（user_id + email + 状态）
   - 检查关联账号之间是否存在邀请关系（parent_id 字段�?   - 检查关联账号是否有已删除的账号
   - 检查涉事订单的状态（是否已取消、已退款等�?   - 如果该用户使用了多个不同�?pay_by_id，需逐个排查每个 pay_by_id 的关联账�?
常见风险信号�?- 同一支付账户被多个不相关的亚米账号使�?- 关联账号之间存在邀请关系（可能是为了薅邀请奖励）
- 关联账号中有已删除的账号（可能是用完即删�?- 短时间内密集下单后取�?退�?

### 场景九：退款是否到账综合排查（礼卡/积分/现金/优惠券）
触发条件：客服询问退款后礼卡/积分/现金/优惠券是否退回到账

#### 核心表说明
- `yamibuy_finance.fin_receivable` — 财务应退账款主表（记录每笔退款的总金额和状态）
  - `reference_type`：1=全单取消，2=手动退款，3=补偿退款/RMA退款
  - `status`：0=待处理，1=已完成
  - `reference_no`：关联的子单 order_id
  - `order_id`：主单 order_id
- `yamibuy_finance.fin_receivable_detail` — 财务应退账款明细表（按金额类型拆分）
  - `amount_type`：1=现金（美元），2=礼卡，3=积分（金额形式，非积分数量）
  - `amount_value`：退款金额（负数表示退出）
- `yamibuy_payment.payment_refund` — 现金退款记录（Stripe/PayPal 等实际退款状态）
  - `status`：60=退款成功

#### 排查步骤（一次性并行查询，查完后统一输出结论）
1. 查订单基本信息，获取 purchase_id、user_id、gift_card_money、integral、bonus：
   ```sql
   SELECT order_id, order_sn, user_id, purchase_id, gift_card_money, integral, integral_money, bonus, bonus_id, order_amount, FROM_UNIXTIME(add_time) AS order_time
   FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
   ```
2. 查财务应退账款（总览）：
   ```sql
   SELECT r.receivable_no, r.reference_type, r.reference_no, r.order_id, r.amount, r.status, r.in_user, FROM_UNIXTIME(r.in_dtm) AS in_time
   FROM yamibuy_finance.fin_receivable r WHERE r.order_id = 主单order_id ORDER BY r.in_dtm;
   ```
3. 查财务应退账款明细（按类型拆分）：
   ```sql
   SELECT d.receivable_no, d.amount_type, d.amount_value, d.memo
   FROM yamibuy_finance.fin_receivable_detail d
   WHERE d.receivable_no IN (上一步查到的receivable_no列表) ORDER BY d.receivable_no, d.amount_type;
   ```
4. 查现金退款实际到账状态：
   ```sql
   SELECT refund_id, purchase_id, refund_amount, status, refund_reason, FROM_UNIXTIME(refund_dtm) AS refund_time
   FROM yamibuy_payment.payment_refund WHERE purchase_id = 'purchase_id' ORDER BY refund_dtm;
   ```

#### 结论输出格式
用表格展示四类资产的退款状态：

| 资产类型 | 应退金额（fin_receivable_detail） | 实际到账 | 到账依据 |
|----------|----------------------------------|----------|----------|
| 💵 现金 | amount_type=1 的 amount_value | payment_refund.status=60 | payment_refund 表 |
| 🎁 礼卡 | amount_type=2 的 amount_value | xysc_egift_log.reason_flag=2 | xysc_egift_log 表 |
| 🎯 积分（抵扣退回） | amount_type=3 的 amount_value | crm_point 中 reason_third=1004002 且 point>0 | crm_point 表 |
| 🎟️ 优惠券 | 不在 fin_receivable 中 | mkt_coupon_code.status 恢复为未使用 | mkt_coupon_code 表 |

#### 积分说明（两种积分，退法不同）
- **积分抵扣**（`xysc_order_info.integral`）：用户下单时用积分抵扣的部分，退款时退回到积分账户，记录在 `crm_point` 表中 reason_third=1004002
- **下单赠送积分**（`crm_point` 中 reason_third=1004001）：下单后系统赠送的积分，RMA/整单取消时扣回（负积分），补偿退款通常不扣回

#### 退款执行顺序（代码来源：central-customer-service → CustomerService.refund()）
1. 退礼卡 → 2. 退积分（抵扣部分）→ 3. 退现金
- 优惠券退回由 central-so-service 通过 MKTService.refundCoupons() 单独处理，不在上述顺序中
- 每步失败会记录状态到 Redis，重试时跳过已成功的步骤

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 支付超时的订单系统会自动退款并退还优惠券
- FBY 订单退款是按商家子单分别退款的，会有多笔退款记录，且退款有 8 小时延迟
- Stripe CVC 检查有时会误判，确认是用户本人的卡可找 Phoebe 加白名单
- 支付宝可能受政策限制无法使用
- 微信旧版�?SDK �?iOS 18 某些版本中可能无法唤起支�?- `payment_charge` 表中支付方式字段�?`pay_provider`（非 pay_id），支付状态字段为 `pay_status`（非 status）；pay_status=50 表示支付失败
- `payment_charge.charge_type=1` 表示授信模式（先授权后扣款），此�?`settlement_amount` 为实�?capture 金额，可能小�?`amount`（授权总金额）
- `payment_charge_order` 表按订单维度记录授信状态，时间字段（auth_dtm、submit_dtm、cancel_dtm、in_dtm、edit_dtm）单位为毫秒，查询时需 `FROM_UNIXTIME(字段/1000)` 转换
- 授信模式下，发货前取消的订单只释放授权不退款，`payment_refund` 表无记录是正常的
- Stripe partial_capture 时会自动对未 capture 部分生成 reason=`partial_capture` �?refund 记录，这是释放授权而非真正退�?- 合并支付（多订单共用 purchase_id）场景下，部分订单取消只释放对应金额的授权，不影响其他订单的 capture
