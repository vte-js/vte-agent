Topic: VTE Agent — VSCode AI coding agent with fox avatar, tool calls, sessions, and image upload

# Project memory
_Durable project-level knowledge. Persists across all sessions in this project. Edit only content under italic instructions._

## Project context
_VTE Agent — VSCode extension providing an AI coding agent with a fox avatar, tool call display, per-message thinking, session management, image upload, context attachment (files/folders/docs/skills/terminal/git), built-in skills management, fine-grained permission control, and reasoning strength levels._

## Rules
_Hard constraints from user that every session must respect._

- **All popup/overlay panels must be extracted as independent .vue components** — no inline implementation in parent components. Data/icons in separate .ts files.
- **No emojis unless user requests them**
- **Build and verify after each change**
- **严禁使用 CSS Grid 布局** — 统一使用 flex + flex-wrap 实现响应式自适应。Grid 布局在项目中被禁止使用，flex 是唯一认可的布局方式。
- **配置面板/弹窗标题不要加 margin-bottom** — 标题样式只设置 font-size、font-weight、color，不加 margin。
- **权限控制仅在 Code 模式生效** — Plan 模式已限制为只读工具（read, search, list, grep, glob, diagnostics, git），权限检查是多余的。
- **Extension host 命令应直接调用 panel 方法** — 不要通过 `postMessage` 发送消息给 webview（webview 的 `onMessage` 只处理特定类型的 host→webview 消息）。正确做法：`provider.handleXxx()`。
- **弹出选择器统一使用居中模态框** — 不要用上下左右方向性弹出。ModelSelector 和 ReasoningPicker 都使用 Teleport to body + 固定居中遮罩。
- **viewTitle 菜单键名必须是 `"view/title"`** — 不是 `"viewTitle"`。VSCode 要求带斜杠的格式。

## Architecture decisions
_Major design choices with rationale. The "why" matters more than the "what" for future sessions._

- **Image upload flow is 5-layer**: InputArea.vue → App.vue → useChat.ts → useVsCode.ts (IPC) → panel.ts (extension host) → engine.ts (LLM). Images are read as base64 data URLs and passed through `postMessage` to the extension host.
- **Context attachment flow (updated)**: InputArea has @ menu → ContextMenu component → source selection (file/folder/doc/skills/terminal/git). Each source sends `requestContext` to extension host. Extension host processes (file picker, terminal output, git diff, etc.) and returns data to webview. For file/folder/doc: extension host reads content on send. For terminal: captures output via shell integration. For git: shows working changes or commit history picker. For skills: shows SkillsPicker. Context files appear as preview chips; on send, extension host enriches with file content and builds multimodal content for LLM.
- **`thinking` message triggers loading animation**: In `panel.ts`, `{type:'thinking'}` is sent to the webview after all setup (session + engine creation) but BEFORE the LLM call. If setup fails, no thinking message = no loading animation = chat appears stuck.
- **CheckpointBar removed — redundant with session management**: User confirmed that with full session management, the checkpoint/snapshot feature (ShadowGit-based workspace snapshots) is redundant. Entirely removed from UI (`CheckpointBar.vue` deleted) and backend (handlers and methods removed from `panel.ts`).
- **Global ConfirmDialog for all confirmations**: Use `ConfirmDialog.vue` component instead of browser `confirm()`. Three types (info/warning/danger), customizable props, z-index 10001. Applied in SkillsPanel (delete) and SessionManager (delete).
- **Toast for UI feedback**: UI operation feedback (create/save/delete success/errors) uses toast notifications (`{type:'toast'}`) with z-index max, not chat messages. Chat messages get hidden behind panel overlays.
- **Permission control system architecture**: Engine sends `permissionRequest` → webview shows `AuthorizationDialog.vue` → user responds with `permissionResponse` → engine resolves Promise. 8 categories (fileRead, fileWrite, terminal, git, diagnostics, web, task, checkpoint). Default: read-only ops = allow, write/execute ops = ask. Only active in code mode — plan mode already restricts to read-only tools.
- **Reasoning strength control (推理强度)**: Three levels — 低 (disable thinking, fast), 中 (enable thinking + standard prompt), 高 (enable thinking + low temp + deep analysis prompt). Implemented via `chat_template_kwargs: { enable_thinking }` parameter in API call. Level stored in ChatViewProvider and engine; set via `setReasoningLevel()` method.
- **viewTitle toolbar integration**: VSCode sidebar views can add buttons to the native title bar via `"view/title"` menu in package.json with `"when": "view == <viewId>"`. Panel views don't support this — use AppHeader buttons as fallback. CodeBuddy (Fitten Code) uses same approach: `"view/title"` with `when: "view == fittencode.chat"`.

### Input box layout specification (InputArea.vue)
```
.inp
  ┌─ .inp-outer ─────────────────────────────┐
  │  background: var(--vte-bg-alt)            │ ← gray bg, border-radius: 10px
  │  border: 1px solid var(--vte-input-border)│ ← focus: #6366f1
  │  padding: 6px                             │ ← breathing space
  │                                          │
  │  .inp-tool-top                           │ ← transparent, shows outer gray
  │    [📷] [📁] [/@]                        │ ← icon buttons (14x14 svg)
  │                                          │
  │  ┌─ .inp-inner ─────────────────────────┐│
  │  │  background: var(--vte-input-bg)     ││ ← own bg, border-radius: 8px
  │  │  [context chips / image preview]     ││
  │  │  <textarea>                          ││
  │  │  .inp-tool-bottom                    ││ ← transparent
  │  │    [ModelSelector] [⚡中▼]           ││ ← reasoning picker
  │  │    [spacer] [TokenRing] [Send/Stop]  ││
  │  └──────────────────────────────────────┘│
  └──────────────────────────────────────────┘
```

Rules for adding new toolbar actions:
- **"Add content" actions** (images, files, context) → `.inp-tool-top`, icon only via `.tool-btn`
- **"Config/send" actions** (model, reasoning, token, send) → `.inp-tool-bottom`
- Use `VTooltip` wrapper for hover labels, never inline text in `.tool-btn`
- All tool buttons: `padding: 4px 8px; border-radius: 6px; font-size: 11px`

## Discovered durable knowledge
_Cross-task facts that survive across sessions. Promoted from session checkpoints' §7 when proven durable._

- **Vue reactive proxies break `postMessage`**: `ref()` wrapped objects cannot be cloned by the structured clone algorithm. Always `JSON.parse(JSON.stringify(msg))` before calling `vscode.postMessage()` from webview code. This applies to ALL postMessage calls, not just image payloads.
- VSCode webview `onDidReceiveMessage` handler (panel.ts L135) is async but doesn't catch errors — unhandled promise rejections are silently swallowed, causing no response to be sent back to the webview. **Wrap the handler body in try/catch.**
- `AgentMessage.content` is typed as `string` (core/types.ts L106) but multimodal content is actually an array. The `as string` cast at agent/engine.ts L199 is fragile — any code path doing string operations on `content` will break.
- Image upload added in commit `aeacf37` ("feat: Session management, image upload, notification system").
- **Context file cards need dark overlay for contrast**: `rgba(0,0,0,0.2)` with `backdrop-filter: blur(4px)` works against any message bubble background. Light backgrounds (`rgba(255,255,255,0.04)`) blend with user message gradients and lose visual separation.
- **File type color coding via CSS cascade**: Default icon style first, then overrides per extension (`.ts` yellow, `.py` blue, `.json` green, `.md` purple, `.css` pink, `.html` orange). Easier to extend than per-type rules.
- **MessageBubble v-if must check context**: When user sends only context files (no text), the message bubble would be hidden if the v-if only checks `msg.text`. Always include `msg.context?.length` in the condition.
- **`showQuickPick` returns `QuickPickItem[]` not original type**: When using typed objects as quickpick items, the returned value doesn't preserve custom `.value` fields. Use `label` as identifier or map back to original type.
- **Vue watch empty string trap**: `watch(() => val, (v) => { if (v) ... })` fails when `v` is `""`. Check `v !== undefined` or use separate flag.
- **Terminal content via clipboard**: No VSCode API to read terminal output; `vscode.env.clipboard.readText()` is practical fallback — user Cmd+C first.
- **readDirRecursive safety limits**: Max 50 files, skip node_modules/.git/dist/build, skip binary >100KB. Prevents context explosion.
- **ID-based edit tracking**: `editingMessageId` ref is more reliable than text matching for edit/resend flow.
- **Context menu upward popup**: Input at bottom of screen; upward popup avoids clipping.
- **Responsive layout rules (all panels)**: Container: `width: 100%; max-width: Xpx; max-height: calc(100vh - 32px)`. All flex children: `min-width: 0; overflow: hidden; text-overflow: ellipsis`. Fixed elements: `flex-shrink: 0`. Scrollable areas: `flex: 1; min-height: 0; overflow-y: auto`. Forms: `flex-wrap: wrap`. Overlay padding: `16px`.
- **JavaScript duplicate object keys**: `{ type: 'gitSelect', type: 'commits' }` — second `type` overwrites first. Must use unique key names (e.g., `source`) when message has discriminator + category.
- **VSCode `Terminal.onDidWriteData` unavailable**: Only on `Pseudoterminal`, not on `Terminal`. Use Shell Integration API (`terminal.shellIntegration.executeCommand`) or clipboard fallback.
- **VSCode Shell Integration 1.93+**: `executeCommand()` returns `TerminalShellExecution` with `read()` yielding chunks. Falls back gracefully if unavailable.
- **Skills directories**: `.claude/skills`, `.agents/skills`, `.opencode/skills` — each subdirectory contains `SKILL.md`.
- **VSCode webview blocks `confirm()`/`alert()`/`prompt()`**: Sandboxed webviews don't support browser modal dialogs. Must use custom ConfirmDialog component. Error: "Ignored call to 'confirm()'. The document is sandboxed, and the 'allow-modals' keyword is not set."
- **Skills directory full paths required**: Server must send absolute paths (workspace root + relative) to webview for skill creation. Relative paths cause ENOENT errors.
- **SKILL.md standard format**: YAML frontmatter with `name`/`description` fields, or markdown `# Title` + first paragraph. Compatible with Claude Code, MiMo Code, OpenCode.
- **Built-in skills embedded as strings in `src/skills/builtin.ts`**: 9 coding skills (code-review, unit-test, refactor, debug, api-design, security-audit, database-design, performance, git-workflow). Loaded via `loadBuiltinSkills()`. Skills management panel (SkillsPanel.vue) shows both built-in and project skills, with create/edit/delete. Built-in skills are read-only (no delete button).
- **Slash commands pattern**: Input `val === '/'` triggers panel; must close on `!val.startsWith('/')`. Same for `@` → context picker.
- **`<script setup>` cannot export**: ES module exports forbidden in `<script setup>`. Use separate `.ts` files for shared constants/types.
- **SlashCommand positioning**: Remove Teleport, place inside `.inp-tool-top` (has `position: relative`), use `position: absolute; bottom: 100%`.
- **`clickOutside` with textarea**: Use `mousedown` event, check `target.tagName === 'TEXTAREA'` directly.
- **VSCode `view/title` menu format**: The correct key is `"view/title"` (with slash), NOT `"viewTitle"` (camelCase). The `"when"` condition uses `"view == <viewId>"` format. Buttons appear only in sidebar views, not panel views.
- **Extension host command → webview communication**: Host-to-webview messages have limited handling. For actions like session:create, clear, the extension host should call panel methods directly (e.g., `provider.handleNewSession()`) rather than posting messages that the webview's `onMessage` doesn't handle.
- **App.vue state must come from composable**: When a composable (useConfig) manages state (configVisible), the parent component must use the composable's ref — never define a local copy that diverges.
- **Picker popup design pattern**: Use Teleport to body + centered modal overlay for all picker/dropdown components (ModelSelector, ReasoningPicker). Avoid directional popups (up/down/left/right) that can be clipped.

### Discovered
(none)

### Dead ends
(none)
