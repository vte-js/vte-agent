export interface BuiltinSkill {
  name: string;
  description: string;
  content: string;
  path: string;
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    name: 'code-review',
    description: '审查代码质量、潜在 Bug、安全漏洞和性能问题',
    path: 'builtin:code-review',
    content: `---
name: code-review
description: 审查代码质量、潜在 Bug、安全漏洞和性能问题
---

# Code Review

## Description

对代码进行全面审查，包括：
- 逻辑错误和潜在 Bug
- 安全漏洞（SQL 注入、XSS、CSRF 等）
- 性能问题（N+1 查询、内存泄漏、不必要的重渲染）
- 代码规范和可读性
- 边界条件和错误处理

## Trigger

当用户请求代码审查、检查代码质量、或询问代码是否有问题时激活。

## Usage

1. 读取目标代码文件
2. 逐行分析代码逻辑
3. 检查常见的安全和性能问题
4. 给出改进建议和修复方案

## Output Format

\`\`\`
## 审查结果

### 严重问题
- [位置] 问题描述 → 修复建议

### 改进建议
- [位置] 建议描述

### 总结
整体评价和优先修复项
\`\`\``,
  },
  {
    name: 'unit-test',
    description: '为代码生成单元测试用例',
    path: 'builtin:unit-test',
    content: `---
name: unit-test
description: 为代码生成单元测试用例
---

# Unit Test Generator

## Description

为指定代码生成全面的单元测试，包括：
- 正常路径测试
- 边界条件测试
- 异常/错误路径测试
- Mock 外部依赖
- 覆盖率分析

## Trigger

当用户请求编写测试、生成测试用例、或提高测试覆盖率时激活。

## Usage

1. 分析目标代码的函数签名和逻辑
2. 识别输入参数和返回值
3. 设计测试用例覆盖各种场景
4. 生成测试代码并确保可运行

## Test Case Design

- **Happy Path**: 正常输入，预期输出
- **Edge Cases**: 空值、零值、最大值、最小值
- **Error Cases**: 无效输入、异常抛出
- **Integration**: 依赖外部服务时使用 Mock

## Output Format

\`\`\`typescript
describe('functionName', () => {
  it('should handle normal case', () => { ... })
  it('should handle edge case', () => { ... })
  it('should throw error on invalid input', () => { ... })
})
\`\`\``,
  },
  {
    name: 'refactor',
    description: '重构代码以提高可维护性和可读性',
    path: 'builtin:refactor',
    content: `---
name: refactor
description: 重构代码以提高可维护性和可读性
---

# Code Refactoring

## Description

重构代码结构，遵循 SOLID 原则和设计模式：
- 提取重复代码为函数/类
- 简化复杂条件逻辑
- 优化函数签名和参数
- 改善代码组织结构
- 应用适当的设计模式

## Trigger

当用户请求重构、优化代码结构、或代码太复杂时激活。

## Usage

1. 分析现有代码结构
2. 识别代码异味（Code Smells）
3. 设计重构方案
4. 逐步应用重构，保持功能不变
5. 验证重构后的行为一致性

## Refactoring Patterns

- **Extract Function**: 提取重复逻辑为独立函数
- **Extract Class**: 将相关功能组织为类
- **Simplify Conditional**: 简化嵌套的 if/else
- **Rename**: 使用更有意义的命名
- **Move**: 调整代码位置以改善组织
- **Replace with Strategy**: 用策略模式替代复杂条件

## Safety Rules

- 每次重构后确保测试通过
- 小步修改，不要大规模重写
- 保持外部接口不变`,
  },
  {
    name: 'debug',
    description: '系统化调试和问题定位',
    path: 'builtin:debug',
    content: `---
name: debug
description: 系统化调试和问题定位
---

# Debug Helper

## Description

系统化调试流程，快速定位问题根源：
- 分析错误信息和堆栈跟踪
- 设置断点和日志
- 追踪数据流
- 隔离问题范围
- 验证修复方案

## Trigger

当用户遇到 Bug、报错、或行为异常时激活。

## Debug Workflow

1. **复现问题**: 理解问题的触发条件
2. **收集信息**: 错误日志、堆栈跟踪、相关代码
3. **假设验证**: 提出可能的原因并逐一验证
4. **定位根源**: 找到问题的根本原因
5. **制定方案**: 设计修复方案
6. **验证修复**: 确保修复有效且无副作用

## Debugging Techniques

- **Print Debugging**: 关键点输出变量值
- **Binary Search**: 二分法定位问题代码
- **Delta Debugging**: 最小化复现步骤
- **Rubber Duck**: 逐步执行核心逻辑

## Common Bug Patterns

- 空值/未定义检查遗漏
- 异步操作竞态条件
- 状态管理错误
- 边界条件处理不当
- 资源泄漏`,
  },
  {
    name: 'api-design',
    description: '设计 RESTful API 接口规范',
    path: 'builtin:api-design',
    content: `---
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

\`\`\`
GET    /resources          # 列表
GET    /resources/:id      # 详情
POST   /resources          # 创建
PUT    /resources/:id      # 更新
DELETE /resources/:id      # 删除
\`\`\`

## Response Format

\`\`\`json
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
\`\`\`

## Error Response

\`\`\`json
{
  "code": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "name", "message": "Required" }
  ]
}
\`\`\``,
  },
  {
    name: 'security-audit',
    description: '安全审计和漏洞检测',
    path: 'builtin:security-audit',
    content: `---
name: security-audit
description: 安全审计和漏洞检测
---

# Security Audit

## Description

对代码进行安全审计，检测常见漏洞：
- OWASP Top 10 安全风险
- 输入验证和净化
- 认证和授权检查
- 敏感数据保护
- 依赖安全检查

## Trigger

当用户请求安全审查、检查安全漏洞、或讨论安全问题时激活。

## OWASP Top 10 Checklist

1. **注入攻击**: SQL/NoSQL/OS/LDAP 注入
2. **失效的认证**: 弱密码、会话管理
3. **敏感数据暴露**: 未加密传输、明文存储
4. **XML 外部实体**: XXE 攻击
5. **失效的访问控制**: 越权访问
6. **安全配置错误**: 默认配置、不必要的服务
7. **跨站脚本**: XSS 攻击
8. **不安全的反序列化**: 对象注入
9. **使用含漏洞的组件**: 过时的依赖
10. **不足的日志记录**: 缺乏审计日志

## Report Format

\`\`\`
## 安全审计报告

### 高危漏洞
- [文件:行] 漏洞类型 → 修复方案

### 中危问题
- [文件:行] 问题描述 → 建议

### 低危/信息
- [文件:行] 问题描述

### 总结
安全等级评估和优先修复建议
\`\`\``,
  },
  {
    name: 'database-design',
    description: '数据库 schema 设计和查询优化',
    path: 'builtin:database-design',
    content: `---
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

\`\`\`sql
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
\`\`\`

## Query Optimization

- 使用 EXPLAIN 分析查询计划
- 避免 SELECT *，只查询需要的字段
- 使用 LIMIT 限制结果集
- 避免在 WHERE 中对字段使用函数
- 合理使用 JOIN，避免子查询`,
  },
  {
    name: 'performance',
    description: '性能分析和优化',
    path: 'builtin:performance',
    content: `---
name: performance
description: 性能分析和优化
---

# Performance Optimization

## Description

性能分析和优化策略：
- 代码级性能优化
- 算法复杂度分析
- 内存使用优化
- 并发和异步处理
- 缓存策略

## Trigger

当用户需要优化性能、分析瓶颈、或讨论性能问题时激活。

## Performance Checklist

### 前端
- 减少 DOM 操作
- 使用虚拟滚动
- 图片懒加载
- 代码分割和懒加载
- 避免不必要的重渲染
- 使用 Web Workers 处理耗时任务

### 后端
- 数据库查询优化
- 连接池管理
- 异步处理耗时操作
- 缓存热点数据
- CDN 加速静态资源
- 负载均衡

## Common Optimizations

- **O(n²) → O(n log n)**: 优化嵌套循环
- **N+1 → JOIN**: 批量查询替代循环查询
- **同步 → 异步**: 非阻塞 I/O
- **计算 → 缓存**: 结果缓存
- **全量 → 增量**: 差异更新

## Metrics

- 响应时间 (P50, P95, P99)
- 吞吐量 (QPS/RPS)
- 错误率
- 资源使用率 (CPU, Memory, IO)`,
  },
  {
    name: 'git-workflow',
    description: 'Git 工作流和版本控制最佳实践',
    path: 'builtin:git-workflow',
    content: `---
name: git-workflow
description: Git 工作流和版本控制最佳实践
---

# Git Workflow

## Description

Git 版本控制最佳实践：
- 提交信息规范
- 分支管理策略
- 代码合并和变基
- 冲突解决
- 代码回滚

## Trigger

当用户需要 Git 帮助、提交代码、或处理分支问题时激活。

## Commit Message Format

\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

### Types
- **feat**: 新功能
- **fix**: 修复 Bug
- **docs**: 文档更新
- **style**: 代码格式（不影响功能）
- **refactor**: 重构
- **test**: 测试相关
- **chore**: 构建/工具变更

## Branch Strategy

\`\`\`
main (production)
  ├── develop (integration)
  │   ├── feature/user-auth
  │   ├── feature/payment
  │   └── fix/login-error
  └── release/v1.0
\`\`\`

## Best Practices

- 频繁提交，小步前进
- 提交前自测通过
- 使用 .gitignore 排除不需要的文件
- 敏感信息不要提交到仓库
- PR 前先 rebase 主分支`,
  },
];

export function loadBuiltinSkills(): BuiltinSkill[] {
  return BUILTIN_SKILLS;
}

export function getBuiltinSkillContent(skillPath: string): string | null {
  if (!skillPath.startsWith('builtin:')) return null;
  const name = skillPath.replace('builtin:', '');
  const skill = BUILTIN_SKILLS.find(s => s.name === name);
  return skill?.content || null;
}
