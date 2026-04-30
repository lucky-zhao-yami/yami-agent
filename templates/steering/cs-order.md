---
inclusion: manual
---

# 订单问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为订单排查类问题：
- 订单、下单、取消订单、订单状态
- 购物车、结算、提单、免邮、运费
- 商品遗漏、商品缺货、赠品
- 订单地址、配送方式、配送地址
- 共享库存、库存不平
- 预计送达时间、exdd
- 订单语言、central 订单显示
- 差价
- order_id、purchase_id、订单号查询
- vendor、invalid vendor、未识别的商家ID、商家ID

## 常用数据库表
- `yamibuy_master`.`xysc_order_info` - 订单基本信息
- `yamibuy_master`.`xysc_order_goods` - 订单商品信息
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（order_exddTime=预计送达时间、order_bufferTime=缓冲时间、order_exsdTime=预计发货时间）
- `yamibuy_so`.`so_order_purchase_record` - 用户支付记录
- `yamibuy_so`.`so_log` - 订单状态流转日志
- `yamibuy_so`.`so_inventory_change_queue` - 库存变更消息队列
- `yamibuy_so`.`order_cancel_queue` - 取消订单消息队列
- `yamibuy_wh`.`wh_order_info` - 仓库订单信息
- `yamibuy_cart`.`so_cart` - 购物车商品信息（check_status=1 为已勾选）
- `yamibuy_master`.`xysc_vendor_info` - 卖家基本信息（vendor_name、is_active）
- `yamibuy_master`.`xysc_vendor_ext` - 卖家扩展信息（is_cancel=订单是否可取消，非卖家注销标记）

> 字段枚举值见 `.kiro/skills/enum-values.md`，解释字段时先查速查表（如 `xysc_order_info.source_flag`、`so_log.type`），无需重复查表结构。

## Kibana 日志索引
- 订单服务：`search.py -s ec-so`，关键词：order_sn / purchase_id / user_id / order_id

## 常用查询

**[Q1] 按订单号查订单基本信息**
```sql
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       shipping_id, shipping_name, shipping_fee, warehouse_number,
       province, city, zipcode, cart_zipcode,
       goods_amount, bonus, order_amount, tax, lang,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

**[Q2] 按 user_id 查最近订单**
```sql
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       shipping_name, shipping_fee, warehouse_number, province,
       goods_amount, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE user_id = user_id ORDER BY add_time DESC LIMIT 5;
```

**[Q3] 查订单商品信息**
```sql
SELECT goods_id, item_number, goods_name, goods_number, goods_price, market_price, is_gift
FROM yamibuy_master.xysc_order_goods WHERE order_id = order_id;
```

**[Q4] 查订单流转日志（so_log）**
```sql
SELECT rec_id, type, `desc`, attributes, in_user, FROM_UNIXTIME(in_dtm) AS log_time
FROM yamibuy_so.so_log WHERE order_id = order_id ORDER BY in_dtm;
```

---

## 排查场景

### 场景一：购物车商品遗漏未结算
触发条件：客人反馈下单时商品遗漏在购物车

```
客服提供了什么信息？
├─ 有订单号 → [Q1] + [Q3] 并行查询
├─ 有 user_id → [Q2] 查最近订单
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → [Q2]
└─ 有 order_id / purchase_id → 查 xysc_order_info
↓
对比订单商品与客人反馈遗漏的商品：
├─ 遗漏商品不在订单中 → 查日志（search.py -s ec-so -k "order_sn值" -t 7d）
│   ├─ 有 check_item 记录 → 用户手动取消了勾选
│   └─ 无 → 商品曾缺货/失效？恢复后购物车默认未勾选，属正常
└─ 遗漏商品在订单中 → 客人看错了，告知已包含
```

注意：购物车金额是预估值，以结算页金额为准。

### 场景二：运费问题（多笔运费 / 免邮问题）
触发条件：客人反馈收取了多笔运费、应该免邮但收了运费

```
客服提供了什么信息？
├─ 有订单号 → [Q1]
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → [Q2]
└─ 有 user_id → [Q2]
↓
shipping_name / shipping_fee / warehouse_number / province？
├─ Two-Day → 不免邮，不同仓库需收两次邮费，属正常
├─ Standard + 多仓库 → 非主仓不满包邮条件会收运费，属正常
├─ 夏威夷/阿拉斯加 → 不包邮，属正常
└─ 其他 → 查日志确认运费计算逻辑
```

注意：购物车免邮信息是预估值，以结算页为准。共享库存商品可能从不同仓库发出。

### 场景三：订单号查询
触发条件：客服需要查询订单号，可能提供了 order_id、purchase_id、user_id 或邮箱

```
客服提供了什么信息？
├─ 有 order_id / purchase_id → 直接查 xysc_order_info
├─ 有 user_id → [Q2]
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → [Q2]
└─ 以上都查不到 → 查 so_order_purchase_record
↓
xysc_order_info 查到？
├─ 查到 → 返回订单号和状态，结束
└─ 查不到 → ⚠️ 同时查 payment_charge 确认是否扣款（详见 cs-payment-refund.md 场景二）
      ↓
      查 so_order_purchase_record.status：
      ├─ 无记录 → 订单在亚米系统不存在，确认订单号是否正确
      ├─ status=0 → 预占中，尚未支付
      ├─ status=1 → 超时取消
      ├─ status=2 → 主动取消
      └─ status=3（支付成功但无订单）→ 临时订单丢失
            → 查 payment_refund：
            ├─ 退款成功 + "临时订单丢失" → 系统已自动退款
            └─ 无退款或失败 → 需人工处理退款
```

```sql
-- 按 order_id 查
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_id = 'order_id';

-- 按 purchase_id 查（与上条按需选用，禁止 OR 合并）
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE purchase_id = 'purchase_id';

-- 查支付预占记录
SELECT purchase_id, user_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE purchase_id = 'purchase_id';

-- 查最近预占记录（有 user_id 时）
SELECT purchase_id, user_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE user_id = user_id ORDER BY in_dtm DESC LIMIT 5;

-- 查退款记录（仅 status=3 且无订单时）
SELECT purchase_id, status, refund_amount, refund_reason, FROM_UNIXTIME(refund_dtm) AS refund_time
FROM yamibuy_payment.payment_refund WHERE purchase_id = 'purchase_id';
```

### 场景四：订单状态不流转
触发条件：订单长时间停留在某个状态

```
客服提供了什么信息？
├─ 有订单号 → [Q1]
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → [Q2]
└─ 有 user_id / order_id / purchase_id → 查 xysc_order_info
↓
并行查询：[Q1] + [Q4] + payment_charge
↓
分析 so_log 流转记录，确认卡在哪个节点：
├─ 有支付记录（type=10）但无后续 → 查 payment_charge.pay_status
│   ├─ pay_status=60（成功）→ 支付回调后流程中断，查日志定位
│   └─ 未成功 → 支付未完成，正常等待
├─ 有欺诈验证（type=20-24）未通过
│   ├─ type=22 → 需人工审批
│   └─ type=24 → 被欺诈系统拒绝
├─ 有 down 单（type=30）但无发货（type=33）→ 卡在仓库，联系仓库确认
├─ so_log 最后记录距今很久 → 流程可能中断，查日志定位
└─ 流转正常 → 确认客人预期是否合理
```

```sql
-- 查支付状态（与 [Q1] [Q4] 并行）
SELECT tx_id, purchase_id, pay_status, pay_provider, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';
```

### 场景五：预计送达时间查询
触发条件：客人询问预计送达时间

```
拿到 order_id 后，并行查询：so_order_ext + so_tracking_info
↓
预计送达范围：最早 = order_exddTime - order_bufferTime，最晚 = order_exddTime（UTC 时间戳）
↓
so_tracking_info 有 exddTime？
├─ 有 → AfterShip 推送了更新时间，以此为准
└─ 无 → 以下单时预估为准
```

```sql
SELECT order_exddTime, order_bufferTime, order_exsdTime,
       FROM_UNIXTIME(order_exddTime) AS exdd_time,
       FROM_UNIXTIME(order_exddTime - order_bufferTime) AS earliest_time
FROM yamibuy_so.so_order_ext WHERE order_id = 'order_id';

SELECT tracking_number, carrier, delivery_status, exddTime,
       FROM_UNIXTIME(exddTime) AS estimated_delivery,
       FROM_UNIXTIME(deliveryTime) AS actual_delivery
FROM yamibuy_so.so_tracking_info WHERE order_id = 'order_id';
```

注意：详情页用最快配送方式计算，结算页用可用配送方式计算，两者逻辑不同。

### 场景六：不可配送区域成功下单
触发条件：不应配送的区域（如波多黎各）成功下单

```
[Q1] 查订单收货地址
↓
province/zipcode 在限制区域？
├─ 是 → 查日志（search.py -s ec-so -k "order_sn值" -t 7d）
│   ├─ 地址校验被跳过 → 系统推荐地址绕过了下拉框限制
│   └─ 无异常 → 查 so_log type=40（地址修改）
│       ├─ 有 → 下单后地址被修改到限制区域
│       └─ 无 → 下单时就用了限制区域地址，反馈产品优化
└─ 否 → 地址不在限制区域，订单正常
```

### 场景七：库存不平
触发条件：订单取消后库存异常

```
并行查询：so_inventory_change_queue + [Q4] so_log + order_cancel_queue
↓
so_log 有重复还库存记录？
├─ 是 → 取消时已还库存 + 出库失败后仓库再次归还，导致还了两次
└─ 否 → so_inventory_change_queue 有还库存消息？
      ├─ 有 → 库存已归还，查日志确认仓库是否收到
      └─ 无 → order_cancel_queue 有取消消息？
            ├─ 有 → 库存归还可能延迟，查日志确认
            └─ 无 → 取消流程异常，联系开发
↓
查 so_log 中 type=31（拣货）和 type=12（取消）的时间顺序：
├─ 拣货后取消 → 库存可能未归还，联系仓库确认实物
└─ 取消后无拣货 → 库存应已归还
```

```sql
SELECT * FROM yamibuy_so.so_inventory_change_queue WHERE order_id = 'order_id';
SELECT * FROM yamibuy_so.order_cancel_queue WHERE order_id = 'order_id';
```

### 场景八：Central 订单商品语言显示问题
触发条件：Central 切换语言后商品名称显示不正确

```
[Q1] 查 xysc_order_info.lang：
├─ 0（中文）/ 4（繁体）→ 切英文时商品名仍显示原语言，属正常逻辑
└─ 1（英文）→ 应显示英文，显示其他语言则异常，联系开发
```

### 场景九：赠品未随订单发出
触发条件：订单有买赠活动但未收到赠品

```
[Q3] 查 xysc_order_goods，有 is_gift=1 的记录？
├─ 有 → 赠品在订单中，查物流确认是否发出
└─ 无 → 查日志（search.py -s ec-so -k "order_sn值" -t 7d）
      → 常见原因：MKT 接口未返回赠品（赠品库存没了），找 MKT 确认
```

### 场景十：商品差价查询
触发条件：客服反馈客人询问下单价与当前页面价格是否有差价

```
并行查询：[Q1] + [Q3] + xysc_goods + im_item_area_price_setting
↓
对比下单价（goods_price）与当前价格：
├─ 当前价格 < 下单价 → 存在差价
│   ├─ is_promotion=1 且 mkt_ps_id 有值 → 商品参加了新促销，查 mkt_promotion_schedule 确认
│   ├─ xysc_goods.shop_price 变了 → 基础售价被调整
│   ├─ member_price/seckill_price/giftcard_price 生效 → 限时价格
│   └─ 以上都不是 → 查日志定位
├─ 当前价格 = 下单价 → 无差价
└─ 当前价格 > 下单价 → 客人下单时更低，无需补偿
↓
输出：下单价与当前所有生效价格的对比表，标注生效价格类型，计算差价金额
```

```sql
-- 查商品当前基础售价
SELECT goods_id, shop_price, market_price, promote_price
FROM yamibuy_master.xysc_goods WHERE goods_id = 商品ID;

-- 查区域定价（rule_id 区分区域，同一 item_number 可能多条记录）
SELECT item_number, unit_price, promotion_price, is_promotion,
       FROM_UNIXTIME(promote_start_date) AS promo_start, FROM_UNIXTIME(promote_end_date) AS promo_end,
       member_price, member_status,
       seckill_price, seckill_status,
       pin_price, is_pin, giftcard_price, giftcard_status, mkt_ps_id
FROM yamibuy_im.im_item_area_price_setting WHERE item_number = '商品编号';

-- mkt_ps_id 有值时查促销活动详情
SELECT ps_id, ps_title, ps_sub_title, status,
       FROM_UNIXTIME(start_time) AS start_date, FROM_UNIXTIME(end_time) AS end_date
FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = 活动ID;
```

差价注意事项：
- 差价只对比单件商品 goods_price 与当前售价，与优惠券/积分/礼卡等订单级抵扣无关
- 系统无自动补差价逻辑，补差价为客服手动操作
- `xysc_goods` 无 `item_number` 字段，必须用 `goods_id` 查询
- 无 `im_item_area_price_setting` 记录的商品：价格取 `xysc_goods.shop_price`，促销价需同时查 `mkt_promotion_schedule` type=10 活动的 `ps_content` JSON
- `ps_content` 中 `goods_id` 格式不统一（字符串/数字），搜索用 `LIKE '%goods_id值%'`，需人工确认上下文
- 同一促销活动可能拆分为多个 ps_id，需检查所有匹配时间范围的活动

### 场景十一：结算失败 - invalid vendor ID（错误码 10069）
触发条件：客人反馈结算时出现 "invalid vendor ID" 错误

```
客服提供了什么信息？
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` 查 user_id
└─ 有 user_id → 直接使用
↓
查购物车已勾选商品（check_status=1），提取 seller_id 列表
→ 验证每个 seller_id 的卖家配置完整性（vendor_info + shipping + shipping_calculate）
↓
某个 vendor_id 配置缺失？
├─ 是 → 建议客户取消勾选该卖家商品即可结算，反馈运营修复配置
└─ 否 → 可能是 Redis 缓存问题，查日志定位
```

```sql
-- 查购物车已勾选商品
SELECT c.goods_id, c.item_number, c.seller_id, c.qty, g.goods_name
FROM yamibuy_cart.so_cart c
LEFT JOIN yamibuy_master.xysc_goods g ON c.goods_id = g.goods_id
WHERE c.user_id = user_id AND c.check_status = 1
ORDER BY c.seller_id, c.goods_id;

-- 验证卖家配置完整性
SELECT v.vendor_id, v.vendor_name, v.is_active,
       s.shipping_id, s.enabled, s.is_primary,
       calc.base_expression
FROM yamibuy_master.xysc_vendor_info v
LEFT JOIN yamibuy_master.xysc_shipping s ON s.vendor_id = v.vendor_id AND s.is_primary = 1
LEFT JOIN yamibuy_master.xysc_shipping_calculate calc ON s.shipping_id = calc.shipping_id
WHERE v.vendor_id IN (seller_id列表);
```

### 场景十二：订单无法修改地址
触发条件：客人反馈无法修改订单收货地址

```
[Q1] + [Q4] 并行查询
↓
订单当前状态？
├─ 已发货（order_status=5, shipping_status=1）→ 发货后不允许修改
│   → so_log type=36 获取快递单号，建议联系承运商拦截/改派
├─ 已取消 → 无需修改
└─ 未发货 → 查日志确认修改失败原因
↓
so_log 有 type=40（地址修改）记录？
├─ 有 → 已成功修改过，对比前后地址确认是否生效
└─ 无 → 用户未成功提交过修改
```

## 注意事项
- 商品详情页过期日期/保质期：联系 @Gavin wang；店铺到期日期：联系 @Damon
- 活动页优惠券按钮无法点击 / 商品加购提示有误：联系 @Gavin wang
- 订单取消退款积分：RMA 按订单维度扣，customer 扣积分达赠送上限不再扣
- FBY 订单含多个商家，退款按子单退
- 结算失败但有物流信息：可能是生成 label 后结算被网关拒绝，包裹不会实际出库
- 拆单场景优惠券抵扣（bonus）按比例分摊到子订单，需查所有子订单合计。详见 cs-coupon.md
- 发货后无法改地址，需联系承运商拦截/改派，快递单号从 so_log type=36 或 so_tracking_info 获取