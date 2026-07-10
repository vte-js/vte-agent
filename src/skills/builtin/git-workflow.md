---
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

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat**: 新功能
- **fix**: 修复 Bug
- **docs**: 文档更新
- **style**: 代码格式（不影响功能）
- **refactor**: 重构
- **test**: 测试相关
- **chore**: 构建/工具变更

### Example
```
feat(auth): add JWT token refresh

Implement automatic token refresh when access token expires.
- Add refresh token interceptor
- Handle token refresh race condition
- Update error handling for expired tokens

Closes #123
```

## Branch Strategy

```
main (production)
  ├── develop (integration)
  │   ├── feature/user-auth
  │   ├── feature/payment
  │   └── fix/login-error
  └── release/v1.0
```

## Common Commands

```bash
# 功能开发
git checkout -b feature/xxx
git add .
git commit -m "feat: add xxx"
git push origin feature/xxx

# 同步主分支
git fetch origin
git rebase origin/develop

# 解决冲突
git merge --abort
git rebase --continue

# 回滚
git revert HEAD
git reset --soft HEAD~1
```

## Best Practices

- 频繁提交，小步前进
- 提交前自测通过
- 使用 .gitignore 排除不需要的文件
- 敏感信息不要提交到仓库
- PR 前先 rebase 主分支
