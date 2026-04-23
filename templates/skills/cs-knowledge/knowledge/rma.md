---
inclusion: manual
---

# RMA 售后问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别�?RMA 排查类问题：
- RMA、退货、退款审核、售�?
- 补偿退款、over refund、退款超�?
- 退款审核通过、退款审核失�?
- 无法申请售后、无法退货、没有符合退换条件、不能申请RMA、前端无法售�?

## 排查场景

### 场景一：RMA 退款审核提�?订单中商品有补偿退�?
触发条件：RMA 退款审核时弹出补偿退款提�?

排查要点�?
- 该提示说明订单之前有过补偿退款记�?
- 审核人确认退款金额没有超额时，点击弹窗中�?审核通过"即可继续
- RMA 退款检查逻辑：订单当前退款金�?+ 补偿退款金�?是否大于订单总金�?
  - 大于：提示不�?over refund
  - 小于等于：不会提�?

### 场景二：RMA 退款导致多退�?
触发条件：RMA 退款时没有关联订单补偿数据

排查要点�?
- RMA 退款单和订单补偿目前没有做关联，可能导致多退�?
- 客服在审�?RMA 单时，需先在订单补偿页面根据订单搜索，确认该订单有没有补偿金�?
- 后续会在代码层面优化关联

### 场景三：RMA 单查询失�?
触发条件：RMA 单无法正常显�?

排查要点�?
- 可能是商品在创建 RMA 单后变成�?combo 商品，导�?RMA 展示子品逻辑异常
- 检�?`yamibuy_rma.rma_order_detail` 表中 target_item_number 是否有对应商�?
- 检�?`yamibuy_im.im_item_relation` 表中商品关联时间是否晚于 RMA 创建时间

### 场景四：退款时间限�?
排查要点�?
- 微信支付：订单超过一年无法退�?
- 超过半年的订单可能无法通过 RMA/Central 取消退�?
- 退款积分逻辑：RMA 扣积分按订单维度，customer 扣积分达到下单赠送上限不再扣�?


### 场景五：前端无法申请 RMA（提�?没有符合退换条件的商品"�?
触发条件：客人反馈无法在前端申请售后，提�?当前订单中没有符合退换条件的商品"

排查步骤�?
1. 查询订单基本信息，确认订单类型和物流状态：
   ```sql
   SELECT order_id, order_sn, order_type, vendor_id, order_status, shipping_status, pay_status, FROM_UNIXTIME(add_time) AS order_time FROM `yamibuy_master`.`xysc_order_info` WHERE `order_sn` = '订单�?;
   ```
2. 查询物流送达时间（按主单查询，不按子单）�?
   ```sql
   SELECT order_id, delivery_status, FROM_UNIXTIME(delivery_time) AS delivery_time FROM `yamibuy_so`.`so_tracking_info` WHERE `order_id` = 主单order_id;
   ```
3. 查询该订单商品对应的 RMA 规则天数�?
   ```sql
   SELECT b.rule_id, b.obj_ym_refund, b.sbj_ym_refund FROM `yamibuy_master`.`xysc_order_goods` a LEFT JOIN `yamibuy_rma`.`rma_rule` b ON a.cat_id_1 = b.category_id WHERE a.order_id = order_id;
   ```
4. 查询是否已有 RMA 记录（部分商品可能已退过）�?
   ```sql
   SELECT rma_id, item_number, item_quantity, status FROM `yamibuy_rma`.`rma_order_detail` WHERE order_id = order_id;
   ```
5. 查询商品分类是否配置了售后原因（前端发起售后必须选择原因，无原因选项则无法提交）：
   ```sql
   -- 先查商品的一级分类
   SELECT i.item_number, i.category_id, c2.parent_id AS level1_cat_id
   FROM yamibuy_im.im_item i
   JOIN yamibuy_master.xysc_category c1 ON i.category_id = c1.cat_id
   JOIN yamibuy_master.xysc_category c2 ON c1.parent_id = c2.cat_id
   WHERE i.item_number = '商品编号';

   -- 再查该一级分类在 RMA 中是否有规则配置
   SELECT cr.rec_id AS category_rule_id, cr.category_id, cr.rule_id, r.obj_ym_refund, r.sbj_ym_refund
   FROM yamibuy_rma.category_rule cr
   LEFT JOIN yamibuy_rma.rma_rule r ON cr.rule_id = r.rule_id
   WHERE cr.category_id = 一级分类ID;

   -- 查该分类是否配置了售后原因
   SELECT * FROM yamibuy_rma.category_reason WHERE category_rule_id = 上一步查到的category_rule_id;
   ```
6. 常见原因分析�?
   - **超过售后期限**（最常见）：物流送达后超�?RMA 规则天数（通常 7 �?+ Apollo 配置�?offset 偏移�?`rma.rule.offset.time`），代码逻辑�?`RmaRuleService.getOrderItemRmaRule` 中，超期商品 rma 值被设为 0
   - **所有商品已退�?*：订单中所有商品都已有 RMA 记录且可退数量�?0
   - **订单状态不符合**：订单未送达（`delivery_status != 1`）或订单已取�?
   - **订单类型被排�?*：`order_type` �?1（集运）�?（礼卡）�? 的订单不支持前端 RMA
   - **分类未配置售后原因**：商品一级分类在 `category_rule` 中有规则，但 `category_reason` 中无对应记录，前端无法展示售后原因选项，导致无法提交。解决方案：在 Central RMA 后台为该分类补充售后原因配置
7. 关于 FBY 订单（order_type=5）：
   - FBY 订单�?RMA 中被视为自营，`RmaRuleService.getVendor()` 方法�?order_type=5 返回 vendor_id=0，使用自营退货规�?
   - 物流送达时间按主单查询（`so_tracking_info` 关联主单 order_id），不按子单
   - FBY 订单�?vendor_id=-1，满足可售后列表�?SQL 条件（`vendor_id <= 0`�?

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- RMA 退税是自动的，不需要手动勾选，税按商品维度自动退
- RMA 退款上限按主订单维度计算：主订单总金�?- 已退金额 = 剩余最大可退金额。如果商品含税金额超过剩余可退金额，退款会被限制在剩余可退金额内（税金已包含在内）
- 例如：主订单 $179.72，已退 $40，则最多还能退 $139.72，即使商品含�?$143.31 也只退 $139.72
- RMA 退款审核时务必先检查订单是否有补偿退�?
- 部分商品退款接口调用失败时需手动退款（�?Phoebe�?
- FBY 订单退款按商家子单分别退�?
