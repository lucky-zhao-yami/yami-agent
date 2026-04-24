---
inclusion: manual
---

# 订单问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为订单排查类问题�?
- 订单、下单、取消订单、订单状�?
- 购物车、结算、提单、免邮、运�?
- 商品遗漏、商品缺货、赠�?
- 订单地址、配送方式、配送地址
- 共享库存、库存不�?
- 预计送达时间、exdd
- 订单语言、central 订单显示

## 常用数据库表
- `yamibuy_master`.`xysc_order_info` - 订单基本信息
- `yamibuy_master`.`xysc_order_goods` - 订单商品信息
- `yamibuy_so`.`so_order_ext` - 订单扩展信息（exddTime、bufferTime、礼卡接收方式等�?
- `yamibuy_so`.`so_order_purchase_record` - 用户支付记录
- `yamibuy_so`.`so_log` - 订单状态流转日�?
- `yamibuy_so`.`so_inventory_change_queue` - 库存变更消息队列
- `yamibuy_so`.`order_cancel_queue` - 取消订单消息队列
- `yamibuy_wh`.`wh_order_info` - 仓库订单信息

## 常用工具
- Central 订单查询：https://central.yamibuy.net/so/index.html?v=#/so/orderQuery
- Central 商品库存：https://central.yamibuy.net/im-react/index.html#/im/itemSaleDetails
- Kibana ec-so 日志：索�?`k8s-ec-so-service-log-*`
- Kibana ec-so-job 日志：索�?`k8s-ec-so-job-service-log-*`

## 排查场景

### 场景一：购物车商品遗漏未结�?
触发条件：客人反馈下单时商品遗漏在购物车

排查步骤�?
1. Central 查询订单状态和商品信息
2. Kibana 查询购物车接口日志（item_check）、结算接口（physical）、提单接口（submit/physical/v2�?
3. 检查是否有取消勾选接口（check_item）日�?
4. 常见原因�?
   - 商品在进入购物车后曾经缺�?失效，恢复库存后在购物车中默认未勾�?
   - 用户手动取消了勾�?
5. 购物车金额是预估值，以结算页金额为准

### 场景二：运费问题（多笔运�?免邮问题�?
触发条件：客人反馈收取了多笔运费、应该免邮但收了运费

排查要点�?
- 共享库存商品虽然都是亚米发货，但可能从不同仓库发出，会产生多笔运�?
- Two-Day 配送不免邮，从不同仓库发出需收取两次邮费
- Standard Shipping 下，非主仓发出的商品如果不满包邮条件也可能收运费
- 夏威夷地区不包邮
- 购物车显示的免邮信息是预估值，以结算页为准

### 场景三：订单状态不流转
触发条件：订单长时间停留在某个状态（�?101 支付验证中）

排查步骤�?
1. 查看订单状态和支付状�?
2. 如果支付已完成但订单状态未更新，查 Kibana 日志找出卡住原因
3. 常见原因：某个处理节点挂掉，需通过接口修数�?
4. 需�?Wheat 查找节点问题

### 场景四：预计送达时间查询
触发条件：客人询问预计送达时间

排查步骤�?
1. 查询订单扩展信息�?
   ```sql
   SELECT order_exddTime, order_bufferTime FROM `yamibuy_so`.`so_order_ext` WHERE `order_id` = 'order_id';
   ```
2. 预计送达时间 = order_exddTime - order_bufferTime（注意时区转换）
3. 注意：详情页和结算页的预计送达时间逻辑不同，详情页用最快的，结算页用可用配送方式的

### 场景五：不可配送区域成功下�?
触发条件：不应配送的区域（如波多黎各）成功下�?

排查要点�?
- 可能是系统推荐地址导致，推荐地址可能绕过了下拉框限制
- 需反馈产品看是否需要优�?

### 场景六：库存不平
触发条件：订单取消后库存异常

排查步骤�?
1. 查询库存变更消息�?
   ```sql
   SELECT * FROM `yamibuy_so`.`so_inventory_change_queue` WHERE order相关条件;
   ```
2. 查询订单状态流转：
   ```sql
   SELECT * FROM `yamibuy_so`.`so_log` WHERE order相关条件;
   ```
3. 常见原因�?
   - 取消订单时已还库存，但订单正在出库，出库失败后仓库再次归还库存，导致还了两次
   - 拣货状态下取消订单可能不还库存

### 场景七：Central 订单商品语言显示问题
触发条件：Central 切换语言后商品名称显示不正确

排查要点�?
- Central 订单列表的商品信息是从订单直接查询的，语言跟下单时的语言�?
- 如果用户下单时用繁体中文，Central 切英文时商品名仍显示繁体

### 场景八：赠品未随订单发出
触发条件：订单有买赠活动但未收到赠品

排查步骤�?
1. 查询订单商品�?
   ```sql
   SELECT * FROM `yamibuy_master`.`xysc_order_goods` WHERE `order_id` = 'order_id';
   ```
2. 如果订单中无赠品记录，查 Kibana 日志看购物车和结算时的详�?
3. 常见原因：MKT 接口未返回赠品（通常是赠品库存没了），找 MKT 确认

## 注意事项
- 商品详情页展示的过期日期/有效期/保质期：该数据由商品详情服务（非本组负责）管理，超出当前排查范围，请联系 @Gavin wang 查询
- 店铺（Seller Portal）商品详情页面展示的到期日期：该数据由店铺系统管理，超出当前排查范围，请联系 @Damon 查询
- 活动页面/商品详情页优惠券按钮无法点击领取：超出当前排查范围，请联系 @Gavin wang 查询
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 订单取消后退款积分逻辑：RMA 扣积分按订单维度，customer 扣积分达到下单赠送上限不再扣�?
- FBY 订单包含多个商家，退款按子单退
- 订单结算失败但有物流信息：可能是生成 label 后结算被网关拒绝，包裹不会实际出�?
- 拆单场景下，优惠券抵扣金额（bonus 字段）会按比例分摊到各子订单，客户可能只看到某个子订单的 bonus 值较小而误以为优惠券未生效，需查看所有子订单�?bonus 合计值。优惠券相关的详细排查流程参�?cs-coupon.md

### 场景九：商品差价查询
触发条件：客服反馈客人询问下单价与当前页面价格是否有差价，需要查询差价金额

排查步骤（所有查询一次性并行执行，查完后统一输出结论）：
1. 查询订单基本信息（金额、下单时间）：
   ```sql
   SELECT order_id, order_sn, goods_amount, bonus, order_amount, shipping_fee, tax, FROM_UNIXTIME(add_time) AS order_time
   FROM yamibuy_master.xysc_order_info WHERE order_sn = '订单号';
   ```
2. 查询订单商品明细（item_number、下单成交价）：
   ```sql
   SELECT goods_id, item_number, goods_name, goods_number, goods_price, market_price
   FROM yamibuy_master.xysc_order_goods WHERE order_id = 订单ID;
   ```
3. 查询商品当前基础售价：
   ```sql
   SELECT goods_id, shop_price, market_price, promote_price
   FROM yamibuy_master.xysc_goods WHERE goods_id = 商品ID;
   ```
4. 查询区域定价（促销价、会员价、秒杀价、拼团价、礼卡专享价）：
   ```sql
   SELECT item_number, unit_price, promotion_price, is_promotion,
          FROM_UNIXTIME(promote_start_date) AS promo_start, FROM_UNIXTIME(promote_end_date) AS promo_end,
          member_price, member_status, FROM_UNIXTIME(member_start_time) AS member_start, FROM_UNIXTIME(member_end_time) AS member_end,
          seckill_price, seckill_status, FROM_UNIXTIME(seckill_start_time) AS seckill_start, FROM_UNIXTIME(seckill_end_time) AS seckill_end,
          pin_price, is_pin, giftcard_price, giftcard_status, mkt_ps_id
   FROM yamibuy_im.im_item_area_price_setting WHERE item_number = '商品编号';
   ```
5. 如果步骤4中 mkt_ps_id 有值（非0），查询关联的促销活动详情：
   ```sql
   SELECT ps_id, ps_title, ps_sub_title, status, FROM_UNIXTIME(start_time) AS start_date, FROM_UNIXTIME(end_time) AS end_date
   FROM yamibuy_mkt.mkt_promotion_schedule WHERE ps_id = 活动ID;
   ```

输出要求：
- 列出下单价与当前所有生效价格（基础售价、促销价、会员价、秒杀价、拼团价、礼卡专享价）的对比表
- 明确标注当前页面实际生效的价格类型及金额
- 如有促销活动，列出活动名称和有效期
- 计算差价金额并给出补偿建议
- 如果所有价格路径均无变化，明确告知无差价

常见差价原因：
- 商品参加了新的促销活动，促销价低于下单时的售价
- 商品基础售价（shop_price）被调整
- 会员价/秒杀价等限时价格生效
- 下单时有促销但当前促销力度更大
