# VTE Web IDE

vte-agent 的**第二宿主**（纯 Node + 浏览器），用于在不修改核心层一行代码的前提下，验证 `HostAdapter` 抽象层的宿主无关性。

前端零改造复用 `webview/src` 的全部组件与 composables，后端用 Node 原生 `fs` / `child_process` / `git` 实现 `HostAdapter` 接口，消息经 WebSocket 桥接。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node 22 + TypeScript（tsx 直跑，自动转译 `src` 依赖链） |
| 前端 | Vue 3 + Vite 5 |
| 通信 | WebSocket（`/ws`）+ HTTP 静态托管（:3001） |
| 代码高亮 | highlight.js（VS2015 深色主题） |
| 共享 UI | `../webview/src`（组件 + composables + `theme.css`） |

---

## 目录结构

```
web-ide/
├── start.sh                  # 一键启动脚本（自动加载 .env）
├── .env                     # 运行配置（VTE_MOCK / VTE_API_KEY / VTE_MODEL）
├── .gitignore               # 忽略 .env / node_modules / dist / out
├── package.json
├── server/                  # 后端（零 vscode import）
│   ├── index.ts             # 入口：等价于 VSCode 的 panel.ts
│   ├── host-adapter.ts      # WebIDEHostAdapter 实现 src/host/types.ts
│   ├── transport.ts         # WebSocket 消息桥接（WebIDEMessaging）
│   ├── persistence.ts       # .vte/config.json 持久化（API Key 不出服务端）
│   └── workspace-manager.ts # 全局工作空间注册表（~/.vte-web-ide/workspaces.json）
├── client/                  # 前端（Vite + Vue3）
│   ├── index.html
│   ├── vite.config.ts      # alias @webview → ../webview/src
│   └── src/
│       ├── App.vue          # 三栏布局 + 所有 handler 接线
│       ├── main.ts          # 挂载前注入 WS transport
│       ├── protocol.ts      # 与 core 共享的协议类型
│       ├── ws.ts            # WS 连接封装
│       └── components/      # 仅宿主特有组件
│           ├── ProjectTree.vue       # 文件树（递归 TreeNode）
│           ├── TreeNode.vue          # 递归树节点（共享层 webview/src/components）
│           ├── GitStatus.vue         # Git 状态
│           ├── WorkspaceSwitcher.vue # 动态工作空间切换
│           ├── ChatPanel.vue        # 对话面板包装
│           └── StatusLog.vue       # 状态日志
├── scripts/
│   └── smoke.mjs           # 冒烟测试（连 WS、发 chat、断言 config/thinking/chunks/response）
└── .vte/                   # 运行时工作区数据（sessions/、config.json）

../webview/src/              # 共享 UI 层（被 web-ide + VSCode 双宿主复用）
├── components/              # 60+ 通用组件（MessageList、ConfigPanel、SessionDropdown…）
├── composables/            # useHost / useChat / useSession / useConfig …
├── theme.css               # --vte-* CSS 变量（随宿主主题自适应）
└── protocol.ts             # WebviewToHost / HostToWebview 消息协议
```

---

## 快速开始

### 1. 安装依赖

```bash
cd web-ide
npm install
```

> 需 Node.js 22+（本项目使用 WorkBuddy 受管运行时，位于 `$HOME/.workbuddy/binaries/node/versions/22.22.2`）。`npm` 请确保在 PATH 中，或用该受管 node 自带的 npm。

依赖（ws / tsx / vite / vue / concurrently）会装到 `web-ide/node_modules`，不污染系统环境。

### 2. 启动

**方式 A — 一键脚本（推荐，生产用）**

```bash
./start.sh
```

默认端口 3001，自动清理旧进程，日志直接打印到终端。
服务模式由 `.env` 决定（见下文「配置」）。

**方式 B — 开发模式（热重载）**

```bash
npm run dev
```

同时启动 server（tsx watch）和 client（vite dev server :5173）。

### 3. 访问

浏览器打开 **http://localhost:3001**

---

## 配置

所有运行配置写在 `web-ide/.env`（`start.sh` 启动时自动 `source`）。

| 变量 | 说明 | 默认值 |
|---|---|---|
| `VTE_MOCK` | `1` = mock 回显模式；`0` = 真实模型模式 | 未设则按有无 API Key 自动判断 |
| `VTE_API_KEY` | 真实模型 API Key（仅 `VTE_MOCK=0` 时需要） | 空 |
| `VTE_MODEL` | 模型名（如 `gpt-4o`） | `gpt-4o-mini` |
| `VTE_PORT` | 服务端口 | `3001` |

### 模式说明

- **Mock 模式**（`VTE_MOCK=1` 或无 API Key）：后端用本地回显模拟流式响应，无需任何外部密钥，适合本地开发调试 UI。
- **真实模型模式**（`VTE_MOCK=0` + `VTE_API_KEY`）：接入真实 LLM，`API Key` 仅存在于服务端内存与 `.env` 文件，**绝不发送到浏览器**。

### .env 示例

```bash
# Mock 模式
VTE_MOCK=1

# 或真实模型模式
# VTE_MOCK=0
# VTE_API_KEY=sk-xxxx
# VTE_MODEL=gpt-4o
```

> 注意：`.env` 已被 `.gitignore` 忽略，切勿提交真实 Key。

---

## 核心功能

| 功能 | 说明 |
|---|---|
| **多会话** | 会话历史下拉（🕘），顶栏常驻「+ 新建会话」；数据存于 `.vte/sessions/` |
| **文件树** | 递归无限层级，支持展开/折叠、右键菜单（新建文件/文件夹、重命名、删除）；显示 `.env` 等隐藏文件（排除 `node_modules` / `.git`） |
| **文件预览 + 编辑** | 点击文件 → 居中模态框预览（highlight.js 语法高亮）；可切换编辑模式，`Ctrl/Cmd+S` 保存，后端 `fs:write` 落盘 |
| **多 Agent** | AgentPool + WorkOrderPool + Scheduler；右栏 AgentDashboard / WorkOrderBoard / TokenStats |
| **工作空间切换** | 左栏 WorkspaceSwitcher 支持运行时添加 / 切换 / 移除 / 浏览工作空间（全局注册表持久化到 `~/.vte-web-ide/workspaces.json`） |
| **动态主题** | 全部 UI 走 `--vte-*` CSS 变量，主题在 `app.css` 的 `:root` 定义（深色 #1e1e1e 黑底 + #6366f1 紫） |

---

## 架构要点

### HostAdapter 抽象（解耦验证）

核心层 `src/agent/`、`src/host/types.ts` **零 `vscode` import**（grep 验收只有 `src/vscode/**` 与 theme.css 的 `--vscode-*` 变量名）。

`WebIDEHostAdapter` 实现 `HostAdapter`：
- `messaging`：`WebIDEMessaging` 把 `HostMessaging` 桥接到单条 WebSocket 连接
- `sandbox`：可选 `HostSandbox`（git worktree 隔离，非 git 宿主优雅降级到共享根目录）
- `fs`：直接 Node 原生 `fs.promises`

`index.ts` 等价于 VSCode 的 `panel.ts`：`setHost(adapter)` → `new AgentEngine(...)` → HTTP + WS。

### 协议对齐金标准

`engine.onViewUpdate` 裸发原始 ViewUpdate（不包 `{type:'update'}`），并做三个映射：
- `thinking_start` → 额外发 `{type:'thinking'}`
- `permission_request` → `{type:'permissionRequest'}`
- `question_request` → `{type:'questionRequest'}`

### 共享 UI 复用

前端 `vite.config.ts` 通过 alias `@webview` 指向 `../webview/src`，`main.ts` 在挂载前用 `history.replaceState` 给 URL 加 `?ws=ws://{host}/ws`，`useHost` 自动检测并走 `createWebSocketTransport`。所有 webview composables 只依赖 `useHost`，零改造复用。

---

## 开发脚本

```bash
npm run dev        # 开发模式（server watch + client hot-reload）
npm run build      # 构建客户端到 client/dist/
npm run start      # 生产启动（tsx 直跑 server/index.ts）
npm run typecheck  # 服务端类型检查
node scripts/smoke.mjs   # 冒烟测试（M1 已 PASS）
```

---

## 注意事项

1. **服务请在 WorkBuddy 终端启动**。AI 助手代起的服务会被对话轮次回收；在 WB 终端执行 `./start.sh` 可常驻。
2. **修改 `server/*.ts` 后必须重启服务**（tsx 非 watch 模式不自动重载），否则新 handler 不生效。
3. **API Key 不出服务端**：浏览器只收到对话 token 统计，不接收任何密钥。
4. **核心层改动需回归双宿主**：修改 `src/` 后，VSCode 与 web-ide 都应验证通过。

---

## 里程碑

- M1 脚手架 · M2 左栏（文件树 + Git 状态）· M3 中栏复用富组件 · M4 右栏复用 Agent/工单/Token · M5 配置持久化 · M6 收尾验收全勾 · **动态工作空间管理** · **文件树递归无限层级 + 预览编辑**
- 冒烟测试全 PASS；核心层 grep vscode 干净（仅 `.vscode` 目录名字面量）
