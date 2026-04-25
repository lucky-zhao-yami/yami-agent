---
inclusion: manual
---

# 邮件与通知问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为邮�?通知排查类问题：
- 邮件、收不到邮件、验证码邮件、订单确认邮�?
- 发货通知、缺货通知、邮件通知
- 邮件订阅、取消订阅、退�?
- 营销邮件、活动邮件、邮件语言
- 验证码、收不到验证码（邮箱验证码）

## 常用数据库表
- `yamibuy_master`.`ym_sendmail` - 邮件发送记�?
- `yamibuy_central`.`template` - 邮件模板

## 常用工具
- Kibana ec-customer 日志：索�?`k8s-ec-customer-service-log-*`
- Kibana ec-so-job 日志：索�?`k8s-ec-so-job-service-log-*`
- Central 邮件列表：https://central.yamibuy.net/crm/index.html?v=v1.3.7#/crm/mailList
- Iterable 邮件系统 API（用于取消订阅）

## 排查场景

### 场景一：收不到验证码邮件（注册/重置密码�?
触发条件：客人反馈收不到验证码邮�?

排查步骤�?
1. �?Kibana ec-customer 日志中搜索用户邮箱，确认邮件是否发送成�?
2. 自己在线上测试忘记密码功能，确认邮件服务器是否正�?
3. 如果日志显示发送成功：
   - 请用户检查垃圾邮件、广告邮件等文件�?
   - 可能原因：Gmail 存储空间已满（status=deferred�?
4. 如果用户仍找不到邮件，可从日志中获取验证码：
   - 搜索用户邮箱找到追踪码（格式�?`[ec-customer,349ceb65aa319cdf,d72035cdc260b229]`�?
   - 用追踪码搜索找到验证码：`CustomerRedisService res:验证码`
   - 需要用户提供邮箱截图证明是本人后才能提供验证码
5. 注意：PC 端双击可能导致请求两次覆盖验证码，已加限�?

### 场景二：收不到订单确认邮�?/ 发货通知邮件
触发条件：客人反馈没收到订单确认或发货通知邮件

排查步骤�?
1. �?Kibana ec-so-job 日志中搜索订单号
2. 查找 "Order Submit Email Send Success" �?"email send succeed" 日志
3. 如果日志显示发送成功，请用户检查垃圾邮�?
4. 订单确认邮件发送逻辑�?
   - 判断注册邮箱和收货地址邮箱是否一�?
   - 一致：只发一�?
   - 不一致：注册邮箱和收货地址邮箱各发一�?

### 场景三：取消邮件订阅
触发条件：客人要求取消邮件订阅（包括已删除账户仍收到邮件�?

排查步骤�?
1. 查询用户是否有亚米账�?
2. 查询 Iterable 系统是否有订阅：
   ```
   GET https://api.iterable.com/api/users/用户邮箱?api_key=f562f2e17f8a42bcb5a8460f5fa87722
   ```
3. 如果有订阅，调用删除接口�?
   ```
   DELETE https://api.iterable.com/api/users/用户邮箱?api_key=f562f2e17f8a42bcb5a8460f5fa87722
   ```
4. 如果 Iterable 中无订阅记录，请用户提供邮件截图确认发件�?

### 场景四：邮件语言问题
触发条件：客人想收到特定语言的邮�?

排查要点�?
- 邮件语言根据用户账户设置的语言发�?
- 让用户在 App 或网站中修改默认语言设置
- 邮件模板查询�?
  ```sql
  SELECT * FROM `yamibuy_central`.`template` WHERE `key` LIKE '%关键�?' LIMIT 100;
  ```

### 场景五：邮件地址显示异常
触发条件：订单通知邮件中地址显示有额外信�?

排查要点�?
- 邮件地址显示规则：姓�?+ address + address2 + city + province + zipcode
- 最前面显示的是用户名（user_name），不是地址的一部分

### 场景六：物流送达通知延迟
触发条件：物流已送达但邮件通知延迟

排查要点�?
- 第三方物流通知送达时间可能与实际送达时间有延�?
- 系统收到第三方物流通知后才发送邮件给客户


### 场景七：收不到补货提醒邮件（Restock Alerts�?
触发条件：客人反馈订阅了补货提醒但产品补货后未收到通知邮件

排查要点�?
- 补货提醒邮件（restock alerts）由 **Growth �?* 负责
- 该问题超出客服自动排查范围，需联系 **@Eric**（Growth 组）排查发送状态和日志
- 建议用户同时检查垃圾邮件文件夹，部分邮箱服务商（如 Protonmail）可能拦截营销类邮�?
## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 补货提醒邮件（restock alerts）由 Growth 组负责，需联系 @Eric 排查
- 自提订单确认邮件如果发送给非自提订单，可能�?seller-portal �?bug
- 删除账户后仍收到邮件，需要在 Iterable 系统中手动删除订�?
