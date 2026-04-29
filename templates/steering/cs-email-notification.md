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
- `yamibuy_crm`.`user_cancel_subscript_record` - 用户取消订阅记录表（in_dtm 为取消时间，秒级时间戳）
- `yamibuy_crm`.`user_cancel_subscript_reason` - 取消订阅原因表（reason_cn/reason_en）
- `yamibuy_so`.`so_tracking_info` - 物流追踪信息表（delivery_status=1 为已送达）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## 常用查询

### [Q1] 按 user_id 查最近订单
```sql
SELECT order_id, order_sn, pay_status, shipping_status, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info
WHERE user_id = user_id ORDER BY add_time DESC LIMIT 5;
```

### [Q2] 按订单号查订单信息
```sql
SELECT order_id, order_sn, pay_status, shipping_status, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

## 排查场景

### 场景一：收不到验证码邮件（注册/重置密码）
触发条件：客人反馈收不到验证码邮件

> 📌 本场景与 cs-account-login.md 场景一（修改密码验证码）有交叉。如果客人明确是"修改密码时验证码错误/次数限制"，优先参考 cs-account-login.md 场景一。本场景侧重"邮件未收到"的排查。

```
1. 查日志
   search.py -s ec-customer -k "用户邮箱或user_id" -t 7d
   邮箱验证码登录场景关键接口：`third_verification_code_login`
   ↓
   有验证码发送相关日志？
   ├─ 有且显示发送成功 → 请用户检查垃圾邮件/广告邮件文件夹
   │   Gmail 存储空间已满时会出现 status=deferred
   │   ↓
   │   用户仍找不到邮件？
   │   └─ 从日志中获取验证码（需用户提供邮箱截图证明是本人）：
   │      搜索用户邮箱 → 找到追踪码（格式：[ec-customer,xxx,xxx]）
   │      → 用追踪码搜索 → 找到 CustomerRedisService res:验证码
   ├─ 有但显示发送失败 → 邮件服务异常，联系开发排查
   └─ 无日志 → 用户近期没有触发验证码操作
              → 执行脚本 `python scripts/get-userid.py "邮箱"` 确认邮箱是否注册
              ├─ 有账户 → 让客服跟客人确认操作时间
              └─ 无账户 → 邮箱未注册，引导确认注册时使用的邮箱
```

### 场景二：收不到订单确认邮件 / 发货通知邮件
触发条件：客人反馈没收到订单确认或发货通知邮件

```
客服提供了什么信息？
├─ 有订单号 → 直接查日志
│   search.py -s ec-so-job -k "订单号" -t 7d
│   ↓
│   找到 "Order Submit Email Send Success" 或 "email send succeed"？
│   ├─ 是 → 邮件已发送，请用户检查垃圾邮件
│   └─ 否 → 查订单状态确认是否到了发邮件的阶段
│          ├─ 订单确认邮件：pay_status=2（已支付）才会触发发送
│          ├─ 发货通知邮件：shipping_status 需已发货才会触发发送
│          ├─ 订单状态未到 → 告知客服订单还未到发送邮件的状态
│          └─ 订单状态已到但无发送日志 → 联系开发排查
└─ 只有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id
             → 查最近订单获取订单号
             → 拿到订单号后查日志（同上）
```

> 📌 使用 [Q1] 按 user_id 查最近订单

订单确认邮件发送逻辑：注册邮箱和收货地址邮箱一致 → 只发一封；不一致 → 各发一封。

### 场景三：取消邮件订阅
触发条件：客人要求取消邮件订阅（包括已删除账户仍收到邮件）

```
1. 读取 `.kiro/skills/iterable-api.md` 获取 API 配置
2. 查询 Iterable 系统是否有订阅（GET 接口）
   ↓
   有订阅记录？
   ├─ 是 → 告知客服该邮箱在 Iterable 中有订阅记录，找 @Logon 手动调用删除接口取消订阅
   │       ⚠️ 禁止机器人直接调用 DELETE 接口
   └─ 否 → 查 user_cancel_subscript_record 确认是否之前取消过订阅
          ├─ 有取消记录 → 记录最后一次取消时间（in_dtm）
          │   → 查日志（search.py -s ec-customer -k "邮箱" -k "iterable" -t 30d）
          │   ├─ 有邮件发送记录且发送时间在取消订阅之后 → 取消订阅后仍在发邮件，联系开发排查
          │   ├─ 有邮件发送记录但发送时间在取消订阅之前 → 属正常，取消前发的邮件
          │   └─ 无邮件发送记录 → 已正常取消，告知客服
          └─ 无取消记录 → 用户从未订阅过
                       → 查日志（search.py -s ec-customer -k "邮箱" -k "iterable" -t 30d）
                       ├─ 有邮件发送记录 → 联系开发排查为什么无订阅但在发邮件
                       └─ 无邮件发送记录 → 告知客服：用户没有订阅记录，日志中也没有发邮件内容
                                        → 请客服让客人提供邮件截图确认发件人，再找开发排查
```

```sql
-- 查取消订阅记录（获取最后一次取消时间）
SELECT rec_id, user_id, reason_id, FROM_UNIXTIME(in_dtm) AS cancel_time
FROM yamibuy_crm.user_cancel_subscript_record
WHERE user_id = user_id ORDER BY in_dtm DESC LIMIT 1;
```

### 场景四：邮件语言问题
触发条件：客人想收到特定语言的邮件，或反馈收到的邮件语言不对

```
客服反馈的是什么问题？
├─ 想收到特定语言的邮件 →
│   直接回复客服：邮件语言根据用户账户设置的语言发送
│   → 让用户在 App 或网站中修改默认语言设置即可
│   → 修改后新订单的邮件会使用新语言，已有订单不受影响
└─ 收到的邮件语言错误 →
   1. 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id
   2. 查订单的 lang 字段确认下单时的语言设置
      lang 枚举：0=中文, 1=英文(默认), 2=韩文, 3=日文, 4=繁体中文
      注意：韩文/日文/繁体中文的邮件会 fallback 到英文（系统只支持中英文邮件模板）
   3. 查日志确认邮件发送时使用的语言
      search.py -s ec-so-job -k "订单号或user_id" -t 7d
      ├─ 日志中语言与订单 lang 一致 → 邮件语言正常，是用户下单时的语言设置决定的
      ├─ 日志中语言与订单 lang 不一致 → 联系开发排查
      └─ 无日志 → 邮件可能未发送，转场景二排查
```

```sql
-- 查订单语言设置
SELECT order_id, order_sn, lang, FROM_UNIXTIME(add_time) AS order_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
```

### 场景五：邮件地址显示异常
触发条件：订单通知邮件中地址显示有额外信息

邮件地址正常显示规则：姓名(user_name) + address + address2 + city + province + zipcode

```
客服提供了什么信息？
├─ 有订单号 → 查订单收货地址信息
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id → 查最近订单收货地址
└─ 都没有 → 让客服提供订单号或邮箱
↓
拿到订单信息后：
1. 查日志确认邮件中实际显示的地址内容
   search.py -s ec-so-job -k "订单号" -t 7d
   ↓
   邮件中的地址是否按规则显示？
   ├─ 是（最前面是 user_name，后面是完整地址）→ 属正常显示，告知客服
   │   最前面显示的是用户名（user_name），不是地址的一部分
   └─ 否（有多余信息或格式异常）→ 联系开发排查
```

> 📌 使用 [Q2] 按订单号查订单信息（额外关注 consignee, address, district, city, province, zipcode 字段）

### 场景六：物流送达通知延迟
触发条件：客人反馈物流送达通知邮件延迟

```
客服提供了什么信息？
├─ 有订单号 → 直接查订单信息
├─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 获取 user_id → 查最近订单
└─ 都没有 → 让客服提供订单号或邮箱
↓
查订单的 vendor_id 和 order_type 判断订单类型：
├─ 第三方商家直邮（vendor_id > 0 且 order_type ≠ 5）
│   → 第三方物流通知送达时间可能与实际送达时间有延迟
│   → 系统收到第三方物流通知后才发送邮件给客户，属正常逻辑 
└─ 亚米自营（vendor_id = 0）或 FBY（order_type = 5）
    → 送达通知依赖 AfterShip 物流追踪回调，回调可能有延迟
    → 查日志确认
       search.py -s central-so -k "订单号" -t 7d
       ├─ 有送达邮件发送记录 → 邮件已发送，延迟是 AfterShip 回调延迟导致，属正常
       ├─ 有物流回调但无邮件发送 → 联系开发排查邮件发送逻辑
       └─ 无物流回调记录 → AfterShip 未收到物流商回调，建议客人直接查物流官网
```

> 📌 使用 [Q2] 按订单号查订单信息（额外关注 vendor_id, order_type, shipping_status 字段）

### 场景七：收不到补货提醒邮件（Restock Alerts）
触发条件：客人反馈订阅了补货提醒但产品补货后未收到通知邮件

```
补货提醒邮件由 Growth 组负责，超出排查范围
→ 直接联系 @Eric（Growth 组）排查发送状态和日志
→ 同时建议用户检查垃圾邮件文件夹
```

## 注意事项
- 自提订单确认邮件如果发送给非自提订单，可能是 seller-portal 的 bug
