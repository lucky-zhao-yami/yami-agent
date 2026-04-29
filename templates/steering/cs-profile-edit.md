---
inclusion: manual
---

# 个人信息修改问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为个人信息修改排查类问题：
- 修改个人信息、编辑个人信息、无法修改、修改失败
- 用户名、昵称、头像、生日、性别、个人简介、位置、国家
- 姓名、firstname、lastname、真实姓名
- 信息完整度、个人资料
- 修改邮箱、修改手机号

## 常用数据库表
- `yamibuy_master`.`xysc_users` - 用户信息表
- `yamibuy_crm`.`crm_bind_phone_log` - 手机号变更日志

> 字段枚举值见 `.kiro/skills/enum-values.md`（如 `xysc_users.sex`），解释字段时先查速查表，无需重复查表结构。

## 通用排查流程

大部分个人信息修改失败的排查步骤相同：

```
1. 查日志（search.py -s ec-customer -k "email或user_id" -t 7d）
2. 根据日志中的错误码，对照下方场景的错误码映射表定位原因
3. 无日志 → 请求未到达后端，建议客人检查网络或重新登录
4. 需要查数据库时 → 有邮箱先执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id，再查 xysc_users
```

```sql
-- 查用户当前信息（根据场景选择需要的字段）
SELECT user_id, user_name, avatar, sex, birthday, description, country,
       firstname, lastname, name_source, mobile_phone, is_phone_validated, parent_id
FROM yamibuy_master.xysc_users WHERE user_id = {用户ID};
```

## 排查场景

### 场景一：修改昵称/简介/姓名/性别/国家/生日/头像/位置/真实姓名失败

按通用排查流程查日志（search.py -s ec-customer），根据错误码定位：

| 错误码 | 原因 | 涉及字段 |
|--------|------|---------|
| 10039 | 昵称被占用或含保留词（yamibuy/亚米/YMB，任意位置包含即拦截） | 昵称 |
| 10028 | 内容为空或纯空白字符 | 昵称、firstname、lastname |
| 30004 | 内容过长（昵称 emoji 转义后 >60 字符、国家 >5 字符、简介 emoji 转义后 >255 字符） | 昵称、国家、简介 |
| 10053 | 个人简介过长（emoji 转义后 >255 字符） | 简介 |
| 10066 | 姓名不允许包含 emoji | firstname、lastname |
| 50021 | gender 为负数，前端传参异常 | 性别 |
| ParseException | 日期格式不对，必须是 yyyy-MM-dd | 生日 |
| 请求参数不完整 | 简介不能提交空内容 | 简介 |
| 头像 URL 为空 | 系统自动过滤 some/"/(/) 后变空，静默失败 | 头像 |

> 修改姓名后 `name_source` 更新为 1（用户手动输入）。枚举值见 `enum-values.md`。
> sex=0（未选择）不计入完整度，枚举值见 `enum-values.md`。
> 生日没有修改次数限制，可随时修改。修改生日月份可能影响生日惊喜（VIP权益，需在生日当月领取）。
> 位置和真实姓名无任何格式校验，正常不会失败，日志中也无记录则为网络/登录过期问题。

### 场景二：修改手机号后出现异常

```
1. 查日志（search.py -s ec-customer -k "email或user_id" -t 7d）
2. 并行查数据库：用户信息 + 手机号变更日志
3. 根据日志 + 数据库记录定位：
   ├─ EMPTY_PHONE / INVALID_PHONE_FORMAT → 手机号格式不对，必须是 +1- 开头 + 10位数字
   ├─ is_phone_validated = 0 → 正常行为：换号后验证状态重置，需重新验证
   ├─ parent_id > 0 且 crm_bind_phone_log 有解绑记录 → 换号触发了邀请验证记录删除，确认是否影响实际权益
   └─ 日志中有其他异常 → 根据错误信息定位原因
```

```sql
SELECT user_id, mobile_phone, is_phone_validated, parent_id
FROM yamibuy_master.xysc_users WHERE user_id = {用户ID};

SELECT * FROM yamibuy_crm.crm_bind_phone_log WHERE user_id = {用户ID} ORDER BY id DESC;
```

### 场景三：个人信息完整度不是 100%

```
1. 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id → 查 6 个关键字段
2. 逐一检查哪个不合格，告知客服缺失项：
   ├─ avatar 为空 → 未上传头像
   ├─ user_name 为空 → 未填写昵称
   ├─ sex = 0 或空 → 性别选了"未选择"，需改为男/女/其他/不想说
   ├─ birthday 为空或 1970-01-01 → 未填写生日
   ├─ country 为空 → 未填写国家
   └─ description 为空 → 未填写个人简介（最常见遗漏）
```

```sql
SELECT user_id, user_name, avatar, sex, birthday, description, country
FROM yamibuy_master.xysc_users WHERE user_id = {用户ID};
```

### 场景四：修改邮箱失败

```
1. 查日志（search.py -s ec-customer -k "email或user_id" -t 7d）
   ├─ INCORRECT_PASSWORD → 旧版接口需密码验证，密码输入错误
   ├─ REPEAT_EMAIL → 新邮箱已被其他账户注册，需换一个邮箱
   ├─ EDIT_EMAIL_MAX_COUNT → 1小时内尝试超限（默认3次），1小时后再试
   ├─ INVALID_EMAIL → 邮箱格式不合法（必须包含 @ 和 .，且 @ 只能出现一次）
   ├─ VERIFYCODE_ERROR（新版接口）→ 验证码错误或已过期，重新获取后再试
   └─ 无日志 → 请求未到达后端，建议客人检查网络或重新登录
```

> 修改邮箱成功后副作用：firstname 更新为新邮箱 @ 前缀（name_source=4）；有邀请关系时删除邮箱验证类型的邀请记录；地址簿旧邮箱批量更新为新邮箱。

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 为脱敏数据，查 user_id 参考 cs-global-config.md
- 修改次数限制和完善信息送积分逻辑均已注释，当前不生效
