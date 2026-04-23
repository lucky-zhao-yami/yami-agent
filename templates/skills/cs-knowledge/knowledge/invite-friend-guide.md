# 邀请好友活动数据库设计和运行流程（完善版）

## 一、数据库设计

### 1. crm_invite（奖励记录表）

此表存储了邀请好友活动的奖励信息，包括邀请者 A 和被邀请者 B 的奖励记录。

**字段说明：**

- `rec_id`: 记录ID，自增
- `group_name`: 所属组（如 inviter1, inviter2, register1）
- `user_id`: 获得奖励的用户 ID
- `user_type`: 用户类型，0 为邀请者 A，1 为被邀请者 B
- `invite_id`: 当 user_type 为 0 时，为 B 的用户 ID；当 user_type 为 1 时，为 A 的用户 ID
- `refer_id`: 奖励关联的积分ID/优惠券code/礼卡ID
- `status`: 奖励状态，0 为未发，1 为已发
- `type`: 奖励类型，1 为积分，2 为优惠券，3 为礼卡
- `amount`: 奖励价值
- `validate_type`: **获奖者自己**的验证要求，0 为都不验证，1 为手机验证，2 为邮箱验证，3 为都验证
- `validate_type_other`: **对方**的验证要求，0 为都不验证，1 为手机验证，2 为邮箱验证，3 为都验证
- `event_type`: 发奖事件类型，1 为 B 注册，2 为 B 注册并验证，3 为 B 发货，4 为 B 发货并验证
- `desc_cn`: 奖励内容中文描述
- `desc_en`: 奖励内容英文描述
- `bind_type`: 邀请码绑定类型，0 为注册时绑定，1 为手动绑定
- `log_id`: **（新增）** 触发发奖的 crm_invite_log 的 rec_id
- `in_dtm`: 创建时间
- `in_user`: 创建人
- `edit_dtm`: 修改时间（发奖时间）
- `edit_user`: 修改人

### 2. crm_invite_log（事件日志表）

此表记录被邀请者 B 的事件记录，包括注册、验证、下单和发货等。
该表数据根据 B 用户的状态变化会发生作废，如用户验证后取消验证、下单后取消订单等。

**字段说明：**

- `rec_id`: 记录 ID，自增
- `invite_id`: **（已废弃）** 关联的 crm_invite 表的 rec_id
- `event_user`: 事件用户（B 的 user_id）
- `event_type`: 事件类型
  - 1: 注册
  - 2: 验证（手机或邮箱）
  - 3: 下单
  - 4: 发货
- `event_memo`: 事件备注
  - event_type=1: B 的邮箱
  - event_type=2: 验证的手机号或邮箱
  - event_type=3: purchase_id
  - event_type=4: order_sn
- `order_sn`: **（新增）** 订单号
- `purchase_id`: **（新增）** 采购单ID
- `verify_type`: **（新增）** 验证类型（当 event_type=2 时），1=手机，2=邮箱
- `deleted`: 是否删除，0=正常，1=已删除
- `in_dtm`: 创建时间
- `in_user`: 创建人
- `edit_dtm`: 修改时间
- `edit_user`: 修改人

### 3. crm_invite_risk_control（风控日志表）

记录了 A 和 B 在被风控规则拦截时的日志。

**字段说明：**

- `rec_id`: 记录ID，自增
- `user_id`: 被拦截的用户的用户 ID
- `type`: 风控类型
  - 1: A 未验证手机或无下单历史
  - 2: 设备 ID 相同
  - 3: 收货地址姓名相同
  - 4: 收货地址手机号相同
- `description`: 具体描述，记录风控拦截的详细信息
- `in_dtm`: 记录创建时间

---

## 二、数据流转流程

### 1. 注册阶段

#### 场景一：通过邀请链接注册（自动绑定）

```
A 用户分享邀请链接
  ↓
邀请链接格式：{INVITE_REGISTER_URL}/{A的邀请码}?参数
  ↓
B 用户点击链接访问注册页面
  ↓
【未登录状态】前端调用 /invite_popup 接口
  - 携带 invite_code 参数
  - 后端返回弹窗信息（奖励说明、注册引导等）
  ↓
前端从 URL 中提取邀请码参数（invite_code）
  ↓
B 用户填写注册信息（邮箱、密码等）
  ↓
前端提交注册请求，自动携带 invite_code 参数
  ↓
后端处理注册逻辑：
  - 验证邀请关系（设备ID、A的状态等）
  - 设置 B.parent_id = A.user_id
  - 设置 B.act_source = INV_REGISTER
  - 调用 recordRegisterReward()
  ↓
根据配置 invite_config_v2 插入 crm_invite 记录
  - 为 A 插入 inviter 配置的奖励记录
  - 为 B 插入 register 配置的奖励记录
  - bind_type = 0（注册时绑定）
  ↓
发送 MQ 消息记录注册 log
  ↓
插入 crm_invite_log (event_type=1, event_memo=B的邮箱)
  ↓
调用 giveInviteReward() 检查是否满足发奖条件
```

#### 场景二：第三方快速登录（通过邀请链接）

```
A 用户分享邀请链接
  ↓
B 用户点击链接访问
  ↓
【未登录状态】前端调用 /invite_popup 接口显示弹窗
  ↓
B 用户选择第三方登录（Google/Facebook/Apple等）
  ↓
前端调用 thirdLoginFast 接口，携带 invite_code 参数
  ↓
如果 B 是新用户（需要绑定邮箱）
  ↓
自动触发快速注册流程
  - 使用第三方账号的邮箱
  - 携带 invite_code 参数
  - 调用 thirdBindingRegister()
  ↓
注册成功，邀请关系建立
  - 设置 B.parent_id = A.user_id
  - 设置 B.act_source = INV_REGISTER
  - 调用 recordRegisterReward()
  - bind_type = 0（注册时绑定）
  ↓
后续流程同场景一
```

#### 场景三：登录后手动绑定邀请码

```
B 用户先注册（未通过邀请链接）
  ↓
B.parent_id = 0（未建立邀请关系）
  ↓
B 用户登录后，在个人中心或弹窗中看到绑定邀请码的入口
  ↓
【已登录状态】前端调用 /invite_code/popup 接口
  - 检查是否有待绑定的邀请奖励
  - 返回绑定引导弹窗
  ↓
B 用户手动输入 A 的邀请码
  ↓
前端调用 /invite_code/bind 接口
  ↓
后端验证绑定条件：
  - B 是新用户（未下单）
  - B 未绑定过邀请关系（parent_id=0）
  - 邀请码有效
  - 通过风控检测
  - 非 edu 活动限制用户
  ↓
设置 B.parent_id = A.user_id
  ↓
调用 recordRegisterReward()
  - 插入 crm_invite 记录
  - bind_type = 1（手动绑定）
  ↓
插入 crm_invite_log (event_type=1)
  ↓
补偿验证 log（如果 B 已经验证过手机/邮箱）
  ↓
调用 giveInviteReward() 检查是否满足发奖条件
```

### 2. 验证阶段

```
B 用户验证手机/邮箱
  ↓
发送 MQ 消息
  ↓
插入 crm_invite_log (event_type=2, event_memo=手机号/邮箱)
  ↓
调用 recordInviteLogAndPrize()
  ↓
检查是否满足发奖条件
  - 检查 validate_type 和 validate_type_other
  - 匹配对应的 group_name
  ↓
ec-customer 发送mq 到central-customer
    ↓
满足条件则调用 giveInviteRewardByRegister()
```

### 3. 下单阶段

```
B 用户下单
  ↓
插入 crm_invite_log (event_type=3, event_memo=purchase_id)
  ↓
暂不触发发奖（等待发货）
```

### 4. 发货阶段

```
订单发货（central-so 的 so/deliver/shipping 接口）
  ↓
插入 crm_invite_log (event_type=4, event_memo=order_sn)
  ↓
调用 recordInviteLogAndPrize()
  ↓
验证：
  - 必须有对应的下单 log (event_type=3)
  - 必须满足验证要求
  - 按 group_name 顺序发放奖励
  ↓
调用 giveInviteRewardByRegister()
  ↓
风控检测（收货地址姓名、电话）
  ↓
更新 crm_invite.status = 1
  ↓
发放奖励（积分/优惠券/礼卡）
  ↓
回写 crm_invite.refer_id 和 log_id
```

### 5. 订单取消阶段 **（重要补充）**

```
订单取消
  ↓
调用 deleteOrderInviteLog(userId, purchaseId)
  ↓
将对应的下单 log 标记为 deleted=1
  ↓
【关键】如果该笔交易的任意主单在发货前被取消
  ↓
剩余订单即使发货也不会触发奖励
```

---

## 三、奖励发放机制

### 核心逻辑（giveInviteRewardByRegister）

```
1. 查询 B 的所有待发奖励（status=0）
   - 注册者奖励列表（user_type=1, user_id=B）
   - 邀请者奖励列表（user_type=0, invite_id=B）

2. 按 group_name 分组（保持 ASCII 顺序）

3. 遍历 B 的所有 invite_log

4. 对每个 log，匹配待发奖励：
   - 匹配 event_type（注册/验证/发货）
   - 验证 validate_type（自己的验证状态）
   - 验证 validate_type_other（对方的验证状态）
   - 按 group_name 顺序发放

5. 风控检测：
   - 收货地址姓名不重复
   - 收货地址电话不重复

6. 更新 status=1，发放奖励

7. 回写 refer_id（积分ID/优惠券code/礼卡ID）
```

### 多单奖励规则 **（重要）**

- 每个 `group_name` 代表一个奖励批次
- 如果配置了 2 个 group（inviter1, inviter2），需要 B 下 2 单并发 2 次货
- 按 group_name 的 ASCII 顺序依次发放
- 每次发货只触发一个 group 的奖励

---

## 四、邀请好友配置说明（invite_config_v2）


### 配置结构示例

```json
{
    "prizes": {
        "coupon-1": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655453,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        },
        "coupon-2": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655455,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        },
        "coupon-3": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655456,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        },
        "coupon-4": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655457,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        }
    },
    "rules": {
        "inviter": [
            {
                "group": "inviter1",
                "prizes": ["coupon-1"],
                "event_type": 4,
                "validate_type": 0,
                "validate_type_other": 1
            },
            {
                "group": "inviter2",
                "prizes": ["coupon-2"],
                "event_type": 4,
                "validate_type": 0,
                "validate_type_other": 1
            }
        ],
        "register": [
            {
                "group": "register1",
                "prizes": ["coupon-3", "coupon-4"],
                "event_type": 2,
                "validate_type": 1,
                "validate_type_other": 0
            }
        ],
        "register_edu": [
            {
                "group": "register_edu1",
                "prizes": ["coupon-5"],
                "event_type": 2,
                "validate_type": 1,
                "validate_type_other": 0
            }
        ]
    }
}
```

### 配置字段说明

**prizes（奖品配置）：**
- `type`: 奖励类型，可选值：point（积分）、coupon（优惠券）、giftcard（礼卡）
- `give_amount`: 奖励金额
- `give_ps_id`: 优惠券策略ID（type=coupon时必填）
- `give_activity_id`: 礼卡活动ID（type=giftcard时必填）
- `desc_cn`: 中文描述
- `desc_en`: 英文描述

**rules（规则配置）：**
- `inviter`: A（邀请者）的奖励规则
- `register`: B（被邀请者）的奖励规则
- `register_edu`: B 为 edu 邮箱用户的特殊奖励规则

**每条规则的字段：**
- `group`: 奖励分组名称（按 ASCII 顺序发放，如 inviter1 → inviter2）
- `prizes`: 该组要发放的奖品列表（引用 prizes 中的 key）
- `event_type`: 发奖触发事件
  - 1: B 注册
  - 2: B 注册并验证
  - 3: B 发货
  - 4: B 发货并验证
- `validate_type`: 获奖者自己的验证要求
  - 0: 都不验证
  - 1: 验证手机
  - 2: 验证邮箱
  - 3: 都要验证
- `validate_type_other`: 对方的验证要求（同上）

### 配置更新注意事项

1. **更换优惠券 ps_id**：
   - 更换后旧的 ps_id 将不能使用
   - 需要手动更新历史已发出但未领取的优惠券
   - 在数据库中查找 `type=2` 且 `status=1` 但未使用的优惠券记录

2. **group_name 命名规范**：
   - 必须按 ASCII 顺序命名（如 inviter1, inviter2, inviter3）
   - 系统会按字母顺序依次发放奖励

3. **多奖励配置**：
   - 一个 group 可以配置多个 prizes
   - 所有 prizes 会在同一时间点一起发放

---

## 五、邀请好友关系建立条件（ec-端）

### 风控检测（可配置开关）

1. **A 需要验证手机**
   - 配置开关：`INV_USER_RISK_FLAG=false`（当前关闭）
   - 检查：`A.is_phone_validated = 1`

2. **A 有有效的下单记录**
   - 配置开关：`INV_USER_RISK_FLAG=false`（当前关闭）
   - 检查：调用 `ecSoService.queryActiveOrder(A.user_id)` 不为空

3. **两个用户设备ID不能相同**
   - 配置开关：`INV_USER_RISK_DEVICE_FLAG=true`（当前开启）
   - 检查：调用 `customerService.compareSameUser(A.user_id, deviceId)`

### 基础条件（必须满足）

1. **B 是新用户**：`B.first_order_time` 为空
2. **B 未绑定过邀请关系**：`B.parent_id = 0`
3. **邀请码有效**：A 的 `invitation_code` 存在
4. **不能自己邀请自己**：A 和 B 的 user_id 不同

### 邀请码传递方式

系统支持两种邀请关系建立方式：

#### 1. 通过邀请链接注册（自动绑定，bind_type=0）

**适用场景：**
- 普通邮箱注册
- 第三方账号快速登录注册

**流程：**
- A 用户分享包含邀请码的链接
- 链接格式：`{INVITE_REGISTER_URL}/{A的邀请码}?参数`
- B 用户点击链接后，前端自动提取邀请码
- 注册时自动携带邀请码参数
- 后端自动建立邀请关系

**优势：**
- 用户体验好，无需手动输入邀请码
- 可追踪分享渠道（通过 URL 参数）
- 支持第三方快速登录场景

**邀请链接生成逻辑：**
- 位置：`SendEmailService.sendInvitedRegistEmail()`
- 格式：`INVITE_REGISTER_URL + A.invitation_code + 分享参数 + 内部追踪参数`
- 示例：`https://www.yamibuy.com/register?invite_code=12345678&utm_source=email&user_id=xxx&email_type=xxx&language=en_US`

**关键接口：**
- `GET /invite_popup`: 未登录用户点击邀请链接时显示弹窗（展示奖励信息、注册引导）
- `POST /register`: 注册接口，自动携带 invite_code 参数
- `POST /third/login/fast`: 第三方快速登录，自动携带 invite_code 参数

#### 2. 登录后手动绑定（bind_type=1）

**适用场景：**
- 用户先注册，后来获得邀请码
- 用户注册时未通过邀请链接

**流程：**
- B 用户先注册（parent_id=0）
- B 用户登录后，在个人中心或弹窗中看到绑定入口
- B 用户手动输入 A 的邀请码
- 调用 `/invite_code/bind` 接口绑定
- 后端验证条件后建立邀请关系

**限制条件：**
- B 必须是新用户（未下单）
- B 未绑定过邀请关系（parent_id=0）
- edu 活动期间注册的用户不允许绑定
- 已领取 edu 奖励的用户不允许绑定

**关键接口：**
- `GET /invite_code/popup`: 已登录用户查看绑定引导弹窗
- `GET /invite_code/bind`: 绑定邀请码接口
- `GET /invite_code/reminder`: 绑定邀请码提示信息

### 特殊限制

1. **edu 活动限制**：
   - edu 活动期间注册的用户，不允许后续手动绑定邀请码
   - 已领取 edu 奖励的用户，不允许绑定邀请码

2. **月饼活动限制**：
   - 2023 年月饼活动注册的用户不允许绑定邀请码
   - 检查：`B.act_source != MOON_2023`

---

## 六、获取奖励条件

### 被邀请者 B 获取奖励条件

1. **没有被风控拦截**
   - 与 A 的设备ID不同
   - 与 A 的收货地址信息不重复

2. **建立邀请关系（两种方式）**
   - 方式一：通过 A 分享的邀请链接访问并注册（自动绑定，bind_type=0）
   - 方式二：注册后登录，手动输入邀请码绑定（手动绑定，bind_type=1）

3. **验证手机/邮箱**
   - 根据配置的 `validate_type` 完成验证
   - 0: 不需要验证
   - 1: 验证手机
   - 2: 验证邮箱
   - 3: 验证手机和邮箱

4. **时序要求**
   - 必须先注册（建立邀请关系）
   - 再验证手机/邮箱
   - 验证必须在下单之前完成

### 邀请者 A 获取奖励条件

1. **没有被风控拦截**
   - 与 B 的设备ID不同
   - 与 B 的收货地址信息不重复

2. **B 完成验证**
   - 根据配置的 `validate_type_other` 要求
   - B 必须完成相应的验证

3. **B 下单并发货**
   - 如果 event_type=3 或 4，需要 B 下单并发货
   - 多单奖励需要 B 完成多次下单发货

4. **时序要求**
   - B 必须先绑定邀请码（或注册时填写）
   - B 必须先验证手机/邮箱（在下单之前）
   - B 再下单
   - 订单发货后触发 A 的奖励

---

## 七、奖励发放条件与风控规则（central端）

### 发放前风控检测（可配置开关）

1. **双方地址列表手机号不能相同**
   - 配置开关：`phone_check_enable=false`（当前关闭）
   - 检查逻辑：提取双方所有收货地址的电话号码，去除空格后比对

2. **双方地址列表姓名不能相同**
   - 配置开关：`consignee_check_enable=false`（当前关闭）
   - 检查逻辑：提取双方所有收货地址的收货人姓名，去除空格后比对（不区分大小写）

3. **风控拦截处理**
   - 拦截后不发放奖励
   - 记录风控日志到 `crm_invite_risk_control` 表
   - 日志包含：user_id、type、description

### 发放条件检查

1. **自己的验证状态**
   - 满足 `validate_type` 要求
   - 检查 `is_phone_validated` 和 `is_validated` 字段

2. **对方的验证状态**
   - 满足 `validate_type_other` 要求
   - 检查对方的验证状态

3. **事件匹配**
   - 当前 log 的 event_type 匹配奖励的 event_type
   - 验证事件需要匹配验证类型（手机/邮箱）

4. **顺序发放**
   - 按 group_name 的 ASCII 顺序依次发放
   - 已发放的 group 不再重复发放

5. **下单发货配对**
   - 发货 log（event_type=4）必须有对应的下单 log（event_type=3）
   - 通过 purchase_id 关联

---

## 八、关键代码位置

### EC端（邀请关系建立）

**服务类**：`ec-customer-service/CustomerInviteService.java`

**关键方法**：
- `recordRegisterReward()`: 记录注册奖励到 crm_invite 表
- `bindInvitationCode()`: 手动绑定邀请码
- `checkRisk()`: 风控检测（设备ID、A的状态）
- `checkInvitation_code()`: 验证邀请码有效性
- `makeUpVerifyInviteLog()`: 补偿验证日志

**注册流程**：
- `AbstractRegister.register()`: 注册主流程
  - 从 `RegisterRequestParam.invite_code` 获取邀请码
  - 验证邀请码有效性
  - 设置 `parent_id` 和 `act_source`
  - 调用 `recordRegisterReward()`

**第三方快速登录**：
- `CustomerThirdService.thirdLoginFast()`: 第三方快速登录
  - 从 `ThirdLoginRequestParam.invite_code` 获取邀请码
  - 如果需要绑定邮箱，自动触发注册
  - 将邀请码传递给 `thirdBindingRegister()`

**邀请链接生成**：
- `SendEmailService.sendInvitedRegistEmail()`: 生成邀请邮件
  - 拼接邀请链接：`INVITE_REGISTER_URL + invitation_code + 参数`
  - 发送邀请邮件给好友

### Central端（奖励发放）

**服务类**：`central-customer-service/InviteService.java`

**关键方法**：
- `giveInviteRewardByRegister()`: 发放奖励主流程
- `recordInviteLogAndPrize()`: 记录事件并触发发奖
- `inviteRiskControl()`: 风控检测（收货地址）
- `deleteOrderInviteLog()`: 删除订单log（订单取消时）
- `fillSendRewardInvite()`: 填充待发放奖励
- `matchInviteLog()`: 匹配事件log和奖励配置
- `givePoint()`: 发放积分
- `giveCoupon()`: 发放优惠券
- `giveGiftCard()`: 发放礼卡

### 订单发货触发

**服务**：`central-so` 服务
**接口**：`so/deliver/shipping`
**说明**：订单发货时会调用 central-customer 的邀请奖励接口

### REST接口

**EC端**：
- `GET /invite_code`: 获取用户邀请码（用于分享）
- `GET /invite_popup`: 邀请弹窗接口（未登录用户点击邀请链接时调用）
- `POST /register`: 注册接口（支持 invite_code 参数，自动绑定）
- `POST /third/login/fast`: 第三方快速登录（支持 invite_code 参数，自动绑定）
- `GET /invite_code/popup`: 邀请码绑定弹窗（已登录用户查看绑定引导）
- `GET /invite_code/bind`: 绑定邀请码接口（手动绑定）
- `GET /invite_code/reminder`: 绑定邀请码提示信息

**Central端**：
- `POST /invite/reward/{user_id}`: 发放奖励
- `POST /invite/deleteInviteOrderLog`: 删除订单log

---

## 九、常见问题与注意事项

### 1. 为什么验证必须在下单之前？

因为发奖逻辑会检查 log 的顺序，如果先下单后验证，验证 log 的时间晚于下单 log，系统会认为验证条件不满足。

### 2. 订单取消后会怎样？

- 系统会删除对应的下单 log（标记 deleted=1）
- 如果该笔交易的任意主单在发货前被取消，剩余订单即使发货也不会触发奖励
- 因为发货时找不到对应的下单 log

### 3. 多单奖励如何计算？

- 按 group_name 的 ASCII 顺序发放
- 第一次发货触发第一个 group 的奖励
- 第二次发货触发第二个 group 的奖励
- 以此类推

### 4. 配置更新后历史数据怎么办？

- 已发放的奖励不受影响（status=1）
- 未发放的奖励（status=0）会使用新配置
- 如果更换了优惠券 ps_id，需要手动更新历史未使用的优惠券

### 5. edu 用户有什么特殊规则？

- edu 邮箱用户使用 `register_edu` 配置
- edu 活动期间注册的用户不允许后续绑定邀请码
- 已领取 edu 奖励的用户不允许绑定邀请码

### 6. 风控规则可以关闭吗？

可以，通过配置开关控制：
- `INV_USER_RISK_FLAG`: A 的验证和订单检查
- `INV_USER_RISK_DEVICE_FLAG`: 设备ID检查
- `phone_check_enable`: 收货地址电话检查
- `consignee_check_enable`: 收货人姓名检查

### 7. MQ 消息失败怎么办？

- 系统使用 RabbitMQ 异步处理事件
- 如果 MQ 消息失败，log 不会记录，奖励不会发放
- 需要通过监控和日志排查问题
- 可以手动补偿 log 记录

### 8. 邀请链接如何生成和使用？

**生成方式：**
- A 用户在邀请好友页面获取邀请链接
- 系统自动拼接：`INVITE_REGISTER_URL + A的邀请码 + 追踪参数`
- A 用户可以通过邮件、社交媒体、短信等方式分享

**使用流程（未登录用户）：**
- B 用户点击链接访问
- 前端调用 `/invite_popup` 接口（携带 invite_code）
- 后端返回弹窗信息（奖励说明、注册引导等）
- 前端从 URL 参数中提取 `invite_code`
- B 用户填写注册信息
- 前端提交注册请求时自动携带 `invite_code`
- 后端处理注册并自动建立邀请关系（bind_type=0）

**使用流程（已登录用户）：**
- 如果 B 用户已登录但未绑定邀请关系
- 前端调用 `/invite_code/popup` 接口
- 显示绑定引导弹窗
- B 用户可以选择手动绑定邀请码

**优势：**
- 用户体验好，无需手动输入邀请码
- 可追踪分享渠道（通过 URL 参数）
- 支持第三方快速登录场景
- 自动建立邀请关系，减少用户操作步骤

### 9. 第三方快速登录如何处理邀请码？

- B 用户通过邀请链接访问
- 前端调用 `/invite_popup` 接口显示弹窗
- B 用户选择第三方登录（Google/Facebook/Apple等）
- 前端调用 `thirdLoginFast` 接口，携带 URL 中的 `invite_code` 参数
- 如果是新用户（需要绑定邮箱）：
  - 系统自动触发快速注册流程
  - 使用第三方账号的邮箱作为注册邮箱
  - 自动携带 `invite_code` 参数
  - 完成注册并自动建立邀请关系（bind_type=0）
  - 返回 `by_fast_register=1` 标识
- 如果是老用户：
  - 直接登录，不建立邀请关系

### 10. 注册时绑定和手动绑定有什么区别？

**注册时绑定（bind_type=0）：**
- 通过邀请链接注册，前端自动携带 invite_code
- 在 `AbstractRegister.register()` 中处理
- 自动设置 `parent_id` 和 `act_source=INV_REGISTER`
- 立即记录奖励到 `crm_invite` 表
- 用户无感知，体验流畅

**手动绑定（bind_type=1）：**
- 注册后通过 `/invite_code/bind` 接口绑定
- 在 `CustomerInviteService.bindInvitationCode()` 中处理
- 需要验证用户是否符合绑定条件（新用户、未下单等）
- 记录奖励时 `bind_type=1`
- 需要用户主动操作

**区别：**
- `bind_type` 字段不同，用于区分绑定方式
- 手动绑定有更多限制条件（如 edu 用户限制）
- 注册时绑定用户体验更好，是推荐方式
- 两种方式的奖励发放逻辑相同

**业务场景：**
- 注册时绑定：用户通过分享链接来的（主流场景）
- 手动绑定：用户先注册，后来获得邀请码（补救场景）

---

## 十、数据流转时序图

### 场景一：通过邀请链接注册（推荐方式，自动绑定）

```
时间轴：分享链接 → 点击链接 → 显示弹窗 → 注册 → 验证 → 下单 → 发货

A 用户操作：
  获取邀请链接 → 分享给 B（邮件/社交媒体/短信）

B 用户操作：
  点击链接 → 看到邀请弹窗 → 填写信息注册 → 验证手机 → 下单 → 订单发货

系统处理：
  点击链接时：
    - 前端调用 /invite_popup 接口（未登录状态）
    - 携带 invite_code 参数
    - 后端返回弹窗信息（奖励说明、注册引导）
    - 前端从 URL 中提取 invite_code 并缓存

  注册时：
    - 前端提交注册请求，自动携带 invite_code
    - 验证邀请码有效性
    - 设置 B.parent_id = A.user_id
    - 设置 B.act_source = INV_REGISTER
    - 插入 crm_invite 记录（A 和 B 的奖励，bind_type=0）
    - 插入 crm_invite_log (event_type=1)

  验证时：
    - 插入 crm_invite_log (event_type=2)
    - 检查是否满足发奖条件
    - 如果 B 的奖励 event_type=2，立即发放

  下单时：
    - 插入 crm_invite_log (event_type=3)

  发货时：
    - 插入 crm_invite_log (event_type=4)
    - 检查是否满足发奖条件
    - 如果 A 的奖励 event_type=4，发放奖励
```

### 场景二：第三方快速登录（通过邀请链接，自动绑定）

```
时间轴：分享链接 → 点击链接 → 显示弹窗 → 第三方登录 → 自动注册 → 验证 → 下单 → 发货

A 用户操作：
  获取邀请链接 → 分享给 B

B 用户操作：
  点击链接 → 看到邀请弹窗 → 选择第三方登录（Google/Facebook等）

系统处理：
  点击链接时：
    - 前端调用 /invite_popup 接口（未登录状态）
    - 显示邀请弹窗

  第三方登录：
    - 调用 thirdLoginFast 接口
    - 携带 invite_code 参数
    - 如果是新用户（需要绑定邮箱）：
      ↓
      自动触发快速注册：
        - 使用第三方邮箱
        - 携带 invite_code
        - 调用 thirdBindingRegister()
        - 设置 B.parent_id = A.user_id
        - 设置 B.act_source = INV_REGISTER
        - 插入 crm_invite 记录（bind_type=0）
        - 插入 crm_invite_log (event_type=1)
      ↓
      返回登录成功（by_fast_register=1）

  后续流程同场景一
```

### 场景三：登录后手动绑定邀请码

```
时间轴：注册 → 登录 → 查看弹窗 → 手动绑定 → 验证 → 下单 → 发货

B 用户操作：
  注册（未通过邀请链接）→ 登录 → 看到绑定引导 → 输入邀请码绑定 → 验证手机 → 下单 → 订单发货

系统处理：
  注册时：
    - B.parent_id = 0（未建立邀请关系）
    - 不插入 crm_invite 记录

  登录后：
    - 前端调用 /invite_code/popup 接口（已登录状态）
    - 检查是否有待绑定的邀请奖励
    - 返回绑定引导弹窗

  手动绑定时：
    - 调用 /invite_code/bind 接口
    - 验证绑定条件（新用户、未下单、非 edu 等）
    - 设置 B.parent_id = A.user_id
    - 插入 crm_invite 记录（bind_type=1）
    - 插入 crm_invite_log (event_type=1)
    - 补偿验证 log（如果已验证）

  后续流程同场景一
```

### 数据库变化对比

| 阶段 | crm_invite | crm_invite_log | 说明 |
|------|-----------|----------------|------|
| 分享链接 | 无变化 | 无变化 | 仅生成 URL |
| 点击链接 | 无变化 | 无变化 | 调用 /invite_popup 显示弹窗 |
| 注册（自动绑定） | 插入 A 和 B 的奖励记录（status=0, bind_type=0） | 插入 event_type=1 | 建立邀请关系 |
| 手动绑定 | 插入 A 和 B 的奖励记录（status=0, bind_type=1） | 插入 event_type=1 | 建立邀请关系 |
| 验证 | 可能更新 status=1 | 插入 event_type=2 | B 的奖励可能发放 |
| 下单 | 无变化 | 插入 event_type=3 | 记录下单 |
| 发货 | 更新 status=1，回写 refer_id | 插入 event_type=4 | A 的奖励发放 |

---

## 附录：配置示例

### 示例1：简单配置（B 注册验证即发奖）

```json
{
    "prizes": {
        "point-1": {
            "type": "point",
            "give_amount": 5,
            "desc_cn": "500积分",
            "desc_en": "500 Points"
        }
    },
    "rules": {
        "inviter": [],
        "register": [
            {
                "group": "register1",
                "prizes": ["point-1"],
                "event_type": 2,
                "validate_type": 1,
                "validate_type_other": 0
            }
        ]
    }
}
```

### 示例2：复杂配置（A 和 B 都有奖励，需要发货）

```json
{
    "prizes": {
        "coupon-a1": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655453,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        },
        "coupon-a2": {
            "type": "coupon",
            "give_amount": 15,
            "give_ps_id": 655454,
            "desc_cn": "$15 优惠券",
            "desc_en": "$15 Coupon"
        },
        "coupon-b1": {
            "type": "coupon",
            "give_amount": 10,
            "give_ps_id": 655455,
            "desc_cn": "$10 优惠券",
            "desc_en": "$10 Coupon"
        }
    },
    "rules": {
        "inviter": [
            {
                "group": "inviter1",
                "prizes": ["coupon-a1"],
                "event_type": 4,
                "validate_type": 0,
                "validate_type_other": 1
            },
            {
                "group": "inviter2",
                "prizes": ["coupon-a2"],
                "event_type": 4,
                "validate_type": 0,
                "validate_type_other": 1
            }
        ],
        "register": [
            {
                "group": "register1",
                "prizes": ["coupon-b1"],
                "event_type": 2,
                "validate_type": 1,
                "validate_type_other": 0
            }
        ]
    }
}
```

**说明**：
- B 注册并验证手机后，立即获得 coupon-b1
- B 第一次下单发货后，A 获得 coupon-a1
- B 第二次下单发货后，A 获得 coupon-a2

---

**文档版本**：v1.0  
**最后更新**：2026年  
**维护团队**：Purchase Team
