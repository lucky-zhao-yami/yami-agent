---
inclusion: manual
---

# 商品信息问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为商品信息排查类问题：
- 商品、保质期、shelf_life、商品详情、商品页面
- item、商品属性、预售、预售商品
- 商品显示、页面显示、商品信息

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

## Kibana 日志索引
- 商品服务日志：`search.py -s ec-item`
- 搜索关键词：item_number

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

## 排查场景

### 场景一：商品保质期查询
触发条件：客服询问某商品页面显示的保质期、保质期到哪天

```
第一步：获取 item_number

客服提供了什么信息？
├─ 有 item_number → 直接使用
├─ 有订单号 → [Q1] 查 xysc_order_goods 获取 item_number
├─ 有 goods_id → 查 im_item WHERE goods_id = xxx 获取 item_number
└─ 只有商品名称 → 查 im_item_description 或 xysc_goods 模糊匹配

第二步：并行查询 → [Q2] + [Q3] + [Q4]
↓
判断保质期是否会在前端展示：
├─ business_type ≠ 6 → 不展示保质期（非预售商品）
├─ 标签不含 tag_id=788 → 不展示保质期（非年货商品）
├─ shelf_life 为 null 或 ≤0 或 >180 → 不展示保质期（值不在有效范围）
├─ 以上全部满足 → 前端展示保质期为 shelf_life 天
└─ 不满足展示条件 → 前端不展示保质期
    → 如客户确实看到了过期日期标注，联系 @Gavin wang 确认展示逻辑
```

## 注意事项
- `shelf_life` 存储的是保质期天数（整数），不是具体到期日期
- 前端展示保质期的具体到期日期计算逻辑需查前端代码确认
- `business_type = 6` 且 `tag_id = 788` 是预售商品的必要条件，缺一不可
- 商品信息查询主要在 `yamibuy_im` 库，不在 `yamibuy_master` 库
- `xysc_order_goods.item_number` 可直接关联到 `yamibuy_im` 库的商品信息
- 商品详情页展示的过期日期/有效期/保质期：联系 @Gavin wang 查询
- 店铺（Seller Portal）商品详情页面展示的到期日期：联系 @Damon 查询
