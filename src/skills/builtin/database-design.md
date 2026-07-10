---
name: database-design
description: 数据库 schema 设计和查询优化
---

# Database Design

## Description

数据库设计和优化：
- 表结构设计
- 索引优化
- 查询性能分析
- 数据迁移方案
- 备份恢复策略

## Trigger

当用户需要设计数据库、优化查询、或讨论数据模型时激活。

## Design Principles

- **范式化**: 适当范式化避免数据冗余
- **索引策略**: 为常用查询创建索引
- **数据类型**: 选择合适的数据类型
- **约束**: 使用主键、外键、唯一约束
- **审计字段**: created_at, updated_at, deleted_at

## Table Template

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_email (email),
  INDEX idx_status (status)
);
```

## Query Optimization

- 使用 EXPLAIN 分析查询计划
- 避免 SELECT *，只查询需要的字段
- 使用 LIMIT 限制结果集
- 避免在 WHERE 中对字段使用函数
- 合理使用 JOIN，避免子查询

## Migration Strategy

1. 创建新表结构
2. 迁移数据
3. 验证数据完整性
4. 切换应用连接
5. 清理旧表
