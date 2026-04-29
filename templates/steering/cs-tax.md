---
inclusion: manual
---

# 税费问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为税费排查类问题：
- 税、税费、算税、免税、税码、税率
- avalara、tax code、tax_code
- 关税、售卖税、运费税、服务税
- NJ税、加州税、加拿大税

## 常用数据库表
- `yamibuy_im`.`im_item_taxcode` — 商品税码表（Avalara 算税用，优先级最高）
- `yamibuy_im`.`im_category_taxcode` — 分类税码表（商品无税码时回退）
- `yamibuy_im`.`im_item` — 商品信息表（含 category_id）
- `yamibuy_so`.`tax_avalara_sales` — Avalara 算税记录（ava_request / ava_response 含完整请求响应）
- `yamibuy_so`.`tax_avalara_goods_detail` — Avalara 商品税费明细（含 tax_code / tax / amount）
- `yamibuy_so`.`tax_avalara_rule` — Avalara 税率规则缓存（系统兜底算税时使用）
- `yamibuy_master`.`xysc_tax_lookup` — 美国 zipcode → 税率映射表
- `yamibuy_master`.`xysc_tax_city_lookup` — 美国 city → 税率映射表（CA 州优先按 city 查）
- `yamibuy_master`.`xysc_tax_sku` — NJ 州商品税码标记表（T=应税, E=免税）
- `yamibuy_so`.`so_tax_duty_rate` — 加拿大关税税率表（按商品+国家）
- `yamibuy_so`.`so_tax_sale` — 加拿大售卖税率表（按国家+省份，type: 0=默认 1=GST 2=HST 3=PST）
- `yamibuy_so`.`so_tax_service` — 加拿大服务税配置表（boud_rate / free_tax_amount / exchange_rate）
- `yamibuy_so`.`so_tax_external` — 加拿大免售卖税商品表
- `yamibuy_master`.`xysc_order_info` — 订单基本信息（含 tax / province / zipcode）
- `yamibuy_mkt`.`mkt_tax_rule` — 第三方商家税费规则主表（seller_id / sale_tax / ship_handle_tax / region_id）
- `yamibuy_mkt`.`mkt_tax_external` — 第三方商家免税配置表（type=1 免税分类, type=2 免税商品）
- `yamibuy_master`.`xysc_vendor_info` — 商家信息表（is_tax=2 表示启用税费规则）
- `yamibuy_master`.`xysc_country` — 国家/州映射表（region_id → country + state）

> 字段枚举值见 `.kiro/skills/enum-values.md`，解释字段时先查速查表。

## 排查场景

### 场景一：客人反馈"为什么收了税" / "税费不对" / "应该免税但收了税"

触发条件：客人或商家反馈税费金额不正确

```
客服提供了什么信息？
├─ 有订单号 → 直接查 xysc_order_info
├─ 有 user_id → 查最近订单
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 再查最近订单
└─ 有 purchase_id → 查 xysc_order_info
↓
拿到订单后，并行查询：订单信息 + 订单商品 + Avalara 算税记录
↓
tax_avalara_sales 有记录？（判断走哪套算税）
├─ 有 → 走 Avalara 算税，进入【Avalara 排查路径】
└─ 无 → 走老版自有算税，根据国家进入对应路径：
      ├─ 美国订单 → 进入【美国自有算税排查路径】
      └─ 加拿大订单 → 进入【加拿大算税排查路径】
```

#### Avalara 排查路径

```
1. 查 tax_avalara_sales.type 判断算税方式：
   ├─ type=1（AVALARA_TAX）→ Avalara 正常算税
   │   → 查 tax_avalara_goods_detail 确认每个商品的 tax_code 和 tax 金额
   │   → 税码不对？查商品税码来源（im_item_taxcode → im_category_taxcode）
   │   → 税额不对？查 ava_response 字段中 Avalara 返回的完整税率明细
   ├─ type=2（SYSTEM_TAX）→ Avalara 异常，系统兜底算税
   │   → 查日志确认 Avalara 异常原因（search.py -s ec-so -k "purchase_id值" -t 7d）
   │   → 兜底税率来自 tax_avalara_rule 缓存，可能不够精确
   ├─ type=3（NO_TAX）→ 收货地址错误，未收税
   │   → 查 ava_request 确认发送给 Avalara 的地址是否正确
   └─ type=0（WAIT_TAX）→ 异常状态，算税未完成
       → 查日志定位原因（search.py -s ec-so -k "purchase_id值" -t 7d）
2. 商品没有出现在 tax_avalara_goods_detail 中？
   ├─ 查商品是否有 tax_code（im_item_taxcode 或 im_category_taxcode）
   │   ├─ 无税码 → 该商品不参与 Avalara 算税（税=0），需 IM 同事维护税码
   │   └─ 有税码但未出现 → 查日志确认是否被过滤（search.py -s ec-so -k "purchase_id值" -t 7d）
   └─ 查日志（search.py -s ec-so -k "purchase_id值" -t 7d）
       → 日志中搜索"没有税码"或"tax_code"确认原因
```

```sql
-- 并行查询以下信息
-- 1. 订单基本信息（含税费和地址）
SELECT order_id, order_sn, purchase_id, user_id, tax, province, city, zipcode,
       vendor_id, order_type, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 2. 订单商品信息
SELECT goods_id, item_number, goods_name, goods_number, goods_price, cat_id_1, vendor_id
FROM yamibuy_master.xysc_order_goods WHERE order_id = 订单ID;

-- 3. Avalara 算税记录
SELECT rec_id, purchase_id, order_id, type, sales_amount, sales_tax, status,
       country, region, city, postal_code, FROM_UNIXTIME(in_dtm) AS create_time
FROM yamibuy_so.tax_avalara_sales WHERE purchase_id = 'purchase_id';

-- 4. Avalara 商品税费明细（与上条并行）
SELECT item_number, parent_item_number, tax_code, amount, quantity, unit_amount, tax, unit_tax
FROM yamibuy_so.tax_avalara_goods_detail WHERE purchase_id = 'purchase_id';

-- 5. 查商品税码（与上条并行）
SELECT item_number, tax_code FROM yamibuy_im.im_item_taxcode WHERE item_number IN ('商品编号');

-- 6. 查分类税码（与上条并行）
SELECT a.item_number, a.category_id, b.tax_code
FROM yamibuy_im.im_item a
LEFT JOIN yamibuy_im.im_category_taxcode b ON a.category_id = b.category_id
WHERE a.item_number IN ('商品编号');
```

Kibana 日志排查：
- 命令：`search.py -s ec-so -k "purchase_id值" -t 7d`
- 关注日志：
  - `"没有税码"` — 商品缺少 tax_code，未参与算税
  - `"ava create transaction request"` — 发送给 Avalara 的请求
  - `"ava create transaction response"` — Avalara 返回的结果
  - `"current purchase system cal tax"` — 触发了系统兜底算税
  - `"avalara aop Returning error"` / `"avalara aop Throwing error"` — Avalara API 调用异常
  - `"算税--Avalara异常"` — Avalara 异常企微通知
  - `"目标品=xxx的原品=xxx没有税码"` — Mapping 商品原品缺少税码

Combo/Mapping 商品补充说明：
- Avalara 路径：Mapping 商品会拆成多个原品分别算税，每个原品使用自己的 tax_code，无 tax_code 的原品不参与算税。查 `tax_avalara_goods_detail` 中 `parent_item_number` 有值的记录即为 Mapping 拆分的原品
- 老版路径：Combo 商品按原品应税金额占比计算（应税金额占比 = 应税子商品总金额 / 所有子商品总金额，实际税额 = 主商品税额 × 占比）。日志关注 `"combo商品 原品 child_item_list"` 和 `"combo商品最后收税"`（search.py -s ec-so -k "combo商品" -t 7d）

#### 美国自有算税排查路径

```
1. 确认订单收货州（province）
2. 按州分别排查：
   ├─ California：
   │   ├─ 查税率：优先按 city 查 xysc_tax_city_lookup，查不到按 zipcode 查 xysc_tax_lookup
   │   ├─ 查不到税率 → 使用默认税率 7.25%
   │   ├─ 商品在 CA 免税分类列表中？→ 免税（配置在 Apollo: yami.us.ca.free.cat）
   │   └─ Combo 商品 → 按原品分别判断免税，按应税金额占比计算
   ├─ New Jersey：
   │   ├─ 查税率：按 zipcode 查 xysc_tax_lookup，查不到使用默认 6.625%
   │   ├─ 查 xysc_tax_sku 获取商品标记（T=应税, E=免税）
   │   ├─ 商品标记不为 T（不在表中或标记为 E）→ 不收税
   │   └─ Combo 商品 → 按原品标记分别判断，按应税金额占比计算
   └─ 其他州：
       ├─ 按 zipcode 查 xysc_tax_lookup
       ├─ 查到 → 使用该税率
       └─ 查不到 → 税率=0，不收税
3. 税额 = 商品单价 × 数量 × 税率%
4. 同步查日志交叉验证（与数据库查询并行）
   search.py -s ec-tax -k "purchase_id值" -t 7d
   → 对比日志中的税率和税额与数据库计算结果是否一致
   → 日志中有异常或与数据库结果不符 → 以日志中实际执行的逻辑为准
```

```sql
-- CA 州按 city 查税率（优先）
SELECT tax as sale_tax, nation as country, province as state
FROM yamibuy_master.xysc_tax_city_lookup WHERE city = 'city名称' LIMIT 1;

-- 按 zipcode 查税率
SELECT tax as sale_tax, nation as country, province as state
FROM yamibuy_master.xysc_tax_lookup WHERE zipcode = 'zipcode';

-- NJ 州查商品税码标记（T=应税, E=免税）
SELECT rec_id, item_number, province, tax
FROM yamibuy_master.xysc_tax_sku WHERE province = 'NJ' AND item_number IN ('商品编号');
```

Kibana 交叉验证（美国自有算税）：
- 命令：`search.py -s ec-tax -k "purchase_id值" -t 7d`
- 关注日志：
  - 请求参数中的 country / province / zipcode / city — 与数据库订单地址对比
  - 税率计算结果 — 与 xysc_tax_lookup / xysc_tax_city_lookup 查询结果对比
  - NJ 商品标记 — 与 xysc_tax_sku 查询结果对比
  - `"combo商品 原品 child_item_list"` — Combo 原品列表和计税比例

#### 加拿大算税排查路径

```
1. 并行查询：服务税配置 + 商品关税税率 + 省份售卖税率 + 免售卖税商品
2. 计算商品总金额（USD）× 汇率，与免税门槛比较
   ├─ < 免税门槛（通常 20 CAD）→ 全部免税，税=0
   └─ ≥ 免税门槛 → 逐商品计算三项税费：
       ├─ 关税 = 商品金额 × 关税税率（so_tax_duty_rate.rate%）
       ├─ 售卖税 = (商品金额 + 关税) × 售卖税率（so_tax_sale 各 type 的 rate 之和%）
       │   └─ 商品在 so_tax_external 中 → 售卖税=0
       └─ 服务税 = (售卖税 + 关税) × 服务税率（so_tax_service.boud_rate%）
3. 加拿大运费不收税（shipping_tax=0）
4. FBY 订单（order_type=5）不参与加拿大售卖税计算
5. 同步查日志交叉验证（与数据库查询并行）
   search.py -s ec-tax -k "purchase_id值" -t 7d
   → 对比日志中的汇率、免税门槛、各项税率与数据库配置是否一致
   → 确认日志中实际使用的税率和计算结果
```

```sql
-- 并行查询以下信息
-- 1. 加拿大服务税配置（汇率、免税门槛、服务税率）
SELECT country, boud_rate, free_tax_amount, exchange_rate, status
FROM yamibuy_so.so_tax_service WHERE country = 'Canada' AND status = 1;

-- 2. 商品关税税率
SELECT item_number, hts_code, country, rate
FROM yamibuy_so.so_tax_duty_rate WHERE country = 'Canada' AND item_number IN ('商品编号');

-- 3. 省份售卖税率（type: 0=默认 1=GST 2=HST 3=PST）
SELECT province, type, rate FROM yamibuy_so.so_tax_sale
WHERE country = 'Canada' AND province = '省份全称';

-- 4. 免售卖税商品
SELECT item_number FROM yamibuy_so.so_tax_external
WHERE country = 'Canada' AND is_delete = 0;
```

### 场景二：第三方商家反馈税费设置与实际不符

触发条件：第三方商家反馈"我设置了免税为什么还收税" / 税费规则与预期不一致（不一定有具体订单）

```
客服提供了什么信息？
├─ 有商家 ID（seller_id）→ 直接查商家税费规则
├─ 有订单号 → 查 xysc_order_info 获取 vendor_id，再查商家税费规则
└─ 有商品编号 → 查 xysc_order_goods 获取 vendor_id
↓
并行查询：商家税费规则（数据库）+ 日志交叉验证
↓
1. 查 xysc_vendor_info.is_tax 确认商家是否启用税费规则
   ├─ is_tax ≠ 2 → 商家未启用税费规则，不走自有算税
   └─ is_tax = 2 → 继续查 mkt_tax_rule
2. 查 mkt_tax_rule 获取商家税费规则（按 seller_id + country + state）
   ├─ 无记录 → 该商家在该州无税费规则，sale_tax=0, ship_handle_tax=0
   └─ 有记录 → 确认 sale_tax（售卖税率%）和 ship_handle_tax（运费税率%）
3. 查 mkt_tax_external 获取免税配置
   ├─ type=1 的记录 → 免税分类 ID 列表（categoryIdList）
   └─ type=2 的记录 → 免税商品编号列表（itemNumList）
4. 对比商家反馈的设置与数据库中的实际规则：
   ├─ 一致 → 规则本身没问题，排查算税逻辑（是否走了 Avalara）
   │   ├─ 商家已接入 Avalara → 商家后台的免税设置对 Avalara 不生效，以 Avalara 结果为准
   │   │   → 税码有疑问请联系 Damon 确认
   │   └─ 未接入 Avalara → 按老版自有算税逻辑排查（见场景一美国自有算税路径）
   └─ 不一致 → 数据库规则与商家后台设置不符，联系 MKT 同事排查
```

```sql
-- 1. 查商家是否启用税费规则（is_tax=2 表示启用）
SELECT vendor_id, vendor_name, vendor_ename, is_tax
FROM yamibuy_master.xysc_vendor_info WHERE vendor_id = 商家ID;

-- 2. 查商家税费规则（与下条并行）
SELECT rule.rule_id, rule.seller_id, rule.sale_tax, rule.ship_handle_tax, rule.region_id,
       cty.country, cty.state
FROM yamibuy_mkt.mkt_tax_rule rule
INNER JOIN yamibuy_master.xysc_country cty ON cty.id = rule.region_id
WHERE rule.is_delete = 0 AND rule.seller_id = 商家ID;

-- 3. 查免税配置（type=1 免税分类, type=2 免税商品）
SELECT ext.rule_id, ext.type, ext.category_id, ext.item_number
FROM yamibuy_mkt.mkt_tax_external ext
INNER JOIN yamibuy_mkt.mkt_tax_rule rule ON ext.rule_id = rule.rule_id
WHERE ext.is_delete = 0 AND rule.is_delete = 0 AND rule.seller_id = 商家ID;
```

如果有具体订单可以辅助验证：
```sql
-- 查订单信息确认商家和税费
SELECT order_id, order_sn, purchase_id, vendor_id, order_type, tax, province, zipcode,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查 Avalara 记录判断是否走了 Avalara 算税
SELECT rec_id, purchase_id, order_id, type, sales_tax, FROM_UNIXTIME(in_dtm) AS create_time
FROM yamibuy_so.tax_avalara_sales WHERE purchase_id = 'purchase_id';
```

Kibana 交叉验证：
- 命令：`search.py -s ec-tax -k "seller_id值" -t 7d` 或 `search.py -s ec-so -k "seller_id值" -t 7d`
- 关注日志：`"MktService querySellerTaxRuleList response"` — 对比日志中返回的 SellerTaxRule 与数据库查询结果是否一致

注意：
- 商家后台设置的免税仅对老版自有算税生效，对 Avalara 不生效（这是最常见的误解）
- 预售商品（seller_id=-2，含亚米预售和第三方预售）：老版算税接口在代码层面排除预售不走第三方路径；新版算税接口未排除，但 MKT 中无 seller_id=-2 的税费规则，实际结果为不收第三方税
- 商家税费规则按 seller_id + country + state 维度配置，不同州可能有不同规则
- 商家税费规则有 Redis 缓存（key 格式：`{REDIS_SELLER_TAX_KEY}{seller_id}:{country}{state}`），修改后可能需要等缓存过期

### 场景三：客人询问"为什么这个州要收税" / "为什么税率这么高"

触发条件：客人对税率本身有疑问（非计算错误），只需解释税率来源

```
客服提供了什么信息？
├─ 有订单号 → 查 xysc_order_info 获取 province / zipcode / vendor_id
├─ 有收货地址 → 直接用地址信息
└─ 有 user_id / 邮箱 → 查最近订单获取地址
↓
判断走哪套算税（同场景一逻辑）：
├─ tax_avalara_sales 有记录 → Avalara 算税
│   → 税率由 Avalara 根据地址和商品税码计算
│   → 查 tax_avalara_sales.ava_response 可看到详细税率
├─ 美国订单（无 Avalara 记录）→ 老版自有算税
│   → 税率由系统按 zipcode/city 配置，非亚米自定义
│   → CA 州部分商品分类免税（食品等）
│   → NJ 州按商品维度判断应税/免税
│   → 其他州如无 zipcode 配置则不收税
└─ 加拿大订单 → 税包含关税+售卖税+服务税，总税率较高属正常
    → 商品总金额折合 < 20 CAD 时免税

SQL 见场景一对应路径，不重复列出。
同步查日志交叉验证，命令和关键词见场景一对应路径。
```

## 关键常量值

| 常量 | 值 | 说明 |
|------|-----|------|
| YAMIBUY_SELLER_ID | 0 | 亚米自营 |
| PRESALE_SELLER_ID | -2 | 预售商品（含亚米预售和第三方预售，算税时按自营处理） |
| FBY_ORDER_TYPE | 5 | FBY 订单类型 |
| US_CA_TAX_RENT | 7.25% | CA 州默认税率（zipcode 查不到时使用） |
| US_NJ_TAX_RENT | 6.625% | NJ 州默认税率（zipcode 查不到时使用） |
| US_NJ_TAX_TAXABLE | T | NJ 应税标记 |
| US_NJ_TAX_EXEMPT | E | NJ 免税标记 |

## 注意事项
- 新建的商品分类可能没有配置税码，需 IM 同事维护
- Avalara 算税以 Avalara 返回结果为准，商家后台的免税设置对 Avalara 不生效
- CA 州售卖税优先按 city 查税率，查不到再按 zipcode 查
- 电子礼卡（EGIFT_CARD）不参与任何算税
- Avalara 地址错误时不收税，其他异常时使用系统兜底算税（tax_avalara_rule 缓存税率）
- 税费计算结果有 Redis 缓存，如数据库配置已更新但税费未变化，可能是缓存未过期，需联系开发刷新缓存
- 美国运费税：部分州对运费也征税，老版自有算税中运费税率由 xysc_tax_lookup.shipping_tax 字段控制（有该字段且 > 0 时收运费税）；Avalara 路径中运费税由 Avalara 自动计算（运费作为 Freight 类型的 line item 传入）
