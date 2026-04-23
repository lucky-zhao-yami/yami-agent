# GitHub KB - AI 仓库知识库

管理本地 AI 相关 GitHub 项目，让 AI 基于这些仓库学习研究，提供技术选型和产品建议。

## 知识库路径

`/mnt/d/github-kb/`

## 使用方式

### 添加仓库
```
帮我克隆 [仓库地址] 到知识库
```

### 研究仓库
```
分析一下知识库中的 [项目名]，它的核心架构是什么？
```

### 技术选型
```
我想做一个 [描述你的想法]，基于知识库中的仓库，你有什么建议？
```

### 更新仓库
```
更新知识库中所有仓库到最新版本
```

## 操作命令

### 克隆仓库
```bash
cd /mnt/d/github-kb && git clone https://github.com/[owner]/[repo].git
```

### 更新仓库
```bash
cd /mnt/d/github-kb/[repo] && git pull
```

### 批量更新
```bash
for dir in /mnt/d/github-kb/*/; do (cd "$dir" && git pull); done
```

## 添加仓库后

更新 `/mnt/d/workspace/all/.kiro/skills/github-kb/CATALOG.md`，添加项目信息：
- 项目名和路径
- 一句话描述
- 核心技术栈
- 适用场景
