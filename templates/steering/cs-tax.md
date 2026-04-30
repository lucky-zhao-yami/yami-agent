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
- `yamibuy_im`.`im_item_taxcode` — 商品税码表（Avalara 用，优先级最高）
- `yamibuy_im`.`im_category_taxcode` — 分类税码表（商品无税码时回退）
- `yamibuy_im`.`im_item` — 商品信息表（含 category_id）
- `yamibuy_so`.`tax_avalara_sales` — Avalara 算税记录（ava_request / ava_response）
- `yamibuy_so`.`tax_avalara_goods_detail` — Avalara 商品税费明细（tax_code / tax / amount）
- `yamibuy_so`.`tax_avalara_rule` — Avalara 税率规则缓存（兜底算税用）
- `yamibuy_master`.`xysc_tax_lookup` — 美国 zipcode → 税率映射表
- `yamibuy_master`.`xysc_tax_city_lookup` — 美国 city → 税率映射表（CA 州优先按 city 查）
- `yamibuy_master`.`xysc_tax_sku` — NJ 州商品税码标记表（T=应税, E=免税）
- `yamibuy_so`.`so_tax_duty_rate` — 加拿大关税税率表
- `yamibuy_so`.`so_tax_sale` — 加拿大售卖税率表（type: 0=默认 1=GST 2=HST 3=PST）
- `yamibuy_so`.`so_tax_service` — 加拿大服务税配置表（boud_rate / free_tax_amount / exchange_rate）
- `yamibuy_so`.`so_tax_external` — 加拿大免售卖税商品表
- `yamibuy_master`.`xysc_order_info` — 订单基本信息（含 tax / province / zipcode）
- `yamibuy_mkt`.`mkt_tax_rule` — 第三方商家税费规则主表
- `yamibuy_mkt`.`mkt_tax_external` — 第三方商家免税配置表（type=1 免税分类, type=2 免税商品）
- `yamibuy_master`.`xysc_vendor_info` — 商家信息表（is_tax=2 表示启用税费规则）
- `yamibuy_master`.`xysc_country` — 国家/州映射表（region_id → country + state）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## ⚠️ 核心业务规则

### 算税路径判断
- tax_avalara_sales 有记录 → Avalara 算税
- 无记录 + 美国订单 → 老版自有算税
- 无记录 + 加拿大订单 → 加拿大算税

### Combo/Mapping 商品算税
- Avalara 路径：Mapping 商品拆成原品分别算税，无 tax_code 的原品不参与。`tax_avalara_goods_detail.parent_item_number` 有值 = Mapping 拆分的原品
- 老版路径：Combo 按原品应税金额占比计算（应税占比 = 应税子商品总金额 / 所有子商品总金额）

### 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| YAMIBUY_SELLER_ID | 0 | 亚米自营 |
| PRESALE_SELLER_ID | -2 | 预售商品（算税时按自营处理） |
| FBY_ORDER_TYPE | 5 | FBY 订单类型 |
| CA 默认税率 | 7.25% | zipcode 查不到时使用 |
| NJ 默认税率 | 6.625% | zipcode 查不到时使用 |

## Kibana 日志索引
- 算税服务：`search.py -s ec-tax`，关键词：purchase_id / seller_id
- 订单服务：`search.py -s ec-so`，关键词：purchase_id

Avalara 相关日志关键词：`没有税码`、`ava create transaction request/response`、`current purchase system cal tax`、`avalara aop Returning/Throwing error`、`算税--Avalara异常`、`目标品=xxx的原品=xxx没有税码`
Combo 相关：`combo商品 原品 child_item_list`、`combo商品最后收税`

## 常用查询

**[Q1] 查订单基本信息（含税费和地址）**
```sql
SELECT order_id, order_sn, purchase_id, user_id, tax, province, city, zipcode,
       vendor_id, order_type, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

**[Q2] 查订单商品信息**
```sql
SELECT goods_id, item_number, goods_name, goods_number, goods_price, cat_id_1, vendor_id
FROM yamibuy_master.xysc_order_goods WHERE order_id = 订单ID;
```

**[Q3] 查 Avalara 算税记录**
```sql
SELECT rec_id, purchase_id, order_id, type, sales_amount, sales_tax, status,
       country, region, city, postal_code, FROM_UNIXTIME(in_dtm) AS create_time
FROM yamibuy_so.tax_avalara_sales WHERE purchase_id = 'purchase_id';
```

**[Q4] 查 Avalara 商品税费明细**
```sql
SELECT item_number, parent_item_number, tax_code, amount, quantity, unit_amount, tax, unit_tax
FROM yamibuy_so.tax_avalara_goods_detail WHERE purchase_id = 'purchase_id';
```

**[Q5] 查商品税码（im_item_taxcode → im_category_taxcode 回退）**
```sql
SELECT item_number, tax_code FROM yamibuy_im.im_item_taxcode WHERE item_number IN ('商品编号');

-- 无商品税码时查分类税码
SELECT a.item_number, a.category_id, b.tax_code
FROM yamibuy_im.im_item a
LEFT JOIN yamibuy_im.im_category_taxcode b ON a.category_id = b.category_id
WHERE a.item_number IN ('商品编号');
```

**[Q6] 美国税率查询**
```sql
-- CA 州优先按 city 查
SELECT tax as sale_tax, nation as country, province as state
FROM yamibuy_master.xysc_tax_city_lookup WHERE city = 'city名称' LIMIT 1;

-- 按 zipcode 查
SELECT tax as sale_tax, nation as country, province as state
FROM yamibuy_master.xysc_tax_lookup WHERE zipcode = 'zipcode';

-- NJ 州商品税码标记
SELECT rec_id, item_number, province, tax
FROM yamibuy_master.xysc_tax_sku WHERE province = 'NJ' AND item_number IN ('商品编号');
```

**[Q7] 加拿大税费查询**
```sql
-- 服务税配置
SELECT country, boud_rate, free_tax_amount, exchange_rate, status
FROM yamibuy_so.so_tax_service WHERE country = 'Canada' AND status = 1;

-- 商品关税税率
SELECT item_number, hts_code, country, rate
FROM yamibuy_so.so_tax_duty_rate WHERE country = 'Canada' AND item_number IN ('商品编号');

-- 省份售卖税率
SELECT province, type, rate FROM yamibuy_so.so_tax_sale
WHERE country = 'Canada' AND province = '省份全称';

-- 免售卖税商品
SELECT item_number FROM yamibuy_so.so_tax_external
WHERE country = 'Canada' AND is_delete = 0;
```

**[Q8] 第三方商家税费规则**
```sql
-- 查商家是否启用税费规则
SELECT vendor_id, vendor_name, vendor_ename, is_tax
FROM yamibuy_master.xysc_vendor_info WHERE vendor_id = 商家ID;

-- 查商家税费规则
SELECT rule.rule_id, rule.seller_id, rule.sale_tax, rule.ship_handle_tax, rule.region_id,
       cty.country, cty.state
FROM yamibuy_mkt.mkt_tax_rule rule
INNER JOIN yamibuy_master.xysc_country cty ON cty.id = rule.region_id
WHERE rule.is_delete = 0 AND rule.seller_id = 商家ID;

-- 查免税配置
SELECT ext.rule_id, ext.type, ext.category_id, ext.item_number
FROM yamibuy_mkt.mkt_tax_external ext
INNER JOIN yamibuy_mkt.mkt_tax_rule rule ON ext.rule_id = rule.rule_id
WHERE ext.is_delete = 0 AND rule.is_delete = 0 AND rule.seller_id = 商家ID;
```

---

## 排查场景

### 场景一：税费不对 / 为什么收了税 / 应该免税但收了税
触发条件：客人或商家反馈税费金额不正确

```
客服提供了什么信息？
├─ 有订单号 → [Q1]
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → 查最近订单
└─ 有 user_id / purchase_id → 查 xysc_order_info
↓
并行查询：[Q1] + [Q2] + [Q3]
↓
tax_avalara_sales 有记录？
├─ 有 → 【Avalara 路径】
└─ 无 → 美国订单 → 【美国自有算税路径】
      → 加拿大订单 → 【加拿大算税路径】
```

#### Avalara 路径

```
[Q3] tax_avalara_sales.type？
├─ type=1（正常算税）→ [Q4] 查商品税费明细
│   ├─ 税码不对 → [Q5] 查税码来源（im_item_taxcode → im_category_taxcode）
│   └─ 税额不对 → 查 ava_response 中 Avalara 返回的完整税率明细
├─ type=2（系统兜底）→ Avalara 异常，兜底税率来自 tax_avalara_rule 缓存
│   → 查日志确认异常原因
├─ type=3（未收税）→ 查 ava_request 确认地址是否正确
└─ type=0（未完成）→ 异常，查日志定位
↓
商品未出现在 [Q4] 结果中？
├─ [Q5] 无税码 → 不参与算税（税=0），需 IM 维护税码
└─ 有税码但未出现 → 查日志确认是否被过滤
```

#### 美国自有算税路径

```
确认 province，按州排查：
├─ California → [Q6] 优先按 city 查税率，查不到按 zipcode，都查不到用 7.25%
│   → CA 免税分类配置在 Apollo: yami.us.ca.free.cat
├─ New Jersey → [Q6] 按 zipcode 查税率，查不到用 6.625%
│   → 查 xysc_tax_sku：T=应税，E/无记录=免税
└─ 其他州 → [Q6] 按 zipcode 查，查不到则税率=0
↓
税额 = 商品单价 × 数量 × 税率%
→ 同步查日志交叉验证（search.py -s ec-tax -k "purchase_id值" -t 7d）
```

#### 加拿大算税路径

```
[Q7] 并行查询：服务税配置 + 关税税率 + 售卖税率 + 免税商品
↓
商品总金额（USD）× 汇率 vs 免税门槛（通常 20 CAD）？
├─ < 门槛 → 全部免税
└─ ≥ 门槛 → 逐商品计算：
      ├─ 关税 = 金额 × duty_rate%
      ├─ 售卖税 = (金额 + 关税) × sale_rate%（在 so_tax_external 中的商品免售卖税）
      └─ 服务税 = (售卖税 + 关税) × boud_rate%
↓
加拿大运费不收税；FBY 订单（order_type=5）不参与售卖税计算
→ 同步查日志交叉验证（search.py -s ec-tax -k "purchase_id值" -t 7d）
```

### 场景二：第三方商家税费设置与实际不符
触发条件：商家反馈"设置了免税为什么还收税"

```
客服提供了什么信息？
├─ 有 seller_id → 直接使用
├─ 有订单号 → [Q1] 获取 vendor_id
└─ 有商品编号 → 查 xysc_order_goods 获取 vendor_id
↓
[Q8] 并行查询：商家税费规则 + 免税配置
↓
xysc_vendor_info.is_tax？
├─ ≠ 2 → 未启用税费规则，不走自有算税
└─ = 2 → 查 mkt_tax_rule + mkt_tax_external
      ↓
      对比商家反馈与数据库规则：
      ├─ 一致 → 规则没问题，查是否走了 Avalara
      │   ├─ 走了 Avalara → ⚠️ 商家后台免税设置对 Avalara 不生效（最常见误解），税码问题联系 Damon
      │   └─ 未走 Avalara → 按场景一美国自有算税路径排查
      └─ 不一致 → 联系 MKT 排查
```

如有具体订单可辅助验证：
```sql
SELECT order_id, order_sn, purchase_id, vendor_id, order_type, tax, province, zipcode,
       FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

SELECT rec_id, purchase_id, order_id, type, sales_tax, FROM_UNIXTIME(in_dtm) AS create_time
FROM yamibuy_so.tax_avalara_sales WHERE purchase_id = 'purchase_id';
```

### 场景三：客人询问"为什么这个州要收税" / "税率这么高"
触发条件：客人对税率本身有疑问（非计算错误），只需解释税率来源

```
获取订单地址（province / zipcode）后，判断算税路径（同场景一）：
├─ Avalara → 税率由 Avalara 根据地址和税码计算，查 ava_response 看详细税率
├─ 美国自有 → 税率按 zipcode/city 配置，非亚米自定义
│   CA 部分分类免税；NJ 按商品维度判断；其他州无配置则不收税
└─ 加拿大 → 含关税+售卖税+服务税，总税率较高属正常；< 20 CAD 免税

SQL 见场景一对应路径。
```

## 注意事项
- 商家后台免税设置仅对老版自有算税生效，对 Avalara 不生效
- 新建商品分类可能没有税码，需 IM 维护
- 电子礼卡（EGIFT_CARD）不参与任何算税
- Avalara 地址错误时不收税，其他异常时用 tax_avalara_rule 缓存兜底
- 税费计算有 Redis 缓存，配置更新后税费未变可能是缓存未过期
- 美国运费税：老版由 xysc_tax_lookup.shipping_tax 控制；Avalara 路径运费作为 Freight line item 自动计算
- 预售商品（seller_id=-2）：老版排除不走第三方路径；新版无规则实际也不收第三方税
- 商家税费规则有 Redis 缓存（key: `{REDIS_SELLER_TAX_KEY}{seller_id}:{country}{state}`），修改后需等缓存过期