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
- `yamibuy_mkt`.`mkt_promotion_schedule` - 促销活动主表（ps_id、活动标题、有效期、状态；type=12 为优惠券活动）
- `yamibuy_mkt`.`mkt_coupon_ps_code` - 折扣码与活动关联表（ps_code = 用户输入的折扣码，关联 ps_id）
- `yamibuy_mkt`.`mkt_coupon_code` - 用户领取/使用记录（user_id、order_id、status、off_amount、use_end_time、ps_id）
- `yamibuy_mkt`.`mkt_coupon_item` - 优惠券适用商品范围（仅 code_type=4 单品模式使用）
- `yamibuy_mkt`.`mkt_coupon_seller` - 优惠券适用卖家范围（ps_id、seller_id，商品的 seller_id 必须在此表中才能使用该券）
- `yamibuy_im`.`im_item` - 商品主表（item_number、category_id、brand_id、seller_id、status，用于判断商品分类/品牌/卖家归属）
- `yamibuy_master`.`xysc_category` - 商品分类层级表（cat_id、cat_name、parent_id，code_type=2 分类模式时逐级向上追溯 parent_id 判断是否属于适用分类。⚠️ 注意不是 yamibuy_im.im_item_category，该表不存在）
- `yamibuy_master`.`xysc_order_info` - 订单信息（bonus = 优惠券实际抵扣金额）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## ⚠️ 核心业务规则
- 所有优惠券排查都依赖 ps_id，第一步必须先获取 ps_id
- 券能否使用的最终判断取决于两层校验：
  1. 商品适用范围：由 `codeItemsScope.code_type` 决定（见下方分支逻辑）
  2. 金额门槛：由 `couponContent.coupon_type` 决定（折扣/满减/现金券各不同）
- 卖家范围限制：由 `yamibuy_mkt.mkt_coupon_seller` 表控制（ps_id + seller_id），购物车商品的 seller_id 必须在该表中有对应记录才能使用该券；`couponContent.seller_id` 主要用于免邮券场景
- mkt 服务通过 Redis 缓存判断商品适用范围（非直接查数据库），数据库配置正确不代表缓存已同步

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
SELECT item_number, qty, seller_id, origin_price, is_gift, FROM_UNIXTIME(in_dtm) AS add_time
FROM yamibuy_cart.so_cart WHERE user_id = 用户ID;
-- ⚠️ origin_price 是加购时快照价格，不能用于门槛金额判断
```

**[Q5] 查商品实时价格（用于门槛金额判断）**
```sql
SELECT item_number, unit_price, promotion_price, is_promotion,
       seckill_price, seckill_status, member_price, member_status,
       giftcard_price, giftcard_status
FROM yamibuy_im.im_item_area_price_setting WHERE item_number IN ('商品编号');
-- 价格优先级：秒杀价 > 会员价 > 促销价 > 礼卡专享价 > unit_price
-- ⚠️ rule_id 不固定，不要硬编码，直接用 item_number 查询
-- ⚠️ 第三方卖家商品可能在 im_item_area_price_setting 中无记录，
--    此时需通过 im_item.goods_id 关联 yamibuy_master.xysc_goods.shop_price 获取价格
```

**[Q6] 查单品模式适用商品（仅 code_type=4 时使用）**
```sql
SELECT rec_id, ps_id, item_number, type, category_id, brand_id
FROM yamibuy_mkt.mkt_coupon_item WHERE ps_id = ps_id AND item_number IN ('商品编号');
```

**[Q7] 查商品分类/品牌/卖家信息（用于判断商品是否适用券）**
```sql
SELECT item_number, category_id, brand_id, seller_id, status
FROM yamibuy_im.im_item WHERE item_number IN ('商品编号');
```

**[Q8] 查券的适用卖家范围（判断商品卖家是否在券的可用范围内）**
```sql
SELECT ps_id, seller_id FROM yamibuy_mkt.mkt_coupon_seller
WHERE ps_id = ps_id AND seller_id IN (商品的seller_id列表);
-- 查不到记录 = 该卖家的商品不在券的可用范围内
```

## 排查场景

### 场景一：优惠券/折扣码无法使用
触发条件：客人反馈优惠券或折扣码无法使用、提示无效、无法抵扣、券是否已使用

> ⚠️ 邮箱查 user_id 必须执行脚本 `python scripts/get-userid.py "邮箱"`。禁止手动拼接 API 请求。

```
第一步：获取 ps_id（所有后续排查都依赖 ps_id）

客服提供了什么信息？
├─ 有折扣码 → [Q1] 查 ps_id
│   ├─ 查不到 → 折扣码无效，结束
│   └─ 查到 → 进入第二步
├─ 有纯数字 → 并行查 mkt_promotion_schedule + mkt_coupon_code，取 ps_id
├─ 只有金额/过期时间描述 → 查 mkt_coupon_code 反查 ps_id
└─ 有订单号 → 查 xysc_order_info → mkt_coupon_code 取 ps_id

第二步：用 ps_id 并行查询 → [Q2] + [Q3]
↓
用户在 mkt_coupon_code 中的 status？
├─ status=20 → 已使用，查 order_id 告知在哪个订单使用，结束
├─ status=30 → 券已失效，结束
├─ 无记录 → 客人未领取该券，结束
└─ status=10 → 券仍可用，继续判断
              ↓
              use_end_time 是否已过期？（活动结束不代表券不能用，以 use_end_time 为准）
              ├─ 已过期 → 结束
              └─ 未过期 → 检查 platform 限制
                         ├─ 0=全平台 / 1=仅APP / 2=仅H5 / 3=仅PC
                         ↓
                         卖家范围判断（[Q8] 查 mkt_coupon_seller）
                         → 购物车商品的 seller_id 是否在该券的 mkt_coupon_seller 中？
                         ├─ 不在 → 该卖家的商品不参与此券，仅计算在范围内的商品
                         └─ 在 → 继续判断商品适用范围
                         ↓
                         商品适用范围判断（获取购物车商品 → [Q4]，按 code_type 分支）
                         ├─ code_type=1（全场）→ 必须将购物车商品的 item_number 逐一与 exclude_items 列表比对
                         │   → 在排除列表中的商品不参与该券，不在列表中的商品可参与
                         │   → 禁止输出"需确认"，必须给出明确结论：哪些商品可参与、哪些被排除
                         ├─ code_type=2（分类）→ 商品分类在 containRule.categoryList 中 = 可参与
                         ├─ code_type=3（品牌）→ 商品品牌在 containRule.brandList 中 = 可参与
                         └─ code_type=4（单品）→ [Q6] 查 mkt_coupon_item，有记录 = 可参与
                         ↓
                         金额门槛判断（查实时价格 → [Q5]，按 coupon_type 分支）
                         ├─ coupon_type=1（折扣）→ buy_amount 有值时需 金额>=buy_amount，折扣=金额×(percent/100)，受 max_discount 上限
                         ├─ coupon_type=2（满减）→ 金额>=buy_amount，减 reduce_amount
                         └─ coupon_type=3（现金券）→ 金额>=cash_amount，减 cash_amount
                         ↓
                         以上全部满足但券仍不可用？
                         → 查日志（search.py -s ec-mkt -k "user_id值" -t 7d）
                         → 当前排查手段无法定位 mkt 内部拒绝原因，需人工协助：
                           1. 联系 mkt 开发检查 Redis 缓存中商品与 ps_id 的关联（getCouponInfoList）
                           2. 可能原因：Redis 缓存不一致、商品信息查询异常等
                         → ⚠️ Redis 查询需人工操作，禁止机器人直接访问 Redis
```

获取购物车商品补充说明：
- 有订单号 → 查 xysc_order_goods
- 无订单号 → [Q4]，实时价格 → [Q5]
- so_cart 和 Kibana 都查不到 → 让客服提供商品编号
- 日志（search.py -s ec-so -k "user_id值" -k "checkCouponBySelect" -t 7d）可作为补充验证

### 场景二：结算页优惠券抵扣异常（抵扣消失 / 金额不符）
触发条件：购物车显示优惠券抵扣但结算页消失，或抵扣金额与预期不符

```
├─ 有订单号 → 查 xysc_order_info.bonus + mkt_coupon_code（WHERE order_id = 订单号）
│   ├─ bonus > 0 → 已生效，确认实际使用的 ps_id
│   │   ├─ 实际 ps_id 的券面额/门槛与客户描述不符 → 客户选错了券
│   │   │   → 查该用户所有可用券（status IN (10,20)），列出各券的 buy_amount 和 reduce_amount
│   │   │   → 对比客户想用的券的 code_type，确认订单商品是否满足该券的适用范围和金额门槛
│   │   │   → 常见原因：同一活动发放多档券（如全场券+分类券），分类券的适用商品金额不足门槛，系统选了全场券
│   │   └─ ps_id 与描述一致 → 拆单时查所有子订单 bonus 合计，按场景一的 code_type + coupon_type 分支判断金额差异
│   └─ bonus = 0 → 结算时条件不满足，查日志确认结算时商品列表（search.py -s ec-so -k "purchase_id值" -t 7d）
└─ 无订单号 → 查日志（search.py -s ec-so -k "user_id值" -t 7d）→ 按场景一的 code_type + coupon_type 分支判断
```

## 注意事项
- 活动结束（status=70）不代表券不能用，以 mkt_coupon_code.use_end_time 为准
- 拆单场景下，优惠券关联的 order_id 是主订单 ID，抵扣金额按比例分摊到各子订单 bonus
- Kibana 校验日志：`search.py -s ec-so`，关键词 `checkCouponBySelect` + user_id，response 只返回成功/失败
- mkt 内部日志：`search.py -s ec-mkt`，关键词 user_id 或 ps_id
- mkt 服务走 Redis 缓存（getCouponInfoList）判断商品范围，数据库正确不代表缓存同步，需人工查 Redis 确认
- mkt_coupon_item 仅 code_type=4（单品）时使用，其他模式无记录是正常的