---
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
- 保持外部接口不变
