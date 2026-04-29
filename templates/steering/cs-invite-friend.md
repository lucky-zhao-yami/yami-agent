---
inclusion: manual
---

# 邀请好友活动 - 客服排查规则

## 参考文档
#[[file:.kiro/docs/邀请好友活动文档.md]]

## 识别规则
当用户提问涉及以下关键词时，自动识别为邀请好友排查类问题：
- 邀请好友、邀请码、邀请链接、invite code
- 邀请奖励、邀请优惠券、邀请积分、邀请礼包
- 绑定邀请码、填写邀请码、邀请码不符合、邀请码无效、无法输入邀请码、找不到绑定入口、填不了邀请码
- 风控拦截、设备相同、设备ID、同一设备
- 收货地址相同、姓名相同、手机号相同（邀请好友上下文）
- 邀请人、被邀请人、新用户奖励

## 常用数据库表
- `yamibuy_crm`.`crm_invite` - 邀请奖励记录表（status=发放状态、type=奖励类型、refer_id=奖励引用ID）
- `yamibuy_crm`.`crm_invite_log` - 邀请事件日志表（event_type=事件类型、event_memo=事件备注）
- `yamibuy_crm`.`crm_invite_risk_control` - 邀请风控拦截记录表（type=拦截类型）
- `yamibuy_crm`.`crm_customer_device` - 用户设备ID表（device_id=设备标识）
- `yamibuy_master`.`xysc_users` - 用户信息表（parent_id=邀请人、invitation_code=邀请码、act_source=注册来源）

> 字段枚举值见 `.kiro/skills/enum-values.md`

## 数据库查询注意事项
- `crm_invite`、`crm_invite_log`、`crm_invite_risk_control` 表中时间字段均为 Unix 时间戳，查询时用 `FROM_UNIXTIME()` 转换
- `crm_invite_log` 表中 `order_sn` 和 `verify_type` 字段在当前生产环境中不存在，禁止使用；事件备注信息统一通过 `event_memo` 字段获取
- `crm_customer_device` 表中 device_id 为 NULL 表示数据异常，需开发人员修复
- `crm_invite` 表中 `refer_id` 字段：type=2（优惠券）时，UUID 格式 = 已发放的 coupon_code，纯数字 = 优惠券 ps_id（未成功发放，可能过期）
- `mkt_coupon_code` 表中较早期的优惠券记录可能已被归档或清理，通过 coupon_code 查不到时不代表未发放，需结合 crm_invite 的 status 和 refer_id 格式综合判断

- 如果客服提供了邀请码但没有 user_id，可通过邀请码直接查邀请人：
  ```sql
  SELECT user_id, invitation_code, FROM_UNIXTIME(reg_time) AS reg_time FROM yamibuy_master.xysc_users WHERE invitation_code = '邀请码';
  ```
- 通过邀请码查到 user_id 后，需要查真实邮箱时：xysc_users 的 email 字段已脱敏，必须通过 Central API `/customer/customers/{user_id}` 获取未脱敏邮箱；`python scripts/get-userid.py` 的 user_id 参数为模糊搜索，短 user_id 可能匹配到其他用户邮箱中包含该数字的记录，使用后必须核对返回的 user_id 是否与目标一致

## 常用查询

以下查询在多个场景中复用，使用 [Q编号] 引用。

### [Q1] 查用户信息
```sql
SELECT user_id, email, user_name, parent_id, act_source, invitation_code,
       is_phone_validated, is_validated,
       FROM_UNIXTIME(reg_time) AS reg_time, FROM_UNIXTIME(first_order_time) AS first_order_time
FROM yamibuy_master.xysc_users WHERE user_id = 用户ID;
```

### [Q2] 查邀请奖励记录
```sql
SELECT rec_id, group_name, user_id, user_type, invite_id, refer_id, status, type, amount,
       validate_type, validate_type_other, event_type, desc_cn, bind_type, log_id,
       FROM_UNIXTIME(in_dtm) AS in_dtm, FROM_UNIXTIME(edit_dtm) AS edit_dtm
FROM yamibuy_crm.crm_invite
WHERE user_id = 用户ID OR invite_id = 用户ID ORDER BY in_dtm DESC;
```

### [Q3] 查风控拦截记录
```sql
SELECT * FROM yamibuy_crm.crm_invite_risk_control
WHERE user_id = 用户ID ORDER BY in_dtm DESC;
```

## 排查场景

### 场景一：邀请码绑定失败 / 输入邀请码提示不符合
触发条件：用户提及"邀请码"+"不符合条件"/"无法绑定"/"绑定失败"/"提示错误"

```
客服提供了什么信息？
├─ 有 B 的邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 B 的 user_id
├─ 有 B 的 user_id → 直接使用
└─ 有邀请码 → 通过邀请码查 A 的 user_id
↓
拿到 A 和 B 的 user_id 后，查 B 的用户信息
↓
逐项检查绑定条件：
├─ parent_id != 0 → 已绑定过邀请关系，不能再绑
├─ first_order_time 不为空 → 已下单，不能绑定
├─ act_source = 2（月饼活动注册，活动已结束但历史用户仍受限）→ 不允许绑定
├─ A 和 B 的 user_id 相同 → 不能自己邀请自己
├─ 提示 "only one invite code can be used" 但 parent_id=0 且 crm_invite 无记录
│   → 异常情况，可能是风控拦截后前端缓存了状态
│   → 需结合设备 ID 和日志进一步排查（search.py -s ec-customer -k "user_id值" -t 7d）
└─ 以上条件都正常 → 查风控拦截和设备 ID
    ↓
    查 crm_invite_risk_control
    ├─ 有风控记录 → 根据 type 值解释拦截原因
    └─ 无风控记录 → 查双方设备 ID 比对
        ├─ 存在相同 device_id → 设备 ID 风控拦截，无法绑定
        ├─ 某一方 device_id 全为 NULL → 数据异常，联系 @Phoebe 修复
        └─ 无交集 → 查日志进一步排查
            search.py -s ec-customer -k "A的user_id-B的user_id" -t 7d
```

- 查 B 的用户信息 → [Q1]（user_id = B的user_id）
- 查风控拦截记录 → [Q3]（user_id = B的user_id）
- 查已有邀请记录 → [Q2]（user_id/invite_id = B的user_id）

```sql
-- 通过邀请码查 A 用户
SELECT user_id, invitation_code, is_phone_validated, is_validated,
       FROM_UNIXTIME(reg_time) AS reg_time, first_order_time
FROM yamibuy_master.xysc_users WHERE invitation_code = '邀请码';

-- 查双方设备 ID
SELECT user_id, device_id, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_customer_device WHERE user_id IN (A的user_id, B的user_id);
```

### 场景二：找不到绑定邀请码入口 / 无法输入邀请码
触发条件：用户提及"找不到绑定入口"/"无法输入邀请码"/"只能看到自己的邀请码"/"没有绑定邀请码的地方"/"填不了邀请码"

```
客服提供了什么信息？
├─ 有 B 的 user_id → 直接使用
└─ 有 B 的邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id
↓
查 B 的用户信息
↓
parent_id = ?
├─ != 0 → B 已绑定过其他邀请人，不能再绑定新的邀请码，系统不会显示绑定入口
└─ = 0 → first_order_time = ?
    ├─ 不为空 → B 已下过单，不再是新用户，系统不会显示绑定入口
    └─ 为空 → act_source = ?
        ├─ 2（月饼活动注册，活动已结束但历史用户仍受限）→ 不允许绑定邀请码
        └─ 0 或 1 → 条件都满足，可能是 App 端 UI 问题
            → 建议客服引导客人在 App 个人中心查找正确的绑定入口，个人资料页底部有入口，个人中心邀请好友页面有入口
```

- 查 B 的用户信息 → [Q1]（user_id = B的user_id）

### 场景三：邀请奖励未发放
触发条件：用户提及"邀请奖励"+"没收到"/"未发放"/"没有"

```
客服提供了什么信息？
├─ 有 A 和 B 的 user_id → 直接使用
└─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id
↓
查 crm_invite 表中 A 和 B 的奖励记录
↓
有记录？
├─ 无记录 → 查 B 的 parent_id
│   ├─ parent_id = 0 → A 和 B 从未建立邀请关系，不会有奖励
│   ├─ parent_id != A 的 user_id → B 绑定了其他人的邀请码
│   └─ parent_id = A 但 crm_invite 无记录 → 异常，联系 @Phoebe
└─ 有记录 → 检查 status
    ├─ status = 1（已发放）但客人说没收到
    │   ├─ 通过 refer_id（coupon_code）查 mkt_coupon_code 确认优惠券状态
    │   │   ├─ status=10（可用）→ 优惠券还在，客人可能没注意到
    │   │   ├─ status=20（已使用）→ 优惠券已用过
    │   │   └─ status=30（已失效）→ 优惠券已过期
    │   └─ 客人可能登录了不同账号 → 确认当前登录账号
    └─ status = 0（未发放）→ 查原因
        ├─ 查 crm_invite_risk_control 有风控记录？
        │   ├─ type=1 → 邀请人未验证手机/无下单历史（当前已关闭，老关系可能仍有）
        │   ├─ type=2 → 设备 ID 相同
        │   ├─ type=3 → 收货地址姓名相同（当前已关闭，老关系可能仍有）
        │   └─ type=4 → 收货地址手机号相同（当前已关闭，老关系可能仍有）
        │   注意：A 邀请多人时，通过风控记录 description 中的"邀请记录id"
        │         对应 crm_invite.rec_id，避免张冠李戴
        ├─ 无风控 → 查 crm_invite_log 检查事件条件
        │   ├─ B 未完成所需操作（未验证手机/未下单/未发货）
        │   ├─ validate_type 不满足（1=验证手机、2=验证邮箱、3=两者都要）
        │   ├─ 时序问题：验证是否在下单之前完成
        │   └─ 多单奖励：A 有多个 group 时，每个 group 需 B 独立完成下单+发货
        └─ refer_id 为纯数字（ps_id）而非 UUID → 优惠券可能已过期
            → 查 mkt_promotion_schedule 确认优惠券有效期
            → 过期则联系 @Phoebe 修复后重新发放
            → 如果同时存在风控拦截记录，说明奖励因风控被阻止且优惠券活动已过期
            → 即使解除风控也无法发放（活动已结束），需联系 @Phoebe 确认是否手动补发新券
```

- 查 A 和 B 的邀请奖励记录 → [Q2]（user_id/invite_id = 查询的user_id）
- 查 B 的用户信息 → [Q1]（user_id = B的user_id）
- 查风控拦截记录 → [Q3]（user_id = B的user_id）

```sql
-- 查 B 的事件记录
SELECT rec_id, event_user, event_type, event_memo, deleted, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_crm.crm_invite_log
WHERE event_user = B的user_id AND deleted = 0 ORDER BY in_dtm ASC;

-- 确认优惠券是否过期（refer_id 为纯数字时）
SELECT ps_id, ps_title, FROM_UNIXTIME(start_time) AS start_date,
       FROM_UNIXTIME(end_time) AS end_date, status
FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = refer_id中的ps_id;

-- 确认已发放优惠券的状态（refer_id 为 UUID 格式的 coupon_code 时）
SELECT coupon_code, ps_id, user_id, status, FROM_UNIXTIME(use_dtm) AS use_dtm,
       FROM_UNIXTIME(use_start_time) AS start_time, FROM_UNIXTIME(use_end_time) AS end_time
FROM yamibuy_mkt.mkt_coupon_code WHERE coupon_code = 'refer_id的值';
```

### 场景四：查询邀请关系
触发条件：用户提及"邀请关系"/"谁邀请的"/"邀请人是谁"

```
客服提供了什么信息？
├─ 有 user_id → 直接查 xysc_users
└─ 有邮箱 → 执行脚本 `python scripts/get-userid.py "邮箱"` 查 user_id
↓
查 parent_id
├─ parent_id = 0 → 未绑定任何邀请人
└─ parent_id != 0 → 查邀请人信息
    → 返回：邀请人 user_id、邮箱、邀请码
    → 可进一步查 crm_invite 确认奖励详情
```

- 查用户邀请关系 → [Q1]（user_id = 用户ID）

```sql
-- 查邀请人信息（parent_id != 0 时）
SELECT user_id, email, user_name, invitation_code
FROM yamibuy_master.xysc_users WHERE user_id = parent_id的值;
```

### 场景五：查询邀请奖励发放详情
触发条件：用户提及"邀请奖励"+"查询"/"详情"/"状态"

```
查 crm_invite 表
↓
有记录？
├─ 有 → 解读字段：
│   ├─ status：0=未发放 / 1=已发放 / 3=已作废(edu旧奖励)
│   ├─ type：1=积分 / 2=优惠券 / 3=礼卡(当前未使用)
│   └─ refer_id：UUID=已发放的 coupon_code / 纯数字=未发放的 ps_id
└─ 无 → 该用户无邀请奖励记录
```

- 查邀请奖励记录 → [Q2]（user_id/invite_id = 用户ID）

### 场景六：客服咨询邀请好友风控规则
触发条件：客服询问风控判断逻辑，如"为什么地址一样但没被拦截"/"风控是怎么判断的"/"什么情况会触发风控"

```
风控类型有哪些？
├─ type=2：设备 ID 相同（当前开启）
│   ├─ 检查时机：绑定阶段（注册或手动绑定邀请码时）
│   ├─ 检查范围：双方所有历史设备 ID 列表，曾经有过相同即触发
│   ├─ 更换设备不能解除：只要历史上有过相同设备 ID 就永久拦截
│   └─ 注销重注册也会检查：同一台设备注册的新账号仍可能匹配
├─ type=3：收货地址姓名相同（当前已关闭，老关系可能仍有记录）
│   ├─ 匹配规则：不区分大小写，去除空格后比对
│   ├─ 检查时机：发货触发发奖时，提取双方当时所有收货地址列表比对
│   ├─ 客户声称"收件人不一样"时：风控检查的是发货当时的地址快照，客户后续修改地址不影响已有的风控判定
│   └─ 可通过 crm_invite_risk_control.description 中的 address_id 查 xysc_user_address 确认当时的地址归属
├─ type=4：收货地址手机号相同（当前已关闭，老关系可能仍有记录）
│   ├─ 匹配规则：去除空格后比对
│   └─ 检查时机：同 type=3，发货时比对
└─ type=1：邀请人未验证手机/无下单历史（当前已关闭，老关系可能仍有记录）

关键规则：
├─ 风控不可解除，被拦截后奖励无法发放
├─ 地址风控检查的是姓名和电话，不是完整地址
├─ 发货后才添加的地址不会被检查到
└─ 风控开关状态属于内部信息，不要向客服提及
```

## 回复原则
- 查询到结果后直接提供给客服
- 涉及风控拦截的，如实告知拦截原因，不提供绕过方案
- 风控开关状态属于内部信息，不要向客服提及风控开关是否开启/关闭
- 设备相同的拦截，数据库可能没有记录，需要查日志确认
  - 命令：`search.py -s ec-customer -k "A的user_id-B的user_id" -t 7d`
