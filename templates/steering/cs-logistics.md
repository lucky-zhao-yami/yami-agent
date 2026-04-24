---
inclusion: manual
---

# 物流与配送问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为物流/配送排查类问题：
- 物流、快递、配送、发货、tracking
- 物流单号、运单、物流信息
- 配送方式、Local、Two-Day、Standard、Next Day
- 送达时间、预计送达
- 运单地址、配送地址不一致
- 礼品赠言、送货备注

## 常用数据库表
- `yamibuy_master`.`xysc_order_info` - 订单信息（invoice_no 物流单号、zipcode 当前地址 zipcode、cart_zipcode 下单时购物车 zipcode、shipping_method 配送方式）
- `yamibuy_so`.`so_tracking_info` - 物流追踪信息（tracking_number）
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（exddTime 预计送达时间）
- `yamibuy_so`.`so_log` - 订单操作日志（type=40 表示地址修改，attributes 含完整 old/new 地址和操作人）
- `yamibuy_wh`.`wh_order_info` - 仓库订单信息（含 down 单地址）

## 排查场景

### 场景一：物流单号错误 / 物流信息不一致
触发条件：物流单号与实际不符、配送方式与物流不一致

排查步骤：
1. 查询订单物流信息：
   ```sql
   SELECT order_id, invoice_no FROM `yamibuy_master`.`xysc_order_info` WHERE `order_sn` = '订单号';
   ```
2. 查询物流追踪信息：
   ```sql
   SELECT * FROM `yamibuy_so`.`so_tracking_info` WHERE `order_id` = 'order_id';
   ```
3. 如果两个表的物流单号不一致，去 Kibana 日志确认是否有人手动修改
4. 常见原因：
   - 仓库操作人员通过 Central 手动更换了物流信息
   - 仓库人员调用 deliver/tracking_number 接口上传了错误的物流单号
   - 人工干预生成了新的物流单

### 场景二：配送方式与地址不匹配
触发条件：配送方式无法配送到指定区域

排查步骤：
1. 查询订单基本信息，重点对比 `zipcode` 和 `cart_zipcode`：
   ```sql
   SELECT order_id, order_sn, shipping_id, shipping_name, shipping_method, province, city, zipcode, cart_zipcode, FROM_UNIXTIME(add_time) as add_time FROM `yamibuy_master`.`xysc_order_info` WHERE `order_sn` = '订单号';
   ```
   - 如果 `zipcode` 与 `cart_zipcode` 不一致，说明地址在下单后被修改过，直接进入步骤 2
   - 如果两者一致，说明是用户下单时就选了不支持的配送方式，查 Kibana 日志确认下单时的 shipping_id 和 zipcode
2. 查询地址修改日志（so_log type=40）：
   ```sql
   SELECT rec_id, type, `desc`, attributes, in_user, FROM_UNIXTIME(in_dtm) as in_dtm FROM `yamibuy_so`.`so_log` WHERE `order_id` = 'order_id' AND type = 40 ORDER BY in_dtm ASC;
   ```
   attributes 字段包含完整的 old/new 地址信息和操作人，可直接确认是谁修改了地址
3. 常见原因：
   - 客服手动改了配送地址但未同步修改配送方式
   - 系统在 Central 修改地址时不会校验新 zipcode 是否支持当前配送方式（已知系统缺陷，可反馈产品加校验拦截）

### 场景三：运单地址信息缺失
触发条件：客人反馈收到的包裹运单上地址信息不完整

排查步骤：
1. 查询 down 单地址（需找运维执行，数据脱敏）：
   ```sql
   SELECT order_id, address, address2 FROM yamibuy_wh.`wh_order_info` WHERE order_id = 'order_id';
   ```
2. 如果 down 单地址正常，问题出在仓库打印环节，联系 @William

### 场景四：礼品赠言 / 送货备注
触发条件：客人反馈包裹没有赠言、送货备注不显示

排查要点：
- 礼品赠言：在 Central 订单详情中查看是否有赠言信息，如有但包裹没有，找仓库查原因
- 送货备注：此前只支持亚米自营商品以 Local、Next Day 配送方式添加，FBY 商品已修改为与自营保持一致
- 如果订单包含 FBY 商品导致不显示送货备注，属于已知问题（已修复）

### 场景五：物流送达时间不一致
触发条件：App 显示的送达时间与物流官网不一致

排查步骤：
1. 确认是自营订单
2. 查询 `yamibuy_so.so_tracking_info` 表中存储的送达时间
3. 如果表中数据正常，联系 @William 排查

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 详情页和结算页的预计送达时间逻辑不同：详情页用最快的，结算页用可用配送方式的
- zipcode 配送信息可能未同步，导致结算页配送方式缺失
- 第三方物流通知送达时间可能与实际送达时间有较大延迟
