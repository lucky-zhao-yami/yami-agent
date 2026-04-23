---
inclusion: manual
---

# 客服问题排查规则

## 全局规则
- 严格按照本文档中定义的场景和排查步骤执行，如果用户提问不匹配任何已定义的场景，禁止自行发散、猜测或尝试未定义的查询
- 遇到无法匹配的场景时，直接告知客服：该问题超出当前排查范围，建议联系 @Phoebe 等相关人员协助处理
- 禁止在没有明确排查路径的情况下随意拼写 SQL 查询或给出未经验证的结论
- 当用户提及"优惠"、"礼包"、"奖励"等词但未提及"邀请"相关关键词时，不要自动关联到邀请好友活动的排查流程。必须严格按照各文档的识别规则匹配，不得跨文档推测用户意图

## 识别规则
当用户提问涉及以下关键词时，自动识别为客服排查类问题：
- 手机号、手机绑定、绑定邮箱、绑定手机
- 用户信息查询、用户账号、账号查询
- 客人、客户、顾客 + 查询/绑定/信息
- 解除绑定、解绑手机、注销账户、注销账号
- 无法绑定、已绑定其他账户
- 验证码、收不到验证码、短信验证、手机验证、SMS
- 邀请码、邀请好友、绑定邀请码、邀请链接、不符合条件

## 数据库查询注意事项
- `xysc_users` 表中时间字段 `reg_time`、`last_login`、`first_order_time`、`edit_dtm` 等为 int 类型的 Unix 时间戳，查询时需用 `FROM_UNIXTIME()` 转换
- `crm_bind_phone_log` 表中 `in_dtm`、`edit_dtm` 同样是 Unix 时间戳
- `xysc_users` 表注册时间用 `reg_time`
- 手机号在数据库中存储格式为带区号的格式（如 `+1-3472675207`），查询时统一使用 `+1-手机号` 格式精确匹配，只查这一种格式，禁止纯数字或模糊匹配，禁止修改区号格式
- 所有手机号统一使用美国区号 `+1-`，不考虑其他国家区号，无需向客服确认区号
- 当前连接的是生产环境数据库，禁止提供任何写操作 SQL（UPDATE/DELETE/INSERT）
- 所有查询使用精确匹配（`=`），不使用模糊匹配（`LIKE`）
- AI 只能执行只读查询（SELECT），禁止提供任何写操作 SQL（UPDATE/DELETE/INSERT）
- 涉及解绑、修改数据等操作，不要给出 SQL，而是引导客服告知客人自行操作（注销账号或更换手机号）
- **重要：`yamibuy_master`.`xysc_users` 表中的 `email` 和 `mobile_phone` 字段是脱敏数据，无法查到真实信息**
- 因此通过 email 或 mobile_phone 在 xysc_users 表中做 WHERE 条件查询，大概率查不到结果
- **强制规则：当只有邮箱信息时，禁止直接用 email 查 xysc_users。优先使用 api-fetch skill 中的 Central API 接口（POST /customer/customers/search）通过邮箱直接查询 user_id（token 通过 central-login skill 自动获取）；如果自动登录失败，则让客服去 Central 后台（https://central.yamibuy.net/crm/index.html#/crm/customerList）通过邮箱搜索获取 user_id。拿到 user_id 后再进行后续数据库排查。不要因为查不到就猜测用户不存在**
- 如果需要通过手机号或邮箱查真实数据，需要联系 Moc 或 Wheat 帮忙在未脱敏环境中执行
- `crm_bind_phone_log` 表中的 `mobile_phone` 字段未脱敏，可以正常查询
- 推荐排查路径：先通过 `crm_bind_phone_log` 查到 user_id，再用 user_id 在 `xysc_users` 获取其他非脱敏字段信息

## 重要安全规则
- 查询结果中涉及用户隐私信息（手机号、邮箱、地址等），回复时不做脱敏处理
- 所有查询操作仅限只读（SELECT），禁止执行任何写操作
- 禁止提供任何写操作 SQL（UPDATE/DELETE/INSERT），解绑类需求引导客人自行操作

## 通用排查流程

### 场景一：查询手机号绑定的邮箱
触发条件：用户提及"手机号"+"绑定"+"邮箱"相关内容

排查步骤：
1. 从用户问题中提取手机号（注意格式，需要补充国际区号如 `+1-`）
2. 查询手机绑定日志（此表未脱敏，可正常查询）：
   ```sql
   SELECT rec_id, user_id, mobile_phone, type, FROM_UNIXTIME(in_dtm) AS bind_time, in_user FROM `yamibuy_crm`.`crm_bind_phone_log` WHERE mobile_phone = '+1-手机号' ORDER BY in_dtm DESC;
   ```
3. 从结果中获取用户 ID（user_id 字段）
4. 根据用户 ID 查询用户表（注意：email 和 mobile_phone 字段为脱敏数据）：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = '查到的用户ID';
   ```
5. 注意：xysc_users 表中的 email 和 mobile_phone 是脱敏数据，如果需要查看真实邮箱/手机号，需联系 Moc 或 Wheat 帮忙在未脱敏环境中查询
6. 如果 crm_bind_phone_log 和 xysc_users 均查不到结果，且 MCP SQL 工具执行失败，才将以下 SQL 提供给客服转发给 Moc 或 Wheat 在未脱敏环境中执行：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE mobile_phone = '+1-手机号';
   ```
7. 汇总结果，用中文回复，包含：
   - 用户 ID
   - 绑定时间（从 crm_bind_phone_log 获取）
   - 如果 xysc_users 中的 email 是脱敏数据，必须提示需要联系 Moc 或 Wheat 查看真实邮箱

### 场景二：查询邮箱绑定的手机号
触发条件：用户提及"邮箱"+"绑定"+"手机"相关内容

排查步骤：
1. 从用户问题中提取邮箱地址
2. 注意：xysc_users 表中的 email 字段是脱敏数据，直接通过邮箱查询大概率无结果
3. 建议联系 Moc 或 Wheat 帮忙在未脱敏环境中执行以下 SQL：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE email = '邮箱地址';
   ```

### 场景三：手机号无法绑定 / 提示已绑定其他账户
触发条件：用户提及"无法绑定手机"/"手机已绑定"/"绑定其他账户"相关内容

排查步骤：
1. 从用户问题中提取手机号和邮箱
2. 通过绑定日志查手机号记录（此表未脱敏）：
   ```sql
   SELECT rec_id, user_id, mobile_phone, type, FROM_UNIXTIME(in_dtm) AS bind_time, in_user FROM `yamibuy_crm`.`crm_bind_phone_log` WHERE mobile_phone = '+1-手机号' ORDER BY in_dtm DESC;
   ```
3. 如果绑定日志有结果，用 user_id 查用户表：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = 用户ID;
   ```
4. 注意：xysc_users 中的 email 和 mobile_phone 是脱敏数据，查看真实信息联系 Moc 或 Wheat
5. 如果绑定日志也查不到，且 MCP SQL 工具执行失败，才将以下 SQL 提供给客服转发给 Moc 或 Wheat 在未脱敏环境中执行：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE mobile_phone = '+1-手机号';
   ```
6. 汇总分析：
   - 如果手机号已被其他账户绑定，列出占用该手机号的 user_id
   - 如果数据库中查不到该手机号，提示客服：该手机号没有绑定任何账号，可能是缓存层或其他系统的校验问题

### 场景四：解除手机号绑定（手机号被其他账户占用）
触发条件：用户提及"解除绑定"/"解绑手机"/"注销账户占用手机号"相关内容

排查步骤：
1. 先按场景三的流程排查，确认手机号被哪个账户占用
2. 通过绑定日志或联系 Moc/Wheat 查询占用手机号的账户 user_id
3. 用 user_id 查询用户表（email/mobile_phone 为脱敏数据）：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, flag, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = 占用账户的user_id;
   ```
4. 回复客服时，提供以下建议让客服转告客人：
   - 建议客人注销当前绑定该手机号的账号，然后在目标账号上重新绑定
   - 或者建议客人登录绑定该手机号的账号，在账号设置中更换为其他手机号，释放后再到目标账号绑定
5. 如需在后台查看更多信息，可通过 Central 后台：https://central.yamibuy.net/crm/index.html?v=v1.3.7#/crm/customerList

### 场景五：通过用户 ID 查询用户信息
触发条件：用户提及"用户ID"/"用户编号" + "查询"/"信息"

排查步骤：
1. 从用户问题中提取用户 ID
2. 查询用户表：
   ```sql
   SELECT user_id, email, mobile_phone, user_name, is_phone_validated, FROM_UNIXTIME(reg_time) AS reg_time FROM `yamibuy_master`.`xysc_users` WHERE user_id = '用户ID';
   ```
3. 汇总结果并回复

### 场景六：手机验证码收不到
触发条件：用户提及"验证码"/"收不到验证码"/"短信验证"/"手机验证"/"SMS"相关内容

排查步骤：
1. 从用户问题中提取客人邮箱和手机号
2. 手机号格式转换：去掉括号、空格、横杠等，拼接区号，如 (646) 475-3814 → +1-6464753814
3. （可选）通过 Kibana 日志确认客人实际使用的手机号：
   - 索引：`k8s-ec-customer-service-log-*`
   - 搜索关键词：客人的邮箱（如 `"ting7913123@gmail.com"`）
   - 时间范围：最近 15 小时（或根据客人反馈的时间调整）
   - 目的：确认客人发送验证码时系统实际使用的手机号，避免客人提供的手机号与系统记录不一致
4. 查询手机号类型：
   ```sql
   SELECT mobile_phone, phone_type AS phoneType, phone_type_code AS phoneTypeCode FROM yamibuy_crm.crm_aws_phone_validation WHERE mobile_phone = '+1-手机号' LIMIT 1;
   ```
5. 根据 phone_type 结果判断：
   - VOIP 或 INVALID：该手机号被系统识别为虚拟号码，无法发送验证码。注意：部分地区性小运营商（如阿拉斯加的 GCI）的号码也可能被误判为 VOIP，但系统仍无法发送验证码，建议客人更换非虚拟手机号
   - 注意：即使客人声称使用的是三大运营商（T-Mobile、AT&T、Verizon），系统仍可能将其识别为 VOIP。可能原因包括：T-Mobile DIGITS 副号、携号转网后系统缓存旧标记、运营商虚拟号码服务等。以系统检测结果为准，建议客人更换非虚拟手机号
   - MOBILE 或其他正常类型：号码正常，建议客人检查短信拦截设置、稍后重试、或联系运营商
   - 无结果：手机号未在系统中验证过。如果客人提供了运营商信息且为已知虚拟运营商（如 Google Fi、TextNow、Google Voice 等），可直接判断为虚拟号码问题，建议更换非虚拟手机号；否则确认号码是否正确并重新尝试
6. 常见 VOIP 虚拟运营商（无法接收验证码）：Google Fi、Google Voice、TextNow、Skype、Vonage、MagicJack、Line2 等

## 非匹配问题处理
当用户提问不属于上述任何场景（不涉及手机绑定、邮箱绑定、验证码、用户信息查询等），按以下方式处理：
- 不要强行套用上述排查流程
- 直接以普通对话模式回答用户问题
- 如果问题涉及其他业务系统或需要其他团队协助，简短告知客服：该问题超出当前排查范围，当前仅覆盖XX类问题，建议联系 Moc、Wheat 或 @Phoebe 协助处理
- 禁止额外提供"如果是XX活动请提供XX信息"之类的引导建议，不要猜测用户意图或主动关联其他排查流程

## 回复原则
- 查询到结果后直接提供给客服，不需要额外附加操作建议（如"建议客人注销账号"等）
- 需要转发 SQL 给 Moc/Wheat 的情况，直接给出 SQL 即可

## 回复模板
回复时使用以下格式：

```
查询结果如下：
- 用户 ID：xxx
- 绑定邮箱：a****@example.com
- 绑定手机：+1-123****7890
- 绑定时间：2024-01-01 12:00:00
```
