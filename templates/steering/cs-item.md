---
inclusion: manual
---

# 商品信息问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为商品信息排查类问题：
- 商品、保质期、shelf_life、商品详情、商品页面
- item、商品属性、预售、预售商品
- 商品显示、页面显示、商品信息
- CRV、crv、回收费、环保费、California Redemption、回收点、回收点拒收

## 常用数据库表
- `yamibuy_im`.`im_item` - 商品主表（item_number、goods_id、business_type、status、category_id、brand_id、seller_id）
- `yamibuy_im`.`im_item_extend` - 商品扩展信息表（item_number、shelf_life、estimated_arrival_start、estimated_arrival_end、slug、share_inventory、clone_type）
- `yamibuy_im`.`im_item_tag` - 商品标签关联表（item_number、tag_id）
- `yamibuy_im`.`im_item_description` - 商品描述表（item_number、language_id、detail_specification=规格参数JSON、overview=商品详情HTML/图片、edit_dtm=最后编辑时间、edit_user=编辑人。⚠️ 无 title 字段。注意：overview 中的图片不会显示赠品信息）
- `yamibuy_im`.`im_item_short_description` - 商品短描述表（item_number、language_id、selling_point）
- `yamibuy_im`.`im_item_price_setting` - 商品价格设置表（item_number、platform_code、channel_code）
- `yamibuy_im`.`im_item_area_price_setting` - 商品区域价格表（item_number、unit_price、promotion_price 等）
- `yamibuy_master`.`xysc_goods` - 商品基础表（goods_id、goods_name、goods_sn、shop_price 等）
- `yamibuy_master`.`xysc_order_goods` - 订单商品表（order_id、goods_id、item_number、goods_name 等）
- `yamibuy_mkt`.`mkt_gift_lookup` - 赠品活动商品关联表（ps_id、item_number、goods_id）—— 记录哪些商品参与了赠品活动
- `yamibuy_mkt`.`mkt_gift_item` - 赠品活动赠品明细表（ps_id、item_number=赠品item_number、goods_id=赠品goods_id、wh_num=仓库、gift_qty=赠品库存数量）
- `yamibuy_mkt`.`mkt_promotion_schedule` - 营销活动排期表（ps_id、start_time/end_time=Unix时间戳秒、status、type、ps_text_cn=前端展示文案）
- `yamibuy_im`.`im_item_gift_mapping` - 商品赠品映射表（item_number、gift_number、in_dtm、in_user）
- `yamibuy_master`.`xysc_order_activity_gift` - 订单赠品记录表（purchase_id=order_id、act_id、goods_id、num）
- `yamibuy_im`.`im_item_crv` - 商品 CRV 环保回收费配置表（item_number、state=州缩写、crv=单件CRV金额、status: 0=禁用 1=启用、in_user、edit_user）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## ⚠️ 核心业务规则

### item_number 与 goods_id 的关系
- `item_number` 是 yamibuy_im 库中的商品唯一标识（10位数字）
- `goods_id` 是 yamibuy_master 库中的商品ID
- 两者通过 `yamibuy_im.im_item.goods_id` 关联
- `yamibuy_master.xysc_order_goods` 表同时包含 `goods_id` 和 `item_number` 字段，可直接获取两者

### 保质期显示逻辑（源码：`ItemQueryService.handlePreSaleProductInternal`）
- `shelf_life` 字段存储在 `yamibuy_im.im_item_extend` 表中，单位为天
- 前端仅在满足以下**全部条件**时才展示保质期：
  1. `im_item.business_type = 6`（预售商品）
  2. 商品标签包含 `tag_id = 788`（年货商品tag）
  3. `shelf_life` 值在 `(0, 180]` 范围内
- 不满足任一条件时，`shelf_life` 被置为 null，前端不展示
- 同时 `estimated_arrival_start` 和 `estimated_arrival_end`（预计到货时间）也仅在预售条件满足时展示

### 促销活动商品关联方式（不同 type 不同）
- type=10（折扣）→ 商品在 `ps_content` JSON 的 `containRule.customizeList` 数组中（按 goods_id 关联，含 promote_price）
- type=11（秒杀/满减）→ 商品在 `mkt_seckill_item` 表中（按 item_number 关联，含 seckill_price）
- type=12（优惠券）→ 商品在 `mkt_coupon_item` 表中（按 item_number 关联）
- type=13（闪购）→ 同 type=11

### CRV 业务逻辑（源码：`CrvFeeService.fetchItemCrv`）
- Apollo 配置 `crv_config` 控制全局开关（switch: 0=关闭 1=开启）和生效州列表（states 数组）
- 只有收货州在 `crv_config.states` 列表中才收取 CRV
- CRV 金额来自 `im_item_crv` 表，按 item_number + state 匹配，仅取 status=1 的记录
- CRV 计入订单总金额：`order_amount = goods_amount - 优惠 + tax + shipping_fee + crv + service_fee - gift_card_money`
- Mapping/Combo 商品的 CRV 按原品分别查询
- 订单级 CRV = 各商品 goods_crv × goods_number 之和

## Kibana 日志索引
- 商品服务日志：`search.py -s ec-item`，关键词：item_number
- 订单服务日志（CRV）：`search.py -s ec-so`，关键词：purchase_id

## 常用查询

**[Q1] 通过订单号查商品的 item_number**
```sql
SELECT og.goods_id, og.goods_name, og.goods_sn, og.item_number, og.goods_number
FROM yamibuy_master.xysc_order_goods og
WHERE og.order_id = (SELECT order_id FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号');
```

**[Q2] 查商品基本信息**
```sql
SELECT item_number, goods_id, business_type, status, category_id, brand_id, seller_id
FROM yamibuy_im.im_item WHERE item_number = 'item_number';
```

**[Q3] 查商品扩展信息（含保质期）**
```sql
SELECT item_number, shelf_life, estimated_arrival_start, estimated_arrival_end, clone_type, share_inventory
FROM yamibuy_im.im_item_extend WHERE item_number = 'item_number';
```

**[Q4] 查商品标签**
```sql
SELECT item_number, tag_id FROM yamibuy_im.im_item_tag WHERE item_number = 'item_number';
```

**[Q5] 查商品价格**
```sql
SELECT item_number, unit_price, promotion_price, is_promotion,
       seckill_price, seckill_status, member_price, member_status,
       giftcard_price, giftcard_status
FROM yamibuy_im.im_item_area_price_setting WHERE item_number = 'item_number';
```

**[Q6] 查商品参与的折扣活动（type=10，通过 ps_content JSON）**
```sql
-- 先查时间范围内的 type=10 活动
SELECT ps_id, type, status, ps_text_cn,
       FROM_UNIXTIME(start_time) AS start_time,
       FROM_UNIXTIME(end_time) AS end_time
FROM yamibuy_mkt.mkt_promotion_schedule
WHERE type = 10
  AND start_time <= UNIX_TIMESTAMP('结束时间')
  AND end_time >= UNIX_TIMESTAMP('开始时间')
  AND status IN (30, 40, 50)
ORDER BY start_time DESC;

-- 然后查 ps_content，在 JSON 中搜索 goods_id
SELECT ps_id, ps_content
FROM yamibuy_mkt.mkt_promotion_schedule
WHERE ps_id = xxx;
-- 在 containRule.customizeList 数组中找 goods_id 对应的 promote_price
```

**[Q7] 查商品参与的优惠券活动（type=12）**
```sql
SELECT ps.ps_id, ps.type, ps.status, ps.ps_text_cn,
       FROM_UNIXTIME(ps.start_time) AS start_time,
       FROM_UNIXTIME(ps.end_time) AS end_time
FROM yamibuy_mkt.mkt_promotion_schedule ps
WHERE ps.ps_id IN (
    SELECT DISTINCT ps_id FROM yamibuy_mkt.mkt_coupon_item WHERE item_number = 'item_number'
)
AND ps.start_time <= UNIX_TIMESTAMP('结束时间')
AND ps.end_time >= UNIX_TIMESTAMP('开始时间')
ORDER BY ps.start_time DESC;
```

**[Q8] 查商品参与的秒杀/满减活动（type=11/13）**
```sql
SELECT ps.ps_id, ps.type, ps.status, ps.ps_text_cn,
       FROM_UNIXTIME(ps.start_time) AS start_time,
       FROM_UNIXTIME(ps.end_time) AS end_time,
       si.seckill_price, si.seckill_status
FROM yamibuy_mkt.mkt_promotion_schedule ps
JOIN yamibuy_mkt.mkt_seckill_item si ON ps.ps_id = si.ps_id
WHERE si.item_number = 'item_number'
AND ps.start_time <= UNIX_TIMESTAMP('结束时间')
AND ps.end_time >= UNIX_TIMESTAMP('开始时间')
ORDER BY ps.start_time DESC;
```

**[Q9] 查订单 CRV 明细**
```sql
SELECT a.order_id, a.order_sn, a.purchase_id, a.user_id, a.crv, a.province, a.city, a.zipcode,
       FROM_UNIXTIME(a.add_time) AS order_time,
       b.item_number, b.goods_name, b.goods_number, b.goods_price, b.crv AS goods_crv
FROM yamibuy_master.xysc_order_info a
JOIN yamibuy_master.xysc_order_goods b ON a.order_id = b.order_id
WHERE a.order_sn = '订单号';
```

**[Q10] 查商品 CRV 配置**
```sql
SELECT item_number, state, crv, status,
       FROM_UNIXTIME(in_dtm) AS create_time, in_user,
       FROM_UNIXTIME(edit_dtm) AS edit_time, edit_user
FROM yamibuy_im.im_item_crv
WHERE item_number IN ('商品编号');
```

---

## 排查场景

### 场景一：商品保质期查询
触发条件：客服询问某商品页面显示的保质期、保质期到哪天

```
客服提供了什么信息？
├─ 有 item_number → 直接使用
├─ 有订单号 → [Q1] 查 xysc_order_goods 获取 item_number
├─ 有 goods_id → 查 im_item WHERE goods_id = xxx 获取 item_number
└─ 只有商品名称 → 查 im_item_description 或 xysc_goods 模糊匹配
↓
并行查询 → [Q2] + [Q3] + [Q4]
↓
判断保质期是否会在前端展示：
├─ business_type ≠ 6 → 不展示（非预售商品）
├─ 标签不含 tag_id=788 → 不展示（非年货商品）
├─ shelf_life 为 null 或 ≤0 或 >180 → 不展示（值不在有效范围）
├─ 以上全部满足 → 前端展示保质期为 shelf_life 天
└─ 不满足展示条件但客户确实看到了过期日期标注 → 联系 @Gavin wang 确认展示逻辑
```

### 场景二：商品促销价格查询
触发条件：客服询问某商品在某个时间是否有促销价格、折扣价、活动价

```
客服提供了什么信息？
├─ 有 item_number → 查 im_item 获取 goods_id
├─ 有订单号 → [Q1] 获取 item_number 和 goods_id
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 查最近订单
└─ 有 goods_id → 查 im_item 获取 item_number
↓
并行查当前价格和所有类型活动：
├─ [Q5] im_item_area_price_setting（当前价格、is_promotion）
├─ [Q7] 优惠券类（type=12）→ mkt_coupon_item 关联 mkt_promotion_schedule
├─ [Q8] 秒杀/满减/闪购类（type=11/13）→ mkt_seckill_item 关联 mkt_promotion_schedule
└─ [Q6] 折扣类（type=10）→ ⚠️ 必须查 ps_content JSON！
    → 查 mkt_promotion_schedule WHERE type=10 AND 时间范围
    → 解析 ps_content JSON，在 containRule.customizeList 中搜索 goods_id
    → 找到后读取 promote_price 字段即为促销价
↓
按时间范围过滤：start_time <= 目标日期结束 AND end_time >= 目标日期开始
↓
数据库无法确定时 → 查日志（search.py -s ec-item -k "item_number" -t 时间范围）
```

### 场景三：CRV 环保回收费排查
触发条件：客人反馈 CRV 费用有疑问、包装无 CRV 标志但被收费、回收点拒收等

```
客服提供了什么信息？
├─ 有订单号 → [Q9] 查订单 CRV 明细
├─ 有 user_id → 查最近订单
└─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 查最近订单
↓
并行查询：[Q9] 订单 CRV 明细 + [Q10] 商品 CRV 配置 + Kibana 日志（search.py -s ec-so -k "purchase_id值" -t 7d）
↓
验证 CRV 金额并判断收费是否合理：
├─ 单商品 CRV = im_item_crv.crv × goods_number，所有商品之和 = 订单总 CRV
├─ 与 xysc_order_info.crv 对比是否一致
│   ├─ 一致 → 金额计算正确
│   └─ 不一致 → 异常，查日志定位原因
↓
im_item_crv 中该商品该州的记录？
├─ status=1 → 下单时配置生效，收费有据
├─ status=0 → 配置已被禁用
│   → 查 edit_user 和 edit_dtm 确认禁用时间
│   ├─ 禁用时间晚于下单时间 → 下单时配置仍生效，收费合理但当前已调整
│   └─ 禁用时间早于下单时间 → 异常，需查日志定位原因
└─ 无记录 → 该商品未配置 CRV，不应收费
    → 如订单中仍有 CRV → 异常，查日志定位原因
```

Kibana 关注日志：`"fetch crv error"` — CRV 获取异常

加州 CRV 标准参考：≤24oz（约710ml）容器 $0.05/个，>24oz 容器 $0.10/个，适用品类：碳酸饮料、啤酒、水、果汁等。

## 注意事项
- 商品详情页展示的过期日期/有效期/保质期：联系 @Gavin wang；店铺（Seller Portal）到期日期：联系 @Damon
- `ps_content` JSON 中 `goods_id` 格式不统一（字符串/数字），搜索时用 `LIKE '%goods_id值%'`，需人工确认上下文避免误匹配
- 同一促销活动可能拆分为多个 ps_id，查促销价时需检查所有匹配时间范围的活动；部分商品有 `priceRules` 数组（东西仓区分），`promote_price` 在其内部
- CRV 修改后新订单立即生效，已下单订单不受影响；CRV 与 sales tax 互不影响
- 客人反馈"包装无 CRV 标志"或"回收点拒收"→ 确认 `im_item_crv` 配置是否合理，联系配置操作人
