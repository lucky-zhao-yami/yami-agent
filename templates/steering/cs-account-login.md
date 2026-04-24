---
inclusion: manual
---

# 账户与登录问�?- 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为账�?登录排查类问题：
- 登录、登录失败、无法登录、密码错�?
- 修改密码、重置密码、忘记密�?
- 删除账户、注销账户、账户异�?
- 谷歌登录、Google 登录、第三方登录、Apple 登录
- 收藏、收藏商�?
- 账户被拉�?
- 修改邮箱、更改邮箱、换邮箱、邮箱变更、邮箱是否改过
- Seller Portal、商家入驻、入驻界面

## 常用数据库表
- `yamibuy_master`.`xysc_users` - 用户信息�?
- `yamibuy_master`.`xysc_users_delete` - 已删除用户表
- `yamibuy_master`.`xysc_order_info_2022` 等历史订单表
- `Yamibuy_Master`.`xysc_blacklist` - 黑名单记录表（is_delete=0 仍在黑名单，is_delete=1 已释放；type: 1=账户，8=邮箱）
- `yamibuy_crm`.`crm_customer_log` - 用户操作日志表（type_id=51 为邮箱变更，content 含 old/new 邮箱）

## 排查场景

### 场景一：修改密码失�?/ 验证码错�?
触发条件：客人反馈修改密码时验证码错误、次数过多被限制

排查要点�?
- 修改密码规则�? 小时内验证码只能错误 2 次，�?3 次开始提示次数过多，需�?3 小时
- PC 端双击可能导致请求两次覆盖验证码（已修复加了防抖限制�?
- 查询 Kibana ec-customer 日志确认验证码发送和使用情况

### 场景二：登录失败
触发条件：客人反馈无法登�?

排查步骤�?
1. 查询 Kibana 日志检查用户近期登录记�?
2. 检查是否重置密码成�?
3. 检查登录日志是否有密码不正确的记录
4. 常见原因�?
   - 登录过期（长时间未登录）
   - 密码大小写或特殊字符输入错误
   - 重置密码后使用了旧密�?

### 场景三：Google 登录被限制（403 错误�?
触发条件：客人反�?Google 登录提示 403:disallowed_useragent

排查要点�?
- 可能是在第三�?App（如 DealMoon）内使用 WebView 打开
- Google �?2021 �?9 �?30 日起禁止 WebView 登录
- 建议客人使用网站或真�?App 登录

### 场景四：删除账户
触发条件：客人反馈无法删除账�?

排查要点�?
- 如果提示需要解绑第三方账号，说明账户绑定了 Google/Apple 等第三方账号
- 需要在个人中心 �?账户信息 �?第三方账户中解绑后才能删�?

### 场景五：账户异常（老账号变新账号）
触发条件：客人反馈之前的账号登录后显示为新账�?

排查步骤�?
1. 查询用户是否删除过账户：
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_users_delete` WHERE email = '邮箱';
   ```
2. 查询历史订单�?
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_order_info_2022` WHERE `email` = '邮箱' OR `email_zd` = '邮箱' LIMIT 100;
   ```
3. 常见原因：用户以前使用的是其他邮箱账号，收货邮箱和注册邮箱不�?

### 场景六：收藏商品看不�?
触发条件：客人反馈看不到收藏的商�?

排查要点�?
- 收藏数量超过 1000 时，BFF 接口不支持显�?
- 需要开发调整限�?

## 注意事项
- 客户参加活动时提示账号异常：该问题由活动系统管理，超出当前排查范围，请联系 @Gavin 查询- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 商品加购提示有误/无法加到购物车：超出当前排查范围，请联系 @Gavin 查询- 微信支付 SDK �?iOS 18 某些版本中可能无法唤起，建议升级微信�?iOS 系统
- 验证码邮件收不到时，确认是本人后可从日志中获取验证码提供给用�?

### 场景七：账户被拉黑 / 黑名单释放后仍异常
触发条件：客服反馈账户被拉黑，或已从黑名单释放但客人仍反馈账户异常

排查步骤：
1. 通过 Central API 获取 user_id（读取 `.kiro/skills/central-login.md` 和 `.kiro/skills/api-fetch.md` 获取调用方式）
2. 查询账户基础状态：
   ```sql
   SELECT user_id, flag, White_List, is_validated, is_phone_validated, proguard_time
   FROM yamibuy_master.xysc_users WHERE user_id = xxx;
   ```
3. 查询黑名单记录：
   ```sql
   SELECT rec_id, type, user_id, email, mobile, add_time, note, is_delete
   FROM Yamibuy_Master.xysc_blacklist WHERE user_id = xxx;
   ```
   - `Yamibuy_Master.xysc_blacklist` 字段说明：is_delete=0 仍在黑名单，is_delete=1 已释放；type: 1=账户，8=邮箱
4. 判断结果：
   - 有 is_delete=0 记录 → 仍在黑名单，需在 Central 后台操作释放
   - 全部 is_delete=1 且 flag=1 → 数据库已正常，主动同时查询三个索引的 Kibana 日志（关键词：user_id，时间范围：最近7天）：
     - `k8s-ec-customer-service-log-*`（账户/登录）
     - `k8s-ec-so-service-log-*`（订单）
     - `k8s-ec-payment-service-log-*`（支付）
     根据日志结果判断：
     - 有 ERROR/异常日志 → 根据报错内容定位问题
     - 三个索引均无报错 → 回复客服账户状态正常，建议客人退出重新登录或清除 App 缓存后重试，如问题仍存在请提供报错截图
   - flag 非 1 → 账户被封禁，需联系开发处理
5. Kibana 无报错且数据库正常 → 建议客人退出重新登录或清除 App 缓存后重试

### 场景八：Seller Portal（商家入驻）登录/注册异常
触发条件：客人反馈在商家入驻界面（Seller Portal）登录提示"用户不存在"，重新注册又提示"用户已存在"

排查要点：
- 该问题属于 Seller Portal（商家入驻系统）范畴，不属于 C 端用户账户体系
- Seller Portal 的账户逻辑与 C 端独立，超出客服排查规则覆盖范围
- **直接联系 @Damon Li** 协助排查 Seller Portal 的注册/登录逻辑问题

### 场景九：查询邮箱是否注册过 / 是否更改过邮箱
触发条件：客服询问某邮箱是否注册过、是否改过邮箱、两个邮箱是否同一账户

排查步骤：
1. 通过 Central API 搜索邮箱，查询是否有当前使用该邮箱的账户
2. 查询邮箱变更日志（**核心步骤，必须执行**）：
   - 如果已知 user_id，直接查：
     ```sql
     SELECT rec_id, customer_id, type_id, content, FROM_UNIXTIME(in_dtm) AS change_time, in_user
     FROM yamibuy_crm.crm_customer_log WHERE customer_id = user_id AND type_id = 51 ORDER BY in_dtm DESC;
     ```
   - content 字段格式：`old email : 旧邮箱  edit email : 新邮箱`
   - 如果只有邮箱没有 user_id，先通过 Central API 查 user_id，查不到再通过 Kibana 日志搜索邮箱关键词
3. 查询 Kibana ec-so-job 日志（补充验证）：
   - 索引：`k8s-ec-so-job-service-log-*`
   - 搜索邮箱关键词，查看 `last_success_email` 字段（未脱敏）
   - 可确认该邮箱曾关联的 user_id 和订单
4. 查询 Kibana ec-customer 日志：
   - 索引：`k8s-ec-customer-service-log-*`
   - 搜索邮箱关键词，查看用户信息缓存日志中的 email 字段

⚠️ 重要注意事项：
- **禁止用邮箱查 `xysc_order_info` / `xysc_order_info_2022` 的 email/email_zd 字段**，这些字段是脱敏数据，查不到不代表不存在
- **禁止用邮箱查 `xysc_users` 的 email 字段**，同样是脱敏数据
- Central API 查不到只说明当前没有使用该邮箱的账户，不代表从未注册过（可能已改邮箱）
- 必须结合 `crm_customer_log`（type_id=51）和 Kibana 日志综合判断，**所有渠道查完才能给结论**

### crm_customer_log 常用 type_id 速查

| type_id | 含义 |
|---------|------|
| 10 | 个人信息修改 |
| 11 | 修改密码 |
| 20 | VIP 信息修改 |
| 21 | VIP 升级 |
| 22 | VIP 降级 |
| 40 | 验证邮箱 |
| 51 | 邮箱变更（content 含 old/new 邮箱） |
| 60 | 用户登录 |
