---
inclusion: manual
---

# 礼卡问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为礼卡排查类问题：
- 礼卡、礼品卡、gift card、电子礼卡、实体礼卡
- 礼卡充值、礼卡兑换、礼卡绑定、礼卡激活
- 礼卡过期、礼卡停用、无法兑换
- 礼卡退款、礼卡部分退款
- 礼卡邮件、没收到礼卡、gift card email

## 常用数据库表
- `yamibuy_master`.`xysc_egift_card` - 礼卡信息表（is_redeem=是否兑换、redeem_user=兑换人、cvv_code=兑换码、source_order_sn=来源订单号）
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（receive_type=接收方式、receive_emails=接收邮箱）
- `yamibuy_master`.`xysc_egift_log` - 礼卡操作流水表

> 字段枚举值见 `.kiro/skills/enum-values.md`

## 订单礼卡支付字段说明（禁止混淆）
- `xysc_order_info.gift_card_money` — 订单中礼卡支付金额（正确字段）
- `xysc_order_info.surplus` — 余额/预存款支付金额，**不是礼卡字段，禁止混淆**
- 判断订单是否使用礼卡，必须查 `gift_card_money` 字段

## 常用查询

### [Q1] 按订单号查礼卡信息

```sql
SELECT card_id, card_number, cvv_code, card_amount, use_amount,
       (card_amount - use_amount) AS available_balance,
       is_active, is_redeem, redeem_user, source_order_sn,
       FROM_UNIXTIME(expired_time) AS expired_time
FROM yamibuy_master.xysc_egift_card WHERE source_order_sn = '订单号';
```

### [Q2] 按卡号查礼卡信息

```sql
SELECT card_id, card_number, cvv_code, card_amount, use_amount,
       (card_amount - use_amount) AS available_balance,
       is_active, is_redeem, redeem_user, source_order_sn,
       FROM_UNIXTIME(expired_time) AS expired_time
FROM yamibuy_master.xysc_egift_card WHERE card_number = '卡号';
```

## 排查场景

### 场景一：电子礼卡未收到 / 派发邮件未收到 / 需要充值
触发条件：客人反馈没收到礼卡邮件、购买礼卡后接收人未收到邮件、需要帮忙充值

```
客服提供了什么信息？
├─ 有订单号 → 并行查询：
│   1. [Q1] xysc_egift_card 获取礼卡信息
│   2. so_order_ext 获取接收方式
│   3. so_order_purchase_record 确认预占状态（status=3 为支付成功）
│   4. payment_charge_order 确认授信/capture 状态（status=60 为已capture）
│   ↓
│   礼卡是否已生成？（xysc_egift_card 有记录？）
│   ├─ 无记录 → 检查预占和支付状态，定位卡在哪个环节
│   └─ 有记录 → 礼卡是否已被兑换？（is_redeem=1？）
│              ├─ 已兑换 → 查 redeem_user 是否为下单人本人
│              │   ├─ 是本人 → 礼卡已在账户中，引导客人查看余额
│              │   └─ 非本人 → 正常（礼卡发送给他人场景），告知客服兑换人信息
│              └─ 未兑换 → 按下方 receive_type 分支继续排查邮件发送情况
│   ↓
│   receive_type = ?
│   ├─ 1（直充账户）→ 查日志确认充值是否成功
│   │   search.py -s ec-so-job -k "订单号" -t 7d
│   │   ├─ 充值成功 → 礼卡已充入账户，引导客人在账户余额中查看
│   │   └─ 充值失败/无日志 → 联系开发排查充值流程
│   └─ 2（发送邮箱）→ 查日志确认邮件是否发送成功
│       search.py -s ec-so-job -k "订单号" -t 7d
│       ├─ 发送成功 → 请客人检查垃圾邮件，或直接将兑换码私发给客人
│       └─ 发送失败/无日志 → 直接将兑换码私发给客人
└─ 只有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id
             → 查最近的礼卡订单
             → 拿到订单号后按上面流程排查
```

按订单号查礼卡 → 见 [Q1]

```sql
-- 有订单号时：查接收方式（与上条并行）
SELECT receive_type, receive_emails FROM yamibuy_so.so_order_ext WHERE order_id = order_id;

-- 只有邮箱时：通过 user_id 查最近礼卡订单（order_type=7 为虚拟礼卡订单）
SELECT order_id, order_sn, order_type, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info
WHERE user_id = user_id AND order_type = 7 ORDER BY add_time DESC LIMIT 5;
```

### 场景二：实体礼卡无法兑换
触发条件：客人反馈实体礼卡无法绑定、无法兑换、提示卡号或验证码错误

```
客服提供了什么信息？
├─ 有卡号 → 用卡号查 xysc_egift_card
│   ↓
│   is_redeem = ?
│   ├─ 1 → 礼卡已被兑换，查 redeem_user 确认是否本人
│   └─ 0 → 礼卡未被兑换，是否已激活？（is_active = 1 为已激活）
│          ├─ 已激活 → 告知客服提醒用户：卡号输入格式中间不需要空格，重新尝试
│          └─ 未激活 → 仓库出库时未做礼卡出库
│                    → 需 Tina 在 Central 手动激活
│                    Central 礼卡查询：https://central.yamibuy.net/crm/index.html?v=v1.3.7#/crm/giftCardDetail
└─ 有订单号 → 用订单号查 xysc_egift_card 获取卡号和 cvv_code
            → 将卡号和兑换码告知客服
            → 提醒用户：卡号输入格式中间不需要空格
同步查日志交叉验证：
search.py -s ec-so -k "卡号或订单号" -t 7d
关注日志：兑换请求的错误信息、卡状态校验结果
```

### 场景三：实体礼卡绑定错误订单
触发条件：礼卡绑定了错误的订单

```
1. 用旧订单号查 xysc_egift_card 确认礼卡信息
   ↓
   查到礼卡？
   ├─ 是 → 确认礼卡当前绑定的 source_order_sn
   │       → 实体礼卡不能售后，退货后礼卡状态可能仍为已绑定
   │       → 退货的实体礼卡可能被再次发给其他客人
   │       → 如需修改绑定关系，联系开发更新数据
   └─ 否 → 用新订单号查不到是正常的，需用旧订单号查
同步查日志交叉验证：
search.py -s ec-so -k "订单号或卡号" -t 30d
关注日志：礼卡绑定/解绑操作记录
```

按订单号查礼卡 → 见 [Q1]

### 场景四：退款时礼卡已过期
触发条件：退款涉及礼卡但原卡已过期

```
退卡时原卡是否过期？（expiredTime != 0 且当前时间 > expiredTime）
├─ 是 → 系统自动生成新卡退到用户账户
│       新卡规则（源码确认）：
│       - 新卡金额 = 退款金额
│       - 新卡有效期 = 退款时间 + 90 天
│       - 新卡自动激活并兑换到原用户账户（isRedeem=1）
│       - 新卡 sourceFlag=4（退款生成）
│       → 查 xysc_egift_card WHERE redeem_user = user_id ORDER BY add_time DESC 找到新卡
│       → 或在 Central 订单详情页退款记录中点击礼卡旁"更多"按钮查看
└─ 否 → 退回原卡，查 xysc_egift_log 确认退回记录（reason_flag=2）
```

```sql
-- 查用户最近生成的退款新卡（sourceFlag=4 为退款生成）
SELECT card_id, card_number, cvv_code, card_amount, use_amount,
       FROM_UNIXTIME(add_time) AS create_time, FROM_UNIXTIME(expired_time) AS expired_time
FROM yamibuy_master.xysc_egift_card
WHERE redeem_user = user_id AND source_flag = 4 ORDER BY add_time DESC LIMIT 5;
```

### 场景五：礼卡部分退款
触发条件：客人要求礼卡部分退款

```
客服提供了什么信息？
├─ 有订单号 → 用订单号查 xysc_egift_card 找到礼卡
├─ 有礼卡号码 → 直接用卡号查 xysc_egift_card
└─ 只有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id → 查 xysc_egift_card WHERE redeem_user = user_id
↓
查到礼卡后，确认礼卡当前余额：card_amount - use_amount = 可用余额
↓
告知客服：
- 礼卡不支持部分退款
- 当前礼卡可用余额为 xxx
- 如果确认要给客人退款，可以通过订单补偿方式退款
```

按订单号查礼卡 → 见 [Q1]

按卡号查礼卡 → 见 [Q2]

```sql
-- 只有邮箱时（脚本获取 user_id 后）
SELECT card_id, card_number, card_amount, use_amount,
       (card_amount - use_amount) AS available_balance,
       FROM_UNIXTIME(expired_time) AS expired_time
FROM yamibuy_master.xysc_egift_card WHERE redeem_user = user_id ORDER BY add_time DESC;
```

> ⚠️ 概念区分：
> - "礼卡部分退款"指客人主动要求只退礼卡中的一部分金额（如卡面 $700 只退 $200），此场景不支持。
> - "订单退款退回礼卡"指订单退款时，按订单中礼卡实际支付金额退回原卡（如 $700 的卡用了 $50，退款退回 $50），此为系统正常行为，在 xysc_egift_log 中 reason_flag=2 体现。

## 注意事项
- 实体礼卡不能售后，可能出现卡号泄露问题
- 礼卡停用后需要用户提供订单号才能重新激活
- 会员升级礼卡查询：`SELECT * FROM yamibuy_master.xysc_egift_card WHERE activity_id = 400`
- 礼卡退款排查（涉及礼卡使用/退回）详见 cs-payment-refund.md 场景八
