# 服务名与 Git 仓库映射

## 默认规则

服务名 = Git 仓库名

例如：`central-so-service` → `https://github.com/yamibuy/central-so-service`

## 特殊映射表

未在此表中出现的服务，按默认规则处理。

| Kibana 日志名称 | IDP 发布名称 | GitHub 项目名 |
|----------------|-------------|--------------|
| `central-sp-service` | `central-sellerportal-service` | `central-sellerportal-service` |
| `central-sp-job` | `central-sellerportal-job` | `central-sellerportal-service` |
| `central-sellerportal-service` | `third-sellerportal-service` | `sellerportal-service` |
| `sellerportal-job` | `third-sellerportal-job` | `sellerportal-service` |
| `seller-service` | `third-seller-service` | `seller-service` |
| `seller-job` | `third-seller-job` | `seller-service` |
| `third-shopify-web` | `third-shopify-web` | `seller-website-sync` |
| `ec-openapi-service` | `third-openapi-service` | `openapi-2.0` |
| `central-resource` | `central-resource` | `resouce-service` |
