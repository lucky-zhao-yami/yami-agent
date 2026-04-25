---
inclusion: auto
---

# SQL 查询 Skill

## 用途
通过 mysql 命令行查询 Yamibuy 数据库，用于客服问题排查。只允许 SELECT 查询。

## 数据库连接信息
数据库凭证通过环境变量配置：
- `DB_HOST`: 数据库地址
- `DB_PORT`: 数据库端口（默认 3306）
- `DB_USER`: 数据库用户
- `DB_PASSWORD`: 数据库密码

## 查询方式

### 执行 SQL 查询
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -e "SQL语句" 数据库名
```

### 查询并格式化输出（推荐）
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -t -e "SQL语句" 数据库名
```
`-t` 参数以表格形式输出，便于阅读。

### 查看表结构
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -e "SHOW CREATE TABLE 表名\G" 数据库名
```

### 查看表字段注释
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -e "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='数据库名' AND TABLE_NAME='表名'" information_schema
```

## 常用数据库

| 数据库 | 用途 |
|--------|------|
| `yamibuy` | 主库（订单、用户、商品等） |
| `yamibuy_mkt` | 营销库（优惠券、活动等） |
| `yamibuy_rma` | 退货库 |
| `yamibuy_pay` | 支付库 |
| `yamibuy_fp` | FP 库 |

## 安全规则
- **只允许 SELECT 查询**，禁止 INSERT、UPDATE、DELETE、ALTER、DROP 等修改操作
- 查询必须带 WHERE 条件或 LIMIT，禁止全表扫描
- 大表查询必须加 LIMIT（默认 LIMIT 100）
- 禁止查询密码、密钥等敏感字段的明文值

## 示例

### 通过订单号查订单信息
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -t -e "SELECT order_id, user_id, order_status, pay_status, shipping_status, add_time FROM so_order WHERE order_sn='2026040112345' LIMIT 1" yamibuy
```

### 通过 user_id 查用户信息
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -t -e "SELECT user_id, user_name, email, mobile_phone, reg_time FROM xysc_users WHERE user_id=123456 LIMIT 1" yamibuy
```

### 查询邀请记录
```bash
mysql -h "${DB_HOST}" -P "${DB_PORT}" -u "${DB_USER}" -p"${DB_PASSWORD}" -t -e "SELECT * FROM crm_invite WHERE user_id=123456 ORDER BY id DESC LIMIT 10" yamibuy
```
