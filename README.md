# VTE Agent

Pluggable-host AI coding agent with fine-grained permission control.

[中文文档](README_CN.md)

## Features

- **Multi-model** — GPT-4o, Claude, DeepSeek, Qwen, MiMo
- **Pluggable architecture** — HostAdapter for VSCode, Web, CLI, Electron, JetBrains
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

```
src/
├── core/          # Framework-agnostic types, registry, permissions
├── host/          # HostAdapter interface + implementations
│   ├── types.ts   # HostAdapter, HostFileSystem, HostUI, HostMessaging
│   ├── vscode.ts  # VSCode adapter
│   └── registry.ts
├── agent/         # Engine, tools, sessions
├── tools/         # file, bash, git, search, question...
├── context/       # Project indexing, file reading
├── skills/        # Built-in skill definitions
└── vscode/        # VSCode extension, panel, LSP

webview/src/
├── composables/   # useHost, useChat, useConfig
├── components/    # MessageBubble, ToolCallBlock, DiffViewer, QuestionDialog
└── protocol.ts    # Message types (webview ↔ host)
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

## Installation

```bash
# VSCode Marketplace
code --install-extension vte-agent-0.0.1.vsix
```

## Quick Start

1. Open VTE Agent from Activity Bar or Status Bar
2. Configure API key and model
3. Start chatting

## Usage

| Key | Action |
|-----|--------|
| `/` | Slash commands |
| `@` | Context attachment |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Tab` | Accept LLM suggestion |

### Context Types
File / Folder / Document / Skills / Terminal / Git

### Permissions
Configure per category: file read/write, terminal, git, diagnostics, web, tasks, checkpoints.

## Configuration

`Cmd+,` → "VTE Agent": API Key, Base URL, Model, Permissions, Reasoning level, Task mode.

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

## License

MIT
