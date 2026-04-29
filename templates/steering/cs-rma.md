---
inclusion: manual
---

# RMA 售后问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为 RMA 排查类问题：
- 退货、换货、RMA、退件、return、售后
- 退款审核、补偿退款、over refund、退款超额
- 无法申请售后、无法退货、没有符合退换条件、不能申请RMA、前端无法售后
- 整单拒收、缺货发货、combo商品退货、bundle商品退货
- 礼品卡退款、虚拟礼卡退款

## 常用数据库表
- `yamibuy_master`.`xysc_order_info` — 订单基本信息
- `yamibuy_master`.`xysc_order_goods` — 订单商品信息
- `yamibuy_so`.`so_tracking_info` — 物流追踪
- `yamibuy_rma`.`rma_order` — RMA 单主表
- `yamibuy_rma`.`rma_order_detail` — RMA 商品明细
- `yamibuy_rma`.`rma_rule` — RMA 规则（售后天数）
- `yamibuy_rma`.`category_rule` — 分类规则配置

> 枚举值见 `enum-values.md`（rma_order.status / rma_type / request_type / source / seller_type / rma_rule 天数 / im_item_extend.clone_type / xysc_order_info.source_flag 等）。

### rma_rule 当前配置速查
| rule_id | 客观自营(obj_ym) | 客观第三方(obj_tp) | 主观自营(sbj_ym) | 主观第三方(sbj_tp) |
|---------|-----------------|-------------------|-----------------|-------------------|
| 1 | 90天 | 联系客服(-2) | 联系客服(-2) | 联系客服(-2) |
| 2 | 不支持(0) | 7天 | 不支持(0) | 联系客服(-2) |
| 3 | 联系客服(-2) | 联系客服(-2) | 联系客服(-2) | 联系客服(-2) |
| 4 | 不支持(0) | 不支持(0) | 不支持(0) | 不支持(0) |
| 5 | 7天 | 7天 | 7天 | 7天 |
| 6 | 30天 | 30天 | 30天 | 30天 |
| 7 | 3天 | 3天 | 3天 | 3天 |

> 实际售后截止 = 送达时间 + rule天数 + offset（Apollo 配置 `rma.rule.offset.time`）

## 排查场景

### 场景一：客人无法在前端申请售后（提示"没有符合退换条件的商品"）

```
1. 查日志（search.py -s ec-rma -k "email或order_sn" -t 7d）
2. 并行查数据库：订单信息 + 物流送达时间 + 商品RMA规则 + 已有RMA记录 + 取消状态
3. 按以下顺序逐项排查（任一不满足即为原因）：
   ├─ 订单状态不对？→ 必须是 512(已发货已支付) 或 484(部分退款)
   ├─ order_type 被排除？→ order_type=1(抽奖)/2(代金券)/7(虚拟礼卡) 不可前端RMA
   ├─ vendor_id > 0？→ 第三方订单前端不可RMA（FBY vendor_id=-1 可以；第三方预售 order_type=6 vendor_id>0 也不可）
   ├─ source_flag 被排除？→ 9(补发单)/11,12(TikTok渠道) 不可RMA
   ├─ 未送达？→ so_tracking_info 中无 delivery_status=1 的记录
   ├─ 已取消？→ xysc_order_cancel_status 有取消记录
   ├─ 商品是赠品(is_gift=1)？→ 赠品不支持单独RMA
   ├─ 商品已全部退过？→ 已退数量 >= 购买数量
   ├─ 商品是 Combo(clone_type=3) 或 Bundle(clone_type=5)？→ 前端会拆成子品展示，用子品（原品）申请RMA，正常可退
   ├─ 售后超期？→ 送达天数 > RMA规则天数 + offset（最常见原因）
   ├─ 分类未配置售后原因？→ category_rule 无记录，前端无法展示原因选项
   └─ 以上都不是 → 根据日志中的具体错误定位
```

```sql
-- 查订单基本信息
SELECT order_id, order_sn, order_type, vendor_id, order_status, shipping_status, pay_status,
       source_flag, is_separate, order_amount, integral_money, gift_card_money,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '{订单号}';

-- 查物流送达时间
SELECT order_id, delivery_status, FROM_UNIXTIME(delivery_time) AS delivery_time
FROM yamibuy_so.so_tracking_info WHERE order_id = {子单order_id} AND delivery_status = 1;

-- 查商品RMA规则天数
SELECT a.item_number, a.rule_id, b.obj_ym_refund, b.sbj_ym_refund, b.obj_tp_refund, b.sbj_tp_refund
FROM yamibuy_master.xysc_order_goods a
LEFT JOIN yamibuy_rma.rma_rule b ON a.rule_id = b.rule_id
WHERE a.order_id = {订单ID};

-- 查已有RMA记录
SELECT rd.rma_id, rd.item_number, rd.request_count, ro.status
FROM yamibuy_rma.rma_order_detail rd
JOIN yamibuy_rma.rma_order ro ON rd.rma_id = ro.rma_id
WHERE rd.order_id = {订单ID};

-- 查取消状态
SELECT * FROM yamibuy_master.xysc_order_cancel_status WHERE order_id = {订单ID};

-- 查分类售后原因配置（分类未配置时前端无法展示原因选项）
SELECT rule_id, category_id, reason_id FROM yamibuy_rma.category_rule WHERE category_id IN
  (SELECT DISTINCT cat_id_1 FROM yamibuy_master.xysc_order_goods WHERE order_id = {订单ID});
```

> vendor_id 判断逻辑：vendor_id=0 为自营；vendor_id>0 且 order_type in (1,5,7) 视为自营；其他为第三方。
> 售后期限 = 送达时间 + RMA规则天数 + Apollo配置offset(rma.rule.offset.time)。
> 规则天数含义：-2=联系客服 / -1=不限天数 / 0=不支持 / >0=天数，枚举值见 enum-values.md。
> 前端不可RMA但需 Central 后台操作的情况：
> - 虚拟礼品卡(order_type=7)：Central 可发起但必须全额退且礼卡未使用
> - 第三方订单(vendor_id>0)：Central 可发起（条件：未取消且已支付）
> - 第三方预售(order_type=6, vendor_id>0)：同第三方订单
> - Combo/Bundle 子商品关系已删除时：Central 只能发起"仅退款"
> - FBY(order_type=5) 子单不支持整单拒收

### 场景二：RMA 退款审核提示"订单中商品有补偿退款"/ over refund

```
1. 查日志（search.py -s ec-rma -k "order_sn或rma_id" -t 7d 或 search.py -s central-rma -k "order_sn或rma_id" -t 7d）
2. 查数据库确认退款金额：
   ├─ 订单总金额 = order_amount + integral_money + gift_card_money
   ├─ 已退金额 = RMA已退金额 + 补偿退款金额
   └─ 已退金额 >= 订单总金额 → over refund，不能通过
3. 已退金额 < 订单总金额 → 弹窗点击"审核通过"即可继续
```

```sql
-- 查订单总金额
SELECT order_id, order_sn, order_amount, integral_money, gift_card_money
FROM yamibuy_master.xysc_order_info WHERE order_sn = '{订单号}';

-- 查 RMA 已退金额
SELECT SUM(refund_amount) AS rma_refunded FROM yamibuy_rma.rma_order
WHERE order_sn = '{订单号}' AND status IN (10, 11);

-- 查补偿退款金额
SELECT SUM(refund_amount) AS total_refund FROM yamibuy_master.xysc_refund_apply
WHERE order_sn = '{订单号}' AND audit_status = 2;
```

> RMA 退款单和订单补偿目前没有做关联，审核 RMA 单时需先确认该订单有没有补偿金额。

### 场景三：RMA 单查询/展示异常

```
1. 查日志（search.py -s ec-rma -k "rma_id或order_sn" -t 7d）
2. 根据日志定位：
   ├─ 商品关联异常 → 商品在创建 RMA 后变成了 combo/bundle，导致子品拆分逻辑异常
   │   → 查 im_item_relation 中商品关联时间是否晚于 RMA 创建时间
   └─ 其他异常 → 根据日志错误信息定位
```

### 场景四：客人想取消或修改已提交的 RMA 单

```
1. 查日志（search.py -s ec-rma -k "email或rma_id" -t 7d）
2. 查 RMA 单当前状态
3. 判断是否可操作：
   ├─ 取消：状态必须为 0(待审核) / 1(已批准) / 3(待处理) / 4(待处理2)
   ├─ 编辑：状态必须为 0(待审核) / 4(待处理2)
   └─ 其他状态 → 不可取消/编辑，告知客服当前状态
```

```sql
SELECT rma_id, order_id, status, rma_type, request_type, source,
       FROM_UNIXTIME(in_dtm) AS create_time
FROM yamibuy_rma.rma_order WHERE rma_id = {rma_id};
```

### 场景五：退款时间限制
触发条件：客服询问退款是否受时间限制

```
客服提供了什么信息？
├─ 有订单号 → 查 xysc_order_info 获取 add_time 和 pay_provider
├─ 有 user_id / 邮箱 → 查最近订单
└─ 只有时间描述 → 根据描述判断
↓
判断退款是否受限：
├─ 微信支付（pay_provider 含 wechat）且下单超过一年 → 无法退款（微信支付接口限制）
├─ 超过半年的订单 → 可能无法通过 RMA/Central 取消退款（取决于支付渠道限制）
│   → 查日志确认支付渠道是否支持
│     search.py -s ec-payment -k "purchase_id值" -t 7d
└─ 未超时间限制 → 正常退款流程

退款扣积分条件：(order_type=5 或 vendor_id=0) 且 source_flag≠9 且 order_type≠7
即：自营/FBY 订单扣积分，补发单和虚拟礼卡不扣
```

```sql
-- 查订单下单时间和支付方式
SELECT order_id, order_sn, order_type, vendor_id, source_flag,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '{订单号}';

-- 查支付渠道
SELECT purchase_id, pay_provider, FROM_UNIXTIME(charge_dtm) AS charge_time
FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';
```

## 注意事项
- RMA 退税是自动的，税按商品维度自动退
- RMA 退款上限 = 主订单总金额(order_amount + integral_money + gift_card_money) - 已退金额(RMA已退 + 补偿退款)
- 冻品/特殊存储类型商品(storage_type≠0 或 parent_category_id=300)需要选择退款比例
- 部分商品退款接口调用失败时需手动退款（找 Phoebe）
- FBY 订单退款按商家子单分别退款
