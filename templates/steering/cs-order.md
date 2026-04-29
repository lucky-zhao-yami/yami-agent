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
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（order_exddTime=预计送达时间、order_bufferTime=缓冲时间、order_exsdTime=预计发货时间、礼卡接收方式等）
- `yamibuy_so`.`so_order_purchase_record` - 用户支付记录
- `yamibuy_so`.`so_log` - 订单状态流转日志
- `yamibuy_so`.`so_inventory_change_queue` - 库存变更消息队列
- `yamibuy_so`.`order_cancel_queue` - 取消订单消息队列
- `yamibuy_wh`.`wh_order_info` - 仓库订单信息
- `yamibuy_cart`.`so_cart` - 购物车商品信息（check_status=1 为已勾选）
- `yamibuy_master`.`xysc_vendor_info` - 卖家基本信息（vendor_name、is_active）
- `yamibuy_master`.`xysc_vendor_ext` - 卖家扩展信息（is_cancel=订单是否可取消，非卖家注销标记）

> 字段枚举值见 `.kiro/skills/enum-values.md`，解释字段时先查速查表（如 `xysc_order_info.source_flag`、`so_log.type`），无需重复查表结构。

## 常用查询

以下为各场景中高频使用的公共 SQL，场景中以 `[Qn]` 引用。

### [Q1] 按订单号查订单基本信息

```sql
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       shipping_id, shipping_name, shipping_fee, warehouse_number,
       province, city, zipcode, cart_zipcode,
       goods_amount, bonus, order_amount, tax, lang,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

### [Q2] 按 user_id 查最近订单

```sql
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       shipping_name, shipping_fee, warehouse_number, province,
       goods_amount, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE user_id = user_id ORDER BY add_time DESC LIMIT 5;
```

### [Q3] 查订单商品信息

```sql
SELECT goods_id, item_number, goods_name, goods_number, goods_price, market_price, is_gift
FROM yamibuy_master.xysc_order_goods WHERE order_id = order_id;
```

### [Q4] 查订单流转日志（so_log）

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
├─ 有订单号 → 并行查询：xysc_order_info（订单状态）+ xysc_order_goods（商品信息）
├─ 有 user_id → 查最近订单：xysc_order_info WHERE user_id = xxx ORDER BY add_time DESC
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
└─ 有 order_id / purchase_id → 查 xysc_order_info 获取订单号
↓
拿到订单后，并行查询订单状态和商品信息
↓
对比订单商品与客人反馈遗漏的商品
├─ 遗漏商品不在订单中 → 查日志（search.py -s ec-so -k "order_sn值" -t 7d）
│   日志中有 check_item（取消勾选）记录？
│   ├─ 有 → 用户手动取消了勾选
│   └─ 无 → 查 item_check / physical / submit 接口日志
│         ↓
│         商品是否曾经缺货/失效？
│         ├─ 是 → 恢复库存后购物车默认未勾选，属正常逻辑
│         └─ 否 → 查日志进一步定位（search.py -s ec-so -k "user_id值" -t 7d）
└─ 遗漏商品在订单中 → 客人可能看错了，告知订单中已包含该商品
```

查订单信息 → 见 [Q1]
查最近订单 → 见 [Q2]
查订单商品 → 见 [Q3]

注意：购物车金额是预估值，以结算页金额为准。

### 场景二：运费问题（多笔运费 / 免邮问题）
触发条件：客人反馈收取了多笔运费、应该免邮但收了运费

```
客服提供了什么信息？
├─ 有订单号 → 直接查 xysc_order_info
├─ 有 user_id → 查最近订单
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
└─ 有 order_id / purchase_id → 查 xysc_order_info 获取订单号
↓
查到订单后，确认配送方式和运费
↓
shipping_name / shipping_fee / warehouse_number / province = ?
├─ Two-Day → 不免邮，从不同仓库发出需收取两次邮费，属正常
├─ Standard → warehouse_number 是否有多个仓库？
│             ├─ 是 → 非主仓发出的商品如不满包邮条件会收运费，属正常
│             └─ 否 → 查日志确认运费计算逻辑（search.py -s ec-so -k "purchase_id值" -t 7d）
├─ 收货地址是夏威夷/阿拉斯加？ → 不包邮，属正常
└─ 其他 → 查日志（search.py -s ec-so -k "purchase_id值" -t 7d）确认运费计算详情
```

查订单配送和运费信息 → 见 [Q1]
查最近订单 → 见 [Q2]

注意：购物车显示的免邮信息是预估值，以结算页为准。共享库存商品虽都是亚米发货，但可能从不同仓库发出。

### 场景三：订单号查询
触发条件：客服需要查询订单号（order_sn），可能提供了 order_id、purchase_id、user_id 或邮箱

```
客服提供了什么信息？
├─ 有 order_id / purchase_id → 直接查 xysc_order_info
├─ 有 user_id → 查 xysc_order_info 最近订单
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
└─ 以上都查不到 → 用 user_id 查 so_order_purchase_record 预占记录

第一步：查 xysc_order_info
├─ ✅ 查到 → 返回订单号和状态，结束
└─ ❌ 查不到 → 第二步
              ⚠️ 同时查 payment_charge 确认是否实际扣款成功，如已扣款再查 payment_refund 确认是否已自动退款（详见 cs-payment-refund.md 场景二）

第二步：查 so_order_purchase_record（支持 purchase_id 或 user_id）
├─ ❌ 查不到 → 告诉客服：该订单在亚米系统不存在，请确认订单号是否正确
└─ ✅ 查到了，根据 status 判断：
      ├─ status=0（已预占）→ 订单预占中，尚未支付
      ├─ status=1（超时取消）→ 订单已超时取消
      ├─ status=2（主动取消）→ 订单已被主动取消
      └─ status=3（支付成功）→ 进入第三步 👇

第三步（仅 status=3 但 xysc_order_info 无记录时）：
说明支付成功但订单未落库，可能是临时订单丢失
查 payment_refund 表确认是否已自动退款：
├─ ✅ 退款成功 + refund_reason 含"临时订单丢失" → 告诉客服：支付成功但临时订单丢失，系统已自动退款
└─ ❌ 无退款记录或退款失败 → 告诉客服：支付成功但订单未生成且未自动退款，需人工处理退款
```

```sql
-- 第一步：查订单表（按 order_id 查）
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_id = 'order_id';

-- 第一步：查订单表（按 purchase_id 查，与上条按需选用，禁止 OR 合并）
SELECT order_id, order_sn, purchase_id, order_status, shipping_status, pay_status,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE purchase_id = 'purchase_id';
```

查最近订单 → 见 [Q2]

```sql
-- 第二步：查支付预占记录（支持 purchase_id 或 user_id）
SELECT purchase_id, user_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE purchase_id = 'purchase_id';

-- 有 user_id 时：查最近预占记录
SELECT purchase_id, user_id, status, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_so.so_order_purchase_record WHERE user_id = user_id ORDER BY in_dtm DESC LIMIT 5;

-- 第三步：查退款记录（仅 status=3 且第一步无记录时执行）
SELECT purchase_id, status, refund_amount, refund_reason, FROM_UNIXTIME(refund_dtm) AS refund_time
FROM yamibuy_payment.payment_refund WHERE purchase_id = 'purchase_id';
```

### 场景四：订单状态不流转
触发条件：订单长时间停留在某个状态

```
客服提供了什么信息？
├─ 有订单号 → 直接查 xysc_order_info
├─ 有 user_id / 邮箱 → 查最近订单
└─ 有 order_id / purchase_id → 查 xysc_order_info
↓
并行查询：订单状态 + so_log 流转日志 + 支付状态
↓
分析 so_log 流转记录，确认卡在哪个节点：
├─ 有支付记录（type=10）但无后续流转 → 支付后流程中断
│   → 查 payment_charge.pay_status 确认支付是否真的成功（pay_status=60）
│   ├─ 支付成功 → 支付回调后订单流程中断，查日志定位
│   │   search.py -s ec-so -k "purchase_id值" -t 7d
│   │   ├─ 有报错信息 → 根据日志定位原因
│   │   └─ 无可用信息 → 联系开发排查
│   └─ 支付未成功 → 支付未完成，订单正常等待中
├─ 有欺诈验证记录（type=20-24）但未通过 → 卡在欺诈验证
│   ├─ type=22（等待审批）→ 需人工审批
│   └─ type=24（拒绝）→ 订单被欺诈系统拒绝
├─ 有 down 单记录（type=30）但无发货（type=33）→ 卡在仓库环节
│   → 联系仓库确认
├─ so_log 最后一条记录时间距今很久 → 流程可能中断
│   → 查日志进一步定位（search.py -s ec-so -k "order_id值" -t 7d）
│   ├─ 有报错信息 → 根据日志定位原因
│   └─ 无可用信息 → 联系开发排查
└─ so_log 流转正常 → 订单状态可能是正常的，确认客人预期是否合理
```

查订单状态 → 见 [Q1]
查订单流转日志 → 见 [Q4]

```sql
-- 查支付状态（与上条并行）
SELECT tx_id, purchase_id, pay_status, pay_provider, FROM_UNIXTIME(in_dtm) AS pay_time
FROM yamibuy_payment.payment_charge WHERE purchase_id = 'purchase_id';
```

### 场景五：预计送达时间查询
触发条件：客人询问预计送达时间

```
拿到 order_id 后，并行查询：so_order_ext + so_tracking_info
↓
预计送达时间范围（基于 so_order_ext）：
- 最早送达 = order_exddTime - order_bufferTime
- 最晚送达 = order_exddTime
（注意时区转换，数据库存的是 UTC 时间戳）
↓
so_tracking_info 中有 exddTime？
├─ 有 → AfterShip 推送了更新的预计送达时间，以此为准
└─ 无 → 以下单时预估为准
```

```sql
-- 查下单时预估的送达时间
SELECT order_exddTime, order_bufferTime, order_exsdTime,
       FROM_UNIXTIME(order_exddTime) AS exdd_time,
       FROM_UNIXTIME(order_exddTime - order_bufferTime) AS earliest_time
FROM yamibuy_so.so_order_ext WHERE order_id = 'order_id';

-- 查物流实际推送的送达时间（与上条并行）
SELECT tracking_number, carrier, delivery_status, exddTime,
       FROM_UNIXTIME(exddTime) AS estimated_delivery,
       FROM_UNIXTIME(deliveryTime) AS actual_delivery
FROM yamibuy_so.so_tracking_info WHERE order_id = 'order_id';
```

注意：详情页用最快的配送方式计算，结算页用可用配送方式计算，两者逻辑不同。

### 场景六：不可配送区域成功下单
触发条件：不应配送的区域（如波多黎各）成功下单

```
拿到订单号后，查订单的收货地址和下单日志
↓
确认收货地址 province/zipcode 是否在限制区域
├─ 是 → 查日志确认下单时的地址校验情况
│   search.py -s ec-so -k "order_sn值" -t 7d
│   ├─ 日志显示地址校验被跳过 → 可能是系统推荐地址绕过了下拉框限制
│   └─ 日志无异常 → 查 so_log 确认是否有地址修改记录（type=40）
│       ├─ 有 → 下单后地址被修改到限制区域
│       └─ 无 → 下单时就用了限制区域地址，需反馈产品看是否需要优化
└─ 否 → 地址不在限制区域，订单正常
```

查订单收货地址 → 见 [Q1]

```sql
-- 查地址修改日志（与上条并行）
SELECT rec_id, type, `desc`, attributes, in_user, FROM_UNIXTIME(in_dtm) AS log_time
FROM yamibuy_so.so_log WHERE order_id = order_id AND type = 40 ORDER BY in_dtm;
```

### 场景七：库存不平
触发条件：订单取消后库存异常

```
1. 并行查询：库存变更消息队列 + 订单状态流转日志 + 取消订单队列
   ↓
   so_log 中是否有重复还库存记录？
   ├─ 是 → 取消订单时已还库存，但订单正在出库，出库失败后仓库再次归还，导致还了两次
   └─ 否 → 查 so_inventory_change_queue 确认库存变更消息
          ├─ 有还库存消息 → 库存已正常归还，查日志确认仓库是否收到
          │   search.py -s ec-so -k "order_id值" -k "inventory" -t 7d
          └─ 无还库存消息 → 查 order_cancel_queue 确认取消消息是否发出
              ├─ 取消消息已发出 → 库存归还可能延迟，查日志确认（search.py -s ec-so -k "order_id值" -t 7d）
              └─ 取消消息未发出 → 取消流程异常，联系开发排查
   ↓
   查是否在拣货状态下取消（拣货状态取消可能不还库存）
   → 查 so_log 中 type=31（拣货）和 type=12（取消）的时间顺序
   ├─ 拣货后取消 → 库存可能未归还，需联系仓库确认实物
   └─ 取消后无拣货 → 库存应已归还
```

```sql
-- 查库存变更队列
SELECT * FROM yamibuy_so.so_inventory_change_queue WHERE order_id = 'order_id';

-- 查取消订单队列（与上条并行）
SELECT * FROM yamibuy_so.order_cancel_queue WHERE order_id = 'order_id';
```

查订单流转日志 → 见 [Q4]

### 场景八：Central 订单商品语言显示问题
触发条件：Central 切换语言后商品名称显示不正确

```
拿到订单号后，查订单的下单语言
↓
xysc_order_info.lang = ?
├─ 0（中文）→ Central 切英文时商品名仍显示中文，属正常逻辑
├─ 4（繁体中文）→ Central 切英文时商品名仍显示繁体，属正常逻辑
└─ 1（英文）→ 商品名应显示英文，如果显示其他语言则异常，联系开发排查
```

查订单语言 → 见 [Q1]（关注 `lang` 字段）

### 场景九：赠品未随订单发出
触发条件：订单有买赠活动但未收到赠品

```
拿到订单号后，查订单商品表确认赠品是否在订单中
↓
xysc_order_goods 有赠品记录（is_gift=1）？
├─ 有 → 赠品已在订单中，查物流确认是否发出
└─ 无 → 查日志看购物车和结算时的详情
      search.py -s ec-so -k "order_sn值" -t 7d
      → 常见原因：MKT 接口未返回赠品（赠品库存没了），找 MKT 确认
```

查订单商品（确认赠品） → 见 [Q3]

### 场景十：商品差价查询
触发条件：客服反馈客人询问下单价与当前页面价格是否有差价

```
拿到订单号后，并行查询：订单信息 + 订单商品明细 + 商品当前售价 + 区域定价
↓
对比下单价（xysc_order_goods.goods_price）与当前价格：
├─ 当前价格 < 下单价 → 存在差价
│   ├─ 促销已生效但 promote_start_date > 下单时间 → 下单时促销尚未开始，属正常时间差，根据补差价政策判断是否补偿
│   ├─ im_item_area_price_setting.is_promotion=1 → 商品参加了新促销活动
│   │   → mkt_ps_id 有值？查 mkt_promotion_schedule 确认活动详情
│   ├─ xysc_goods.shop_price 变了 → 基础售价被调整
│   ├─ member_price/seckill_price/giftcard_price 生效 → 限时价格生效
│   └─ 以上都不是 → 查日志确认价格变更原因（search.py -s ec-so -k "order_sn值" -t 7d）
├─ 当前价格 = 下单价 → 无差价，告知客服
└─ 当前价格 > 下单价 → 客人下单时价格更低，无需补偿
↓
输出：下单价与当前所有生效价格的对比表，标注当前实际生效价格类型，计算差价金额
```

查订单基本信息 → 见 [Q1]
查订单商品明细 → 见 [Q3]

```sql
-- 3. 查商品当前基础售价（与上条并行）
SELECT goods_id, shop_price, market_price, promote_price
FROM yamibuy_master.xysc_goods WHERE goods_id = 商品ID;

-- 4. 查区域定价（与上条并行）
-- 注意：该表通过 rule_id 区分区域，同一 item_number 会有多条记录对应不同区域，无 area_id 字段
SELECT item_number, unit_price, promotion_price, is_promotion,
       FROM_UNIXTIME(promote_start_date) AS promo_start, FROM_UNIXTIME(promote_end_date) AS promo_end,
       member_price, member_status,
       seckill_price, seckill_status,
       pin_price, is_pin, giftcard_price, giftcard_status, mkt_ps_id
FROM yamibuy_im.im_item_area_price_setting WHERE item_number = '商品编号';
```

如果步骤4中 mkt_ps_id 有值（非0），再查促销活动详情：

```sql
SELECT ps_id, ps_title, ps_sub_title, status,
       FROM_UNIXTIME(start_time) AS start_date, FROM_UNIXTIME(end_time) AS end_date
FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = 活动ID;
```

输出要求：列出下单价与当前所有生效价格的对比表，明确标注当前实际生效价格类型，计算差价金额并给出补偿建议。

常见差价原因：商品参加了新促销 / 基础售价被调整 / 会员价/秒杀价等限时价格生效。

注意事项：
- 差价计算只对比单件商品的下单价（goods_price）与当前售价，与优惠券/积分/礼卡等订单级抵扣无关
- 如客服询问优惠券是否影响差价，需查询完整支付构成确认：
  `SELECT goods_amount, bonus, bonus_pay, integral_money, tax, shipping_fee, gift_card_money, surplus, order_amount, import_fee, crv FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';`
- 系统无自动补差价逻辑，补差价为客服手动操作流程

注意：`xysc_goods` 表没有 `item_number` 字段，查询时必须使用 `goods_id`。`item_number` 仅存在于 `im_item_area_price_setting`、`xysc_order_goods` 等表中。

注意：并非所有商品都有 `im_item_area_price_setting` 记录。无区域定价记录的商品，当前生效价格直接取 `xysc_goods` 表的 `shop_price`（无促销时）或 `promote_price`（促销期间，需检查 `promote_start_date` 和 `promote_end_date` 是否在有效期内）。

### 场景十一：结算失败 - invalid vendor ID（错误码 10069）
触发条件：客人反馈结算时出现 "invalid vendor ID" / "vendor ID is invalid" 错误

```
1. 通过邮箱获取 user_id
2. 查购物车已勾选商品（check_status=1），提取所有不同的 seller_id
3. 验证每个 seller_id 对应的卖家配置是否完整：
   a. xysc_vendor_info 中是否存在该 vendor_id？
   b. xysc_shipping 中是否有 is_primary=1 AND enabled=1 的配送记录？
   c. xysc_shipping_calculate 中 base_expression 是否有值？
   ↓
   某个 vendor_id 在以上任一环节缺失？
   ├─ 是 → 该卖家配置不完整，结算时查不到有效的卖家信息，触发错误
   │   → 建议客户取消勾选该卖家的商品即可正常结算
   │   → 反馈运营修复卖家配置（补充配送方式/运费计算规则）
   └─ 否（所有卖家配置正常）→ 可能是 Redis 缓存问题或并发问题
       → 查日志（search.py -s ec-so -k "user_id值" -t 7d）进一步定位
```

```sql
-- 查购物车已勾选商品（含卖家信息和商品名称）
SELECT c.goods_id, c.item_number, c.seller_id, c.qty, g.goods_name
FROM yamibuy_cart.so_cart c
LEFT JOIN yamibuy_master.xysc_goods g ON c.goods_id = g.goods_id
WHERE c.user_id = user_id AND c.check_status = 1
ORDER BY c.seller_id, c.goods_id;

-- 验证卖家配置完整性（将上一步查到的 seller_id 列表填入）
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
拿到订单号后，并行查询：订单状态 + so_log 流转日志
↓
订单当前状态？
├─ 已发货（order_status=5, shipping_status=1）→ 发货后系统不允许修改地址
│   → 查 so_log type=36 获取快递单号和承运商
│   → 建议客服联系承运商（FedEx/UPS 等）申请拦截或改派
├─ 已取消 → 订单已取消，无需修改地址
└─ 未发货 → 查日志确认修改失败原因
    search.py -s ec-so -k "order_sn值" -t 7d
    ├─ 有报错信息 → 根据日志定位原因
    └─ 无报错 → 用户可在订单详情页自行修改，确认操作路径是否正确
↓
so_log 中是否有 type=40（用户修改地址）记录？
├─ 有 → 用户已成功修改过地址，对比修改前后地址确认是否生效
└─ 无 → 用户未成功提交过地址修改
```

查订单状态 → 见 [Q1]
查订单流转日志 → 见 [Q4]

## 注意事项
- 商品详情页展示的过期日期/有效期/保质期：联系 @Gavin wang 查询
- 店铺（Seller Portal）商品详情页面展示的到期日期：联系 @Damon 查询
- 活动页面/商品详情页优惠券按钮无法点击领取：联系 @Gavin wang 查询
- 商品加购提示有误/无法加到购物车：联系 @Gavin wang 查询
- 订单取消后退款积分逻辑：RMA 扣积分按订单维度，customer 扣积分达到下单赠送上限不再扣
- FBY 订单包含多个商家，退款按子单退
- 订单结算失败但有物流信息：可能是生成 label 后结算被网关拒绝，包裹不会实际出库
- 拆单场景下，优惠券抵扣金额（bonus 字段）会按比例分摊到各子订单，需查看所有子订单的 bonus 合计值。详细排查参考 cs-coupon.md
- 订单发货后无法修改地址，需联系承运商（FedEx/UPS 等）申请拦截或改派，快递单号从 so_log type=36 或 so_tracking_info 获取
