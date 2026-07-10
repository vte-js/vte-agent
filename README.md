# VTE Agent

AI coding agent for VS Code with fox avatar, context-aware assistance, and fine-grained permission control.

## Features

- **Multi-model support** — Switch between GPT-4o, Claude, DeepSeek, Qwen and more
- **Context attachment** — Add files, folders, documents, skills, terminal output, or Git changes as context
- **Built-in skills** — 9 coding skills: code review, unit tests, refactoring, debugging, API design, security audit, database design, performance optimization, Git workflow
- **Permission control** — Fine-grained tool permissions (allow/ask/deny) per category, with real-time authorization dialogs
- **Reasoning levels** — Low (fast), Medium (balanced), High (deep thinking) with differentiated behavior
- **Slash commands** — Type `/` for quick skill access, `@` for context attachment
- **Session management** — Create, restore, rename, and search sessions
- **Image upload** — Attach images for visual context
- **Thinking display** — Collapsible thinking process with token tracking

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "VTE Agent"
4. Click Install

Or install from VSIX:
```bash
code --install-extension vte-agent-0.0.1.vsix
```

## Quick Start

1. Open the VTE Agent sidebar from the Activity Bar
2. Click the settings button (⚙️) or run `VTE Agent: Open Chat`
3. Configure your API key and model
4. Start chatting!

## Usage

### Keyboard Shortcuts
- `/` — Open slash commands (quick skill access)
- `@` — Open context attachment menu
- `Enter` — Send message
- `Shift+Enter` — New line

### Context Types
- **File** — Select project code files
- **Folder** — Recursively read directory contents
- **Document** — Markdown, TXT, and other document files
- **Skills** — Agent skill definitions (built-in + project)
- **Terminal** — Capture terminal output via Shell Integration
- **Git** — Working tree changes or recent commit history

### Reasoning Levels
- **Low** — Disable thinking, fastest response
- **Medium** — Standard thinking, balanced speed and quality
- **High** — Deep thinking with lower temperature for focused reasoning

### Permission Control
Configure per-category permissions in Settings:
- File Read / Write
- Terminal execution
- Git operations
- Diagnostics
- Web requests
- Tasks / Checkpoints

## Configuration

Open Settings (`Cmd+,`) and search for "VTE Agent" to configure:
- API Key
- API Base URL
- Model name

Or click the settings button (⚙️) in the sidebar title bar.

## Built-in Skills

| Skill | Description |
|-------|-------------|
| code-review | Code quality, bugs, security, performance review |
| unit-test | Generate unit tests with edge cases |
| refactor | Code refactoring following SOLID principles |
| debug | Systematic debugging and root cause analysis |
| api-design | RESTful API design patterns |
| security-audit | OWASP Top 10 security checks |
| database-design | Schema design and query optimization |
| performance | Performance analysis and optimization |
| git-workflow | Git best practices and commit conventions |

## Development

```bash
# Install dependencies
npm install
cd webview && npm install

# Build
npm run compile && cd webview && npx vite build

# Watch mode
npm run watch

# Run extension
Press F5 in VS Code
```

## License

MIT License - see [LICENSE](LICENSE) for details.
