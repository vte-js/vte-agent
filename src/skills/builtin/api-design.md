---
name: api-design
description: 设计 RESTful API 接口规范
---

# API Design

## Description

设计清晰、一致、可扩展的 API 接口：
- RESTful 资源命名
- HTTP 方法和状态码
- 请求/响应格式
- 错误处理规范
- 版本控制策略

## Trigger

当用户需要设计 API、定义接口、或讨论接口规范时激活。

## Design Principles

- **资源导向**: 使用名词而非动词
- **HTTP 语义**: 正确使用 GET/POST/PUT/DELETE
- **状态码**: 2xx 成功、4xx 客户端错误、5xx 服务端错误
- **分页**: 支持 page/limit 参数
- **过滤排序**: 支持 query 参数过滤

## Standard Endpoints

```
GET    /resources          # 列表
GET    /resources/:id      # 详情
POST   /resources          # 创建
PUT    /resources/:id      # 更新
DELETE /resources/:id      # 删除
```

## Response Format

```json
{
  "code": 200,
  "message": "success",
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## Error Response

```json
{
  "code": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "name", "message": "Required" }
  ]
}
```
