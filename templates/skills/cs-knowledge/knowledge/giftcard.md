---
inclusion: manual
---

# 礼卡问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为礼卡排查类问题�?
- 礼卡、礼品卡、gift card、电子礼卡、实体礼�?
- 礼卡充值、礼卡兑换、礼卡绑定、礼卡激�?
- 礼卡过期、礼卡停用、无法兑�?
- 礼卡退款、礼卡部分退�?

## 常用数据库表
- `yamibuy_master`.`xysc_egift_card` - 礼卡信息表（is_redeem 是否兑换、redeem_user 兑换人、cvv_code 兑换码、source_order_sn 来源订单�?
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（receive_type 接收方式�?=直充账户 2=发送邮箱、receive_emails 接收邮箱�?
- `yamibuy_master`.`xysc_egift_log` - 礼卡操作流水表（card_id 礼卡ID、use_amount 操作金额、order_id/order_sn 关联订单、reason_flag：1=使用扣款 2=退回返还、log_time 操作时间）


## 订单礼卡支付字段说明（禁止混淆）
- **`xysc_order_info.gift_card_money`** — 订单中礼卡支付金额（正确字段）
- `xysc_order_info.surplus` — 余额/预存款支付金额，**不是礼卡字段，禁止混淆**
- `xysc_order_info.redeemed_amount` — 兑换金额
- 判断订单是否使用礼卡，必须查 `gift_card_money` 字段，禁止用 `surplus` 判断
## 关键字段说明
- `giftcard_status`（商品价格配置表 `im_item_price_setting` / `im_item_area_price_setting` 字段）：表示商品是否支持礼卡专享价
  - `1` = 礼卡专享商品（常量 `ECSOConstant.IS_GIFTCARD = 1`），使用 `giftcard_price` 作为礼卡支付时的专享价
  - `0` = 非礼卡专享商品，普通价格
  - `null` = 未设置，等同于非礼卡专享商品（代码中多处做 `!= null` 判断）

## 常用工具
- Central 礼卡查询：https://central.yamibuy.net/crm/index.html?v=v1.3.7#/crm/giftCardDetail

## 排查场景

### 场景一：电子礼卡未收到 / 需要充�?
触发条件：客人反馈没收到礼卡邮件、需要帮忙充�?

排查步骤�?
1. 查询订单关联的礼卡信息：
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_egift_card` WHERE `source_order_sn` = '订单�?;
   ```
2. 查询礼卡接收方式�?
   ```sql
   SELECT receive_type, receive_emails FROM `yamibuy_so`.`so_order_ext` WHERE `order_id` = 'order_id';
   ```
   - receive_type=1：直充账�?
   - receive_type=2：发送到邮箱
3. 如果邮件已发送但用户未收到，可直接查询兑换码私发给客�?

### 场景二：实体礼卡无法兑换
触发条件：客人反馈实体礼卡无法绑定、提示卡号或验证码错�?

排查步骤�?
1. 确认卡号输入格式正确（中间不需要空格）
2. 查询礼卡信息�?
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_egift_card` WHERE `card_number` = '卡号';
   ```
3. 如果 source_order_id=0，说明礼卡未与订单绑定，需用户提供订单�?
4. 常见原因�?
   - 仓库出库时未做礼卡出库，礼卡未激�?
   - 需�?Tina �?Central 进行手动激�?
5. 实体礼卡�?Central 查到的前提是订单在仓库发货完成后

### 场景三：礼卡与订单绑定关系错�?
触发条件：礼卡绑定了错误的订�?

排查要点�?
- 实体礼卡不能售后，退货后礼卡状态可能仍为已绑定
- 退货的实体礼卡可能被再次发给其他客�?
- 用旧订单号可以查到礼卡，用新订单号查不到
- 如需修改绑定关系，需更新数据

### 场景四：退款时礼卡已过�?
触发条件：退款涉及已过期的礼�?

排查要点�?
- 退卡时如果原卡过期，系统会生成新卡
- �?Central 订单详情页的退款记录中，点击礼卡旁边的"更多"按钮查看礼卡信息和截止时�?

### 场景五：礼卡部分退�?
触发条件：需要对礼卡订单进行部分退�?

排查要点�?
- 原则上不支持礼卡部分退�?
- 可尝试通过订单补偿方式退�?
- 如果仍不行，需找财务处�?

### 场景六：礼卡派发邮件未收�?
触发条件：客人购买礼卡后接收人未收到邮件

排查步骤�?
1. 查询 ec-so-job 日志确认邮件是否发送（搜索 "pay git card order success send email"�?
2. 直接查询礼卡兑换码：
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_egift_card` WHERE `source_order_sn` = '订单�?;
   ```
3. 将兑换码私发给客�?


## 礼卡退款排查强制步骤（涉及礼卡使用/退回时必须全部执行）
1. 查 `xysc_order_info.gift_card_money` — 确认订单是否使用了礼卡及金额
2. 查 `xysc_egift_log`（按 order_id 或 card_id）— 确认礼卡使用和退回的完整操作流水（reason_flag=1 使用，reason_flag=2 退回）
3. 查 `xysc_egift_card`（按 card_id 或 redeem_user）— 确认礼卡当前状态（card_amount、use_amount、is_refund、expired_time）
- 三张表缺一不可，禁止只查其中一张就下结论
- 禁止用 `surplus` 字段判断礼卡使用情况
## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 实体礼卡不能售后，可能出现卡号泄露问�?
- 礼卡停用后需要用户提供订单号才能重新激�?
- 会员升级礼卡查询：`SELECT * FROM yamibuy_master.xysc_egift_card WHERE activity_id = 400`
