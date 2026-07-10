---
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

## Security Checks

```javascript
// 输入验证
sanitize(userInput)

// SQL 参数化
db.query('SELECT * FROM users WHERE id = ?', [userId])

// XSS 防护
escapeHTML(userContent)

// CSRF 令牌
csrfToken === session.csrfToken

// 安全头
Content-Security-Policy: default-src 'self'
```

## Report Format

```
## 安全审计报告

### 高危漏洞
- [文件:行] 漏洞类型 → 修复方案

### 中危问题
- [文件:行] 问题描述 → 建议

### 低危/信息
- [文件:行] 问题描述

### 总结
安全等级评估和优先修复建议
```
