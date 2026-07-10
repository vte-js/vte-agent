---
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

```typescript
describe('functionName', () => {
  it('should handle normal case', () => { ... })
  it('should handle edge case', () => { ... })
  it('should throw error on invalid input', () => { ... })
})
```
