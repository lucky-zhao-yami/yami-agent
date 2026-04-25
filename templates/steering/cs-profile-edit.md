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

## 常用数据库表
- `yamibuy_master`.`xysc_users` - 用户信息表（user_name、sex、birthday、description、country、avatar、location、firstname、lastname、name_source）

## 可修改字段一览

| 字段 | 接口路径 | 说明 |
|------|---------|------|
| username（昵称） | PUT /user_name | 用户昵称，需唯一 |
| avatar（头像） | PUT /avatar | 头像 URL |
| birthday（生日） | PUT /birthday | 格式 yyyy-MM-dd |
| gender（性别） | PUT /account_info | 1=男，2=女，3=不想说，0=未选择 |
| location（位置） | PUT /user_location | 用户位置 |
| description（个人简介） | PUT /user_description | 最多 255 字符（emoji 转义后） |
| country（国家） | PUT /account_info | 国家代码，最多 5 字符 |
| firstname / lastname | PUT /account_info | 姓名，不能包含 emoji |
| truename（真实姓名） | PUT /account_info | 真实姓名 |
| phone（手机号） | PUT /account_info | 修改手机号会解绑已验证状态 |
| 综合修改 | PUT /account_info | 支持一次性修改多个字段 |

## 信息完整度计算
完整度由以下 6 个字段决定，全部填写为 100%：
1. `avatar` — 头像
2. `user_name` — 昵称
3. `sex` — 性别（必须 > 0，即不能是"未选择"）
4. `birthday` — 生日（不能是 1970-01-01 或空）
5. `country` — 国家
6. `description` — 个人简介

## 排查场景

### 场景一：修改昵称失败
触发条件：客人反馈修改昵称/用户名时提示错误

排查步骤：
1. 确认用户 user_id
2. 查询当前用户信息：
   ```sql
   SELECT user_id, user_name, avatar, sex, birthday, description, country, location FROM `yamibuy_master`.`xysc_users` WHERE user_id = 用户ID;
   ```
3. 常见失败原因：
   - **昵称已被占用**（错误码 10039）：其他用户已使用该昵称，昵称全局唯一
   - **昵称包含黑名单关键词**（错误码 10039）：昵称中包含 `yamibuy`、`亚米`、`YMB`（不区分位置，包含即拦截）
   - **昵称为纯空白字符**（错误码 10028）：全部由不可见字符/空格/控制字符组成
   - **昵称超长**（错误码 30004）：emoji 转义后超过 60 字符
   - **昵称为空**（错误码 10028）：未填写或 trim 后为空

### 场景二：修改个人简介失败
触发条件：客人反馈修改个人简介（description）时提示错误

排查要点：
- **简介为空**：description 不能为空字符串
- **简介超长**（错误码 10053/30004）：emoji 转义为别名后长度超过 255 字符。注意 emoji 转义后会变长（如 😀 → `:grinning:`），实际可输入的字符数少于 255
- 建议客人缩短内容后重试

### 场景三：修改姓名（firstname/lastname）失败
触发条件：客人反馈修改姓名时提示错误

排查要点：
- **姓名包含 emoji**（错误码 10066）：firstname 和 lastname 不允许包含 emoji 表情
- **姓名为纯空白字符**（错误码 10028）：全部由不可见字符组成
- 修改姓名后 `name_source` 会更新为 `USER_INPUT`

### 场景四：修改性别失败
触发条件：客人反馈修改性别时提示错误

排查要点：
- **性别值无效**（错误码 50021）：gender 值不能为负数
- 有效值：1=男，2=女，3=不想说

### 场景五：修改国家失败
触发条件：客人反馈修改国家时提示错误

排查要点：
- **国家代码超长**（错误码 30004）：country 字段最多 5 字符

### 场景六：修改手机号的副作用
触发条件：客人通过 editAccountInfo 接口修改手机号后出现异常

排查要点：
- 通过 account_info 接口修改手机号时，如果新手机号与旧手机号不同：
  - `is_phone_validated` 会被重置为 0（手机验证状态失效）
  - 系统会在 `crm_bind_phone_log` 中记录解绑日志
  - 如果用户有邀请关系（parent_id > 0），会触发邀请好友验证记录删除
- 建议客人修改手机号后重新验证

### 场景七：个人信息完整度不是 100%
触发条件：客人反馈信息已全部填写但完整度不是 100%

排查步骤：
1. 查询用户 6 个关键字段：
   ```sql
   SELECT user_id, user_name, avatar, sex, birthday, description, country FROM `yamibuy_master`.`xysc_users` WHERE user_id = 用户ID;
   ```
2. 逐一检查：
   - `avatar` 是否为空
   - `user_name` 是否为空
   - `sex` 是否为 0 或空（必须是 1/2/3）
   - `birthday` 是否为空或 1970-01-01（默认值视为未填写）
   - `country` 是否为空
   - `description` 是否为空
3. 最常见遗漏：`description`（个人简介）字段

### 场景八：修改生日
触发条件：客人需要修改生日

排查要点：
- 生日格式必须是 `yyyy-MM-dd`
- 生日可以随时修改，没有次数限制
- 注意：修改生日可能影响生日惊喜领取（需在生日当月领取）

## 错误码速查

| 错误码 | 含义 | 常见触发场景 |
|--------|------|-------------|
| 10028 | 无效用户名 | 昵称为空、纯空白字符、firstname/lastname 纯空白 |
| 10039 | 用户名已存在 | 昵称被占用或包含黑名单词 |
| 10043 | 昵称不正确 | 昵称校验不通过 |
| 10050 | 请求过于频繁 | 修改次数超限（当前已注释，暂不生效） |
| 10053 | 个人简介过长 | description 超过 255 字符 |
| 10066 | 姓名不能包含 emoji | firstname/lastname 含 emoji |
| 30004 | 参数过长 | 昵称超 60 字符、国家超 5 字符、简介超 255 字符 |
| 50021 | 性别无效 | gender 为负数 |

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 昵称黑名单为硬编码：`yamibuy`、`亚米`、`YMB`，包含即拦截（不区分大小写位置）
- 修改次数限制逻辑（每天最大修改次数）在代码中已被注释掉，当前不生效
- 完善信息送积分逻辑也已被注释掉，当前不生效
- 头像 URL 中的 `some`、`"`、`(`、`)` 字符会被自动过滤
