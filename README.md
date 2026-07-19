# VTE Agent

Pluggable-host AI coding agent with fine-grained permission control, a token-efficient multi-agent engine, and a framework-agnostic core.

[中文文档](README_CN.md)

## Features

- **Multi-model** — GPT-4o, Claude, DeepSeek, Qwen, MiMo
- **Pluggable architecture** — HostAdapter for VSCode, Web, CLI, Electron, JetBrains (zero VSCode coupling in the core)
- **Token-efficient multi-agent engine** — PM decomposes a request into role-specific work orders, sub-agents run in parallel, results synthesize back. Context is fetched *on demand* via a `get_context` tool instead of being injected into every prompt — no N-copy token waste
- **Per-agent LLM config** — each sub-agent can carry its own provider / model / thinking style / reasoning level
- **Sandbox isolation** — git-worktree isolation for write agents; shared working dir fallback for non-git / non-Node hosts
- **Shared context** — read-only aggregate of completed work orders, retrievable by sibling agents
- **Context attachment** — Files, folders, documents, Skills, terminal, Git
- **Session management** — Create, restore, rename, search, import/export
- **Task tracking** — Real-time task progress with status updates
- **Checkpoint system** — Save/restore code state with diff view
- **Built-in skills** — 9 coding skills via `/` slash commands
- **Question tool** — LLM asks structured questions, user selects options
- **Tab to accept** — LLM suggests next action, Tab auto-fills input
- **Real-time tool calls** — Each tool call appears inline as it executes
- **Per-turn thinking** — Collapsible thinking per LLM iteration
- **Side-by-side diff** — Left/right comparison on wide screens
- **Dynamic placeholder** — Input hint updates based on LLM suggestions
- **Fine-grained permissions** — Allow/ask/deny per tool category
- **Reasoning levels** — Low / Medium / High

## Architecture

The core (`src/core`, `src/agent`, `src/tools`, `src/context`, `src/shared`) is **framework-agnostic** — it imports nothing from `vscode`. All host bindings live exclusively under `src/vscode/` (the VSCode host adapter). Swapping hosts means writing a new adapter, not touching the engine.

```
src/
├── core/          # Framework-agnostic types, registry, permissions
├── host/          # HostAdapter interface + implementations
│   ├── types.ts   # HostAdapter, HostFileSystem, HostUI, HostMessaging
│   ├── vscode.ts  # VSCode adapter   ← only place that imports 'vscode'
│   └── registry.ts
├── agent/         # Engine, agent pool, scheduler, context system
│   ├── engine.ts          # Single-agent LLM engine (host-agnostic)
│   ├── agent-pool.ts      # Role-based sub-agent lifecycle + PM decompose
│   ├── scheduler.ts       # Parallel / pool / pipeline scheduling
│   ├── context-system.ts  # Singleton context authority (get_context source)
│   ├── context-tool.ts    # get_context tool — on-demand, token-efficient
│   └── shared-context.ts  # Read-only cross-agent result aggregate
├── tools/         # file, bash, git, search, question, get_context...
├── context/       # Project indexing, file reading
├── skills/        # Built-in skill definitions
└── vscode/        # VSCode extension, panel, LSP  ← host layer only

webview/src/
├── composables/   # useHost, useChat, useConfig
├── components/    # MessageBubble, ToolCallBlock, DiffViewer, QuestionDialog,
│                   # NumberInput, Toggle, ...  (shared component library)
├── theme.css      # --vte-* design tokens + `c-` component styles
└── protocol.ts    # Message types (webview ↔ host), host-agnostic
```

### HostAdapter

```typescript
interface HostAdapter {
  fs: HostFileSystem       // File I/O
  workspace: HostWorkspace  // Workspace info
  ui: HostUI               // Dialogs, pickers, toast
  messaging: HostMessaging  // postMessage communication
  shell?: HostShell         // Command execution
  lsp?: HostLSP            // Language server protocol
  lspTools?: ToolDefinition[]
}
```

Implement `HostAdapter` + call `setHost()`. Tools use `getHost()` with Node.js fallback.

## Multi-Agent Engine

A single chat message can be routed (or forced) into the multi-agent pipeline:

1. **PM (project manager)** agent decomposes the request into role-specific work orders (developer / tester / reviewer / documenter). It has *no* write tools — only `get_context` to inspect project structure.
2. The **scheduler** assigns orders to idle role agents. Roles have concurrency caps (pm:1, dev:3, test:2, review:1, doc:1) so capable roles genuinely run in parallel.
3. Each sub-agent executes its order and reports back. Completed output is aggregated into the shared context.
4. When all terminal orders finish (or a safety timeout fires), results synthesize back to the main chat.

### Token efficiency — the core design rule

Traditional multi-agent GUIs inject the full project context into *every* sub-agent prompt. With N parallel agents that's N copies of the context — pure token waste.

VTE does **not** do that. There is a single, process-level `AgentContextSystem` that is the *only* authority for project context (structure, files the main agent read, shared sibling output). Sub-agents receive a *small* prompt that tells them to call the `get_context` tool **on demand**:

- `get_context({ topic: "structure" })` → top-level layout summary (default, cheapest)
- `get_context({ topic: "read_files" })` → files the main agent already read
- `get_context({ topic: "shared" })` → output from sibling agents that already finished
- `get_context({ topic: "full" })` → complete index, only when necessary

This keeps per-agent prompts tiny and mirrors the opencode / TUI philosophy: **help the developer save tokens, not burn them.**

## Configuration

All runtime configuration lives in the **in-app ConfigPanel** (open via the settings icon), *not* in the host's native settings UI. The ConfigPanel is a host-agnostic UI driven by the `webview ↔ host` protocol, so it works identically on VSCode, Web, CLI, etc.

Configurable items include: API key / base URL / model (multi-profile), **sub-agent timeout (seconds)**, **force multi-agent delegation**, reasoning level, task mode, and per-category permissions.

> Note: the VSCode host persists config into its own storage backend internally; the webview never reads or writes native settings directly.

## Webview Component Conventions

To stay host-portable and theme-adaptive, the webview uses **self-owned components** — never native HTML controls:

- Reusable controls live in `webview/src/components/` (e.g. `NumberInput.vue`, `Toggle.vue`) and carry **no inline `<style>`**.
- Shared styles live in `webview/src/theme.css` under the `c-` namespace (e.g. `.c-num-input`, `.c-toggle`), driven by `--vte-*` design tokens.
- This lets the entire `c-` style block + `components/` directory be lifted into a standalone "code-agent framework" component library with zero changes.

## Built-in Skills

| Skill | Description |
|-------|-------------|
| code-review | Code quality, bugs, security, performance |
| unit-test | Unit tests with edge cases |
| refactor | SOLID principles refactoring |
| debug | Systematic debugging |
| api-design | RESTful API patterns |
| security-audit | OWASP Top 10 checks |
| database-design | Schema and query optimization |
| performance | Performance analysis |
| git-workflow | Git best practices |

## Development

```bash
npm install && cd webview && npm install
npm run compile && cd .. && npm run build:webview
npm run watch          # Watch mode
# Press F5 in VS Code to run
```

Build outputs:
- Extension: `out/vscode/panel.js` (via `tsc`)
- Webview: `out/webview/index.html` (via `vite` single-file build — all JS/CSS inlined)

## Planned / In-Progress Hosts

The agent core is host-agnostic — it talks to the outside world only through
`HostAdapter` (`src/host/types.ts`). VSCode is the first host; a **Web IDE host**
is the second host, built to prove the abstraction holds end-to-end
(a pure-Node process running the same core, instead of the VSCode extension host).

- Design: three-pane IDE (left = project management, middle = main-agent chat,
  right = opencode-style tool/agent status), a Node + WebSocket backend running
  the same `AgentEngine`/`AgentPool`/`AgentContextSystem`, and a Vue3 client
  reusing the existing webview component library (`webview/src/theme.css`, `c-` namespace).
- Full plan: [`docs/web-ide-host-plan.md`](docs/web-ide-host-plan.md).
- Status: **M1–M5 complete and verified** (`web-ide/`). The `WebIDEHostAdapter`
  (`web-ide/server/host-adapter.ts`) is a pure-Node `HostAdapter` with **zero
  `vscode` imports**; the backend boots, the three-pane client builds, and all
  milestones pass:
  - **M1** — scaffold + mock chat streaming ✅
  - **M2** — left-panel file tree (`fs:list`/`fs:read`) + live Git status ✅
  - **M3** — center panel reuses webview `MessageList`/`InputArea`/`ActiveAgents` ✅
  - **M4** — right panel reuses `AgentDashboard`/`WorkOrderBoard`/`TokenStats` ✅
  - **M5** — server-side config persistence (`.vte/config.json`); API keys never
    leave the server — browser receives masked `'***'` ✅
  - **M6** — DoD verified: core-layer `grep vscode` clean, shell/git tools work
    in Node, multi-agent dashboard wired end-to-end ✅
  Run it:
  ```bash
  cd web-ide
  npm install                 # installs ws / tsx / vite / vue locally
  VTE_MOCK=1 npm run dev      # server :3000 (ws /ws) + client :5173
  # or, for a real model:
  VTE_API_KEY=... VTE_MODEL=gpt-4o-mini npm run dev
  # build & serve from the Node server:
  npm run build && VTE_MOCK=1 npm run start   # open http://localhost:3000
  ```

## License

MIT
