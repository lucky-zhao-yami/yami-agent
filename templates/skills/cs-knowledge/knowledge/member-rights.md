---
inclusion: manual
---

# 会员权益问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为会员权益排查类问题�?
- 生日惊喜、生日礼卡、生日福�?
- 会员等级、升级、降级、Gold、Ruby、Diamond
- 会员权益、VIP
- 个人信息、个人简�?
- edu 邮箱、返校活动�?150 优惠�?

## 常用数据库表
- `yamibuy_crm`.`crm_customer_vip_rights_info` - 会员权益领取记录
- `yamibuy_crm`.`crm_customer_log` - 会员操作日志（ref_id=3 为生日惊喜）
- `yamibuy_master`.`xysc_users` - 用户信息（user_name、sex、birthday、description、country、avatar�?
- `yamibuy_master`.`xysc_egift_card` - 礼卡表（activity_id=400 为会员升级礼卡）

## 排查场景

### 场景一：无法领取生日惊�?
触发条件：客人反馈无法领取生日礼�?生日福利

排查步骤�?
1. 查询用户是否领取过：
   ```sql
   SELECT * FROM `yamibuy_crm`.`crm_customer_vip_rights_info` WHERE user_id = 'user_id' AND rights_id = 3;
   ```
2. 查询用户信息是否完整�? 个字段必须全部填写）�?
   ```sql
   SELECT user_id, user_name, sex, birthday, description, country, avatar FROM `yamibuy_master`.`xysc_users` WHERE user_id = 'user_id';
   ```
3. 检查条件：
   - 用户必须在生日当月才能领取（非系统主动发放，需用户自行在会员中心领取）
   - 6 个个人信息字段必须全部填写，尤其注意 `description`（个人简介）经常被遗�?
   - 如果生日月份已过，无法补�?
4. 常见解决方案�?
   - 未填写个人简介：请客人填写完个人简介再领取
   - 生日月份已过：如果用户还想领取，可修改生日为当前月，领取后再改回真实生日

### 场景二：会员等级异常（降级问题）
触发条件：客人反馈会员等级突然降�?

排查要点�?
- �?Central 查询用户等级变化事件�?
- 礼卡订单取消后会触发降级逻辑
- 退款后等级根据扫描周期（半年）内的消费金额重新计算
- 如果用户本来就是该等级，取消订单应只更新金额不做降级处理（可能是 bug�?
- 会员升级 MQ：`central-customer.exchange`，key �?`user.vip.upgraded`

### 场景三：EDU 邮箱注册未获得优惠券
触发条件：edu 邮箱注册后未收到 $150 优惠券礼�?

排查步骤�?
1. Central 检查用户是否为新用户且已验证邮箱和手机
2. 找服务端人员查询邮箱发送优惠券的状�?
3. 确认 .EDU 邮箱后缀是否在有效列表中
4. 如果邮箱有效但未发放，服务人员手动发送优惠券并更新验证规�?

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 生日惊喜需要用户主动领取，不是系统自动发放
- Central 系统里的姓名和个人信息的姓名取的不是同一个字段，显示可能不同，但不影响权益领�?
- 用户只能在生日当月领取生日惊�?
