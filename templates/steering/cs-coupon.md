---
inclusion: auto
---

# 优惠?折扣码问?- 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为优惠券排查类问题：
- 优惠券、折扣码、coupon、discount code、promo code
- 抵扣、满减、优惠码、折扣、减?
- 券不能用、券无效、券过期、券没生?
- 购物车显示抵扣但结算不显?

## 常用数据库表
- `yamibuy_mkt`.`mkt_promotion_schedule` - 优惠活动主表（ps_id、活动标题、有效期、状态、ps_content 含详细规?JSON?
- `yamibuy_mkt`.`mkt_coupon_ps_code` - 优惠码与活动关联表（ps_code 即用户输入的折扣码，关联 ps_id?
- `yamibuy_mkt`.`mkt_coupon_code` - 用户领取/使用优惠券记录（user_id、order_id、status、off_amount、use_start_time、use_end_time?
- `yamibuy_mkt`.`mkt_coupon_item` - 优惠券适用商品范围（⭐ 判断商品能否用券的最终依据）
- `yamibuy_mkt`.`mkt_coupon_seller` - 优惠券适用商家
- `yamibuy_mkt`.`mkt_coupon_user` - 优惠券用户限?
- `yamibuy_master`.`xysc_order_info` - 订单信息（bonus 字段为优惠券实际抵扣金额?

## 关键字段说明
- `mkt_coupon_code.status`：10=可用，20=已使用，30=已失效
- `mkt_promotion_schedule.status`：10=草稿，20=等待生效，30=促销生效，40=促销结束，50=进行中/已发放，70=已结束
- `mkt_promotion_schedule.ps_content`：JSON 格式，包含以下关键信息：
  - `couponContent.buy_amount` — 满减门槛金额
  - `couponContent.reduce_amount` — 减免金额
  - `couponContent.coupon_type` — 券类型（1=折扣券，2=满减券，3=立减券）
  - `couponContent.coupon_form` — 券形式（1=固定金额）
  - `couponContent.cash_amount` — 立减金额（coupon_type=3 时使用此字段）
  - `couponContent.max_discount` — 折扣券最大优惠金额上限
  - `couponContent.coupon_desc_cn` — 券的中文描述（含适用范围说明，如"亚米自营等117个店铺部分商品可用"）
  - `couponContent.use_start_time` / `use_end_time` — 使用有效期（Unix 时间戳）
  - `codeItemsScope.excelData` — 适用商品 ID 列表
  - `codeItemsScope.total_sku_num` — 适用 SKU 总数
  - `codeItemsScope.containRule` — 包含规则（categoryList=适用分类，brandList=适用品牌，itemList=适用商品）
  - `codeItemsScope.code_type` — 商品范围类型（1=全站适用排除特定商品，2=指定商品列表，4=指定分类）
- `mkt_coupon_item.type`：作用范围类型，1=全场，2=分类，3=品牌，4=单品
- `mkt_promotion_schedule.type`：2=优惠券活动，12=会员权益券
- `mkt_coupon_ps_code.ps_code` — 用户输入的折扣码（如 lucky8）
- `xysc_order_info.bonus` — 订单中优惠券实际抵扣金额
- `xysc_order_info.bonus_id` — 关联的优惠券 ID

## ⚠️ 重要业务规则
- **券的适用范围由两个维度共同决定**：
  1. **商家维度**：`mkt_coupon_seller` 表记录了券适用的商家列表，商品所属商家（seller_id）必须在此列表中
  2. **商品适用范围（核心判断）**：⭐ `mkt_coupon_item` 表记录了券适用的商品/分类/品牌范围，**商品的 item_number 必须在该表对应 ps_id 的记录中才能使用该券**。根据 `type` 字段区分范围类型：1=全场、2=分类（按 category_id 匹配）、3=品牌（按 brand_id 匹配）、4=单品（按 item_number 精确匹配）
  - 两个维度必须同时满足，缺一不可
- **排查优惠券无法使用时的排查步骤**：
  1. 券状态是否正常（`mkt_coupon_code.status=10`）且在有效期内
  2. 活动状态是否正常（`mkt_promotion_schedule.status` 非 40/70）
  3. **检查适用商家**（`mkt_coupon_seller`）：购物车商品的 seller_id 是否在券的适用商家列表中
  4. ⭐ **检查商品是否在适用范围内**（`mkt_coupon_item`，最终判断依据）：查询该 ps_id 下是否包含目标商品的 item_number。如果查不到记录，说明该商品不在券的适用范围内，券不可用
  5. 检查门槛金额：符合条件的商品金额是否达到 `buy_amount` 门槛
  6. 以上都正常才查 Kibana 日志定位 MKT 服务的过滤原因

## 常用工具
- Central 优惠券管理：https://central.yamibuy.net/mkt/index.html

## 排查场景

### 场景一：折扣码无法使用
触发条件：客人反馈折扣码/优惠码输入后无法使用、提示无?

排查步骤：

**⚠️ 路径判断规则：**
- **路径 A**：客服提问中**带有商品编号或订单号** → 如果提供的是订单号，先执行「前置步骤 A」通过订单号查出所有商品，再按步骤 1→2→3→4→5→6 顺序排查；如果直接提供了商品编号，则跳过前置步骤直接排查
- **路径 B**：客服提问中**不带商品编号和订单号**（无法直接拿到商品信息） → **先执行「前置步骤 B」通过 Kibana 日志获取购物车商品**，拿到商品信息后，再按步骤 1→2→3→4→5→6 排查

**前置步骤 A（路径 A 提供订单号时执行）：通过订单号查询订单中所有商品**
   ```sql
   SELECT og.item_number, og.goods_name, og.goods_price, og.goods_number, og.seller_id
   FROM `yamibuy_master`.`xysc_order_goods` og
   JOIN `yamibuy_master`.`xysc_order_info` oi ON og.order_id = oi.order_id
   WHERE oi.order_sn = '订单号';
   ```
- 从结果中提取所有商品的 `item_number`、`seller_id`、`goods_price`，用于后续步骤 5（商家检查）和步骤 6（商品范围检查）

**前置步骤 B（仅路径 B 执行）：通过 Kibana 日志获取购物车商品**
- 索引：`k8s-ec-so-service-log-*`
- 搜索关键词：用户的 user_id + `checkCouponBySelect` 或 `physical`
- 时间范围：最近 3 天（或根据客人反馈时间调整）
- 从日志中提取 `orderGoodsList` 中的 `item_number`、`seller_id`、`goods_price`、`goods_count`
- 提取到商品列表后，继续执行步骤 1→2→3→4→5→6

1. 通过折扣码查找关联活动：
   ```sql
   SELECT * FROM `yamibuy_mkt`.`mkt_coupon_ps_code` WHERE `ps_code` = '折扣码';
   ```
2. 查询活动详情和状态：
   ```sql
   SELECT ps_id, ps_title, ps_sub_title, status, FROM_UNIXTIME(start_time) as start_date, FROM_UNIXTIME(end_time) as end_date, ps_content
   FROM `yamibuy_mkt`.`mkt_promotion_schedule` WHERE `ps_id` = 活动ID;
   ```
   - 检查活动状态和有效期：status=70 表示活动已结束，对比 start_time / end_time 与当前时间
3. 解析 ps_content JSON，检查：
   - `couponContent.buy_amount`：满减门槛，客户购买金额是否达标
   - `codeItemsScope`：适用商品范围，客户购买的商品是否在范围内
   - `limit_get_amount` 和 `limit_get_type`：领取限制（如每人限领 1 张）
   - `limit_new_cusotmer`：是否限新用户
4. 查询客户是否已领取/使用过该券：
   ```sql
   SELECT * FROM `yamibuy_mkt`.`mkt_coupon_code` WHERE `ps_id` = 活动ID AND `user_id` = 用户ID;
   ```
5. **检查适用商家**（关键步骤，必须执行）：
   ```sql
   SELECT ps_id, seller_id, seller_name FROM `yamibuy_mkt`.`mkt_coupon_seller` WHERE ps_id = 活动ID AND seller_id IN (商品的seller_id列表);
   ```
   - 如果查不到记录，说明商品所属商家不在券的适用范围内
6. ⭐ **检查商品是否在券的适用范围内**（最终判断依据，必须执行）：
   ```sql
   SELECT rec_id, ps_id, item_number, type, category_id, brand_id FROM `yamibuy_mkt`.`mkt_coupon_item` WHERE ps_id = 活动ID AND item_number IN ('商品编号');
   ```
   - 如果查不到记录，说明该商品不在券的适用范围内，**这是券不可用的最终判断依据**
   - `type` 字段含义：1=全场、2=分类、3=品牌、4=单品
   - 当 type=2（分类）时，也可按分类查询：`WHERE ps_id = 活动ID AND type = 2 AND category_id = 商品分类ID`
   - 当 type=3（品牌）时，也可按品牌查询：`WHERE ps_id = 活动ID AND type = 3 AND brand_id = 商品品牌ID`
7. 常见原因：
   - 活动已过期（status=70 或超过 end_time）
   - 客户已领取并使用过（status=20），每人限领 1 张
   - ⭐ **商品不在 `mkt_coupon_item` 表的适用范围内**（最常见原因，需查 `mkt_coupon_item` 表确认）
   - 商品所属商家不在券的适用商家列表中（需查 `mkt_coupon_seller` 表）
   - 订单金额未达到满减门槛
   - 优惠券限特定平台（PC/H5/APP）

### 场景二：结算页优惠券抵扣异常（抵扣消失 / 金额不符）
触发条件：客人反馈购物车显示优惠券抵扣但结算页消失，或结算页抵扣金额与预期不符

排查步骤：
1. 通过邮箱获取 user_id（Central API 自动查询）
2. 确认是否已下单：
   - 如果客服提供了订单号，直接按订单号查：
     ```sql
     SELECT order_id, order_sn, goods_amount, bonus, bonus_id, order_amount, FROM_UNIXTIME(add_time) as order_time
     FROM `yamibuy_master`.`xysc_order_info` WHERE `order_sn` = '订单号';
     ```
   - 如果没有订单号，按 user_id 查最近订单（需向客服确认客人反馈的大致时间）：
     ```sql
     SELECT order_id, order_sn, goods_amount, bonus, bonus_id, order_amount, FROM_UNIXTIME(add_time) as order_time
     FROM `yamibuy_master`.`xysc_order_info` WHERE `user_id` = 用户ID ORDER BY add_time DESC LIMIT 5;
     ```
3. **分支 A：已下单（bonus > 0）**
   - 说明优惠券实际已生效，客户可能是视觉上的误解
   - 如果拆单了，优惠券抵扣金额会按比例分摊到各子订单：
     ```sql
     SELECT order_id, order_sn, goods_amount, bonus, order_amount
     FROM `yamibuy_master`.`xysc_order_info` WHERE `parent_id` = 主订单ID OR `order_id` = 主订单ID;
     ```
   - 常见原因：
     - 购物车金额是预估值，以结算页金额为准
     - 拆单后优惠券抵扣分摊到各子订单，客户可能只看到某个子订单以为没抵扣
     - 结算时商品组合变化（如部分商品缺货被移除），导致不再满足优惠券使用条件
4. **分支 B：未下单（没有订单号）**
   - 查询优惠券活动规则（同场景一步骤 1-4），确认券类型、满减门槛、适用商品范围
   - 查询用户优惠券领取状态：
     ```sql
     SELECT coupon_id, ps_id, user_id, status, off_amount, FROM_UNIXTIME(in_dtm) as receive_time
     FROM `yamibuy_mkt`.`mkt_coupon_code` WHERE `ps_id` = 活动ID AND `user_id` = 用户ID;
     ```
   - **自动查询 Kibana 日志获取购物车商品信息**（不要等客服要求）：
     - 索引：`k8s-ec-so-service-log-*`
     - 搜索关键词：用户的 user_id
     - 时间范围：客人反馈的时间前后（如最近 3 天）
     - 重点关注：`checkCouponBySelect`（手动选券）和 `physical`（结算页）相关日志
   - 从日志中提取购物车商品列表，逐一核对：
     - 每个商品的 item_number 是否在 `mkt_coupon_item` 表中该 ps_id 下有记录
     - 符合条件的商品金额合计是否达到满减门槛
   - 常见原因：
     - 购物车中部分商品不在 `mkt_coupon_item` 的适用范围内，实际符合条件的金额不足满减门槛
     - 购物车金额是预估值，结算时会重新计算（部分商品可能缺货被移除）
     - 固定金额满减券不存在"部分抵扣"，如果显示减少了，说明可能自动切换到了其他优惠券

### 场景三：优惠券已使用但客户不知情
触发条件：客人反馈优惠券无法使用，实际已在之前的订单中使?

排查步骤?
1. 查询优惠券使用记录：
   ```sql
   SELECT coupon_id, ps_id, user_id, order_id, off_amount, status,
          FROM_UNIXTIME(in_dtm) as receive_time, FROM_UNIXTIME(use_dtm) as use_time
   FROM `yamibuy_mkt`.`mkt_coupon_code` WHERE `ps_id` = 活动ID AND `user_id` = 用户ID;
   ```
2. 如果 status=20 ?order_id 有值，说明已在该订单中使用
3. 查询关联订单确认抵扣情况?
   ```sql
   SELECT order_id, order_sn, bonus, order_amount, FROM_UNIXTIME(add_time) as order_time
   FROM `yamibuy_master`.`xysc_order_info` WHERE `order_id` = 订单ID;
   ```
4. 告知客户该券已在哪个订单中使用，抵扣了多少金?

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 折扣码在 `mkt_coupon_ps_code` 表中存储，不?`mkt_coupon_code` 表的 coupon_code 字段中（coupon_code 是系统生成的唯一码）
- `ps_content` 字段为大 JSON，解析时注意 `codeItemsScope.excelData` 可能包含数百个商?ID
- 优惠券活动的有效期以 `mkt_promotion_schedule` ?start_time/end_time 为准，同?ps_content 中的 `couponContent.use_start_time/use_end_time` 也记录了使用有效?
- 拆单场景下，优惠券关联的 order_id 是主订单 ID，抵扣金额按比例分摊到各子订单的 bonus 字段
- `mkt_promotion_schedule` 表中活动有效期字段为 `start_time` / `end_time`，不存在 `use_start_date` / `use_end_date` 字段
- `mkt_coupon_code` 表中优惠券使用有效期字段为 `use_start_time` / `use_end_time`（Unix 时间戳）
