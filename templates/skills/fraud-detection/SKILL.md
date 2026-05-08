---
name: fraud-detection
description: "订单欺诈检测分析工具，通过IP分析、支付账号关联、注册行为、User-Agent指纹、商品购买模式等多维度识别可疑订单和刷单行为。触发词：欺诈, fraud, 刷单, 盗刷, 风控, 可疑订单, 异常订单, IP异常, 支付异常, carding"
---

# 订单欺诈检测分析

通过多维度数据分析识别可疑订单和欺诈行为，包括IP关联分析、支付账号交叉检测、注册行为分析、设备指纹比对、商品购买模式识别等。

## 使用场景

- 收到可疑订单，需要判断是否为欺诈
- 根据已知可疑账号，扩展排查关联账号
- 分析某个IP是否为代理/云服务器IP
- 检测支付卡号是否被多个账号共用
- 批量新注册账号的风险评估

## 快速使用

### 根据用户ID排查
```
帮我查一下这几个用户是否有欺诈行为：4545073, 4545109, 4540794
```

### 根据邮箱排查
```
这几个邮箱的订单看起来可疑，帮我分析下：xxx@gmail.com, yyy@outlook.com
```

### 根据IP排查
```
IP 35.212.203.117 关联了哪些订单和用户？
```

### 根据支付账号排查
```
支付账号 ICSTchPgnd5CRAVZ 被哪些用户使用过？
```

## 输入识别与用户ID解析（前置步骤，必须先执行）

收到用户输入后，先判断输入类型：

### 判断规则
- 如果输入包含 `@` 符号 → 视为邮箱，需要先通过 API 查询 customer_id
- 如果输入是纯数字 → 视为 user_id，直接进入后续分析步骤
- 如果输入混合了邮箱和数字ID → 分别处理，邮箱走API查询，数字直接使用

### 邮箱 → 用户ID 转换

当输入为邮箱时，对每个邮箱调用 central API 获取 customer_id：

```bash
curl "https://centralapi.yamibuy.net/customer/customers/queryDetail" ^
  -H "accept: */*" ^
  -H "content-type: application/json" ^
  -H "origin: https://central.yamibuy.net" ^
  -H "referer: https://central.yamibuy.net/" ^
  -H "token: eyJhdXRoIjoiZjJlODVmZmYzNmU4NWU1Y2YwNmU1MTQ5MzgwNzM4OGUiLCJkYXRhIjoiNjQyNyIsIm5vbmNlIjoiMjI5NCIsInQiOjEsInRzIjoxNzc0MzI3MjMxLCJ2IjozfQ==" ^
  -H "yami-origin: central-web" ^
  --data-raw "{\"email\":\"{email}\",\"data_type\":1}"
```

API 返回示例：
```json
{
  "messageId": "10000",
  "success": "true",
  "body": {
    "customer_id": 3017234,
    "customer_name": "logan12",
    "email": "logan.yang@yamibuy.com"
  }
}
```

从返回的 `body.customer_id` 提取用户ID，然后将所有获取到的 user_id 汇总，进入下面的分析步骤。

> ⚠️ 如果 API 返回失败或找不到用户，告知用户该邮箱未查到对应账号，跳过该邮箱继续处理其他输入。

---

## 分析维度与SQL查询

### 第一步：获取目标用户的订单基本信息（IP、地址、UA）,注意是要查主单

```sql
SELECT 
    user_id,
    order_sn,
    ip,
    FROM_UNIXTIME(add_time) AS 下单时间,
    order_amount,
    goods_amount,
    order_status,
    consignee,
    province,
    city,
    zipcode,
    email,
    user_agent
FROM yamibuy_master.xysc_order_info 
WHERE user_id IN ({user_ids}) and  is_separate = 0
ORDER BY add_time DESC
```

**关注点：**
- IP地址是否集中在同一网段
- User-Agent是否完全一致
- 收货地址是否分散在不同州但由同一人操作

### 第二步：IP关联分析 — 查看同一IP下的所有用户

```sql
SELECT 
    ip,
    GROUP_CONCAT(DISTINCT user_id) AS 关联用户,
    COUNT(DISTINCT user_id) AS 用户数,
    COUNT(*) AS 订单数
FROM yamibuy_master.xysc_order_info 
WHERE ip IN ({ip_list})
GROUP BY ip
ORDER BY 用户数 DESC
```

**关注点：**
- 同一IP关联多个不同用户 → 高风险
- IP属于云服务商（如 35.x.x.x = Google Cloud, 52.x.x.x/54.x.x.x = AWS）→ 极高风险
- 174.2xx.xxx.xxx 等住宅代理池IP段 → 需结合其他维度判断

### 第三步：IP归属判断 — 识别代理/云服务器IP

常见高风险IP段：
| IP段 | 归属 | 风险等级 |
|------|------|----------|
| 35.192.0.0/11 | Google Cloud | 极高 |
| 34.0.0.0/8 | Google Cloud | 极高 |
| 52.0.0.0/8 | AWS | 极高 |
| 54.0.0.0/8 | AWS | 极高 |
| 13.0.0.0/8 | AWS | 极高 |
| 104.16.0.0/12 | Cloudflare | 高 |
| 174.2xx.xxx.xxx | Cogent/住宅代理池 | 中高（需结合其他维度） |

可通过 web search 查询具体IP归属：搜索 `{ip} geolocation` 或 `{ip} ASN lookup`

### 第四步：支付账号交叉分析 — 查找共用支付卡的用户

```sql
-- 先获取目标用户的支付账号
WITH target_users AS (
    SELECT DISTINCT user_id 
    FROM yamibuy_master.xysc_order_info 
    WHERE user_id IN ({user_ids})
),
target_pay_accounts AS (
    SELECT DISTINCT pay_by_id 
    FROM yamibuy_payment.payment_attempts_log pal
    INNER JOIN target_users tu ON pal.customer_id = tu.user_id
    WHERE pal.pay_by_id IS NOT NULL AND pal.pay_by_id != ''
)
-- 查询这些支付账号关联的所有用户
SELECT 
    pal.pay_by_id AS 支付账号,
    pal.customer_id AS 客户ID,
    u.email,
    COUNT(*) AS 使用次数,
    CASE pal.gateway_id 
        WHEN 1 THEN 'braintree'
        WHEN 2 THEN 'stripe'
        WHEN 3 THEN 'wechat'
        WHEN 4 THEN 'alipay'
        WHEN 5 THEN 'citcon'
        WHEN 6 THEN 'yami'
        WHEN 7 THEN 'citconUpi'
        ELSE CONCAT('unknown_', pal.gateway_id)
    END AS 支付网关,
    CASE pal.method_id
        WHEN 1 THEN 'card'
        WHEN 2 THEN 'paypal'
        WHEN 3 THEN 'alipay'
        WHEN 4 THEN 'wechat'
        WHEN 5 THEN 'venmo'
        WHEN 6 THEN 'apple'
        WHEN 7 THEN 'free'
        WHEN 8 THEN 'cashapp'
        ELSE CONCAT('unknown_', pal.method_id)
    END AS 支付方式,
    MIN(FROM_UNIXTIME(pal.in_dtm)) AS 首次支付时间,
    MAX(FROM_UNIXTIME(pal.in_dtm)) AS 最后支付时间
FROM yamibuy_payment.payment_attempts_log pal
LEFT JOIN yamibuy_master.xysc_users u ON pal.customer_id = u.user_id
INNER JOIN target_pay_accounts tpa ON pal.pay_by_id = tpa.pay_by_id
GROUP BY pal.pay_by_id, pal.customer_id, u.email, pal.gateway_id, pal.method_id
ORDER BY pal.pay_by_id, 使用次数 DESC
```

**关注点：**
- 同一张卡被多个不同账号使用 → 极高风险（铁证）
- 短时间内在多个账号上尝试支付 → Card Testing行为

### 第五步：注册行为分析 — 注册到下单的时间间隔

```sql
SELECT 
    o.user_id,
    u.email,
    FROM_UNIXTIME(u.reg_time) AS 注册时间,
    MIN(FROM_UNIXTIME(o.add_time)) AS 首次下单时间,
    TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(u.reg_time), MIN(FROM_UNIXTIME(o.add_time))) AS 注册到下单分钟数,
    COUNT(*) AS 总订单数,
    SUM(o.order_amount) AS 总金额,
    GROUP_CONCAT(DISTINCT CONCAT(o.province, '-', o.city)) AS 收货地区,
    GROUP_CONCAT(DISTINCT o.ip) AS 使用IP
FROM yamibuy_master.xysc_order_info o
JOIN yamibuy_master.xysc_users u ON o.user_id = u.user_id
WHERE o.user_id IN ({user_ids})
GROUP BY o.user_id, u.email, u.reg_time
ORDER BY u.reg_time
```

**关注点：**
- 注册到下单 < 10分钟 → 高风险（正常用户通常需要浏览、选品）
- 注册到下单 < 5分钟 → 极高风险（机器人行为）
- 多个账号注册时间连续且间隔均匀 → 批量注册

### 第六步：购买商品分析 — 是否集中购买特定商品

```sql
SELECT 
    og.goods_id,
    og.goods_name,
    og.goods_price,
    COUNT(DISTINCT oi.user_id) AS 购买用户数,
    COUNT(DISTINCT oi.order_id) AS 订单数,
    SUM(og.goods_number) AS 总购买数量,
    GROUP_CONCAT(DISTINCT oi.user_id) AS 购买用户列表
FROM yamibuy_master.xysc_order_goods og
JOIN yamibuy_master.xysc_order_info oi ON og.order_id = oi.order_id
WHERE oi.user_id IN ({user_ids})
GROUP BY og.goods_id, og.goods_name, og.goods_price
ORDER BY 购买用户数 DESC, 总购买数量 DESC
```

**关注点：**
- 多个可疑账号购买完全相同的商品 → 高风险
- 大量购买低价日用品（纸巾、洗洁精等）→ 典型刷单套利商品
- 单品大量囤货（如一次买10瓶洗洁精）→ 异常

### 第七步：优惠券/积分使用分析

```sql
SELECT 
    user_id,
    order_sn,
    bonus_id,
    bonus,
    discount,
    integral,
    integral_money,
    gift_card_money,
    redeemed_amount,
    order_amount,
    goods_amount,
    shipping_fee,
    tax
FROM yamibuy_master.xysc_order_info 
WHERE user_id IN ({user_ids})
ORDER BY add_time DESC
```

**关注点：**
- 全部使用新人优惠券 → 薅羊毛型欺诈
- 完全不使用任何优惠 → 盗刷信用卡型欺诈（不在乎价格）
- 大量使用礼品卡 → 可能涉及洗钱

### 第八步：扩展排查 — 从已知可疑IP反查更多关联账号

```sql
SELECT 
    user_id,
    order_sn,
    ip,
    FROM_UNIXTIME(add_time) AS 下单时间,
    order_amount,
    order_status,
    consignee,
    province,
    city,
    zipcode
FROM yamibuy_master.xysc_order_info 
WHERE ip = '{suspicious_ip}'
ORDER BY add_time DESC
```

**关注点：**
- 同一IP在不同时间段关联了多少不同用户
- 这些用户的收货地址是否也分散全国各地
- 是否存在历史欺诈记录

## 欺诈判定标准

### 风险评分模型

| 维度 | 条件 | 风险分 |
|------|------|--------|
| IP来源 | 云服务商IP（GCP/AWS/Azure） | +40 |
| IP来源 | 住宅代理池IP | +20 |
| IP关联 | 同一IP关联 ≥3 个不同用户 | +30 |
| 支付关联 | 同一支付卡被 ≥2 个用户使用 | +40 |
| 注册行为 | 注册到下单 < 5分钟 | +25 |
| 注册行为 | 注册到下单 < 10分钟 | +15 |
| 设备指纹 | 多个账号 User-Agent 完全一致 | +20 |
| 商品模式 | 多账号购买完全相同的商品 | +15 |
| 商品模式 | 大量购买低价日用品 | +10 |
| 地址分布 | 收货地址分散在 ≥5 个不同州 | +20 |
| 优惠使用 | 完全不使用任何优惠（盗刷特征） | +10 |

### 风险等级

| 总分 | 等级 | 建议操作 |
|------|------|----------|
| ≥ 80 | 极高风险 | 立即冻结账号，拦截未发货订单 |
| 60-79 | 高风险 | 人工审核，暂停发货 |
| 40-59 | 中风险 | 加强监控，要求额外验证 |
| < 40 | 低风险 | 正常处理 |

## 常见欺诈类型

### 1. 信用卡盗刷（Carding）
- 特征：新注册账号、快速下单、不用优惠、收货地址分散、使用代理IP
- 目的：用盗取的信用卡购买实物商品转卖

### 2. Card Testing（卡号测试）
- 特征：短时间内多次小额支付尝试、频繁更换支付卡
- 目的：验证盗取的卡号是否有效

### 3. 薅羊毛（Coupon Abuse）
- 特征：批量注册新账号、全部使用新人优惠券、购买特定促销商品
- 目的：利用新人优惠低价获取商品

### 4. 转售套利（Reselling）
- 特征：大量购买特定低价商品、收货地址为转运仓
- 目的：低价囤货后高价转售

## 涉及的数据库表

| 表名 | 用途 |
|------|------|
| yamibuy_master.xysc_order_info | 订单主表（IP、地址、UA、金额等） |
| yamibuy_master.xysc_order_goods | 订单商品明细 |
| yamibuy_master.xysc_users | 用户注册信息 |
| yamibuy_payment.payment_attempts_log | 支付尝试记录（支付卡号关联） |

## 关键字段说明

### xysc_order_info
- `ip`: 下单时的客户端IP
- `user_agent`: 浏览器/设备指纹
- `add_time`: 下单时间（Unix时间戳）
- `consignee`: 收货人
- `province/city/zipcode`: 收货地址
- `order_status`: 订单状态
- `bonus/discount/integral_money/gift_card_money`: 各类优惠

### payment_attempts_log
- `pay_by_id`: 支付账号标识（脱敏后的卡号token）
- `customer_id`: 用户ID
- `gateway_id`: 支付网关（1=braintree, 2=stripe, 3=wechat, 4=alipay, 5=citcon, 6=yami, 7=citconUpi）
- `method_id`: 支付方式（1=card, 2=paypal, 3=alipay, 4=wechat, 5=venmo, 6=apple, 7=free, 8=cashapp）
- `in_dtm`: 支付时间（Unix时间戳）

## 注意事项

1. 所有查询仅限 SELECT，数据库有安全限制
2. 用户敏感信息（email、姓名、地址）在查询结果中会被脱敏显示
3. IP归属判断建议结合在线工具（如 iplocation.io）进行二次确认
4. 分析结论需要多维度交叉验证，单一维度异常不足以定性
5. 发现欺诈后建议同步通知支付团队和风控团队
