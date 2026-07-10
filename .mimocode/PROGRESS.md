# VTE Agent 项目进度

> 最后更新: 2026-07-11

## 项目概述
VS Code AI 编码助手插件，Vue 3 + Vite webview UI。品牌名 `VTE Agent`，仓库 `vte-js/vte-agent`。

## 本次会话完成的工作

### 1. 图片上传修复 ✅
- 修复 Vue reactive proxy 导致 postMessage 失败的问题
- 图片消息卡片 IM 风格展示
- 图片预览全屏组件（ImagePreview.vue）
- 图片自适应宽度（max-width: min(400px, 100%)）

### 2. 消息体重构 ✅
- 用户消息：紫色实色气泡，右对齐
- 助手消息：透明背景，左对齐
- 去掉用户消息上方"你"标签
- 消息卡片 v-if 支持纯 context 消息（无文本）

### 3. 上下文系统 ✅
- @ 菜单触发上下文选择（ContextMenu.vue）
- 6 种上下文来源：文件、文件夹、文档、Skills、终端、Git
- Git 上下文：工作区变更 + 最近提交选择（GitPicker.vue）
- Skills 上下文：内置 + 项目 Skills 选择（SkillsPicker.vue）
- 终端上下文：通过 Shell Integration API 读取终端输出
- 文件夹：递归读取目录内容（readDirRecursive）

### 4. Skills 管理系统 ✅
- SkillsPanel.vue：管理面板（列表/搜索/新建/编辑/删除）
- 9 套内置编码 Skills（code-review, unit-test, refactor, debug, api-design, security-audit, database-design, performance, git-workflow）
- SKILL.md 解析（name/description 自动提取）
- 内置 Skills 只读标签，不可删除
- 新建 Skill 自动生成标准模板

### 5. 推理强度控制 ✅
- 三档选择：低（关闭思考）、中（标准思考）、高（深度思考）
- ReasoningPicker.vue：居中弹窗选择器
- 输入框底部工具栏按钮（带下拉箭头标识）
- 三档差异化实现：
  - 低：enable_thinking=false
  - 中：enable_thinking=true + 标准 prompt
  - 高：enable_thinking=true + min(temp, 0.3) + 深度分析 prompt

### 6. 权限控制系统 ✅
- 8 个权限类别：文件读写、终端、Git、诊断、网络、任务、快照
- AuthorizationDialog.vue：授权弹窗（仅本次允许/总是允许/拒绝）
- ConfigPanel 权限配置区（仅 Code 模式生效）
- Plan 模式自动跳过权限检查

### 7. 快捷指令 ✅
- / 触发快捷指令面板（SlashCommand.vue）
- 内置 9 个 Skills 快捷指令
- @ 触发上下文选择菜单
- 键盘导航支持（↑↓Enter Esc）

### 8. 配置面板重构 ✅
- 三大分组卡片：模型配置、执行行为、生成参数
- 工作模式：卡片式选择（编码/规划）
- 任务清单：分段控制器
- 权限控制：2列 flex 布局
- 生成参数：滑块 + 范围标签
- 标题统一为"VTE Agent 设置"

### 9. 全局组件化 ✅
- ConfirmDialog.vue：确认对话框
- ContextMenu.vue：上下文菜单（context-menu-items.ts）
- ImagePreview.vue：图片预览
- 所有弹出面板统一组件化

### 10. VSCode 工具栏集成 ✅
- package.json viewTitle 菜单贡献
- 5 个按钮：新建会话、会话历史、Skills、设置、清空
- Extension host 直接调用 panel 方法

### 11. UI/UX 优化 ✅
- 输入框 placeholder 提示快捷键
- 消息卡片图片预览全屏
- Skills/Session 删除使用 ConfirmDialog
- Toast 通知用于所有 UI 操作反馈
- 推理强度按钮带下拉箭头标识

## 关键文件状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/core/permissions.ts` | 新增 | 权限控制系统 |
| `src/skills/builtin.ts` | 新增 | 9 套内置 Skills |
| `src/vscode/extension.ts` | 已修改 | viewTitle 命令注册 |
| `src/vscode/panel.ts` | 已修改 | 权限/推理/上下文处理 |
| `src/agent/engine.ts` | 已修改 | 权限检查 + 推理强度 |
| `webview/src/protocol.ts` | 已修改 | 新增消息类型 |
| `webview/src/components/AuthorizationDialog.vue` | 新增 | 授权弹窗 |
| `webview/src/components/ConfirmDialog.vue` | 新增 | 确认对话框 |
| `webview/src/components/ContextMenu.vue` | 新增 | 上下文菜单 |
| `webview/src/components/GitPicker.vue` | 新增 | Git 选择器 |
| `webview/src/components/ImagePreview.vue` | 新增 | 图片预览 |
| `webview/src/components/ReasoningPicker.vue` | 新增 | 推理强度选择器 |
| `webview/src/components/SkillsPanel.vue` | 新增 | Skills 管理面板 |
| `webview/src/components/SkillsPicker.vue` | 新增 | Skills 选择器 |
| `webview/src/components/SlashCommand.vue` | 新增 | 快捷指令面板 |
| `webview/src/components/ConfigPanel.vue` | 已修改 | 重构布局 |
| `webview/src/components/InputArea.vue` | 已修改 | 上下文/推理/快捷指令 |
| `webview/src/composables/useConfig.ts` | 已修改 | 权限/推理状态 |
| `webview/src/App.vue` | 已修改 | 集成所有新组件 |

## 构建命令
```bash
npm run compile && cd webview && npx vite build
```

## 测试方法
1. F5 启动 Extension Development Host
2. 输入 `/` → 验证快捷指令面板
3. 输入 `@` → 验证上下文选择菜单
4. 添加文件上下文 → 验证预览 chips
5. 切换推理强度 → 验证按钮颜色变化
6. 配置面板 → 验证权限控制（切到 Code 模式）
7. 点击 Skills → 验证管理面板
8. 发送带 context 的消息 → 验证 LLM 收到文件内容
