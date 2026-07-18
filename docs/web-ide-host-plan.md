# Web IDE 宿主计划 —— 架构完整性验证

> 目标：在不修改核心层（`src/agent`、`src/tools`、`src/core`、`src/context`、`src/shared`）一行代码的前提下，新增**第二个宿主**（Web IDE），证明 `HostAdapter` 抽象确实让整套 agent 引擎与 VSCode 解耦。
>
> 思路：三栏布局 —— **左：项目管理** ｜ **中：主 Agent 对话** ｜ **右：opencode 式工具/子 Agent 状态面板**。后端是一个 Node 进程（跑同一套 core），前端是一个 Vue3 单页应用（复用现有 webview 组件库）。

---

## 0. 为什么做这件事（验证命题）

当前架构已经做到「核心层零 `vscode` 依赖」，但**只有一个宿主（VSCode）在用**。单宿主无法证明解耦是真的 —— 也可能是我们恰好没碰到的边界。

Web IDE 宿主是天然的「第二宿主」：

1. 它必须把 agent 跑在 **Node 进程**里（而不是 VSCode extension host），迫使所有 `getHost()` 调用走新的 `WebIDEHostAdapter`，任何漏网的 `vscode` import 会立刻在 Node 下报错。
2. 它的 UI 走 **WebSocket + 浏览器**，而不是 VSCode `postMessage`，证明 `HostMessaging` 抽象对传输层无假设。
3. 它的三栏界面大量复用现有 webview 组件，验证「为组件库生态做的组件化投入」真的可跨宿主复用。

**验收命题（DoD 前置）：** 一个全新的宿主，能让同一套 `AgentEngine` / `AgentPool` / `AgentContextSystem` 跑起来，且 `grep -rn "vscode" src/agent src/tools src/core src/context src/shared` 结果仍为空（仅 `src/vscode` 与 `src/host/vscode.ts` 允许出现）。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Vue3 SPA)  ——  三栏 IDE 界面                       │
│                                                                 │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ 左：项目管理│  │ 中：主Agent对话 │  │ 右：工具/状态    │   │
│  │ ProjectMgr│  │ ChatPanel        │  │ ActiveAgents     │   │
│  │ ProjectTree│ │ (MessageList +   │  │ WorkOrderBoard   │   │
│  │ GitStatus │  │  InputArea)      │  │ ToolCallBlock    │   │
│  └──────────┘  └──────────────────┘  │ TokenRing        │   │
│                                          │ LspStatusPanel   │   │
│                                          └──────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                 │  WebSocket (复用 protocol.ts 消息联合体)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Node Server  ——  WebIDEHostAdapter 在此进程内实例化           │
│                                                                 │
│  setHost(new WebIDEHostAdapter())   ← 唯一与 VSCode 不同的入口 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  核心层（与 VSCode 宿主 100% 相同，零改动）             │  │
│  │  AgentEngine · AgentPool · Scheduler · WorkOrderPool      │  │
│  │  AgentContextSystem · ToolRegistry · ContextManager       │  │
│  └──────────────────────────────────────────────────────────┘  │
│       │              │                │                         │
│       ▼              ▼                ▼                         │
│  WebIDEFS      WebIDEShell      WebIDEGit  (Node 原生实现)   │
│  WebIDEUI      WebIDEMessaging (WebSocket 桥接)               │
│  WebIDESandbox (目录克隆隔离，可选)                           │
└───────────────────────────────┬─────────────────────────────────┘
                                 ▼
                    服务器本地文件系统 / shell / git
```

**关键不变量：** 中间「核心层」方块与 VSCode 宿主完全一致，连 import 都不动。新增的只是下半部分的 `WebIDEHostAdapter` 实现 + 一个 WebSocket 传输层 + 浏览器前端。

---

## 2. 目录结构（新增内容）

```
web-ide/
├── server/                      # Node 后端（宿主 + 传输 + 引导）
│   ├── index.ts                # 引导：setHost()、实例化引擎/池、起 HTTP+WS
│   ├── host-adapter.ts        # WebIDEHostAdapter（实现 src/host/types.ts）
│   ├── transport.ts           # WebSocket ↔ HostMessaging 桥接
│   ├── fs.ts                  # WebIDEFS（Node fs/promises）
│   ├── shell.ts               # WebIDEShell（child_process）
│   ├── git.ts                 # WebIDEGit（simple-git 或 child git）
│   ├── ui.ts                  # WebIDEUI（showInfo→WS toast；QuickPick→请求/响应）
│   ├── sandbox.ts             # WebIDESandbox（目录克隆隔离，可选）
│   └── persistence.ts        # 模型档案/设置服务端持久化（.vte/ 目录）
├── client/                     # Vue3 + Vite 前端（三栏）
│   ├── index.html
│   ├── vite.config.ts         # 含 alias 复用 webview 组件
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue            # 三栏 grid 布局
│   │   ├── protocol.ts        # 直接复用 webview/src/protocol.ts
│   │   ├── ws.ts             # WebSocket 客户端封装
│   │   ├── components/
│   │   │   ├── ProjectManager.vue   # 左栏：项目列表 + 打开/切换
│   │   │   ├── ProjectTree.vue      # 左栏：文件树（新增）
│   │   │   ├── ChatPanel.vue        # 中栏壳，内嵌复用组件
│   │   │   ├── StatusPanel.vue      # 右栏壳，内嵌复用组件
│   │   │   └── ...（其余复用 webview/src/components/*）
│   │   └── theme.css         # 复用 webview/src/theme.css（c- 命名空间）
└── package.json               # 新增 dev/build 脚本
```

> **复用策略（v1）：** 通过 Vite `resolve.alias` 把 `webview/src/components` 与 `webview/src/theme.css` 直接映射到 `web-ide/client`。前端三栏大量 **直接 import 现有组件**（`MessageList`、`InputArea`、`ActiveAgents`、`WorkOrderBoard`、`ToolCallBlock`、`TokenRing`、`ToolLine`、`LspStatusPanel`、`ConfigPanel`、`ModelSelector`、`ModePanel`、`TaskModePanel`、`ReasoningPicker`、`SessionManager`、`DiffViewer`、`AppHeader` 等均已存在）。
>
> **未来（v2，本计划不涉及）：** 将这些组件抽离为独立的 `packages/ui`，让 VSCode 宿主与 Web IDE 宿主共享同一份组件库 npm 包 —— 这正是之前组件化改造的目的。

---

## 3. HostAdapter 实现细节（严格对齐 `src/host/types.ts`）

`WebIDEHostAdapter` 落在 `src/host/web-ide.ts`（与 `vscode.ts` 平级），它直接使用 Node 原生 API，**不含任何 `vscode` import**，因此仍是「host-agnostic」范畴（这里的 host 指的是 VSCode vs 纯 Node 进程）。

| 接口 | Web IDE 实现 | 说明 |
|------|--------------|------|
| `HostFileSystem` | `WebIDEFS` | Node `fs/promises` 实现 `readFile/writeFile/exists/stat/mkdir/readdir/delete`；`watch` 用 `chokidar`（可选） |
| `HostWorkspace` | `WebIDEWorkspace` | `getRoot()` 返回服务端当前打开的项目根；`getFolders()` 返回服务端配置的多项目根列表 |
| `HostUI` | `WebIDEUI` | `showInfo/Warning/Error` → 经 WS 发 `toast`；`showQuickPick/showInputBox/showOpenDialog/confirm` → 走「请求 id → 客户端弹窗 → `permissionResponse` 同款请求/响应模式」回传 |
| `HostMessaging` | `WebIDEMessaging` | 包裹一条 WebSocket：`postMessage` → `ws.send(JSON)`；`onMessage` → `ws.on('message')`。**单客户端 v1**：一个 server 实例服务一个浏览器会话 |
| `HostShell` | `WebIDEShell` | `child_process.exec` / `spawn`，支持 `cwd/timeout/env` |
| `HostGit` | `WebIDEGit` | `simple-git` 封装 `getBranch/getStatus/diff/log/revParse` |
| `HostLSP` | （可选 v1 省略） | 如需，用 `vscode-languageserver` 的 Node 实现桥接；v1 可先不实现，LSP 工具标记为不可用 |
| `HostSandbox` | `WebIDESandbox`（可选） | 用**目录克隆**（而非 git worktree）做隔离，兼容非 git 项目；不可用时优雅回退到共享根（与 `sandbox-git.ts` 同款降级逻辑） |

**权限流：** 核心层触发 `permissionRequest` → server 经 WS 转发 → 客户端弹 `ConfirmDialog`/`AuthorizationDialog`（复用）→ 用户决策 → `permissionResponse` 回传 → `pendingPermissionResolve` 继续引擎。

---

## 4. 后端运行循环（与 `src/vscode/panel.ts` 对齐）

`web-ide/server/index.ts` 是 VSCode `panel.ts` 的「纯 Node 等价物」：

1. `setHost(new WebIDEHostAdapter())`。
2. 收到 `chat` 消息 → 用活跃模型档案（`models[activeModelIndex]`）构建 `AgentEngine`（或复用 `AgentPool` 中的主 Agent）。
3. 把引擎事件**桥接成 `HostToWebviewMessage`** 经 WS 发出：
   - `engine.onViewUpdate` → `thinking` / `response` / `error` / `toast`
   - 工具调用 → `tool_call` / `tool_result`
   - token 统计 → `tokenStats`
   - 多 Agent 委派 → `multiAgent:delegationStart` / `delegationEnd`
4. 多 Agent 路径：复用 `AgentPool` / `Scheduler` / `WorkOrderPool`；`forceMultiAgent` 与 `subAgentTimeout` 来自 `persistence` 读出的配置。
5. 子 Agent 通过 `get_context` 工具（`src/agent/context-tool.ts`）按需检索 `AgentContextSystem` —— **不靠 prompt 注入传递上下文**，与 VSCode 宿主行为完全一致，正好在「第二宿主」下再次验证 token 节省设计。

> 复用 `webview/src/protocol.ts` 的 `WebviewToHostMessage` / `HostToWebviewMessage` 联合体作为 WS 载荷类型，前端与后端共享同一份类型定义。

---

## 5. 前端三栏详细设计

基座：CSS Grid 三列 + 可拖拽分隔条；主题走 `theme.css` 的 CSS 变量（同时支持亮/暗）。复用的组件统一走 `c-` 命名空间样式。

### 左栏 · 项目管理（ProjectManager + ProjectTree）
- **项目列表**：服务端配置的多个项目根（`getFolders` 扩展），支持「打开文件夹」「切换项目」「新增项目根」。
- **文件树 ProjectTree（新增组件）**：调用服务端 `fs:list` / `fs:read` WS 消息（需新增少量 `WebviewToHostMessage` 类型），渲染可折叠目录树；点击文件 → 在中栏或独立视图打开预览。
- **Git 状态条**：当前分支 + 改动数（复用 `git.ts` + 轻量展示组件）。
- 设计意图：左栏是「宿主能力的展示窗」，证明 Web 宿主同样能管理服务器侧项目。

### 中栏 · 主 Agent 对话（ChatPanel）
- 直接复用 `MessageList` + `InputArea`（含图片/上下文附件）+ `AgentConversation`。
- 模式/任务/推理控件复用 `ModePanel` / `TaskModePanel` / `ReasoningPicker`。
- 流式 `thinking` / `response` 渲染；`permissionRequest` 弹 `ConfirmDialog` / `AuthorizationDialog`（复用）。
- 会话管理复用 `SessionManager`（创建/切换/搜索/导出）。
- 配置入口复用 `ConfigPanel` + `ModelSelector`（模型档案、子 Agent 超时、强制多 Agent 委派）。

### 右栏 · 工具 / 子 Agent 状态（StatusPanel，opencode 风格）
这是「验证架构完整性」最直观的一栏 —— 把 agent 内部运作**可视化**，证明我们「省 token、强可观测」的设计主张：
- `ActiveAgents`：实时子 Agent 活动条（Dev/Test/Doc 等角色轮次）。
- `WorkOrderBoard`：委派任务看板（pending / running / done）。
- `ToolCallBlock` / `ToolLine`：工具调用 + 结果时间线（含耗时、截断标记）。
- `TokenRing` / `TokenStats`：token 与花费实时环形/统计。
- `LspStatusPanel`：若启用 LSP，展示语言服务调用统计。
- `DiffViewer`：最近一次改动 diff 预览。
- 右栏本质上是 `HostToWebviewMessage` 中工具/委派类事件的「实时仪表盘」。

---

## 6. 配置与持久化（保持 host-agnostic）

- 模型档案与设置**服务端持久化**到 `.vte/` 目录下的 JSON（形状与 VSCode 的 `models` / `activeModelIndex` / `subAgentTimeout` / `forceMultiAgent` 完全一致），由 `persistence.ts` 读写。
- **API Key 存服务端，不进浏览器**：浏览器只持有「当前活跃模型名」，凭证永远留在 Node 进程内存/`.vte/`，经 WS 不会泄露到前端 —— 比 VSCode 宿主更安全的模型。
- `ConfigPanel` / `ModelSelector` 直接复用，改动仅落在 `web-ide` 目录内。
- **不**向 `package.json` 的 `contributes.configuration` 加任何原生设置项（延续解耦原则）。

---

## 7. 工程化：构建与运行

`web-ide/package.json` 新增脚本（**不触碰根 `package.json` 的 VSCode contributes**）：

```jsonc
{
  "scripts": {
    "web-ide": "concurrently \"npm:web-ide:server\" \"npm:web-ide:client\"",
    "web-ide:server": "tsx watch web-ide/server/index.ts",
    "web-ide:client": "vite --config web-ide/client/vite.config.ts",
    "web-ide:build": "vite build --config web-ide/client/vite.config.ts && tsc -p web-ide/server/tsconfig.json"
  }
}
```

- 开发：`npm run web-ide` → Vite 跑在 `5173`，Node server（含 WS）跑在 `3000`，client 通过 `ws://localhost:3000` 连接。
- 构建：`web-ide:build` 产出静态前端 + 可运行的 Node server bundle。
- 根 `package.json` 可加便捷代理脚本，但**任何 `contributes.configuration` 原生设置项一律不加**。

---

## 8. 验收标准（Definition of Done）

- [ ] `npm run web-ide` 可启动服务端 + 客户端，浏览器打开三栏 IDE 界面。
- [ ] 能加载服务端项目、与主 Agent 对话、看到流式输出。
- [ ] 工具调用 / 子 Agent 活动实时出现在右栏（opencode 风格仪表盘）。
- [ ] `get_context` 在子 Agent 中可用，子 Agent **不重新整读项目**，上下文按需检索。
- [ ] 经 `ConfigPanel` 可切换/新增模型档案、调整子 Agent 超时与强制多 Agent。
- [ ] **核心层零改动**：`grep -rn "vscode" src/agent src/tools src/core src/context src/shared` 结果为空（仅 `src/vscode`、`src/host/vscode.ts` 允许）。
- [ ] shell / git 类工具在 Node 下正常工作；LSP 为可选（v1 可省）。
- [ ] API Key 仅存服务端，浏览器不可见。

---

## 9. 风险与取舍

| 风险 | 取舍 / 缓解 |
|------|--------------|
| 多客户端并发 | v1 单会话单 server 实例；多用户场景留待 `HostMessaging` 做 fan-out |
| LSP 在 Node 的桥接成本 | v1 可省略 `HostLSP`，右栏 `LspStatusPanel` 标记不可用 |
| 沙箱隔离 | 用目录克隆而非 git worktree，兼容非 git 项目；不可用时回退共享根 |
| 组件复用方式 | v1 用 Vite alias 直引 `webview/src/components`；v2 再抽 `packages/ui` |
| 服务端文件树需要新消息类型 | 在 `protocol.ts` 增 `fs:list` / `fs:read` / `fs:watch`，前端后端共享 |

---

## 10. 里程碑拆分

- **M1 脚手架**：`web-ide/server/index.ts` 起 Node + WS；前端三栏空壳；`setHost(new WebIDEHostAdapter())` 跑通最小 `chat` 回显。
- **M2 左栏**：`ProjectManager` + `ProjectTree`（新增 `fs:*` 消息）+ Git 状态。
- **M3 中栏**：复用 `MessageList`/`InputArea`/`ConfigPanel` 等，接通流式对话与配置。
- **M4 右栏**：复用 `ActiveAgents`/`WorkOrderBoard`/`ToolCallBlock`/`TokenRing` 等，接通工具/委派实时状态。
- **M5 配置与持久化**：`persistence.ts` 服务端存模型档案；密钥不出服务端。
- **M6 收尾验证**：跑通 DoD 全部勾选项；补一段 README「Planned Hosts / Web IDE」说明；确认核心层 grep 干净。

---

## 11. 一句话总结

> 给核心层配一个**纯 Node + 浏览器**的第二个宿主，三栏 IDE 界面，复用现有组件库 —— 如果它能在**不改核心一行代码**的前提下把 agent 完整跑起来，我们的 host-agnostic 架构就被实证了。
