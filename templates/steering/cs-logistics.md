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
- `yamibuy_master`.`xysc_order_info` - 订单信息（invoice_no=物流单号、zipcode=当前地址、cart_zipcode=下单时zipcode、shipping_method=配送方式）
- `yamibuy_so`.`so_tracking_info` - 物流追踪信息（tracking_number=物流单号、delivery_status=送达状态、delivery_time=送达时间、exddTime=预计送达时间、carrier=承运商、type=数据来源）
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（order_exddTime=预计送达时间、order_exsdTime=预计发货时间、order_adtdTime=实际送达时间、receive_type=接收方式）
- `yamibuy_so`.`so_log` - 订单操作日志（type=40 表示地址修改，attributes 含完整 old/new 地址和操作人）
- `yamibuy_wh`.`wh_order_info` - 仓库订单信息（含 down 单地址）

> so_log.type 枚举值见 `.kiro/skills/enum-values.md`，解释时直接查速查表 `so_log.type`。

## 排查场景

### 场景一：物流单号错误 / 物流信息不一致
触发条件：物流单号与实际不符、配送方式与物流不一致

```
1. 并行查询：xysc_order_info.invoice_no + so_tracking_info.tracking_number
   ↓
   两个表的物流单号一致？
   ├─ 一致 → 物流单号本身正确，问题在物流商侧，建议客人联系物流商
   └─ 不一致 → 查日志确认是否有人手动修改
              search.py -s ec-so -k "order_id值" -t 7d 或 search.py -s central-so -k "order_id值" -t 7d
```

```sql
-- 查订单物流单号（与下条并行）
SELECT order_id, invoice_no FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查物流追踪信息（与上条并行）
SELECT * FROM yamibuy_so.so_tracking_info WHERE order_id = 'order_id';
```

### 场景二：配送方式与地址不匹配
触发条件：配送方式无法配送到指定区域

```
1. 查订单信息，对比 zipcode 和 cart_zipcode
   ↓
   zipcode ≠ cart_zipcode？
   ├─ 是 → 地址在下单后被修改过 → 查 so_log type=40 确认谁改了地址
   │       → 查 xysc_warehouse_cover_zip 确认新 zipcode 是否支持原配送方式
   │       常见原因：客服改了地址但未同步修改配送方式（已知系统缺陷）
   └─ 否 → 下单时就选了不支持的配送方式 → 查日志确认下单时的 shipping_id 和 zipcode
          search.py -s ec-so -k "order_sn值" -t 7d
```

```sql
-- 查订单配送信息
SELECT order_id, order_sn, shipping_id, shipping_name, shipping_method,
       province, city, zipcode, cart_zipcode, FROM_UNIXTIME(add_time) AS add_time
FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';

-- 查地址修改日志（so_log type=40）
SELECT rec_id, type, `desc`, attributes, in_user, FROM_UNIXTIME(in_dtm) AS in_dtm
FROM yamibuy_so.so_log WHERE order_id = 'order_id' AND type = 40 ORDER BY in_dtm ASC;

-- 查 zipcode 是否在本地配送覆盖范围
SELECT * FROM yamibuy_master.xysc_warehouse_cover_zip WHERE zipcode = '目标zipcode';
```

### 场景三：运单地址信息缺失
触发条件：客人反馈收到的包裹运单上地址信息不完整

```
查 wh_order_info 中的 down 单地址
├─ 地址不完整 → 问题在 down 单数据，联系运维排查
└─ 地址正常 → 问题出在仓库打印环节，联系 @William
同步查日志交叉验证：
search.py -s ec-so -k "order_id值" -t 7d 或 search.py -s central-so -k "order_id值" -t 7d
关注日志：down 单请求中的地址字段、仓库接口返回结果
```

```sql
SELECT order_id, address, address2 FROM yamibuy_wh.wh_order_info WHERE order_id = 'order_id';
```

### 场景四：礼品赠言 / 送货备注
触发条件：客人反馈包裹没有赠言、送货备注不显示

```
礼品赠言：
├─ Central 订单详情有赠言信息 → 找仓库查原因
└─ Central 无赠言信息 → 客人下单时未填写

送货备注：
├─ 订单含 FBY 商品且备注不显示 → 已知问题（已修复）
└─ 自营商品 Local/Next Day 配送 → 正常支持
```

### 场景五：物流送达时间不一致
触发条件：App 显示的送达时间与物流官网不一致

```
1. 查 so_tracking_info 获取 exddTime（预计送达）和 delivery_time（实际送达）
   ↓
   ├─ exddTime 为空 → AfterShip 未推送预计送达时间，属正常情况
   ├─ exddTime 与 App 显示不一致 → 查 so_order_ext.order_exddTime 对比
   │   ├─ 两者一致 → App 显示正确，物流官网可能更新了
   │   └─ 两者不一致 → 联系 @William 排查数据同步问题
   └─ delivery_time 与物流官网不一致 → AfterShip 推送延迟，属正常情况
同步查日志交叉验证：
search.py -s central-so -k "order_id值" -t 7d
关注日志：AfterShip 回调记录、exddTime 更新记录
```

### 场景六：第三方商家商品无法配送到特定国家
触发条件：客人反馈第三方商家商品显示无法配送到某国家（如加拿大）

```
1. 确认商家名称 → 查 xysc_vendor_info 获取 vendor_id 和配送开关
   ↓
   ca_flag 的值？
   ├─ ca_flag=0 → 加拿大配送未开启，这是根本原因
   │   → 如商家确认可寄加拿大，需联系商家运营在 Central 后台开启 ca_flag
   └─ ca_flag=1 → 已开启，需进一步排查（商品级别限制、地址问题等），联系开发协助
```

```sql
-- 查商家配送配置
SELECT vendor_id, vendor_name, ca_flag, ah_flag, is_active, region, area
FROM yamibuy_master.xysc_vendor_info WHERE vendor_name LIKE '%商家名%';
-- 也可通过 vendor_id 查询（如已知 vendor_id）
SELECT vendor_id, vendor_name, ca_flag, ah_flag, is_active, region, area
FROM yamibuy_master.xysc_vendor_info WHERE vendor_id = {vendor_id};
```

## 注意事项
- `wh_order_info` 表属于仓库系统（WMS），不在当前源码项目中，字段含义需联系仓库团队确认
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 必须执行脚本 `python scripts/get-userid.py "邮箱"`
- 详情页和结算页的预计送达时间逻辑不同：详情页用最快的，结算页用可用配送方式的
- zipcode 配送信息可能未同步，导致结算页配送方式缺失
- 第三方物流通知送达时间可能与实际送达时间有较大延迟
