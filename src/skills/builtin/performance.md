---
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

## Analysis Tools

```bash
# Node.js 性能分析
node --inspect app.js
# Chrome DevTools Profiler

# Python 性能分析
python -m cProfile script.py

# Go 性能分析
go test -bench=. -cpuprofile=cpu.out
```

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
- 资源使用率 (CPU, Memory, IO)
