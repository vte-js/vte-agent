---
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
- **Rubber Duck**: 向他人解释代码逻辑
- **Delta Debugging**: 最小化复现步骤
- **Rubber Duck**: 逐步执行核心逻辑

## Common Bug Patterns

- 空值/未定义检查遗漏
- 异步操作竞态条件
- 状态管理错误
- 边界条件处理不当
- 资源泄漏
