---
inclusion: manual
---

# 会员权益问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为会员权益排查类问题：
- 生日惊喜、生日礼卡、生日福利
- 会员等级、升级、降级、Gold、Ruby、Diamond
- 会员权益、VIP

## 常用数据库表
- `yamibuy_crm`.`crm_customer_vip_rights_info` - 会员权益领取记录
- `yamibuy_crm`.`crm_customer_log` - 会员操作日志（ref_id=3 为生日惊喜）
- `yamibuy_master`.`xysc_users` - 用户信息（user_name、sex、birthday、description、country、avatar）
- `yamibuy_master`.`xysc_egift_card` - 礼卡表（activity_id=400 为会员升级礼卡）

## 排查场景

### 场景一：无法领取生日惊喜
触发条件：客人反馈无法领取生日礼卡/生日福利

```
1. 并行查询：当年是否已领取 + 用户信息完整度
   ↓
   crm_customer_log 中 type_id=30 且 ref_id=3 且 in_dtm 在当年的记录？
   ├─ 有 → 当年已领取过，告知客人明年生日月可再次领取
   └─ 无 → 检查 6 个字段是否全部填写：
          avatar / user_name / sex(>0) / birthday(非1970-01-01) / country / description
          ├─ 有字段为空 → 告知客人补充（最常见遗漏：description 个人简介）
          └─ 全部填写 → 是否在生日当月？
                       ├─ 不在 → 只能在生日当月领取
                       └─ 在 → 查日志定位原因
                            search.py -s ec-customer -k "user_id值" -t 7d
                            ├─ 有报错信息 → 根据日志定位原因
                            └─ 无可用信息 → 联系开发排查
```

```sql
-- 查当年是否已领取生日惊喜（与下条并行）
SELECT rec_id, type_id, ref_id, content, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_customer_log
WHERE customer_id = 'user_id' AND type_id = 30 AND ref_id = '3'
  AND in_dtm >= UNIX_TIMESTAMP(CONCAT(YEAR(NOW()), '-01-01'))
ORDER BY in_dtm DESC LIMIT 1;

-- 查用户信息完整度（与上条并行）
SELECT user_id, user_name, sex, birthday, description, country, avatar
FROM yamibuy_master.xysc_users WHERE user_id = 'user_id';
```

### 场景二：会员等级异常（降级问题）
触发条件：客人反馈会员等级突然降级

```
1. 查 crm_customer_log 获取最近的等级变化记录（注意时效性，只看最近半年内的记录）
   ↓
   最近一条等级变化记录是什么？
   ├─ type_id=25（降级）→ 半年内因订单取消触发的降级
   │   → 查 content 字段确认降级详情（from X to Y, consumed_amount）
   │   → 查 ref_id 对应的订单是否为礼卡订单（order_type=7）
   │   ├─ 是 → 礼卡订单取消触发降级，属正常
   │   └─ 否 → 其他退款触发
   │          → 通过 ref_id（订单号）查 xysc_order_info 确认订单详情
   │          → 查日志确认降级触发原因
   │            search.py -s central-customer -k "user_id值" -t 7d
   ├─ type_id=22（扫描）→ 半年周期到了系统自动重新评估等级
   │   → 查 content 字段确认扫描前后等级（from X to Y）
   │   ├─ X > Y → 扫描后降级，说明半年内消费金额不足以维持原等级，属正常
   │   └─ X = Y → 等级未变，不是降级问题
   ├─ type_id=21（升级）→ 最近一次操作是升级，不存在降级
   │   → 客人可能记错了，确认当前等级
   └─ 无最近半年内的等级变化记录 → 查日志确认
       search.py -s central-customer -k "user_id值" -t 7d
       ├─ 有相关日志 → 根据日志定位原因
       └─ 无可用信息 → 联系开发排查

注意：
├─ 会员等级每半年扫描一次，降级可能发生在扫描时（type_id=22）或半年内订单取消时（type_id=25）
├─ 排查时必须看最近一次记录的时间，不能用历史降级记录解释当前问题
└─ 扫描周期外（半年前）的订单取消不影响当前等级，降级有兜底：不会低于最近一次扫描时的等级
```

```sql
-- 查用户最近半年内的等级变化记录（注意时效性）
SELECT rec_id, type_id, ref_id, content, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_customer_log
WHERE customer_id = 'user_id' AND type_id IN (20,21,22,23,24,25)
  AND in_dtm > UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 6 MONTH))
ORDER BY in_dtm DESC;
```

会员升级 MQ：`central-customer.exchange`，key = `user.vip.upgraded`

### 场景三：会员等级未升级
触发条件：客人反馈消费金额已达标但等级未升级

```
1. 查 crm_customer_log 获取最近的等级变化记录
   ↓
   有 type_id=21（升级）的记录？
   ├─ 有 → 已升级，客人可能没注意到，确认当前等级
   └─ 无 → 查 type_id=22（扫描）的最近记录
          ├─ 有 → 查 content 中 consumed_amount 确认系统计算的消费金额
          │       ├─ 金额不足 → 告知客人当前消费金额和升级门槛差距
          │       └─ 金额已达标但未升级 → 查日志定位原因
          │           search.py -s central-customer -k "user_id值" -t 7d
          └─ 无 → 查日志确认是否有等级计算记录
                 search.py -s central-customer -k "user_id值" -t 7d
                 ├─ 有相关日志 → 根据日志定位原因
                 └─ 无可用信息 → 联系开发排查

注意：
├─ 升级基于半年内累计消费金额（已支付且已发货的订单），退款金额会扣减
├─ 等级每半年扫描一次，非实时升级
└─ 礼卡订单(order_type=7)的金额也计入消费金额
```

```sql
-- 查用户最近等级变化记录（复用场景二 SQL）
SELECT rec_id, type_id, ref_id, content, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_customer_log
WHERE customer_id = 'user_id' AND type_id IN (20,21,22,23,24,25)
  AND in_dtm > UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 6 MONTH))
ORDER BY in_dtm DESC;
```

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 必须执行脚本 `python scripts/get-userid.py "邮箱"`
- 生日惊喜需要用户主动领取，不是系统自动发放
- Central 系统里的姓名和个人信息的姓名取的不是同一个字段，显示可能不同，但不影响权益领取
- 用户只能在生日当月领取生日惊喜
