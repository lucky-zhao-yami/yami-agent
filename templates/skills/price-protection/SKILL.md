---
name: price-protection
description: "价格保护（补差价）计算工具，根据订单号自动查询订单信息、商品当前售价、优惠券情况，按照SOP规则计算补差价金额。触发词：价格保护, 补差价, price match, price protection, 降价, 保价"
---

# 价格保护（补差价）计算

根据客服 SOP 规则，自动查询订单信息和商品当前售价，计算补差价金额。

## 使用场景 & 问话模板

### 客服问话格式（支持中英文）

```
格式1（最简，自动计算所有商品）：
补差价 2026031662087

格式2（指定商品关键词）：
补差价 2026031662087 流金水 男士精华

格式3（自然语言）：
订单 2026031662087 申请价格保护，客户说流金水和男士精华降价了

格式4（英文）：
price match 2026031662087 Time Reset Aqua
```

### 输入解析规则

1. 从消息中提取订单号：匹配 `202\d{10,}` 格式的数字串
2. 如果有商品关键词（订单号之后的文字），只计算匹配的商品
3. 如果没有商品关键词，计算订单中所有商品的差价，列出有差价的
4. 商品匹配方式：用关键词模糊匹配 `xysc_order_goods.goods_name`

### 核心计算原则（重要！）

**必须用 `deal_price`（成交单价）而不是 `goods_price`（原售价）来比较！**

- `deal_price` 是用户实际支付的单价（已扣除订单级折扣）
- `goods_price` 是下单时的标价（折扣前）
- 如果订单使用了优惠券/折扣码，`deal_price < goods_price`
- 差额 = `deal_price` - 当前售价（只有正值才需要补差）
- 如果 deal_price ≤ 当前售价，说明没有降价（或用户已享受的折扣比当前降价更大），不需要补差

## 适用范围

- **`vendor_id = 0` 视为自营**（不依赖 business_type 字段）
- 自营（business_type=1）和 FBY（business_type=5）商品
- 不含第三方 Marketplace（business_type=3）
- 7 天内：退款到原支付账户
- 7-14 天：等额积分补偿
- 超过 14 天：不支持

## 排除项（不支持价格保护）

- 已取消/已删除订单（order_status=4）
- 内部订单（source_flag=9 或 13）/ 补发订单（order_type=8）
- 赠品（is_gift > 0）
- 预售订单（order_type=6）
- 秒杀商品（特殊情况除外，见第五步）
- VVIP 会员价降价（原则上不支持，可积分破例）
- 无货/限购商品
- 系统价格错误导致的降价

## 执行步骤

### 第一步：查询订单基本信息

```sql
SELECT oi.order_id, oi.order_sn, oi.user_id,
       FROM_UNIXTIME(oi.add_time) AS 下单时间,
       oi.order_status, oi.pay_status, oi.shipping_status,
       oi.order_amount, oi.goods_amount, oi.bonus, oi.bonus_id,
       oi.discount, oi.integral_money, oi.gift_card_money,
       oi.order_type, oi.source_flag, oi.is_separate,
       oi.warehouse_number,
       ROUND((UNIX_TIMESTAMP() - oi.add_time) / 86400, 1) AS 距今天数
FROM yamibuy_master.xysc_order_info oi
WHERE oi.order_sn = '{order_sn}'
  AND oi.is_separate = 0
```

**校验点：**
- `order_status` 不能是 4（已取消）
- `pay_status` 必须是 2（已支付）
- `order_type` 不能是 6（预售）或 8（内部单）
- `source_flag` 不能是 9 或 13（内部下单）
- 距今天数 ≤ 7：可退款到原支付账户
- 距今天数 7-14：只能等额积分补偿
- 距今天数 > 14：不支持价格保护
- **记录 `warehouse_number`（订单发货仓），第三步取价时需要用**

### 第二步：查询订单商品明细 + 判断商品类型

**⚠️ 重要：商品类型必须从 `im_item.business_type` 取，不能用 `xysc_vendor_info.business_type`**

`xysc_vendor_info.business_type` 不可靠（很多 FBY 商家的 vendor 表 business_type=0），必须通过 `im_item` 表获取商品维度的 `business_type`。

```sql
SELECT og.goods_id, ii.item_number, og.goods_name,
       og.goods_number AS 数量, og.goods_price AS 原售价,
       og.deal_price AS 成交单价, og.market_price AS 市场价,
       og.is_gift, og.vendor_id, og.act_id,
       og.bonus_pay AS 券分摊金额, og.points_amount AS 积分分摊,
       og.is_wh_price, og.warehouse_number AS 发货仓, og.rule_id,
       ii.business_type,
       ii.seller_id,
       vi.vendor_name, vi.vendor_ename,
       CASE
           WHEN og.vendor_id = 0 THEN '自营'
           WHEN ii.business_type = 1 THEN '自营'
           WHEN ii.business_type = 2 THEN '代销'
           WHEN ii.business_type = 3 THEN '第三方Marketplace'
           WHEN ii.business_type = 5 THEN 'FBY'
           ELSE CONCAT('其他(', IFNULL(ii.business_type,'NULL'), ')')
       END AS 商品类型
FROM yamibuy_master.xysc_order_goods og
JOIN yamibuy_im.im_item ii ON ii.goods_id = og.goods_id
LEFT JOIN yamibuy_master.xysc_vendor_info vi ON og.vendor_id = vi.vendor_id
WHERE og.order_id = {order_id}
ORDER BY og.goods_id
```

**校验点：**
- **`vendor_id = 0` 直接视为自营**（不依赖 business_type 字段）
- **商品类型从 `im_item.business_type` 取**：1=自营, 2=代销, 3=第三方, 4=集运, 5=FBY
- 自营(1) 和 FBY(5) 支持价格保护
- `is_gift > 0` 的赠品不参与补差价
- 记录每个商品的 `deal_price`、`goods_number`、`vendor_id`（商家ID）
- **记录 `is_wh_price`、`warehouse_number`（发货仓）和 `rule_id`（区域价格规则ID）**，第三步取价时需要用

### 第三步：查询商品当前售价

**⚠️ 重要：价格体系说明**

商品价格存储在 `yamibuy_im` 库，不是 `xysc_goods` 表：
- **`yamibuy_im.im_item`** — 商品主表（goods_id ↔ item_number 映射）
- **`yamibuy_im.im_item_price_setting`** — 默认价格（unit_price、promotion_price、is_promotion 等）
- **`yamibuy_im.im_item_area_price_setting`** — 区域/仓库价格（通过 rule_id 关联），有值时**覆盖**默认价格

取价逻辑：`IFNULL(区域价格, 默认价格)`

**一次性查询所有商品的当前售价（含区域价格）：**

```sql
SELECT og.goods_id, ii.item_number, og.goods_name, og.deal_price,
       og.goods_number, og.is_wh_price, og.rule_id,
       iips.unit_price AS 默认售价,
       iips.is_promotion AS 默认是否促销,
       iips.promotion_price AS 默认促销价,
       iips.promote_start_date AS 默认促销开始,
       iips.promote_end_date AS 默认促销结束,
       iips.seckill_status, iips.seckill_price,
       iaps.unit_price AS 区域售价,
       iaps.is_promotion AS 区域是否促销,
       iaps.promotion_price AS 区域促销价,
       iaps.promote_start_date AS 区域促销开始,
       iaps.promote_end_date AS 区域促销结束,
       CASE
           WHEN iaps.is_promotion = 'Y' AND NOW() BETWEEN iaps.promote_start_date AND iaps.promote_end_date AND iaps.promotion_price > 0
               THEN iaps.promotion_price
           WHEN iaps.unit_price IS NOT NULL
               THEN iaps.unit_price
           WHEN iips.is_promotion = 'Y' AND NOW() BETWEEN iips.promote_start_date AND iips.promote_end_date AND iips.promotion_price > 0
               THEN iips.promotion_price
           ELSE iips.unit_price
       END AS 当前售价,
       CASE
           WHEN iaps.is_promotion = 'Y' AND NOW() BETWEEN iaps.promote_start_date AND iaps.promote_end_date AND iaps.promotion_price > 0
               THEN '区域促销价'
           WHEN iaps.unit_price IS NOT NULL
               THEN '区域售价'
           WHEN iips.is_promotion = 'Y' AND NOW() BETWEEN iips.promote_start_date AND iips.promote_end_date AND iips.promotion_price > 0
               THEN '默认促销价'
           ELSE '默认售价'
       END AS 价格类型
FROM yamibuy_master.xysc_order_goods og
JOIN yamibuy_im.im_item ii ON ii.goods_id = og.goods_id
LEFT JOIN yamibuy_im.im_item_price_setting iips ON iips.item_number = ii.item_number
LEFT JOIN yamibuy_im.im_item_area_price_setting iaps ON iaps.item_number = ii.item_number AND iaps.rule_id = og.rule_id
WHERE og.order_id = {order_id}
ORDER BY og.goods_id
```

**当前售价取值规则（按优先级）：**
1. 如果有区域价格（`iaps` 有记录）且区域促销中 → 取 `iaps.promotion_price`
2. 如果有区域价格但非促销 → 取 `iaps.unit_price`
3. 如果无区域价格，默认促销中 → 取 `iips.promotion_price`
4. 否则 → 取 `iips.unit_price`（默认售价）
5. 秒杀价、会员价不参与保价比较

**差额计算：**
```
差额 = deal_price - 当前售价
如果差额 > 0 → 有差价，需要补
如果差额 ≤ 0 → 无差价
```

### 第四步：查询订单已使用的优惠券

```sql
-- 方式1：查订单使用的所有券
SELECT ob.bonus_id, ob.bonus AS 抵扣金额, ob.vendor_id,
       bt.type_name AS 券名称, bt.type_money AS 券面额,
       bt.is_percent_off AS 是否百分比券,
       bt.is_off_on_amount AS 是否满减,
       bt.min_goods_amount AS 满减门槛,
       bt.type AS 券类型标识,
       CASE
           WHEN bt.purchase_id > 0 THEN '跟买券'
           WHEN bt.is_percent_off = 1 THEN '百分比折扣券'
           WHEN bt.is_off_on_amount > 0 THEN '满减券'
           ELSE '现金券'
       END AS 券类型说明
FROM yamibuy_master.xysc_order_bonus ob
JOIN yamibuy_master.xysc_bonus_type bt ON ob.bonus_id = bt.type_id
WHERE ob.order_id = {order_id}

-- 方式2：查订单使用的 coupon
SELECT oc.coupon_code, oc.coupon_type, oc.off_amount, oc.seller_id
FROM yamibuy_master.xysc_order_coupon oc
WHERE oc.order_id = {order_id}
```

### 第五步：查询用户可用优惠券（如需）

```sql
SELECT ub.bonus_id, ub.bonus_type_id,
       bt.type_name AS 券名称, bt.type_money AS 券面额,
       bt.is_percent_off, bt.is_off_on_amount,
       bt.min_goods_amount AS 满减门槛,
       FROM_UNIXTIME(bt.use_start_date) AS 有效期开始,
       FROM_UNIXTIME(bt.use_end_date) AS 有效期结束,
       CASE
           WHEN bt.purchase_id > 0 THEN '跟买券'
           WHEN bt.is_percent_off = 1 THEN '百分比折扣券'
           WHEN bt.is_off_on_amount > 0 THEN '满减券'
           ELSE '现金券'
       END AS 券类型
FROM yamibuy_master.xysc_user_bonus ub
JOIN yamibuy_master.xysc_bonus_type bt ON ub.bonus_type_id = bt.type_id
WHERE ub.user_id = {user_id}
  AND ub.is_delete = 0
  AND ub.used_time = 0
  AND bt.use_end_date >= UNIX_TIMESTAMP()
```

**券适用商品判断：**
```sql
SELECT bl.type_id, bl.goods_id, bl.cat_id, bl.brand_id
FROM yamibuy_master.xysc_bonus_lookup bl
WHERE bl.type_id = {bonus_type_id}
```
- 如果 lookup 表有记录且 goods_id 匹配 → 该券适用该商品
- 如果 lookup 表无记录 → 可能是全场通用券

### 第六步：秒杀商品特殊判断（P1）

```sql
SELECT act_id, act_name, goods_id,
       FROM_UNIXTIME(start_time) AS 开始时间,
       FROM_UNIXTIME(end_time) AS 结束时间,
       is_finished, ext_info
FROM yamibuy_master.xysc_goods_activity
WHERE goods_id = {goods_id}
  AND is_finished = 0
  AND start_time <= UNIX_TIMESTAMP()
  AND end_time >= UNIX_TIMESTAMP()
```

**秒杀保价规则：**
- 秒杀活动进行中 + 有库存（可按秒杀价结算）→ 可以补差价
- 秒杀活动已结束 or 已秒完 → 不可补差价
- 注意：秒杀库存在 Redis 中，数据库查询可能有延迟，需人工确认

---

## 计算逻辑

### 场景 A：订单未使用优惠券

| 子场景 | 公式 | 示例 |
|--------|------|------|
| 商品直降 | 成交单价 - 当前售价 | $129.99 - $125.99 = $4 |
| 忘记用百分比券 | 商品金额 × 折扣比例 | $143.28 × 10% = $14.33 |
| 忘记用满减券 | 满足门槛则补券面额 | 满99-10 → 补 $10 |

> **首单新人 Welcome 10% 券**：
> 1. 先查 Welcome 券的适用商家：`SELECT seller_id FROM yamibuy_mkt.mkt_coupon_seller WHERE ps_id = (SELECT ps_id FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_code = 'welcome' AND status IN (30,50) ORDER BY ps_id DESC LIMIT 1)`
> 2. 只有 `vendor_id` 在适用商家列表中的商品才参与折扣计算
> 3. 可参与折扣金额 = 适用商家的商品金额之和
> 4. 折扣金额 = 可参与折扣金额 × 10%
> 5. **不要硬编码"排除 FBY"**，很多 FBY 商家也参与 Welcome 活动，必须查 `mkt_coupon_seller` 表确认

### 场景 B：订单已使用优惠券

| 子场景 | 公式 | 示例 |
|--------|------|------|
| 券可重复领取（月度会员$2、大使券） | 商品原价 - 当前价格 | 原价$100，用了-$2，现价$95 → $100-$95=$5 |
| 券已过期/不可再用（转盘券、首单券） | 商品实付金额 - 当前价格 | 实付$90，现价$90 → 无需补差 |
| 已用券 + 有新券（不可叠加） | 新券折扣 - 旧券折扣 | 已用-$2，现在88折=$5 → $5-$2=$3 |
| 已用券 + 有跟买券（可叠加） | 实付金额 × 跟买折扣比例 | 实付 × 0.1 |
| 部分商品用券 + 全场折扣 | 原价总额 × 全场折扣 - 已享折扣 | 原价 × 12% - 已享9折折扣 |

### 优惠券叠加规则

| 规则 | 说明 |
|------|------|
| 平台券之间 | **不可叠加** |
| 跟买券 + 平台券 | **可以叠加** |
| 单订单最多 | 5 张券（作用于不同商品） |

### 退款方式

| 时间范围 | 方式 | 退款顺序 |
|---------|------|---------|
| ≤ 7 天 | 原路退回 | 礼品卡 → 积分 → 原始付款方式 |
| 7-14 天 | 等额积分 | 积分到账户 |

---

## 输出格式

查询完成后，按以下格式输出结果（简洁版，方便客服直接复制给客户）：

```
## 价格保护计算结果

**订单号**: {order_sn}
**下单时间**: {add_time}（距今 {days} 天）
**退款方式**: ≤7天 原路退回 / 7-14天 等额积分
**订单已用优惠**: {有/无，如有列出类型和金额}

### 有差价的商品

| 商品 | 数量 | 成交单价 | 当前售价 | 价格类型 | 单件差额 | 小计 |
|------|------|---------|---------|---------|---------|------|
| XXX  | 1    | $26.09  | $24.93  | 区域售价 | $1.16   | $1.16|

### 无差价的商品（当前价 ≥ 成交价）

| 商品 | 成交单价 | 当前售价 | 价格类型 | 说明 |
|------|---------|---------|---------|------|
| YYY  | $71.99  | $79.99  | 默认售价 | 当前价更高，无需补差 |

### 结论
- 应退金额：$XX.XX
- 退款方式：原路退回 / 等额积分
```

### 输出规则
- 如果客服指定了商品，只输出指定商品的结果
- 如果客服没指定商品，输出所有商品，分"有差价"和"无差价"两组
- **每个商品都要标注价格类型**（区域售价/区域促销价/默认售价/默认促销价），方便客服核实

---

## 涉及的数据库表

| 表名 | 用途 |
|------|------|
| yamibuy_master.xysc_order_info | 订单主表 |
| yamibuy_master.xysc_order_goods | 订单商品明细（含 rule_id 区域价格规则） |
| yamibuy_im.im_item | 商品主表（goods_id ↔ item_number 映射，**business_type 从这里取**） |
| yamibuy_im.im_item_price_setting | 商品默认价格（unit_price、promotion_price 等） |
| yamibuy_im.im_item_area_price_setting | 商品区域/仓库价格（通过 rule_id 关联，覆盖默认价格） |
| yamibuy_master.xysc_order_bonus | 订单使用的券 |
| yamibuy_master.xysc_order_coupon | 订单使用的 coupon |
| yamibuy_master.xysc_bonus_type | 券类型定义 |
| yamibuy_master.xysc_user_bonus | 用户已领取的券 |
| yamibuy_master.xysc_bonus_lookup | 券适用范围 |
| yamibuy_master.xysc_goods_activity | 商品活动（秒杀） |
| yamibuy_mkt.mkt_promotion_schedule | 促销计划主表（查 Welcome 等券的 ps_id） |
| yamibuy_mkt.mkt_coupon_seller | 券适用商家表（查某个券适用哪些商家） |

## 注意事项

1. 所有查询仅限 SELECT，数据库有安全限制
2. **价格查询用 im 表，不用 xysc_goods 表**。`xysc_goods.shop_price` 已废弃，当前售价从 `yamibuy_im.im_item_price_setting`（默认）和 `yamibuy_im.im_item_area_price_setting`（区域）获取
3. **区域价格优先**：通过订单商品的 `rule_id` 关联 `im_item_area_price_setting`，有区域价格时覆盖默认价格。取价逻辑：`IFNULL(区域价格, 默认价格)`
4. **vendor_id=0 判断**：`vendor_id=0` 就是亚米自营，不需要查 `xysc_vendor_info` 的 `business_type`。不要因为 business_type 为 0 或 NULL 就判断为"不支持"
5. **商品类型判断**：必须用 `im_item.business_type`，不能用 `xysc_vendor_info.business_type`。很多 FBY 商家在 vendor 表的 business_type=0，但商品在 im_item 表的 business_type=5
6. **Welcome 首单券适用范围**：不要硬编码"排除 FBY"。Welcome 券适用 347 个商家（含大量 FBY 商家），必须查 `yamibuy_mkt.mkt_coupon_seller` 表确认商家是否在券的适用范围内
5. 秒杀库存在 Redis 中管理，数据库查询可能有延迟
6. 券是否可重复领取无明确字段，需根据券名称和类型人工判断（如"月度会员券"、"大使券"通常可重复领取）
7. VVIP 价格保护原则上不支持，如客人坚持可积分破例
8. 差额 > $50 建议提交人工审核
