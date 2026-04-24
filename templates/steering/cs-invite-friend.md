---
inclusion: manual
---

# 邀请好友活�?- 客服排查规则

## 参考文�?
#[[file:.kiro/docs/邀请好友活动文�?md]]

## 全局规则
- 严格按照本文档中定义的场景和排查步骤执行，如果用户提问不匹配任何已定义的场景，禁止自行发散、猜测或尝试未定义的查询
- 遇到无法匹配的场景时，直接告知客服：该问题超出当前排查范围，建议联系 Moc、Wheat �?@Phoebe 等相关人员协助处�?
- 禁止在没有明确排查路径的情况下随意拼�?SQL 查询或给出未经验证的结论

## 识别规则
当用户提问涉及以下关键词时，自动识别为邀请好友排查类问题�?
- 邀请好友、邀请码、邀请链接、invite code
- 邀请奖励、邀请优惠券、邀请积分、邀请礼�?
- 绑定邀请码、填写邀请码、邀请码不符合、邀请码无效、无法输入邀请码、找不到绑定入口、填不了邀请码
- 风控拦截、设备相同、设备ID、同一设备
- 收货地址相同、姓名相同、手机号相同（邀请好友上下文�?
- 邀请人、被邀请人、新用户奖励

## 数据库查询注意事�?
- `yamibuy_crm`.`crm_invite` 表中 `in_dtm`、`edit_dtm` �?int 类型 Unix 时间戳，查询时用 `FROM_UNIXTIME()` 转换
- `yamibuy_crm`.`crm_invite_log` 表中 `in_dtm`、`edit_dtm` 同样�?Unix 时间�?
- `yamibuy_crm`.`crm_invite_risk_control` 表中 `in_dtm` �?Unix 时间�?
- `yamibuy_master`.`xysc_users` 表中 `email` �?`mobile_phone` 字段是脱敏数据，通过邮箱/手机号查询大概率无结�?
- 如需通过邮箱�?user_id，建议联�?Moc �?Wheat 在未脱敏环境中执�?
- `xysc_users` 表中 `act_source` 字段记录用户注册来源，常见值：0（普通注册）、INV_REGISTER（邀请注册）、MOON_2023（月饼活动）�?
- `xysc_users` 表中 `first_order_time` 为空表示新用户（未下单），是绑定邀请码的前提条件之一
- `xysc_users` 表中 `parent_id` 字段记录邀请人�?user_id，默认值为 0 表示未绑定邀请关系；该字段只能判�?是否绑定过邀请人"以及"邀请人是谁"
- 邀请关系的完整信息（奖励状态、绑定类型、风控拦截等）需要从 `crm_invite` 表查询，两个表结合使用才能获得完整排查信�?
- `crm_invite_risk_control` 表主要记�?Central 端的风控拦截（type=3 收货地址姓名相同、type=4 收货地址手机号相同）
- EC 端的设备 ID 检查拦截（type=2）发生在绑定阶段，拦截后邀请关系不会建立，风控记录可能不写入数据库，需�?Kibana 日志确认
- Kibana 索引：`k8s-ec-customer-service-log-*`，搜索格式：`"A的user_id-B的user_id"`
- `crm_invite_log` 表中 `order_sn` �?`verify_type` 字段在当前生产环境中不存在，查询时不要使用这两个字段；事件备注信息统一通过 `event_memo` 字段获取
- 如果客服提供了邀请码但没有提供邀请人 user_id，可以通过邀请码直接查询邀请人�?
  ```sql
  SELECT user_id, invitation_code, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE invitation_code = '邀请码';
  ```
- `yamibuy_crm`.`crm_customer_device` 表记录用户的设备 ID 信息，可用于排查设备 ID 风控相关问题；device_id �?NULL 表示数据异常，需开发人员修�?
- `crm_invite` 表中 `refer_id` 字段：当 type=2（优惠券）时，如果发放成功，refer_id 存储的是 UUID 格式�?coupon_code（如 `48d6c909c66d4361ab3ec1031515462d`）；如果 refer_id 存储的是纯数字（�?`772871`），则为优惠�?ps_id，说明优惠券尚未成功发放到用户账户，可能是优惠券过期导致
- **强制规则：当客服只提供了邮箱而没�?user_id 时，禁止自行通过任何表（包括 crm_invite_log.event_memo、xysc_users.email 等）反查 user_id。优先使�?api-fetch skill 中的 Central API 接口（POST /customer/customers/search）通过邮箱直接查询 user_id（token 通过 central-login skill 自动获取）；如果自动登录失败，则要求客服先去 Central 后台（https://central.yamibuy.net/crm/index.html#/crm/customerList）通过邮箱搜索确认 user_id 后再进行排查，避免查错人**
- 当前连接的是生产环境数据库，禁止提供任何写操�?SQL（UPDATE/DELETE/INSERT�?
- AI 只能执行只读查询（SELECT�?

## 重要安全规则
- 所有查询操作仅限只读（SELECT），禁止执行任何写操�?
- 查询结果中涉及用户隐私信息，回复时不做脱敏处�?

## 通用排查流程

### 场景一：输入邀请码提示不符�?/ 邀请码绑定失败
触发条件：用户提�?邀请码"+"不符�?/"无法绑定"/"失败"/"提示错误"

说明：此场景与场景七相同，请按场景七的完整排查步骤执行�?

### 场景二：找不到绑定邀请码入口 / 无法输入邀请码
触发条件：用户提�?找不到绑定入�?/"无法输入邀请码"/"只能看到自己的邀请码"/"没有绑定邀请码的地�?/"填不了邀请码"

排查步骤�?
1. 确认邀请人 A 和被邀请人 B �?user_id（如客服提供的是邮箱，提醒客服先�?Central 后台�?user_id�?
   Central 查询地址：https://central.yamibuy.net/crm/index.html?v=v1.3.7#/crm/customerList
2. 查询 B 的用户信息，确认是否满足手动绑定条件�?
   ```sql
   SELECT user_id, parent_id, act_source, FROM_UNIXTIME(reg_time) AS reg_time, FROM_UNIXTIME(first_order_time) AS first_order_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = B的user_id;
   ```
3. 分析原因�?
   - parent_id != 0：B 已绑定过其他邀请人，不能再绑定新的邀请码
   - first_order_time 不为空：B 已下过单，不再是新用户，系统不会显示绑定入口
   - act_source �?edu 相关值：edu 活动用户不允许绑定邀请码
   - 以上条件都满足（parent_id=0、未下单、非 edu）：可能�?App 端的 UI 问题，客人进入的�?我的邀请码"页面而非"绑定邀请码"页面，建议客服引导客人在 App 个人中心查找正确的绑定入�?
4. 汇总结果回复客�?

### 场景三：邀请奖励未发放
触发条件：用户提�?邀请奖�?+"没收�?/"未发�?/"没有"

排查步骤�?
1. 确认邀请人 A 和被邀请人 B �?user_id
   - 如果客服提供的是邮箱，优先通过 Central API 接口（api-fetch skill）用邮箱查询 user_id（token 自动获取）；如果接口不可用，则让客服�?Central 后台�?
2. 查询 crm_invite 表中的奖励记录：
   ```sql
   SELECT rec_id, group_name, user_id, user_type, invite_id, refer_id, status, type, amount, validate_type, validate_type_other, event_type, desc_cn, bind_type, log_id, FROM_UNIXTIME(in_dtm) AS in_dtm, FROM_UNIXTIME(edit_dtm) AS edit_dtm FROM `yamibuy_crm`.`crm_invite` WHERE user_id = 查询的user_id OR invite_id = 查询的user_id ORDER BY in_dtm DESC;
   ```
   如果 crm_invite 表中查不�?A �?B 之间的任何记录，进一步检�?B �?parent_id�?
   ```sql
   SELECT user_id, parent_id, act_source, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = B的user_id;
   ```
   - 如果 parent_id = 0：说�?A �?B 之间从未建立邀请关系，B 注册时没有通过邀请链接，也没有手动绑定邀请码，因此不会产生任何邀请奖励。请客服跟客人确�?B 是否确实通过 A 的邀请链接注册或绑定过邀请码
   - 如果 parent_id != 0 但不等于 A �?user_id：说�?B 绑定了其他人的邀请码，不�?A 的被邀请人
   - 如果 parent_id = A �?user_id �?crm_invite 无记录：属于异常情况，建议联�?@Phoebe 排查
3. 查询 crm_invite_log 表中 B 的事件记录：
   ```sql
   SELECT rec_id, event_user, event_type, event_memo, deleted, FROM_UNIXTIME(in_dtm) AS in_dtm FROM `yamibuy_crm`.`crm_invite_log` WHERE event_user = B的user_id AND deleted = 0 ORDER BY in_dtm ASC;
   ```
4. 检查风控拦截记录（同场景一步骤5�?
5. 分析未发放原因：
   - status=0 且无风控记录：检查事件条件是否满足（验证、下单、发货）
   - 有风控记录：说明被风控拦截，根据 type 值向客服解释具体原因�?
     - type=1：邀请人未验证手机或无下单历史 —— 当前生产环境该检查已关闭（INV_USER_RISK_FLAG=false），新的邀请关系不受此限制，但关闭前建立的老邀请关系可能仍有此拦截记录
     - type=2：两个用户设�?ID 相同
     - type=3：两个用户收货地址中存在相同的收货人姓名（即使客服说地址不同，只要姓名匹配就会触发）—�?当前生产环境该检查已关闭（consignee_check_enable=false），新的邀请关系不受此限制，但关闭前建立的老邀请关系可能仍有此拦截记录
     - type=4：两个用户收货地址中存在相同的手机�?—�?当前生产环境该检查已关闭（phone_check_enable=false），新的邀请关系不受此限制，但关闭前建立的老邀请关系可能仍有此拦截记录
     - 风控拦截后奖励无法自动发放，且风控不可解除，需向客服如实说明拦截原�?
     - 注意：当 A 邀请了多人时，需通过风控记录 `description` 字段中的"邀请记录id"来对应具体的 `crm_invite.rec_id`，确认该风控记录属于哪对邀请关系，避免张冠李戴
   - event_type 不匹配：B 还未完成所需的操作（如未验证手机、未下单、未发货�?
   - validate_type/validate_type_other 不满足：验证条件未达�?
     - validate_type=1：需要验证手机，检�?is_phone_validated 是否�?1
     - validate_type=2：需要验证邮箱，检�?invite_log 中是否有 event_type=2 的邮箱验证记�?
     - validate_type=3：需要同时验证手机和邮箱，两个条件都必须满足
   - 时序问题：验证是否在下单之前完成
   - 多单奖励未满足：如果 A 有多�?group（如 inviter1、inviter2），每个 group 需�?B 完成一次独立的下单+发货才能触发；检�?B 的发�?log（event_type=4）数量是否少�?A 的待发放 group 数量
   - status=0 �?refer_id 为纯数字（ps_id）而非 UUID 格式�?coupon_code：说明优惠券在发放时可能已过期。邀请关系建立时系统会预先记录优惠券 ps_id，但优惠券有效期为一年，如果用户很久之后才满足发奖条件（验证手机、下单发货等），优惠券可能已失效导致无法发放。快速判断：如果邀请关系建立时间（in_dtm）和客服提问时间跨年了，就容易出现此问题。可通过以下 SQL 确认优惠券是否过期：
     ```sql
     SELECT ps_id, ps_title, FROM_UNIXTIME(start_time) AS start_date, FROM_UNIXTIME(end_time) AS end_date, status FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = refer_id中的ps_id;
     ```
     如果 use_end_date 已过期，需要联系开发人员（@Phoebe）修复优惠券数据后重新发�?
6. 如果所有奖�?status=1（已发放），但客人反馈没收到，可能原因：
   - 优惠券已过期或已使用，建议客服在 Central 后台查看用户的优惠券列表确认状�?
   - 奖励发放时间较早（如几个月前），客人可能记错了时�?
   - 客人从不同渠道（如微信跳�?App）登录时可能登录了不同账号，建议确认客人当前登录的账号是否正�?
7. 汇总结果回复客�?

### 场景四：查询邀请关�?
触发条件：用户提�?邀请关�?/"谁邀请的"/"邀请人是谁"

排查步骤�?
1. 查询用户�?parent_id�?
   ```sql
   SELECT user_id, email, user_name, parent_id, invitation_code, FROM_UNIXTIME(reg_time) AS reg_time, act_source FROM `yamibuy_master`.`xysc_users` WHERE user_id = 用户ID;
   ```
2. 如果 parent_id != 0，查询邀请人信息�?
   ```sql
   SELECT user_id, email, user_name, invitation_code FROM `yamibuy_master`.`xysc_users` WHERE user_id = parent_id的�?
   ```
3. 查询 crm_invite 表中的奖励记录确认详�?

### 场景五：查询邀请奖励发放详�?
触发条件：用户提�?邀请奖�?+"查询"/"详情"/"状�?

排查步骤�?
1. 查询 crm_invite 表：
   ```sql
   SELECT rec_id, group_name, user_id, user_type, invite_id, refer_id, status, type, amount, event_type, desc_cn, bind_type, FROM_UNIXTIME(in_dtm) AS in_dtm, FROM_UNIXTIME(edit_dtm) AS edit_dtm FROM `yamibuy_crm`.`crm_invite` WHERE user_id = 用户ID ORDER BY in_dtm DESC;
   ```
2. status 含义�?=未发放，1=已发�?
3. type 含义�?=积分�?=优惠券，3=礼卡
4. 汇总结果回�?

### 场景六：客服咨询邀请好友风控规�?
触发条件：客服询问风控判断逻辑，如"为什么地址一样但没被拦截"/"风控是怎么判断�?/"什么情况会触发风控"

回复要点�?
1. 收货地址风控检查的是收货人姓名和收货电话是否相同，不是完整地址是否一模一�?
   - 姓名匹配（不区分大小写，去除空格后比对）触发 type=3 拦截
   - 电话匹配（去除空格后比对）触�?type=4 拦截
2. 当前生产环境�?`consignee_check_enable`（姓名检查）�?`phone_check_enable`（电话检查）风控开关均为关闭状态，即新的邀请关系不受收货地址姓名和电话的风控限制；但关闭前建立的老邀请关系可能仍存在此类拦截记录
3. 风控检查发生在发货时（不是注册或验证时），系统在发货触发发奖的那一刻提取双方当时所有的收货地址列表进行比对
4. 如果好友的地址是在发货之后才添加的，发货时风控检查不会命中，奖励会正常发�?
5. 设备 ID 检查发生在绑定阶段（注册或手动绑定邀请码时），不是发货时；设�?ID 检查开�?`INV_USER_RISK_DEVICE_FLAG=true`（当前开启）
6. 风控不可解除，被拦截后奖励无法发�?
7. 更换设备不能解除拦截：系统检查的是双方所有历史设�?ID 列表，只要曾经有过相同的设备 ID 就会触发拦截，即使现在换了新设备也无法解�?
8. 注销后重新注册也会检查设�?ID：新账号登录时会记录新的设备 ID，但如果使用同一台设备注册，新设�?ID 仍可能与邀请人的历史设�?ID 匹配，同样会被拦�?

## 回复原则
- 查询到结果后直接提供给客�?
- 涉及风控拦截的，如实告知拦截原因，不提供绕过方案
- 风控开关状态属于内部信息，不要向客服提及风控开关是否开�?关闭
- 设备相同的拦截，数据库可能没有记录，需要查 Kibana 日志确认
- 需要联�?Moc/Wheat 查未脱敏数据的情况，直接给出 SQL


### 场景七：邀请码绑定失败排查
触发条件：用户提�?邀请码"+"不符合条�?/"无法绑定"/"绑定失败"相关内容

排查步骤�?
1. 提取 B 用户邮箱�?A 用户邀请码
2. **email 脱敏无法直接查询，优先通过 Central API 接口（api-fetch skill）用邮箱�?B �?user_id（token 通过 central-login skill 自动获取�?*；如果自动登录失败，则让客服�?Central 后台查：`https://central.yamibuy.net/crm/index.html#/crm/customerList`
3. 通过邀请码�?A 用户�?
   ```sql
   SELECT user_id, invitation_code, is_phone_validated, is_validated, FROM_UNIXTIME(reg_time) AS reg_time, first_order_time FROM yamibuy_master.xysc_users WHERE invitation_code = '邀请码';
   ```
4. 拿到 B �?user_id 后，检查绑定条件：
   ```sql
   SELECT user_id, parent_id, act_source, first_order_time, is_phone_validated, is_validated, invitation_code, FROM_UNIXTIME(reg_time) AS reg_time FROM yamibuy_master.xysc_users WHERE user_id = B的user_id;
   ```
5. 逐项检查失败原因：
   - `parent_id != 0` �?已绑定过邀请关系，不能再绑
   - `first_order_time` 不为�?�?已下单，不能绑定
   - `act_source` 为特殊活动来源（edu/月饼活动等）�?不允许绑�?
   - A �?B �?user_id 相同 �?不能自己邀请自�?
   - 系统提示 "only one invite code can be used"：表示系统认为用户已使用过邀请码。检�?parent_id 是否�?0 �?crm_invite 无记录，如果是则属于异常情况（可能是之前尝试绑定时被风控拦截但前端缓存了状态），需结合设备 ID �?Kibana 日志进一步排�?
6. 查风控拦截记录：
   ```sql
   SELECT * FROM yamibuy_crm.crm_invite_risk_control WHERE user_id = B的user_id ORDER BY in_dtm DESC;
   ```
7. 查已有邀请记录：
   ```sql
   SELECT rec_id, user_id, invite_id, user_type, group_name, status, bind_type, FROM_UNIXTIME(in_dtm) AS create_time FROM yamibuy_crm.crm_invite WHERE user_id = B的user_id OR invite_id = B的user_id ORDER BY rec_id DESC;
   ```
8. 如果以上步骤均未发现问题，查询双方设�?ID 进行比对�?
   ```sql
   SELECT user_id, device_id, FROM_UNIXTIME(in_dtm) AS in_dtm FROM yamibuy_crm.crm_customer_device WHERE user_id IN (A的user_id, B的user_id);
   ```
9. 根据设备 ID 查询结果判断�?
   - 如果双方存在相同�?device_id：说明使用了相同设备，设�?ID 风控拦截正常，无法绑�?
   - 如果某一方的 device_id 全部�?NULL：说明设�?ID 数据异常，需要联系开发人员（@Phoebe）修复该用户�?device_id 数据，修复后让客人重新尝试绑定邀请码
   - 如果双方 device_id 都不�?NULL 且没有交集：提供 Kibana 日志查询链接给客服进一步排查：
     https://kibana.yamibuy.net/app/discover#/?_g=(filters:!(),refreshInterval:(display:Off,pause:!f,value:0),time:(from:now-30d,to:now))&_a=(columns:!(),filters:!(),index:'k8s-ec-customer-service-log-*',interval:d,query:(language:lucene,query:%22邀请人user_id-被邀请人user_id%22),sort:!(!('@timestamp',asc)))
   - 如果 Kibana 也查不到相关记录，联�?@Phoebe 进一步排