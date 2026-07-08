# VTE Agent 项目进度

> 最后更新: 2026-07-08

## 项目概述
VS Code AI 编码助手插件，Vue 3 + Vite webview UI。品牌名 `VTE Agent`，仓库 `vte-js/vte-agent`。

## 本次会话完成的工作

### 1. 重命名 vte-code → vte-agent ✅
所有 ID、标题、日志、组件文本统一更新。

### 2. 状态栏入口 + WebviewPanel 弹出层 ✅
- 状态栏按钮 `$(comment-discussion) VTE Agent`
- 命令 `vte-agent.openChat` 打开/聚焦 WebviewPanel
- 保留 Activity Bar 侧边栏作为第二入口
- 两者共享同一个 ChatViewProvider 和 AgentEngine

### 3. 聊天历史跨 Webview 同步 ✅
- Provider 端维护 `chatHistory` 数组
- 新 Webview 打开时通过 `chatHistory` 消息同步完整历史
- 当前模式通过 `modeChanged` 消息同步

### 4. 消息结构重构 — per-message 状态 ✅
- ChatMessage 新增 `thinkingPhase`、`thinkingText`、`toolCalls`
- 去除所有全局状态 ref（thinking、thinkingContent、reasoning 等）
- 每条消息自带完整状态，支持历史会话查看

### 5. 思考过程实时显示 ✅
- `thinking` 事件时立即创建 streaming 消息（thinkingPhase=true）
- thinking_chunk 直接写入消息的 thinkingText
- 内容开始时 thinkingPhase=false，动画消失，思考内容永久保留
- 动画和思考内容在 MessageBubble 内部，位于图标名称下方

### 6. 工具调用展示 ✅
- Engine 发送 tool_call/tool_result 事件
- ToolCallBlock 组件：工具名 + 状态图标 + 耗时
- 多工具自动折叠显示"调用了 N 个工具"

### 7. Token 用量追踪修复 ✅
- 添加 `stream_options: { include_usage: true }` 到 API 请求
- recordUsage 调用缺失修复

### 8. 狐狸头像设计 ✅
- AgentAvatar.vue 双模式组件（full/compact）
- **完整版**：拟人化狐狸，渐变背景圆 + clipPath 裁剪，耳朵摇摆/眨眼/瞳孔微动/鼻子抽动/胡须摆动动画
- **紧凑版**：单色狐狸剪影，用于 header 和消息气泡
- Activity Bar 图标：简化狐狸轮廓 SVG

### 9. 消息流 UI 优化 ✅
- 思考动画与内容丝滑过渡（同一容器内状态切换）
- 空消息气泡在 thinkingPhase 时隐藏（v-if 控制）
- 欢迎页重做：大头像 + 标题 + 示例提示词卡片

## 关键文件状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `package.json` | 已修改 | vte-agent 命名 + command 注册 |
| `src/vscode/extension.ts` | 已修改 | 状态栏 + 命令注册 |
| `src/vscode/panel.ts` | 已修改 | WebviewPanel + chatHistory 同步 |
| `src/agent/engine.ts` | 已修改 | tool_call/tool_result 事件 + usage |
| `webview/src/protocol.ts` | 已修改 | tool_call/tool_result 消息类型 |
| `webview/src/composables/useChat.ts` | 已重构 | per-message 状态，去除全局 ref |
| `webview/src/composables/useMode.ts` | 已修改 | modeChanged 同步 |
| `webview/src/components/AgentAvatar.vue` | 新增 | 双模式狐狸头像 |
| `webview/src/components/ToolCallBlock.vue` | 新增 | 工具调用展示 |
| `webview/src/components/MessageBubble.vue` | 已修改 | 思考块内置 + 工具调用 |
| `webview/src/components/MessageList.vue` | 已修改 | 简化，状态从消息读取 |
| `webview/src/theme.css` | 已修改 | 工具块样式 + 头像样式 |
| `resources/icon.svg` | 已修改 | 狐狸轮廓图标 |

## 构建命令
```bash
npm run compile && cd webview && npx vite build
```

## 测试方法
1. F5 启动 Extension Development Host
2. 状态栏点击 → 弹出 WebviewPanel
3. Activity Bar → 侧边栏
4. 发送消息 → 观察思考过程实时显示
5. 触发工具调用 → 观察状态变化
6. 多轮对话 → 验证每轮独立状态

## 待办事项
- [ ] 历史会话记录持久化
- [ ] 消息编辑功能端到端测试
- [ ] Mermaid 图表功能验证
- [ ] 图片粘贴功能
