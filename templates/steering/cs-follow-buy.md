---
inclusion: manual
---

# 跟买与砍单问题 - 客服排查规则

## 参考文档
#[[file:.kiro/docs/跟买功能文档.md]]

## 识别规则
当用户提问涉及以下关键词时，自动识别为跟买/砍单排查类问题：
- 跟买、砍单、分享、无法分享、无法跟买
- 跟买积分、跟买优惠券
- 砍单次数、砍单限制

## 常用数据库表
- `yamibuy_so`.`so_order_follow` - 订单跟买扩展
- `yamibuy_activity`.`fo_activity` - 跟买活动表
- `yamibuy_activity`.`fo_item` - 跟买商品表（fo_id + item_number）
- `yamibuy_activity`.`fo_join` - 参与跟买/砍单记录
- `yamibuy_crm`.`crm_point` - 积分记录（reason_third 1006001/1006002 为跟买积分）
- `yamibuy_master`.`xysc_vendor_ext` - 商家扩展

> 字段枚举值见 `.kiro/skills/enum-values.md`（含 `so_order_follow.fo_status`、`fo_activity.status`、`fo_join.type/status/back_reason`、`xysc_vendor_ext.is_fo`）

## 常用查询

### [Q1] 查跟买活动详情（场景一、三、四复用）
```sql
SELECT fo_id, order_id, status, user_id, max_points, is_free,
       FROM_UNIXTIME(start_time) AS start_time, FROM_UNIXTIME(end_time) AS end_time
FROM yamibuy_activity.fo_activity WHERE user_id = 用户ID ORDER BY fo_id DESC;
```

## 排查场景

### 场景一：无法发起跟买/分享
触发条件：客人反馈订单中的商品无法分享

```
1. 并行查询：so_order_follow + xysc_order_info + xysc_vendor_ext
   ↓
   fo_status = ?
   ├─ 0（不能发起）→ 查日志定位原因
   │   search.py -s ec-activity -k "order_id值" -t 7d
   │   ├─ 日志有具体原因 → 根据日志回答
   │   └─ 日志无法定位 → 并行检查以下原因：
   │       ├─ 商品金额 - 优惠券抵扣 < 35（price_line 配置）
   │       ├─ 礼卡/京东图书/拼团/集运订单（order_type 字段判断）
   │       ├─ 商家 is_fo=0 不支持跟买
   │       ├─ 下单超过72小时（已过发起时间）
   │       └─ 商品在 not_allowed_item_number 配置中
   ├─ 1（可发起）→ 查日志确认分享失败原因
   │   search.py -s ec-activity -k "order_id值" -t 7d
   │   ├─ 日志有报错 → 根据日志回答
   │   └─ 日志无报错 → 并行检查商品库存（不同仓库库存不同）
   │                  → 检查 search 服务库存是否同步
   ├─ 5（可发起因故取消）→ 进入场景 1.1
   └─ 其他 → 活动已结束或取消
```

```sql
-- 查订单跟买状态
SELECT order_id, fo_status, fo_points, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_so.so_order_follow WHERE order_id = 订单ID;

-- 查订单基本信息（与上条并行）
SELECT order_id, order_sn, goods_amount, bonus, order_amount, order_type,
       FROM_UNIXTIME(add_time) AS add_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查商家是否支持跟买（与上条并行）
SELECT seller_id, is_fo FROM yamibuy_master.xysc_vendor_ext WHERE seller_id = 商家ID;
```

注意：使用礼卡部分抵扣导致实付金额为0的普通订单，order_type 仍为普通订单，不属于礼卡订单，不影响跟买资格。

### 场景 1.1：fo_status=5（可发起因故取消）无法发起跟买
触发条件：查询 so_order_follow 发现 fo_status=5

```
fo_status=5 含义：订单原本可以发起跟买（fo_status=1），但在客人发起之前订单被取消/退款，系统自动将状态改为 5。

查订单当前状态（order_status + shipping_status + pay_status 拼接）
↓
拼接值命中以下任一 → checkAllowFollow 返回 false，无法发起：
├─ 200 = 未支付取消（order_status=2, shipping_status=0, pay_status=0）
├─ 483 = 已支付取消（order_status=4, shipping_status=8, pay_status=3）
└─ 484 = 已支付部分取消（order_status=4, shipping_status=8, pay_status=4）

结论：fo_status=5 的订单无法发起跟买，这是代码设计如此。
如果业务上希望亚米原因取消的订单仍可发起跟买，需修改 checkAllowFollow 判断逻辑，建议联系开发评估。
```

注意：亚米原因取消 vs 客户原因取消的区别仅影响积分退还，不影响发起跟买本身。两种情况下 fo_status 都会变为 5，都无法再发起。

### 场景二：砍单次数限制
触发条件：客人反馈只砍了一次就无法再砍

砍单限制规则（滚动窗口，不是按自然日计算）：
- 最近 180 天有下单历史的用户：24 小时内最多砍 30 次
- 最近 180 天无下单历史的用户：24 小时内最多砍 2 次

```
1. 查日志确认砍单请求
   search.py -s ec-activity -k "user_id值" -t 7d
   ↓
   日志中有 51018 错误码？
   ├─ 有 → 砍单次数已达上限，告知客服等待 24 小时后重试
   └─ 无 → 查数据库确认砍单记录和下单历史
          ↓
          并行查询：最近 24 小时砍单次数 + 最近 180 天下单历史
          ├─ 有下单历史且砍单次数 < 30 → 未达上限，查日志定位其他原因
          ├─ 有下单历史且砍单次数 >= 30 → 已达上限（每天 30 次）
          ├─ 无下单历史且砍单次数 < 2 → 未达上限，查日志定位其他原因
          └─ 无下单历史且砍单次数 >= 2 → 已达上限（新用户每天 2 次）
```

```sql
-- 查最近 24 小时砍单次数 + 最近 180 天下单历史（与源码逻辑一致）
SELECT
  (SELECT COUNT(1) FROM yamibuy_master.xysc_order_info
   WHERE user_id = 用户ID AND order_status = 5 AND shipping_status = 1 AND pay_status = 2
   AND add_time > UNIX_TIMESTAMP() - 180*86400) AS order_count,
  (SELECT COUNT(1) FROM yamibuy_activity.fo_join
   WHERE user_id = 用户ID AND type = 1 AND in_dtm > UNIX_TIMESTAMP() - 86400) AS cut_count;

-- 查最近砍单明细
SELECT rec_id, fo_id, user_id, type, points, status, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_activity.fo_join
WHERE user_id = 用户ID AND type = 1 AND in_dtm > UNIX_TIMESTAMP() - 86400 * 2
ORDER BY in_dtm DESC;
```

### 场景三：跟买积分未到账
触发条件：客人反馈发起跟买后积分未到账

```
1. 确认用户邮箱是否已验证（邮箱不验证积分无法发放）
2. 并行查询：fo_activity + fo_join + crm_point
   ↓
   fo_join.status = ?
   ├─ 0（待发）→ 活动是否已结束？
   │             ├─ 未结束 → 活动结束后约9小时发放，等待即可
   │             └─ 已结束超过9小时 → 查日志
   │                 search.py -s ec-activity -k "fo_id值" -t 7d
   │                 ├─ 有发放失败报错 → 根据报错定位原因，联系开发处理
   │                 └─ 无报错 → 异常，联系开发排查
   ├─ 1（已发）→ 查 crm_point 确认积分是否到账
   ├─ 2（已退）→ 查 back_reason 确认退回原因
   └─ 3（原单已免单）→ 无需发放积分，属正常
```

```sql
-- 查跟买活动 → 见 [Q1]

-- 查参与记录
SELECT fj.rec_id, fj.fo_id, fj.user_id, fj.type, fj.points, fj.status, fj.back_reason,
       FROM_UNIXTIME(fj.in_dtm) AS join_time
FROM yamibuy_activity.fo_join fj WHERE fj.fo_id = 活动ID ORDER BY fj.rec_id;

-- 查积分发放记录
SELECT rec_id, user_id, points, refer_id, refer_type, reason_third, status,
       FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_point
WHERE user_id = 用户ID AND reason_third IN (1006001, 1006002) ORDER BY rec_id DESC;
```

### 场景四：跟买活动状态查询
触发条件：客人询问跟买活动进度

```
1. 并行查询：fo_activity + fo_join
   ↓
   fo_activity.status = ?
   ├─ 1（进行中）→ 返回活动开始/结束时间、当前参与人数、已获积分
   ├─ 2（已结束）→ 返回活动结果：总参与人数、总积分、是否免单
   │              积分发放状态查 fo_join.status（0=待发，1=已发）
   └─ 3（已取消）→ 活动已取消，告知客服
```

```sql
-- 查活动详情 → 见 [Q1]（按 order_id 查时改 WHERE 条件为 order_id = 订单ID）

-- 查参与人数和详情
SELECT fj.rec_id, fj.user_id, fj.user_type, fj.type, fj.points, fj.status,
       FROM_UNIXTIME(fj.in_dtm) AS join_time
FROM yamibuy_activity.fo_join fj WHERE fj.fo_id = 活动ID ORDER BY fj.rec_id;
```

## 注意事项
- 共享库存商品也可以发起跟买
- search 服务库存不同步可能导致无法分享，同步后即可恢复
- 跟买积分在活动结束后约 9 小时才发放，不是实时发放
