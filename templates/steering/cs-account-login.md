---
inclusion: manual
---

# 账户与登录问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为账户/登录排查类问题：
- 登录、登录失败、无法登录、密码错误
- 修改密码、重置密码、忘记密码
- 删除账户、注销账户、账户异常
- 谷歌登录、Google 登录、第三方登录、Apple 登录
- 收藏、收藏商品
- 账户被拉黑
- 修改邮箱、更改邮箱、换邮箱、邮箱变更、邮箱是否改过
- Seller Portal、商家入驻、入驻界面

## 常用数据库表
- `yamibuy_master`.`xysc_users` - 用户信息表
- `yamibuy_master`.`xysc_users_delete` - 已删除用户表
- `yamibuy_master`.`xysc_blacklist` - 黑名单记录表
- `yamibuy_crm`.`crm_customer_log` - 用户操作日志表
- `yamibuy_master`.`xysc_collect_goods` - 用户收藏商品表
- `yamibuy_master`.`xysc_users_third` - 第三方账号绑定表（Google/Apple 等）
- `yamibuy_master`.`xysc_refund_apply` - 退款申请表

> 字段枚举值见 `.kiro/skills/enum-values.md`

## 常用查询

### [Q1] 查邮箱变更记录（场景五、场景九复用）
```sql
SELECT rec_id, customer_id, type_id, content, FROM_UNIXTIME(in_dtm) AS change_time, in_user
FROM yamibuy_crm.crm_customer_log
WHERE customer_id = user_id AND type_id = 51 ORDER BY in_dtm DESC;
-- content 格式：old email : 旧邮箱  edit email : 新邮箱
```

## 排查场景

### 场景一：修改密码失败 / 验证码错误
触发条件：客人反馈修改密码时验证码错误、次数过多被限制

```
1. 直接查日志
   search.py -s ec-customer -k "邮箱" -t 7d
   ↓
   有修改密码/验证码相关日志？
   ├─ 有 → 根据日志内容判断原因：
   │   ├─ 验证码错误次数过多 → 3 小时内验证码只能错误 2 次，第 3 次起被限制，需等 3 小时
   │   ├─ 验证码被覆盖 → PC 端双击可能导致请求两次覆盖验证码（已修复加了防抖限制）
   │   └─ 其他报错 → 根据日志具体内容回答
   └─ 查不到日志 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查询该邮箱是否有注册账户
                 ├─ 有账户 → 用户近期没有修改密码操作，让客服跟客人确认操作时间和具体报错
                 └─ 无账户 → 邮箱未注册，客人提供的邮箱有误，引导确认注册时使用的邮箱
```

### 场景二：登录失败
触发条件：客人反馈无法登录

```
1. ⚠️ 查日志（必须执行，禁止跳过）
   search.py -s ec-customer -k "user_id值" -t 7d
   时间范围：最近 7 天
   具体操作步骤：
   a. 先用 user_id + "ExceptionAspect" 搜索，直接定位所有 WARN/ERROR 报错
      → 有报错 → 提取 messageId 和 trace ID
      → 用 trace ID 搜索还原该请求的完整调用链（请求接口、参数、耗时）
      → 常见 messageId：10031=密码错误、90008=Token无效/过期
   b. 如果步骤 a 无结果，用 user_id + "third" 搜索第三方登录相关接口调用
      → 关注 third_login_fast / check_binding / third_binding_login / third_verification_code_login
      → 提取每个请求的 trace ID，逐个追踪是否有隐藏报错
      → 按需查 xysc_users_third 确认绑定状态（未绑定需走绑定流程）
   c. 如果步骤 a/b 都无结果，用 user_id 搜索所有日志，按时间排序还原用户完整操作时间线
   ↓
2. 检查是否有重置密码操作（关注 reset_password/change_password 相关日志）
   ↓
3. 按需查数据库确认账户状态（flag、黑名单、第三方绑定）
   ├─ flag ≠ 1 或有黑名单记录 → 转场景七排查
   ├─ 日志中有正常请求但无登录接口 → 用户可能已登录成功，让客服确认具体报错时间和内容
   ├─ 完全无日志 → 执行脚本 `python scripts/get-userid.py "邮箱"` 确认邮箱是否注册
   │   ├─ 有账户 → 让客服确认操作时间和具体报错
   │   └─ 无账户 → 邮箱未注册，引导确认注册时使用的邮箱
   └─ 均无法定位 → 建议清缓存或联系开发
```

常见原因：
- 登录过期（长时间未登录）
- 密码大小写或特殊字符输入错误
- 重置密码后使用了旧密码
- 邮箱一次性验证码登录收不到验证码：验证码登录接口为 `third_verification_code_login`，日志中无该请求 = 前端未发出请求（检查 App 版本是否过旧），有请求但收不到邮件 → 转 cs-email-notification.md 场景一

```sql
-- 查第三方账号绑定状态
SELECT user_id, platform_id, open_id, is_bind FROM yamibuy_master.xysc_users_third WHERE user_id = {user_id};
-- 查账户状态（与下条并行）
SELECT user_id, flag, FROM_UNIXTIME(last_login) AS last_login_time
FROM yamibuy_master.xysc_users WHERE user_id = {user_id};
-- 查黑名单（与上条并行）
SELECT rec_id, type, user_id, email, mobile, add_time, note, is_delete
FROM yamibuy_master.xysc_blacklist WHERE user_id = {user_id};
```

### 场景三：Google 登录被限制（403 错误）
触发条件：客人反馈 Google 登录提示 403:disallowed_useragent

可能是在第三方 App（如 DealMoon）内使用 WebView 打开。Google 自 2021 年 9 月 30 日起禁止 WebView 登录，建议客人使用网站或真正的 App 登录。

```
1. 直接查日志
   search.py -s ec-customer -k "邮箱或user_id" -t 7d
   ↓
   有 403/useragent 相关报错？
   ├─ 有 → 根据日志中的 useragent 确认实际请求来源，定位问题
   └─ 查不到相关日志 → 可能是在第三方 App（如 DealMoon）内使用 WebView 打开
                       Google 自 2021 年 9 月 30 日起禁止 WebView 登录
                       建议客人使用网站或真正的 App 登录
```

### 场景四：删除账户
触发条件：客人反馈无法删除账户

```
1. 直接查日志
   search.py -s ec-customer -k "邮箱或user_id" -k "remove user" -t 7d
   ↓
   日志中有具体报错？
   ├─ 有 → 根据报错信息判断原因，常见报错：
   │   ├─ "duplicate ip request" → 同一 IP 24 小时内操作超过 3 次，需等待后重试
   │   ├─ "verify timeout" 相关 → 邮箱验证已超时，需重新验证邮箱后再操作
   │   ├─ platform/version 相关 → App 版本过低，提示客人升级 App
   │   └─ "unfinished service" → 有未完成的前置条件，进入步骤 2 排查
   └─ 查不到日志 → 直接查数据库排查可查条件，进入步骤 2

2. 日志提示有未完成前置条件时，查数据库确认具体原因：
   ↓
   ④ 是否有未完成订单？
   ├─ 有 → 需等待订单完成或取消后才能删除
   └─ 无 → 继续
   ↓
   ⑤ 是否有未处理的退款？
   ├─ 有 → 需等待退款处理完成后才能删除
   └─ 无 → 继续
   ↓
   ⑥ 是否绑定了第三方账号（Google/Apple 等）？
   ├─ 有 → 需在个人中心 → 账户信息 → 第三方账户中解绑后才能删除
   └─ 无 → 所有条件满足，应可正常删除，联系开发排查
```

```sql
-- 查未完成订单（与下两条并行）
SELECT COUNT(i.order_id) AS not_finish_count
FROM yamibuy_master.xysc_order_info i
LEFT JOIN yamibuy_so.so_tracking_info t ON i.order_id = t.order_id
WHERE i.user_id = user_id AND i.is_separate = 0
  AND ((((i.order_status = 5 AND i.shipping_status = 1 AND i.pay_status = 2)
      OR (i.order_status = 4 AND i.shipping_status = 8 AND i.pay_status = 4))
    AND (t.delivery_status != 1 OR t.delivery_status IS NULL)
    AND order_type NOT IN (1,2,7))
  OR i.order_status = 1);

-- 查未处理退款（与上条并行）
SELECT COUNT(i.order_id) AS not_refund_count
FROM yamibuy_master.xysc_order_info i
LEFT JOIN yamibuy_master.xysc_refund_apply a ON i.order_id = a.order_id
LEFT JOIN yamibuy_rma.rma_order r ON i.order_id = r.order_id
WHERE i.user_id = user_id AND (a.audit_status = 1 OR r.status < 10);

-- 查第三方账号绑定（与上条并行）
SELECT COUNT(*) AS third_bind_count
FROM yamibuy_master.xysc_users_third WHERE user_id = user_id AND is_bind = 1;
```

### 场景五：账户异常（老账号变新账号）
触发条件：客人反馈之前的账号登录后显示为新账号

```
1. 执行脚本 `python scripts/get-userid.py "邮箱"` 查询邮箱获取 user_id
2. 拿到 user_id 后，并行查询：xysc_users_delete + crm_customer_log 邮箱变更记录
   ↓
   xysc_users_delete 有记录？
   ├─ 是 → 用户删除过账户，重新注册后是新账号
   └─ 否 → crm_customer_log 有 type_id=51 的邮箱变更记录？
          ├─ 有 → 用户改过邮箱，content 中有 old/new 邮箱，当前邮箱可能不是原注册邮箱
          └─ 无 → 邮箱正确但账号仍异常 → 查日志
                 search.py -s ec-customer -k "邮箱或user_id" -t 7d
                 ├─ 有 ERROR/异常记录 → 根据报错信息定位问题，联系开发处理
                 └─ 无异常记录 → 建议客人退出重新登录或清除 App 缓存，仍有问题联系开发
```

```sql
-- 查是否删除过账户（与下条并行，脚本获取 user_id 后执行）
SELECT * FROM yamibuy_master.xysc_users_delete WHERE email = '邮箱';
```

查邮箱变更记录（与上条并行） → 见 [Q1]

### 场景六：收藏商品看不到
触发条件：客人反馈看不到收藏的商品

```
1. 查日志
   search.py -s ec-customer -k "user_id值" -t 7d
   ↓
   有报错？
   ├─ 有 → 根据报错信息定位问题
   └─ 无 → 查数据库确认收藏数量
          ↓
          收藏数量超过 1000？
          ├─ 是 → BFF 接口不支持显示超过 1000 条收藏，需要开发调整限制
          └─ 否 → 联系开发进一步排查
```

```sql
-- 查收藏数量
SELECT COUNT(*) AS collect_count FROM yamibuy_master.xysc_collect_goods WHERE user_id = user_id;
```

### 场景七：账户被拉黑 / 黑名单释放后仍异常
触发条件：客服反馈账户被拉黑，或已从黑名单释放但客人仍反馈账户异常

```
1. 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id
2. 并行查询：xysc_users 账户状态 + xysc_blacklist 黑名单记录
   ↓
   有 is_delete=0 的黑名单记录？
   ├─ 是 → 仍在黑名单，需在 Central 后台操作释放
   └─ 否（全部 is_delete=1）→ 检查 flag 是否为 1
                              ├─ flag ≠ 1 → 账户被封禁，联系开发处理
                              └─ flag = 1 → 数据库已正常，查日志
                                           同时查三个索引（关键词：user_id，最近7天）：
                                           - search.py -s ec-customer -k "user_id值" -t 7d
                                           - search.py -s ec-so -k "user_id值" -t 7d
                                           - search.py -s ec-payment -k "user_id值" -t 7d
                                           ├─ 有 ERROR/异常 → 根据报错定位问题
                                           └─ 无报错 → 建议客人退出重新登录或清除 App 缓存
```

```sql
-- 查账户基础状态（与下条并行）
SELECT user_id, flag, White_List, is_validated, is_phone_validated, proguard_time
FROM yamibuy_master.xysc_users WHERE user_id = xxx;

-- 查黑名单记录（与上条并行）
SELECT rec_id, type, user_id, email, mobile, add_time, note, is_delete
FROM yamibuy_master.xysc_blacklist WHERE user_id = xxx;
```

### 场景八：Seller Portal（商家入驻）登录/注册异常
触发条件：客人反馈在商家入驻界面登录提示"用户不存在"，重新注册又提示"用户已存在"

Seller Portal 的账户逻辑与 C 端独立，超出客服排查规则覆盖范围，直接联系 **@Damon Li** 协助排查。

### 场景九：查询邮箱是否注册过 / 是否更改过邮箱
触发条件：客服询问某邮箱是否注册过、是否改过邮箱、两个邮箱是否同一账户

```
1. 执行脚本 `python scripts/get-userid.py "邮箱"` 搜索邮箱（查当前是否有账户使用该邮箱，获取 user_id）
2. 查邮箱变更日志（核心步骤，必须执行）
   ↓
   有 type_id=51 的变更记录？
   ├─ 有 → 直接返回变更信息：旧邮箱、新邮箱、变更时间、操作人
   └─ 无 → 查日志（search.py -s ec-customer -k "邮箱" -t 30d）
   └─ 无 → 查日志（search.py -s ec-customer -k "邮箱" -t 30d）
          ├─ 有相关记录 → 根据日志内容回答
          └─ 无记录 → 该邮箱未有变更历史
```

查邮箱变更日志 → 见 [Q1]

⚠️ 禁止用邮箱查 `xysc_order_info`、`xysc_order_info_2022` 的 email/email_zd 字段，这些字段是脱敏数据。

> 💡 **脱敏数据交叉验证**：当用户已删除（在 `xysc_users_delete` 中）且 email 被脱敏为 `**` 时，可通过 `yamibuy_mail.hms_mail_send_status` 表交叉验证——用邮箱查该表的 `name` 字段（通常为 user_name），再与 `xysc_users_delete.user_name` 比对确认是否同一用户。`xysc_order_info` 和 `xysc_user_address` 的敏感字段同样已脱敏，不可用于交叉验证。


## 注意事项
- 客户参加抽奖活动时提示账号异常：联系 @Gavin 查询
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 必须执行脚本 `python scripts/get-userid.py "邮箱"`
- 验证码邮件收不到时，确认是本人后可从日志中获取验证码提供给用户：
  搜索用户邮箱 → 找到追踪码（格式：[ec-customer,xxx,xxx]）→ 用追踪码搜索 → 找到 CustomerRedisService res:验证码
- 登录相关常见 messageId：10031=密码错误(Invalid password)、90008=Token无效/过期(Token is Invalid)
- `xysc_users.last_login` 仅在邮箱密码登录时更新，第三方登录（Facebook/Google/Apple）不会更新该字段。排查时 last_login 很久远不能直接判断用户长期未登录，需结合日志（search.py -s ec-customer）确认实际访问情况
