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

## Kibana 日志索引
- 用户服务：`search.py -s ec-customer`，关键词：邮箱 / user_id
- 订单服务：`search.py -s ec-so`，关键词：user_id
- 支付服务：`search.py -s ec-payment`，关键词：user_id

## 常用查询

**[Q1] 查邮箱变更记录**
```sql
SELECT rec_id, customer_id, type_id, content, FROM_UNIXTIME(in_dtm) AS change_time, in_user
FROM yamibuy_crm.crm_customer_log
WHERE customer_id = user_id AND type_id = 51 ORDER BY in_dtm DESC;
-- content 格式：old email : 旧邮箱  edit email : 新邮箱
```

---

## 排查场景

### 场景一：修改密码失败 / 验证码错误
触发条件：客人反馈修改密码时验证码错误、次数过多被限制

```
查日志（search.py -s ec-customer -k "邮箱" -t 7d）
↓
有修改密码/验证码相关日志？
├─ 有 → 根据日志判断：
│   ├─ 验证码错误次数过多 → 3 小时内只能错 2 次，第 3 次起被限制，需等 3 小时
│   ├─ 验证码被覆盖 → PC 端双击导致请求两次覆盖（已修复加了防抖）
│   └─ 其他报错 → 根据日志内容回答
└─ 无日志 → `python scripts/get-userid.py "邮箱"` 确认邮箱是否注册
      ├─ 有账户 → 让客服确认操作时间和具体报错
      └─ 无账户 → 邮箱未注册，引导确认注册邮箱
```

### 场景二：登录失败
触发条件：客人反馈无法登录

```
客服提供了什么信息？
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` 查 user_id
└─ 有 user_id → 直接使用
↓
⚠️ 必须查日志（禁止跳过）：search.py -s ec-customer -k "user_id值" -t 7d
↓
按优先级排查：
├─ 用 user_id + "ExceptionAspect" 搜索 → 定位 WARN/ERROR
│   → 有报错 → 提取 messageId：10031=密码错误、90008=Token无效/过期
│   → 用 trace ID 还原完整调用链
├─ 用 user_id + "third" 搜索 → 第三方登录相关
│   → 关注 third_login_fast / check_binding / third_binding_login / third_verification_code_login
│   → 按需查 xysc_users_third 确认绑定状态
├─ 用 user_id 搜索全量日志 → 按时间排序还原操作时间线
└─ 完全无日志 → `python scripts/get-userid.py "邮箱"` 确认邮箱是否注册
↓
按需查数据库确认账户状态：
├─ flag ≠ 1 或有黑名单记录 → 转场景七
└─ 均无法定位 → 建议清缓存或联系开发
```

常见原因：登录过期、密码大小写错误、重置后用旧密码、邮箱验证码登录收不到（转 cs-email-notification.md 场景一）

```sql
-- 查第三方账号绑定状态
SELECT user_id, platform_id, open_id, is_bind FROM yamibuy_master.xysc_users_third WHERE user_id = {user_id};
-- 查账户状态
SELECT user_id, flag, FROM_UNIXTIME(last_login) AS last_login_time
FROM yamibuy_master.xysc_users WHERE user_id = {user_id};
-- 查黑名单
SELECT rec_id, type, user_id, email, mobile, add_time, note, is_delete
FROM yamibuy_master.xysc_blacklist WHERE user_id = {user_id};
```

### 场景三：Google 登录被限制（403 错误）
触发条件：客人反馈 Google 登录提示 403:disallowed_useragent

```
查日志（search.py -s ec-customer -k "邮箱或user_id" -t 7d）
↓
有 403/useragent 相关报错？
├─ 有 → 根据 useragent 确认请求来源
└─ 无 → 可能在第三方 App（如 DealMoon）内用 WebView 打开
      → Google 自 2021.9.30 起禁止 WebView 登录，建议用网站或 App 登录
```

### 场景四：删除账户
触发条件：客人反馈无法删除账户

```
查日志（search.py -s ec-customer -k "邮箱或user_id" -k "remove user" -t 7d）
↓
有具体报错？
├─ "duplicate ip request" → 同一 IP 24h 内操作超 3 次，需等待
├─ "verify timeout" → 邮箱验证超时，需重新验证
├─ platform/version → App 版本过低，提示升级
├─ "unfinished service" → 有未完成前置条件，查数据库确认
└─ 无日志 → 直接查数据库排查
↓
并行查询：未完成订单 + 未处理退款 + 第三方绑定
├─ 有未完成订单 → 需等待订单完成或取消
├─ 有未处理退款 → 需等待退款完成
├─ 有第三方绑定（is_bind=1）→ 需先在个人中心解绑
└─ 全部满足 → 应可正常删除，联系开发
```

```sql
-- 查未完成订单
SELECT COUNT(i.order_id) AS not_finish_count
FROM yamibuy_master.xysc_order_info i
LEFT JOIN yamibuy_so.so_tracking_info t ON i.order_id = t.order_id
WHERE i.user_id = user_id AND i.is_separate = 0
  AND ((((i.order_status = 5 AND i.shipping_status = 1 AND i.pay_status = 2)
      OR (i.order_status = 4 AND i.shipping_status = 8 AND i.pay_status = 4))
    AND (t.delivery_status != 1 OR t.delivery_status IS NULL)
    AND order_type NOT IN (1,2,7))
  OR i.order_status = 1);

-- 查未处理退款
SELECT COUNT(i.order_id) AS not_refund_count
FROM yamibuy_master.xysc_order_info i
LEFT JOIN yamibuy_master.xysc_refund_apply a ON i.order_id = a.order_id
LEFT JOIN yamibuy_rma.rma_order r ON i.order_id = r.order_id
WHERE i.user_id = user_id AND (a.audit_status = 1 OR r.status < 10);

-- 查第三方绑定
SELECT COUNT(*) AS third_bind_count
FROM yamibuy_master.xysc_users_third WHERE user_id = user_id AND is_bind = 1;
```

### 场景五：账户异常（老账号变新账号）
触发条件：客人反馈之前的账号登录后显示为新账号

```
`python scripts/get-userid.py "邮箱"` 查 user_id
↓
并行查询：xysc_users_delete + [Q1] 邮箱变更记录
↓
xysc_users_delete 有记录？
├─ 是 → 用户删除过账户，重新注册后是新账号
└─ 否 → [Q1] 有 type_id=51 的变更记录？
      ├─ 有 → 用户改过邮箱，content 中有 old/new 邮箱
      └─ 无 → 查日志（search.py -s ec-customer -k "邮箱或user_id" -t 7d）
            ├─ 有异常 → 根据报错定位
            └─ 无异常 → 建议退出重新登录或清缓存
```

```sql
SELECT * FROM yamibuy_master.xysc_users_delete WHERE email = '邮箱';
```

### 场景六：收藏商品看不到
触发条件：客人反馈看不到收藏的商品

```
查日志（search.py -s ec-customer -k "user_id值" -t 7d）
↓
有报错？
├─ 有 → 根据报错定位
└─ 无 → 查收藏数量
      ├─ 超过 1000 → BFF 接口不支持显示超 1000 条，需开发调整
      └─ 未超 → 联系开发排查
```

```sql
SELECT COUNT(*) AS collect_count FROM yamibuy_master.xysc_collect_goods WHERE user_id = user_id;
```

### 场景七：账户被拉黑 / 黑名单释放后仍异常
触发条件：客服反馈账户被拉黑，或已释放但仍异常

```
`python scripts/get-userid.py "邮箱"` 获取 user_id
↓
并行查询：xysc_users + xysc_blacklist
↓
有 is_delete=0 的黑名单记录？
├─ 是 → 仍在黑名单，需在 Central 后台释放
└─ 否 → flag = 1？
      ├─ flag ≠ 1 → 账户被封禁，联系开发
      └─ flag = 1 → 数据库已正常，同时查三个索引日志（user_id，7d）：
            ec-customer / ec-so / ec-payment
            ├─ 有异常 → 根据报错定位
            └─ 无报错 → 建议退出重新登录或清缓存
```

```sql
SELECT user_id, flag, White_List, is_validated, is_phone_validated, proguard_time
FROM yamibuy_master.xysc_users WHERE user_id = xxx;

SELECT rec_id, type, user_id, email, mobile, add_time, note, is_delete
FROM yamibuy_master.xysc_blacklist WHERE user_id = xxx;
```

### 场景八：Seller Portal 登录/注册异常
触发条件：商家入驻界面登录提示"用户不存在"，注册提示"用户已存在"

Seller Portal 账户逻辑与 C 端独立，直接联系 **@Damon Li** 排查。

### 场景九：查询邮箱是否注册过 / 是否更改过邮箱
触发条件：客服询问某邮箱是否注册过、是否改过邮箱

```
`python scripts/get-userid.py "邮箱"` 查是否有账户
↓
[Q1] 查邮箱变更日志
↓
有 type_id=51 的变更记录？
├─ 有 → 返回：旧邮箱、新邮箱、变更时间、操作人
└─ 无 → 查日志（search.py -s ec-customer -k "邮箱" -t 30d）
      ├─ 有记录 → 根据日志回答
      └─ 无记录 → 该邮箱未有变更历史
```

⚠️ 禁止用邮箱查 `xysc_order_info` 的 email/email_zd 字段（脱敏数据）。

> 脱敏数据交叉验证：用户已删除且 email 被脱敏为 `**` 时，可通过 `yamibuy_mail.hms_mail_send_status.name` 与 `xysc_users_delete.user_name` 比对确认。

## 注意事项
- 客户参加抽奖活动时提示账号异常：联系 @Gavin
- `xysc_users` 的 email/mobile_phone 为脱敏数据，查 user_id 必须用脚本
- 验证码邮件收不到时，确认本人后可从日志获取验证码：搜索邮箱 → 追踪码 → CustomerRedisService res:验证码
- 常见 messageId：10031=密码错误、90008=Token无效/过期
- `last_login` 仅邮箱密码登录时更新，第三方登录不更新，不能直接判断用户长期未登录