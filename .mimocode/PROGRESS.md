# VTE Agent 项目进度

> 最后更新: 2026-07-09

## 项目概述
VS Code AI 编码助手插件，Vue 3 + Vite webview UI。品牌名 `VTE Agent`，仓库 `vte-js/vte-agent`。

## 本次会话完成的工作

### 1. 侧边栏图标优化 ✅
- 重新设计狐狸图标，从 welcome page 等比缩放到 24x24
- 添加圆形边框 + clipPath 裁剪
- 响应式适配窗口大小

### 2. 多模型管理 ✅
- ModelSelector 组件：快速切换模型
- 中间弹窗管理模型配置（添加/编辑/删除）
- 输入框左下角也显示模型选择器
- 支持多个 provider/model 配置持久化

### 3. 消息反馈系统 ✅
- 点赞/点踩按钮
- 点踩时弹出反馈弹窗（快捷标签 + 自定义输入）
- 反馈存储到 `.vte/feedback.json`
- 反馈注入到 LLM system prompt 作为校准

### 4. 消息拦截中间件 ✅
- 结构化 system prompt（XML 标签）
- 模板引擎：`{{AGENT_ROLE}}` `{{TOOL_USE}}` `{{RULES}}`
- 环境信息注入（cwd/os/shell）
- 响应包装：`<system-reminder>` 元数据
- 错误消息清理：提取 JSON message，移除 system-reminder

### 5. 规则文件系统 ✅
- `.vte/rules/*.md` 项目规则
- `.vte/rules/local/*.md` 个人规则
- `~/.vte/rules/*.md` 全局规则
- 内置默认规则：`src/agent/default-rules.md`
- 规则自动注入到 system prompt

### 6. Token 优化 ✅
- 消息历史截断（保留最近 20 条）
- 工具结果压缩（超过 2000 字符截断）
- Token 预算追踪

### 7. 代码差异渲染 ✅
- DiffViewer 组件：解析 unified diff 格式
- Prism.js 语法高亮
- 绿色/红色背景高亮
- 工具调用后自动显示 diff
- 响应式布局

### 8. 思考内容折叠 ✅
- 思考内容默认隐藏
- 点击展开/折叠
- 消息卡片更简洁

### 9. Checkpoint + Shadow Git ✅
- Shadow Git 管理器：`.vte/checkpoints/{workspaceHash}/.git`
- LLM 工具：checkpoint_save/restore/diff/log
- 对话/任务状态存储到 `.vte-metadata.json`
- 工具调用后自动 git commit

### 10. UI/UX 优化 ✅
- 输入框去掉上边框
- 任务清单整行可点击
- 错误消息红色样式
- 消息内容 word-break 防溢出
- 灰盒测试显示代码差异

## 关键文件状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/agent/shadow-git.ts` | 新增 | Shadow Git 管理器 |
| `src/agent/checkpoint-tools.ts` | 新增 | Checkpoint LLM 工具 |
| `src/agent/middleware.ts` | 新增 | 消息拦截中间件 |
| `src/agent/prompt-template.ts` | 新增 | 结构化 prompt 模板 |
| `src/agent/rules.ts` | 新增 | 规则文件引擎 |
| `src/agent/default-rules.md` | 新增 | 内置默认规则 |
| `src/agent/mock-engine.ts` | 已修改 | 添加 diff 测试场景 |
| `src/vscode/panel.ts` | 已修改 | 多模型/checkpoint/错误处理 |
| `src/shared/types.ts` | 已修改 | Checkpoint 接口 |
| `webview/src/components/ModelSelector.vue` | 新增 | 模型选择器 |
| `webview/src/components/FeedbackModal.vue` | 新增 | 反馈弹窗 |
| `webview/src/components/DiffViewer.vue` | 新增 | 代码差异渲染 |
| `webview/src/components/CheckpointBar.vue` | 新增 | Checkpoint 管理 |
| `webview/src/components/AgentAvatar.vue` | 已修改 | 圆形边框 + clipPath |
| `webview/src/components/ToolCallBlock.vue` | 已修改 | 显示 diff |
| `webview/src/components/MessageBubble.vue` | 已修改 | 反馈/错误/思考折叠 |
| `webview/src/composables/useConfig.ts` | 已修改 | 多模型支持 |
| `webview/src/theme.css` | 已修改 | 全新样式 |

## 构建命令
```bash
npm run compile && npm run copy:assets && cd webview && npx vite build
```

## 测试方法
1. F5 启动 Extension Development Host
2. 输入 "你是谁" → 验证身份回复
3. 让 LLM 编辑文件 → 验证 diff 显示
4. 点击点赞/点踩 → 验证反馈弹窗
5. 点击模型选择器 → 验证多模型切换
6. 点击 checkpoint 按钮 → 验证保存/恢复
7. 模拟 API 错误 → 验证错误样式

## 待办事项
- [ ] Shadow Git metadata 完整测试
- [ ] 反馈系统端到端测试
- [ ] 规则文件热加载
- [ ] 图片粘贴功能
