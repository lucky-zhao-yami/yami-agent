---
inclusion: manual
---

# 优惠券/折扣码问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为优惠券排查类问题：
- 优惠券、折扣码、coupon、discount code、promo code
- 抵扣、满减、优惠码、折扣、减免、立减
- 券不能用、券无效、券过期、券没生效
- 购物车显示抵扣但结算不显示

## 常用数据库表
- `yamibuy_mkt`.`mkt_promotion_schedule` - 促销活动主表（type=12 为优惠券活动）
- `yamibuy_mkt`.`mkt_coupon_ps_code` - 折扣码与活动关联表（ps_code 关联 ps_id）
- `yamibuy_mkt`.`mkt_coupon_code` - 用户领取/使用记录
- `yamibuy_mkt`.`mkt_coupon_item` - 优惠券适用商品范围（仅 code_type=4 单品模式）
- `yamibuy_mkt`.`mkt_coupon_seller` - 优惠券适用卖家范围
- `yamibuy_im`.`im_item` - 商品主表（category_id、brand_id、seller_id）
- `yamibuy_master`.`xysc_category` - 商品分类层级表（⚠️ 不是 yamibuy_im.im_item_category，该表不存在）
- `yamibuy_master`.`xysc_order_info` - 订单信息（bonus = 优惠券实际抵扣金额）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## ⚠️ 核心业务规则
- 所有排查都依赖 ps_id，第一步必须先获取 ps_id
- 券能否使用取决于两层校验：商品适用范围（code_type）+ 金额门槛（coupon_type）
- 卖家范围：`mkt_coupon_seller` 表控制，商品 seller_id 必须在表中
- mkt 服务走 Redis 缓存判断商品范围，数据库正确不代表缓存同步

## Kibana 日志索引
- 订单服务：`search.py -s ec-so`，关键词：user_id / checkCouponBySelect
- MKT 服务：`search.py -s ec-mkt`，关键词：user_id / ps_id

## 常用查询

**[Q1] 通过折扣码查 ps_id**
```sql
SELECT ps_id, ps_code FROM yamibuy_mkt.mkt_coupon_ps_code WHERE ps_code = '折扣码';
```

**[Q2] 查活动详情（⭐一次性提取所有排查字段）**
```sql
SELECT ps_id, ps_title, status, type, FROM_UNIXTIME(start_time) AS start_date,
       FROM_UNIXTIME(end_time) AS end_date,
       JSON_EXTRACT(ps_content, '$.couponContent.coupon_type') AS coupon_type,
       JSON_EXTRACT(ps_content, '$.couponContent.buy_amount') AS buy_amount,
       JSON_EXTRACT(ps_content, '$.couponContent.percent') AS percent,
       JSON_EXTRACT(ps_content, '$.couponContent.max_discount') AS max_discount,
       JSON_EXTRACT(ps_content, '$.couponContent.reduce_amount') AS reduce_amount,
       JSON_EXTRACT(ps_content, '$.couponContent.cash_amount') AS cash_amount,
       JSON_EXTRACT(ps_content, '$.couponContent.platform') AS platform,
       JSON_EXTRACT(ps_content, '$.couponContent.coupon_form') AS coupon_form,
       JSON_EXTRACT(ps_content, '$.couponContent.seller_id') AS seller_id,
       JSON_EXTRACT(ps_content, '$.codeItemsScope.code_type') AS code_type,
       JSON_EXTRACT(ps_content, '$.codeItemsScope.eliminateRule.itemList') AS exclude_items
FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = ps_id;
```

**[Q3] 查用户领取/使用记录**
```sql
SELECT coupon_id, ps_id, user_id, order_id, status, off_amount,
       FROM_UNIXTIME(in_dtm) AS receive_time, FROM_UNIXTIME(use_dtm) AS use_time,
       FROM_UNIXTIME(use_start_time) AS valid_from, FROM_UNIXTIME(use_end_time) AS valid_to
FROM yamibuy_mkt.mkt_coupon_code WHERE ps_id = ps_id AND user_id = 用户ID;
```

**[Q4] 查购物车商品**
```sql
SELECT item_number, qty, seller_id, origin_price, is_gift, check_status, FROM_UNIXTIME(in_dtm) AS add_time
FROM yamibuy_cart.so_cart WHERE user_id = 用户ID;
-- ⚠️ origin_price 是加购快照价格，不能用于门槛判断
-- ⚠️ check_status=1 已勾选，0 未勾选；结算时仅已勾选商品参与计算
```

**[Q5] 查商品实时价格（用于门槛判断）**
```sql
SELECT item_number, unit_price, promotion_price, is_promotion,
       seckill_price, seckill_status, member_price, member_status,
       giftcard_price, giftcard_status
FROM yamibuy_im.im_item_area_price_setting WHERE item_number IN ('商品编号');
-- 价格优先级：秒杀价 > 会员价 > 促销价 > 礼卡专享价 > unit_price
-- 部分商品无记录时需通过 im_item.goods_id 关联 xysc_goods.shop_price
```

**[Q6] 查单品模式适用商品（仅 code_type=4）**
```sql
SELECT rec_id, ps_id, item_number, type, category_id, brand_id
FROM yamibuy_mkt.mkt_coupon_item WHERE ps_id = ps_id AND item_number IN ('商品编号');
```

**[Q7] 查商品分类/品牌/卖家信息**
```sql
SELECT item_number, category_id, brand_id, seller_id, status
FROM yamibuy_im.im_item WHERE item_number IN ('商品编号');
```

**[Q8] 查券的适用卖家范围**
```sql
SELECT ps_id, seller_id FROM yamibuy_mkt.mkt_coupon_seller
WHERE ps_id = ps_id AND seller_id IN (商品的seller_id列表);
-- 查不到 = 该卖家商品不在券的可用范围内
```

**[Q9] 查用户会员等级**
```sql
SELECT customer_id, level_id FROM yamibuy_crm.crm_customer_vip_rights_info WHERE customer_id = 用户ID;
-- ⚠️ crm_customer 和 crm_customer_vip 表不存在
```

---

## 排查场景

### 场景一：优惠券/折扣码无法使用
触发条件：客人反馈优惠券或折扣码无法使用、提示无效、券是否已使用

> ⚠️ 邮箱查 user_id 必须执行脚本 `python scripts/get-userid.py "邮箱"`

```
获取 ps_id（所有后续排查都依赖 ps_id）：
├─ 有折扣码 → [Q1]，查不到 = 折扣码无效，结束
├─ 有纯数字 → 并行查 mkt_promotion_schedule + mkt_coupon_code 取 ps_id
├─ 只有金额/过期时间描述 → 查 mkt_coupon_code 反查 ps_id
└─ 有订单号 → 查 xysc_order_info → mkt_coupon_code 取 ps_id
↓
用 ps_id 并行查询 → [Q2] + [Q3]
↓
mkt_coupon_code.status？
├─ status=20 → 已使用，查 order_id 告知在哪个订单使用
├─ status=30 → 券已失效
├─ 无记录 → 客人未领取该券
└─ status=10 → 券仍可用，继续判断：
      ↓
      use_end_time 已过期？（活动结束不代表券不能用，以 use_end_time 为准）
      ├─ 已过期 → 结束
      └─ 未过期 → platform 限制？（0=全平台 / 1=APP / 2=H5 / 3=PC）
            ↓
            [Q8] 卖家范围 → 商品 seller_id 在 mkt_coupon_seller 中？
            ├─ 不在 → 该卖家商品不参与此券
            └─ 在 → 商品适用范围（[Q4] 获取购物车商品，按 code_type 分支）：
                  ├─ code_type=1（全场）→ 逐一与 exclude_items 比对，必须给出明确结论
                  ├─ code_type=2（分类）→ 商品分类在 containRule.categoryList 中
                  ├─ code_type=3（品牌）→ 商品品牌在 containRule.brandList 中
                  └─ code_type=4（单品）→ [Q6] 有记录 = 可参与
                  ↓
                  ⚠️ 全部 check_status=0 → 提醒客服：需先勾选商品
                  ↓
                  金额门槛（[Q5] 查实时价格，按 coupon_type 分支）：
                  ├─ coupon_type=1（折扣）→ 金额>=buy_amount，折扣=金额×(percent/100)，受 max_discount 上限
                  ├─ coupon_type=2（满减）→ 金额>=buy_amount，减 reduce_amount
                  └─ coupon_type=3（现金券）→ 金额>=cash_amount，减 cash_amount
                  ↓
                  全部满足但仍不可用？→ 查日志（search.py -s ec-mkt -k "user_id值" -t 7d）
                  → 需人工联系 mkt 开发检查 Redis 缓存（getCouponInfoList）
                  → ⚠️ Redis 查询需人工操作
```

获取购物车商品：有订单号 → 查 xysc_order_goods；无订单号 → [Q4]；都查不到 → 让客服提供商品编号

### 场景二：结算页优惠券抵扣异常（抵扣消失 / 金额不符）
触发条件：购物车显示抵扣但结算页消失，或金额与预期不符

```
├─ 有订单号 → 查 xysc_order_info.bonus + mkt_coupon_code（WHERE order_id）
│   ├─ bonus > 0 → 已生效，确认实际 ps_id
│   │   ├─ ps_id 与客户描述不符 → 客户选错了券
│   │   │   → 查该用户所有可用券，对比各券的门槛和适用范围
│   │   │   → 常见：同一活动多档券，分类券适用商品金额不足门槛，系统选了全场券
│   │   └─ ps_id 一致 → 拆单时查所有子订单 bonus 合计，按场景一分支判断差异
│   └─ bonus = 0 → 结算时条件不满足，查日志确认结算时商品列表
└─ 无订单号 → 查日志（search.py -s ec-so -k "user_id值" -t 7d）→ 按场景一分支判断
```

## 注意事项
- 活动结束（status=70）不代表券不能用，以 mkt_coupon_code.use_end_time 为准
- 拆单场景：优惠券关联主订单 ID，抵扣按比例分摊到子订单 bonus
- mkt_coupon_item 仅 code_type=4 时使用，其他模式无记录是正常的
- mkt 走 Redis 缓存判断商品范围，数据库正确不代表缓存同步，需人工查 Redis