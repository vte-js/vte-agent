# VTE Agent

可插拔宿主架构的 AI 编程助手，具备细粒度权限控制、token 高效的多 agent 引擎，以及框架无关内核。

[English](README.md)

## 功能特性

- **多模型** — GPT-4o、Claude、DeepSeek、Qwen、MiMo
- **可插拔架构** — HostAdapter 接口，支持 VSCode、Web、CLI、Electron、JetBrains（核心层零 VSCode 耦合）
- **Token 高效多 Agent 引擎** — PM 将需求拆为角色化工单，子 agent 并行执行，结果回流汇总。上下文通过 `get_context` 工具**按需检索**，而非注入每个 prompt，杜绝 N 份重复 token 浪费
- **每 Agent 独立 LLM 配置** — 每个子 agent 可单独携带 provider / 模型 / thinking 风格 / 推理强度
- **沙箱隔离** — 写类 agent 走 git worktree 隔离；非 git / 非 Node 宿主优雅降级到共享工作区
- **共享上下文** — 已完成工单的只读聚合，供兄弟 agent 检索复用
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

核心层（`src/core`、`src/agent`、`src/tools`、`src/context`、`src/shared`）**框架无关**——不引入任何 `vscode`。所有宿主绑定仅存在于 `src/vscode/`（VSCode 宿主适配器）。切换宿主只需写一个新的适配器，无需改动引擎。

```
src/
├── core/          # 框架无关核心（类型、注册表、权限）
├── host/          # HostAdapter 接口 + 实现
│   ├── types.ts   # HostAdapter、HostFileSystem、HostUI、HostMessaging
│   ├── vscode.ts  # VSCode 适配器   ← 唯一 import 'vscode' 的地方
│   └── registry.ts
├── agent/         # 引擎、agent 池、调度器、上下文系统
│   ├── engine.ts          # 单 agent LLM 引擎（框架无关）
│   ├── agent-pool.ts      # 基于角色的 sub-agent 生命周期 + PM 拆解
│   ├── scheduler.ts       # 并行 / 池 / 流水线 调度
│   ├── context-system.ts  # 单例上下文权威（get_context 数据源）
│   ├── context-tool.ts    # get_context 工具 —— 按需、省 token
│   └── shared-context.ts  # 跨 agent 产出只读聚合
├── tools/         # file、bash、git、search、question、get_context...
├── context/       # 项目索引、文件读取
├── skills/        # 内置 Skill 定义
└── vscode/        # VSCode 扩展、面板、LSP  ← 仅宿主层

webview/src/
├── composables/   # useHost、useChat、useConfig
├── components/    # MessageBubble、ToolCallBlock、DiffViewer、QuestionDialog、
│                   # NumberInput、Toggle...（共享组件库）
├── theme.css      # --vte-* 设计令牌 + `c-` 组件样式
└── protocol.ts    # 消息类型（webview ↔ host），框架无关
```

### HostAdapter

```typescript
interface HostAdapter {
  fs: HostFileSystem       // 文件 I/O
  workspace: HostWorkspace  // 工作区信息
  ui: HostUI               // 对话框、选择器、Toast
  messaging: HostMessaging  // postMessage 通信
  shell?: HostShell         // 命令执行
  lsp?: HostLSP            // 语言服务器协议
  lspTools?: ToolDefinition[]
}
```

实现 `HostAdapter` + 调用 `setHost()`。工具通过 `getHost()` 访问，fallback 到 Node.js API。

## 多 Agent 引擎

一条对话消息可被路由（或强制）进入多 agent 流水线：

1. **PM（项目经理）agent** 将需求拆解为角色化工单（developer / tester / reviewer / documenter）。它**没有**任何写工具——只有 `get_context` 用于查看项目结构。
2. **调度器** 把工单分配给空闲的角色 agent。各角色有并发上限（pm:1、dev:3、test:2、review:1、doc:1），能力足够的角色可真正并行。
3. 每个子 agent 执行自己的工单并回报。已完成产出聚合进共享上下文。
4. 当所有终结工单完成（或安全超时触发），结果回流汇总到主对话。

### Token 高效 —— 核心设计准则

传统多 agent GUI 会把**完整项目上下文注入每一个子 agent 的 prompt**。N 个并行 agent 就是 N 份上下文副本——纯 token 浪费。

VTE **不这么做**。有一个进程级单例 `AgentContextSystem`，是项目上下文的**唯一权威**（结构、主 agent 已读文件、兄弟 agent 共享产出）。子 agent 收到的是**精简 prompt**，被告知按需调用 `get_context` 工具：

- `get_context({ topic: "structure" })` → 顶层结构概要（默认，最省）
- `get_context({ topic: "read_files" })` → 主 agent 已读的文件
- `get_context({ topic: "shared" })` → 已完成兄弟 agent 的产出
- `get_context({ topic: "full" })` → 完整索引，仅在必要时用

这让每个 agent 的 prompt 保持极小，契合 opencode / TUI 的理念：**帮开发者省 token，而不是烧 token。**

## 配置

所有运行时配置都在**应用内 ConfigPanel**（点设置图标打开），**不**在宿主的原生设置 UI 里。ConfigPanel 是由 `webview ↔ host` 协议驱动的框架无关界面，因此在 VSCode、Web、CLI 等宿主上表现一致。

可配置项包括：API Key / Base URL / 模型（多配置档）、**子 Agent 超时（秒）**、**强制多 Agent 委派**、推理强度、任务模式、按类别的权限。

> 注：VSCode 宿主会在内部把配置持久化进它自己的存储后端；webview 本身从不直接读写原生设置。

## Webview 组件约定

为保持宿主语移植性与主题自适应，webview 一律使用**自有组件**，绝不使用原生 HTML 控件：

- 可复用控件放在 `webview/src/components/`（如 `NumberInput.vue`、`Toggle.vue`），且**组件本身不带内联 `<style>`**。
- 共享样式统一在 `webview/src/theme.css` 的 `c-` 命名空间（如 `.c-num-input`、`.c-toggle`），并由 `--vte-*` 设计令牌驱动。
- 这样整段 `c-` 样式块 + `components/` 目录能零改造抽离成独立的「code agent 框架通用组件库」。

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

构建产物：
- 扩展：`out/vscode/panel.js`（经 `tsc`）
- Webview：`out/webview/index.html`（经 `vite` 单文件构建——全部 JS/CSS 内联）

## 规划中的宿主

Agent 核心层是与宿主解耦的 —— 它通过 `HostAdapter`（`src/host/types.ts`）与外界交互。VSCode 是第一个宿主；**Web IDE 宿主**作为第二个宿主，用于端到端验证抽象是否成立。

- 设计：三栏 IDE（左=项目管理、中=主 Agent 对话、右=opencode 式工具/子 Agent 状态面板），Node + WebSocket 后端复用同一套 `AgentEngine`/`AgentPool`/`AgentContextSystem`，Vue3 前端复用现有 webview 组件库。
- 完整计划见：[`docs/web-ide-host-plan.md`](docs/web-ide-host-plan.md)。

## 许可证

MIT
