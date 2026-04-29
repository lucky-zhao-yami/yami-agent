---
inclusion: manual
---

# 手机绑定与验证问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为手机绑定/验证排查类问题：
- 手机号、手机绑定、绑定邮箱、绑定手机
- 用户信息查询、用户账号、账号查询
- 客人、客户、顾客 + 查询/绑定/信息
- 解除绑定、解绑手机、注销账户、注销账号
- 无法绑定、已绑定其他账户
- 验证码、收不到验证码、短信验证、手机验证、SMS

## 常用数据库表
- `yamibuy_master`.`xysc_users` - 用户信息表（email/mobile_phone 为脱敏数据）
- `yamibuy_crm`.`crm_bind_phone_log` - 手机绑定日志表（mobile_phone 未脱敏，可正常查询）
- `yamibuy_crm`.`crm_aws_phone_validation` - 手机号类型验证表（phone_type 判断是否 VOIP）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## 常用查询

```sql
-- [Q1] 按手机号查绑定日志
SELECT rec_id, user_id, mobile_phone, type, FROM_UNIXTIME(in_dtm) AS bind_time, in_user
FROM yamibuy_crm.crm_bind_phone_log WHERE mobile_phone = '+1-手机号' ORDER BY in_dtm DESC;

-- [Q2] 按 user_id 查绑定日志
SELECT rec_id, user_id, mobile_phone, type, FROM_UNIXTIME(in_dtm) AS bind_time, in_user
FROM yamibuy_crm.crm_bind_phone_log WHERE user_id = user_id ORDER BY in_dtm DESC;

-- [Q3] 查手机号类型
SELECT mobile_phone, phone_type AS phoneType, phone_type_code AS phoneTypeCode
FROM yamibuy_crm.crm_aws_phone_validation WHERE mobile_phone = '+1-手机号' LIMIT 1;

-- [Q4] 查用户基本信息
SELECT user_id, user_name, is_phone_validated, is_validated, FROM_UNIXTIME(reg_time) AS reg_time
FROM yamibuy_master.xysc_users WHERE user_id = user_id;
```

## 排查场景

### 场景一：查询手机号绑定的邮箱
触发条件：用户提及"手机号"+"绑定"+"邮箱"相关内容

```
1. 提取手机号，已有区号保留原样，没有区号补充 +1-
2. 查 crm_bind_phone_log（未脱敏，可正常查询）
   同步查日志交叉验证：
   search.py -s ec-customer -k "手机号" -t 7d
   ↓
   有绑定记录？
   ├─ 有 → 拿到 user_id，执行脚本 `python scripts/get-userid.py "" "user_id"` 查真实邮箱
   │       → 返回：user_id、绑定时间、真实邮箱
   └─ 无 → 该手机号没有绑定记录
```

```sql
-- 查手机绑定日志 → 见 [Q1]
```

### 场景二：查询邮箱绑定的手机号
触发条件：用户提及"邮箱"+"绑定"+"手机"相关内容

```
1. 执行脚本 `python scripts/get-userid.py "邮箱"` 用邮箱查询 user_id
   ↓
   查到 user_id？
   ├─ 有 → 查 crm_bind_phone_log 获取绑定的手机号
   │       同步查日志交叉验证：
   │       search.py -s ec-customer -k "user_id值" -t 7d
   │       ├─ 有记录 → 返回手机号和绑定时间
   │       └─ 无记录 → 该用户未绑定手机号
   └─ 无 → 邮箱未注册，引导客人确认邮箱
```

```sql
-- 查用户绑定的手机号 → 见 [Q2]
```

### 场景三：手机号无法绑定 / 提示已绑定其他账户 / 解除绑定
触发条件：用户提及"无法绑定手机"/"手机已绑定"/"绑定其他账户"/"解除绑定"/"解绑手机"/"注销账户占用手机号"相关内容

```
1. 提取手机号，已有区号保留原样，没有区号补充 +1-
2. 查 crm_bind_phone_log 确认手机号被谁占用
   同步查日志交叉验证：
   search.py -s ec-customer -k "手机号或邮箱" -t 7d
   ↓
   有绑定记录？
   ├─ 有 → 拿到占用该手机号的 user_id
   │       → 执行脚本 `python scripts/get-userid.py "" "user_id"` 查该 user_id 的真实邮箱
   │       → 告知客服：该手机号已被 user_id=xxx 的账户绑定
   │       ↓
   │       客服需要解除绑定？
   │       ├─ 是 → 建议客人：登录占用账号，在账号设置中更换为其他手机号，释放后再到目标账号绑定
   │       │       ⚠️ 系统目前没有解绑手机号的功能，只能通过换绑来释放
   │       │       ⚠️ 注销占用账号也无法释放手机号（删除账户不清理 crm_bind_phone_log）
   │       │       ⚠️ 如果占用账号已被删除且无法登录，则该手机号目前无法释放，需反馈开发处理
   │       └─ 否 → 告知占用信息即可
   └─ 无 → 该手机号没被任何人绑定
          ├─ 日志有报错信息（search.py -s ec-customer -k "手机号" -t 7d）→ 根据日志定位原因
          └─ 日志无可用信息 → 建议客人重新尝试绑定
```

注意：不提供任何写操作 SQL，解绑需客人自行操作。

⚠️ 注意：删除账户不会自动解绑手机号。
源码依据：`CustomerInfoService.removeUser` 方法执行流程为：备份用户数据 → 删除 Iterable → 清理 SNS → 物理删除 xysc_users → 清理缓存。
整个流程未涉及 `crm_bind_phone_log` 表的清理，因此删除账户后手机绑定记录仍然保留。
如果客人删除账户后重新注册，绑定同一手机号时会提示"已绑定其他账户"，需按本场景流程处理。

```sql
-- 查手机号被谁绑定 → 见 [Q1]
```
触发条件：用户提及"用户ID"/"用户编号" + "查询"/"信息"

```
1. 并行查询：xysc_users + 执行脚本 `python scripts/get-userid.py "" "user_id"`（查真实邮箱）
   ↓
   返回：user_id、用户名、真实邮箱（脚本查询）、注册时间、手机验证状态、邮箱验证状态
```

```sql
-- 查用户基本信息 → 见 [Q4]（与脚本查询并行）
```

### 场景五：手机验证码收不到
触发条件：用户提及"验证码"/"收不到验证码"/"短信验证"/"手机验证"/"SMS"相关内容

```
1. 提取手机号，格式转换：去掉括号、空格、横杠，已有区号保留原样，没有区号补充 +1-
   如 (646) 475-3814 → +1-6464753814
2. 查 crm_aws_phone_validation 确认手机号类型
   ↓
   phone_type = ?
   ├─ VOIP 或 INVALID → 系统识别为虚拟号码，无法发送验证码
   │   注意：部分小运营商（如阿拉斯加 GCI）可能被误判为 VOIP
   │   注意：即使客人声称是三大运营商，系统仍可能识别为 VOIP
   │   （T-Mobile DIGITS 副号、携号转网缓存等原因）
   │   → 以系统检测结果为准，建议客人更换非虚拟手机号
   ├─ MOBILE 或其他正常类型 → 号码正常，查日志确认验证码发送情况
   │   search.py -s ec-customer -k "手机号或邮箱" -t 7d
   │   ├─ 有验证码发送日志 → 验证码已发送，建议客人检查短信拦截设置、稍后重试、联系运营商 或者 让客人再次触发验证，验证码提供给客人
   │   └─ 无验证码日志 → 客人最近没有触发手机验证码，请客服确认手机号码是否正确
   └─ 无结果 → 手机号未在系统中验证过，号码格式可能不正确
          ├─ 确认号码格式是否为 +1- 开头 + 10位数字 → 格式不对则纠正后重新查询
          ├─ 客人运营商为已知虚拟运营商 → 建议更换非虚拟手机号
          └─ 其他 → 确认号码是否正确并重新尝试
```

常见 VOIP 虚拟运营商（无法接收验证码）：Google Fi、Google Voice、TextNow、Skype、Vonage、MagicJack、Line2 等

```sql
-- 查手机号类型 → 见 [Q3]
```
