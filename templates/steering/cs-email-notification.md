---
inclusion: manual
---

# 邮件与通知问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为邮件/通知排查类问题：
- 邮件、收不到邮件、验证码邮件、订单确认邮件
- 发货通知、缺货通知、邮件通知
- 邮件订阅、取消订阅、退订
- 营销邮件、活动邮件、邮件语言
- 验证码、收不到验证码（邮箱验证码）
- 补货提醒

## 常用数据库表
- `yamibuy_central`.`template` - 邮件模板
- `yamibuy_crm`.`user_cancel_subscript_record` - 用户取消订阅记录表
- `yamibuy_crm`.`user_cancel_subscript_reason` - 取消订阅原因表
- `yamibuy_so`.`so_tracking_info` - 物流追踪信息表（delivery_status=1 为已送达）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## Kibana 日志索引
- 用户服务：`search.py -s ec-customer`，关键词：邮箱 / user_id
- 订单 Job：`search.py -s ec-so-job`，关键词：订单号 / user_id
- Central 订单：`search.py -s central-so`，关键词：订单号

## 常用查询

**[Q1] 按 user_id 查最近订单**
```sql
SELECT order_id, order_sn, pay_status, shipping_status, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE user_id = user_id ORDER BY add_time DESC LIMIT 5;
```

**[Q2] 按订单号查订单信息**
```sql
SELECT order_id, order_sn, pay_status, shipping_status, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

---

## 排查场景

### 场景一：收不到验证码邮件（注册/重置密码）
触发条件：客人反馈收不到验证码邮件

> 与 cs-account-login.md 场景一有交叉。"修改密码验证码错误/次数限制"优先参考该场景，本场景侧重"邮件未收到"。

```
查日志（search.py -s ec-customer -k "邮箱或user_id" -t 7d）
↓
有验证码发送日志？
├─ 有且发送成功 → 请用户检查垃圾邮件（Gmail 存储满时 status=deferred）
│   → 仍找不到 → 从日志获取验证码（需用户提供邮箱截图证明本人）：
│     搜索邮箱 → 追踪码（[ec-customer,xxx,xxx]）→ CustomerRedisService res:验证码
├─ 有但发送失败 → 邮件服务异常，联系开发
└─ 无日志 → `python scripts/get-userid.py "邮箱"` 确认邮箱是否注册
      ├─ 有账户 → 让客服确认操作时间
      └─ 无账户 → 邮箱未注册
```

邮箱验证码登录场景关键接口：`third_verification_code_login`

### 场景二：收不到订单确认邮件 / 发货通知邮件
触发条件：客人反馈没收到订单确认或发货通知邮件

```
客服提供了什么信息？
├─ 有订单号 → 直接使用
├─ 有邮箱 → `python scripts/get-userid.py "邮箱"` → [Q1] 查最近订单
└─ 都没有 → 让客服提供
↓
查日志（search.py -s ec-so-job -k "订单号" -t 7d）
↓
找到 "Order Submit Email Send Success" 或 "email send succeed"？
├─ 是 → 邮件已发送，请用户检查垃圾邮件
└─ 否 → 查订单状态确认是否到了发邮件阶段
      ├─ 订单确认邮件：pay_status=2（已支付）才触发
      ├─ 发货通知：shipping_status 需已发货才触发
      ├─ 状态未到 → 告知客服订单还未到发送阶段
      └─ 状态已到但无日志 → 联系开发
```

订单确认邮件：注册邮箱和收货地址邮箱一致 → 只发一封；不一致 → 各发一封。

### 场景三：取消邮件订阅
触发条件：客人要求取消邮件订阅（包括已删除账户仍收到邮件）

```
读取 `.kiro/skills/iterable-api.md` 获取 API 配置
↓
查询 Iterable 是否有订阅（GET 接口）
↓
有订阅记录？
├─ 是 → 找 @Logon 手动调用删除接口取消（⚠️ 禁止机器人直接调用 DELETE）
└─ 否 → 查 user_cancel_subscript_record 确认是否取消过
      ├─ 有取消记录 → 查日志（search.py -s ec-customer -k "邮箱" -k "iterable" -t 30d）
      │   ├─ 发送时间在取消之后 → 取消后仍发邮件，联系开发
      │   ├─ 发送时间在取消之前 → 正常
      │   └─ 无发送记录 → 已正常取消
      └─ 无取消记录 → 从未订阅过
            → 查日志确认是否有发邮件记录
            ├─ 有 → 联系开发排查
            └─ 无 → 请客服让客人提供邮件截图确认发件人
```

```sql
SELECT rec_id, user_id, reason_id, FROM_UNIXTIME(in_dtm) AS cancel_time
FROM yamibuy_crm.user_cancel_subscript_record WHERE user_id = user_id ORDER BY in_dtm DESC LIMIT 1;
```

### 场景四：邮件语言问题
触发条件：客人想收到特定语言的邮件，或收到的邮件语言不对

```
想收特定语言 → 邮件语言根据账户语言设置发送，让用户在 App/网站修改即可
↓
收到的语言错误：
├─ `python scripts/get-userid.py "邮箱"` → 查订单 lang 字段
│   lang：0=中文, 1=英文(默认), 2=韩文, 3=日文, 4=繁体中文
│   注意：韩/日/繁体 fallback 到英文（系统只支持中英文模板）
├─ 查日志（search.py -s ec-so-job -k "订单号或user_id" -t 7d）
│   ├─ 语言与 lang 一致 → 正常，由下单时语言设置决定
│   ├─ 不一致 → 联系开发
│   └─ 无日志 → 邮件可能未发送，转场景二
```

```sql
SELECT order_id, order_sn, lang, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

### 场景五：邮件地址显示异常
触发条件：订单通知邮件中地址显示有额外信息

邮件地址正常规则：姓名(user_name) + address + address2 + city + province + zipcode

```
有订单号 → [Q2] 查订单信息
↓
查日志（search.py -s ec-so-job -k "订单号" -t 7d）
↓
地址按规则显示？
├─ 是 → 最前面是 user_name 不是地址，属正常
└─ 否 → 联系开发
```

### 场景六：物流送达通知延迟
触发条件：客人反馈物流送达通知邮件延迟

```
有订单号 → [Q2] 查订单信息（关注 vendor_id、order_type）
↓
├─ 第三方商家直邮（vendor_id > 0 且 order_type ≠ 5）→ 依赖第三方物流通知，延迟属正常
└─ 自营/FBY → 依赖 AfterShip 回调
      查日志（search.py -s central-so -k "订单号" -t 7d）
      ├─ 有送达邮件发送记录 → 已发送，延迟是 AfterShip 回调延迟
      ├─ 有物流回调但无邮件 → 联系开发
      └─ 无物流回调 → AfterShip 未收到回调，建议查物流官网
```

### 场景七：收不到补货提醒邮件
触发条件：客人订阅了补货提醒但未收到通知

补货提醒由 Growth 组负责，直接联系 **@Eric** 排查。建议用户检查垃圾邮件。

## 注意事项
- 自提订单确认邮件发送给非自提订单，可能是 seller-portal 的 bug