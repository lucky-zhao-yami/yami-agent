---
inclusion: auto
---

# 税费问题 - 客服排查规则

## 识别规则
当用户提问涉及以下关键词时，自动识别为税费排查类问题�?
- 税、税费、算税、免税、税�?
- avalara、tax code

## 常用数据库表
- `yamibuy_im`.`im_item_taxcode` - 商品税码�?
- `yamibuy_im`.`im_category_taxcode` - 分类税码�?
- `yamibuy_im`.`im_item` - 商品信息表（�?category_id�?
- `yamibuy_so`.`tax_avalara_sales` - Avalara 算税记录（ava_response 含税码详情）

## 排查场景

### 场景一：商品税费异常（应免税但收了�?/ 应收税但没收�?
触发条件：客人或商家反馈税费不正�?

排查步骤�?
1. 查询商品税码（优先查商品级别，查不到再查分类级别）：
   ```sql
   -- 查商品税�?
   SELECT * FROM `yamibuy_im`.`im_item_taxcode` WHERE `item_number` IN (商品编号);
   
   -- 查分类税�?
   SELECT a.category_id, b.tax_code, a.item_number
   FROM `yamibuy_im`.`im_item` a
   LEFT JOIN `yamibuy_im`.`im_category_taxcode` b ON a.category_id = b.category_id
   WHERE `item_number` IN (商品编号);
   ```
2. 查询 Avalara 算税记录确认实际使用的税码：
   ```sql
   SELECT * FROM yamibuy_so.tax_avalara_sales WHERE purchase_id = 'purchase_id';
   ```
3. 算税逻辑�?
   - 优先取商品税码（im_item_taxcode�?
   - 取不到则取分类税码（im_category_taxcode�?
   - 拿到税码后请�?Avalara 算税
   - 拿不到税码则不算�?
4. 如果商品或分类没有税码导致未算税，协�?IM 同事维护税码数据

### 场景二：第三方商家税费问�?
触发条件：第三方商家反馈税费设置与实际不�?

排查要点�?
- 商家后台设置的免税是针对之前亚米自己计算税费时生效的
- 现在第三方商家的税都接了 Avalara 算税，以 Avalara 结果为准
- 如有疑问可请 Simon 确认商品税码是否正确

## 注意事项
- `xysc_users` 表的 email 和 mobile_phone 字段为脱敏数据，查询 user_id 请参考全局规则（cs-global-config.md）的 Central API 查询规则
- 新建的商品分类可能没有配置税码，需�?IM 同事维护
- 算税�?Avalara 返回结果为准，商家后台的免税设置�?Avalara 不生�?
