---
inclusion: manual
---

# 跟买与砍单问�?- 客服排查规则

## 参考文�?#[[file:.kiro/docs/跟买功能文档.md]]

## 识别规则
当用户提问涉及以下关键词时，自动识别为跟�?砍单排查类问题：
- 跟买、砍单、分享、无法分享、无法跟�?- 跟买积分、跟买优惠券
- 砍单次数、砍单限�?
## 常用数据库表
- `yamibuy_so`.`so_order_follow` - 订单跟买扩展（fo_status�?不能发起 1可发�?2进行�?3已结�?4已取�?5可发起因故取消）
- `yamibuy_activity`.`fo_activity` - 跟买活动表（status�?进行�?2已结�?3已取消）
- `yamibuy_activity`.`fo_item` - 跟买商品表（fo_id + item_number�?- `yamibuy_activity`.`fo_join` - 参与跟买/砍单记录（type=1砍单 type=2跟单；status�?待发 1已发 2已退 3原单已免单无需发放�?- `yamibuy_crm`.`crm_point` - 积分记录（reason_third 1006001/1006002 为跟买积分，refer_type=3 为跟单活动）
- `yamibuy_master`.`xysc_vendor_ext` - 商家扩展（is_fo�?不能发起跟单 1可以发起�?
## 数据库查询注意事�?- `fo_activity`、`fo_join` 表中 `in_dtm`、`edit_dtm`、`start_time`、`end_time` �?Unix 时间戳，查询时用 `FROM_UNIXTIME()` 转换
- `so_order_follow` 表中 `in_dtm` 同样�?Unix 时间�?- 当前连接的是生产环境数据库，禁止提供任何写操�?SQL
- AI 只能执行只读查询（SELECT�?
## 排查场景

### 场景一：无法发起跟�?分享
触发条件：客人反馈订单中的商品无法分�?
排查步骤�?1. 确认用户 user_id 和订单号
2. 查询订单跟买状态：
   ```sql
   SELECT order_id, fo_status, fo_points, FROM_UNIXTIME(in_dtm) AS in_dtm FROM yamibuy_so.so_order_follow WHERE order_id = 订单ID;
   ```
3. 查询订单基本信息确认金额和时间：
   ```sql
   SELECT order_id, order_sn, goods_amount, bonus, order_amount, FROM_UNIXTIME(add_time) AS add_time FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单�?;
   ```
4. 检查商家是否支持跟买：
   ```sql
   SELECT seller_id, is_fo FROM yamibuy_master.xysc_vendor_ext WHERE seller_id = 商家ID;
   ```
5. 分析不能发起的原因：
   - fo_status=0：系统判定不能发起，可能原因�?     - 商品金额 - 优惠券抵�?< 35（配置的 price_line�?     - 礼卡、京东图书、拼团、集运订单不支持（注意：订单类型通过 `xysc_order_info.order_type` 字段判断，不是根据是否使用礼卡抵扣来判断。使用礼卡部分抵扣导致实付金额为0的普通订单，order_type 仍为普通订单，不属于礼卡订单）
     - 商家 is_fo=0 不支持跟�?   - 下单超过72小时：已过发起时�?   - 商品�?not_allowed_item_number 配置中：被排除的特定SKU
   - 商品无库存或已下�?   - 订单已取�?6. 如果商品有库存但仍无法分享：
   - 检查用户发货仓库的库存（不同仓库库存不同）
   - 检�?search 服务库存是否同步（搜索结果页无库存但详情页有库存说明未同步）
   - �?search 同事同步商品库存

### 场景 1.1：fo_status=5（可发起因故取消）无法发起跟�?触发条件：客人反馈无法发起跟买，查询 so_order_follow �?fo_status=5

排查步骤�?1. 确认订单跟买状态：
   ```sql
   SELECT order_id, fo_status, fo_points, FROM_UNIXTIME(in_dtm) AS in_dtm FROM yamibuy_so.so_order_follow WHERE order_id = 订单ID;
   ```
2. fo_status=5 含义：订单原本可以发起跟买（fo_status=1），但在客人发起之前订单被取�?退款，系统自动将状态改�?5
3. 确认订单当前状态：
   ```sql
   SELECT order_id, order_sn, order_status, shipping_status, pay_status, goods_amount, bonus, order_amount, pay_id FROM yamibuy_master.xysc_order_info WHERE order_id = 订单ID;
   ```
4. 关键判断逻辑（代码来源：`ec-activity-service` �?`checkAllowFollow` 方法）：
   - 发起跟买时，系统�?`order_status`、`shipping_status`、`pay_status` 三个字段拼接�?status 字符�?   - 以下拼接值会被直接拦截，**不区分取消原因（亚米原因/客户原因�?*�?     - `200` = 未支付取消（order_status=2, shipping_status=0, pay_status=0�?     - `483` = 已支付取消（order_status=4, shipping_status=8, pay_status=3�?     - `484` = 已支付部分取消（order_status=4, shipping_status=8, pay_status=4�?   - 只要订单状态命中以上任一值，`checkAllowFollow` 返回 false，无法发起跟�?5. 关于"亚米原因取消不影响跟�?的说明：
   - 该逻辑存在�?`central-activity-service` �?`ReturnFoPointsReciver`（MQ 消费者）�?   - 作用范围�?*仅影响已发起跟买后的积分退�?*，不影响发起跟买本身
   - 亚米原因取消：不退积分，只将未发起的跟买状态改�?5
   - 客户原因取消：退积分 + 将未发起的跟买状态改�?5
   - 两种情况下，未发起的跟买都会变为 fo_status=5，都无法再发�?6. 结论：fo_status=5 的订单无法发起跟买，这是代码设计如此。如果业务上希望亚米原因取消的订单仍可发起跟买，需要修�?`checkAllowFollow` 的判断逻辑，建议联系开发评�?
### 场景二：砍单次数限制
触发条件：客人反馈只砍了一次就无法再砍

排查步骤�?1. 确认用户 user_id
2. 查询近期砍单记录�?   ```sql
   SELECT rec_id, fo_id, user_id, user_type, type, points, status, FROM_UNIXTIME(in_dtm) AS in_dtm FROM yamibuy_activity.fo_join WHERE user_id = 用户ID AND type = 1 AND in_dtm > UNIX_TIMESTAMP() - 86400 * 2 ORDER BY in_dtm DESC;
   ```
3. 砍单限制规则：从当前时间往前推 24 小时内，最多砍 2 次（滚动窗口，不是按自然日计算）

### 场景三：跟买积分未到�?触发条件：客人反馈发起跟买后积分未到�?
排查步骤�?1. 确认用户邮箱是否已验证（邮箱不验证积分无法发放）
2. 查询跟买活动信息�?   ```sql
   SELECT fo_id, order_id, ps_id, ps_code, status, user_id, max_points, is_free, FROM_UNIXTIME(start_time) AS start_time, FROM_UNIXTIME(end_time) AS end_time FROM yamibuy_activity.fo_activity WHERE user_id = 用户ID ORDER BY fo_id DESC;
   ```
3. 查询参与记录和积分发放状态：
   ```sql
   SELECT fj.rec_id, fj.fo_id, fj.user_id, fj.type, fj.points, fj.status, fj.back_reason, FROM_UNIXTIME(fj.in_dtm) AS join_time FROM yamibuy_activity.fo_join fj WHERE fj.fo_id = 活动ID ORDER BY fj.rec_id;
   ```
4. 查询积分发放记录�?   ```sql
   SELECT rec_id, user_id, points, refer_id, refer_type, reason_third, status, FROM_UNIXTIME(in_dtm) AS in_dtm FROM yamibuy_crm.crm_point WHERE user_id = 用户ID AND reason_third IN (1006001, 1006002) ORDER BY rec_id DESC;
   ```
5. 分析未到账原因：
   - fo_join.status=0（待发）：积分尚未发放，检查活动是否已结束�?9小时后发放）
   - fo_join.status=2（已退）：积分已退回，�?back_reason 确认原因
   - fo_join.status=3：原单已免单，无需发放积分
   - 活动 status=3（已取消）：活动被取消，积分不发�?   - 邮箱未验证：积分无法发放

### 场景四：跟买活动状态查�?触发条件：客人询问跟买活动进�?
排查步骤�?1. 查询活动详情�?   ```sql
   SELECT fo_id, order_id, status, user_id, max_points, is_free, FROM_UNIXTIME(start_time) AS start_time, FROM_UNIXTIME(end_time) AS end_time FROM yamibuy_activity.fo_activity WHERE order_id = 订单ID;
   ```
2. 查询参与人数和详情：
   ```sql
   SELECT fj.rec_id, fj.user_id, fj.user_type, fj.type, fj.points, fj.status, FROM_UNIXTIME(fj.in_dtm) AS join_time FROM yamibuy_activity.fo_join fj WHERE fj.fo_id = 活动ID ORDER BY fj.rec_id;
   ```
3. status 含义�?=进行�?2=已结�?3=已取�?
## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 共享库存商品也可以发起跟�?- search 服务库存不同步可能导致无法分享，同步后即可恢�?- 砍单 24 小时限制是滚动窗口，不是自然�?- 跟买积分在活动结束后�?9小时）才发放，不是实时发�?- fo_join.back_reason 含义�?=原单未发�?1=跟单未发�?2=发起者取�?3=跟单者取�?4=系统取消
