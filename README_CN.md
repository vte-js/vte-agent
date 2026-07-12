# VTE Agent

可插拔宿主架构的 AI 编程助手，细粒度权限控制。

[English](README.md)

## 功能特性

- **多模型** — GPT-4o、Claude、DeepSeek、Qwen、MiMo
- **可插拔架构** — HostAdapter 接口，支持 VSCode、Web、CLI、Electron、JetBrains
- **上下文附加** — 文件、文件夹、文档、Skills、终端、Git
- **会话管理** — 创建、恢复、重命名、搜索、导入导出
- **任务跟踪** — 实时任务进度与状态更新
- **快照系统** — 保存/恢复代码状态，带 Diff 对比
- **内置 Skills** — 9 套编码技能，`/` 快捷调用
- **Question 工具** — LLM 提问，用户从选项中选择
- **Tab 采纳** — LLM 建议下一步，Tab 自动填入
- **实时工具调用** — 每个工具调用在消息流中逐个内联显示
- **逐轮思考** — 每次 LLM 迭代独立显示可折叠的思考过程
- **左右对比 Diff** — 宽屏时代码修改左右并排对比
- **动态占位符** — 输入框根据 LLM 建议自动更新
- **细粒度权限** — 按类别允许/询问/拒绝
- **推理强度** — 低 / 中 / 高

## 架构

```
src/
├── core/          # 框架无关核心（类型、注册表、权限）
├── host/          # HostAdapter 接口 + 实现
│   ├── types.ts   # HostAdapter、HostFileSystem、HostUI、HostMessaging
│   ├── vscode.ts  # VSCode 适配器
│   └── registry.ts
├── agent/         # 引擎、工具、会话
├── tools/         # file、bash、git、search、question...
├── context/       # 项目索引、文件读取
├── skills/        # 内置 Skill 定义
└── vscode/        # VSCode 扩展、面板、LSP

webview/src/
├── composables/   # useHost、useChat、useConfig
├── components/    # MessageBubble、ToolCallBlock、DiffViewer、QuestionDialog
└── protocol.ts    # 消息类型（webview ↔ host）
```

### HostAdapter

```typescript
interface HostAdapter {
  fs: HostFileSystem       // 文件 I/O
  workspace: HostWorkspace  // 工作区
  ui: HostUI               // 对话框、选择器、Toast
  messaging: HostMessaging  // postMessage 通信
  shell?: HostShell         // 命令执行
  lsp?: HostLSP            // 语言服务器协议
  lspTools?: ToolDefinition[]
}
```

实现 `HostAdapter` + 调用 `setHost()`。工具通过 `getHost()` 访问，fallback 到 Node.js API。

## 安装

```bash
code --install-extension vte-agent-0.0.1.vsix
```

## 快速开始

1. 从活动栏或状态栏打开 VTE Agent
2. 配置 API Key 和模型
3. 开始对话

## 使用方法

| 按键 | 功能 |
|------|------|
| `/` | 快捷指令 |
| `@` | 上下文附加 |
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Tab` | 采纳 LLM 建议 |

### 上下文类型
文件 / 文件夹 / 文档 / Skills / 终端 / Git

### 权限控制
按类别配置：文件读写、终端、Git、诊断、网络、任务、快照。

## 配置

`Cmd+,` → "VTE Agent"：API Key、Base URL、模型、权限、推理强度、任务模式。

## 内置 Skills

| Skill | 描述 |
|-------|------|
| code-review | 代码质量、Bug、安全、性能 |
| unit-test | 单元测试，覆盖边界情况 |
| refactor | SOLID 原则重构 |
| debug | 系统化调试 |
| api-design | RESTful API 设计 |
| security-audit | OWASP Top 10 检查 |
| database-design | Schema 和查询优化 |
| performance | 性能分析 |
| git-workflow | Git 最佳实践 |

## 开发

```bash
npm install && cd webview && npm install
npm run compile && cd .. && npm run build:webview
npm run watch          # 开发模式
# VS Code 中按 F5 运行
```

## 许可证

MIT
