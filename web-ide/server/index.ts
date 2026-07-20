/**
 * Web IDE host — server entry point (the "panel.ts equivalent" for Node).
 *
 * This file is the ONLY place that wires the agent engine to a host.
 * Everything below `setHost(...)` is the SAME core that the VSCode
 * extension runs — we do NOT modify the core to make this work.
 *
 * Run:  VTE_API_KEY=... VTE_MODEL=... npx tsx server/index.ts
 *   (optionally VTE_MOCK=1 to stream a fake reply without a real API)
 *
 * Protocol note (mirrors src/vscode/panel.ts onViewUpdate):
 *   - Engine produces ViewUpdate objects; we forward them RAW to the
 *     client (no {type:'update', update} envelope).
 *   - The only transform: `thinking_start` → also emit `{type:'thinking'}`
 *     so useChat() creates a fresh streaming message per turn.
 *   - multiAgent:* messages are pushed as top-level types.
 */

import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { WebSocketServer, WebSocket } from 'ws'

import { setHost } from '../../src/host/registry'
import { AgentEngine } from '../../src/agent/engine'
import { VTEContextManager } from '../../src/context/manager'
import { AgentPool } from '../../src/agent/agent-pool'
import { WorkOrderPool } from '../../src/agent/work-order'
import { AgentCommunication } from '../../src/agent/agent-communication'
import { Scheduler, ScheduleConfig } from '../../src/agent/scheduler'
import { BUILTIN_ROLES } from '../../src/agent/agent-role'
import { SessionManager } from '../../src/agent/session-manager'
import { WebIDEHostAdapter, WebIDEGit } from './host-adapter'
import { ConfigPersistence, type PersistedConfig } from './persistence'
import { WorkspaceManager, WorkspaceEntry } from './workspace-manager'
import { type ChatHistoryPayload } from '../../src/agent/history-store'
import { loadBuiltinSkills, getBuiltinSkillContent } from '../../src/skills/builtin'

const PORT = Number(process.env.VTE_PORT || 3000)
const INITIAL_WORKSPACE = process.env.VTE_WORKSPACE || process.cwd()
const API_KEY = process.env.VTE_API_KEY || ''
const API_BASE = process.env.VTE_API_BASE || 'https://api.openai.com/v1'
const MODEL = process.env.VTE_MODEL || 'gpt-4o-mini'
const MOCK = process.env.VTE_MOCK === '1'

// Host-global default model config, stored at ~/.vte-web-ide/config.json
// (alongside the workspace registry). Shared/inherited by EVERY workspace so
// the user only configures models ONCE — switching to a fresh workspace
// no longer loses the API key / model selection.
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.vte-web-ide')
const globalPersistence = new ConfigPersistence(GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_DIR)

// Mutable current workspace (changes when the user switches)
let currentWorkspace = INITIAL_WORKSPACE

// Module-level refs assigned in main()
let adapter: WebIDEHostAdapter
let engine: AgentEngine

// Multi-agent system (lazy-init on first multiAgent:* message)
let agentPool: AgentPool
let workOrderPool: WorkOrderPool
let agentCommunication: AgentCommunication
let scheduler: Scheduler

// Config persistence (model profiles, subAgentTimeout, etc.)
let persistence: ConfigPersistence

// Conversation-session store (multi-session, host-agnostic core).
// One SessionManager per active workspace root (rebuilt on switch).
let sessionManager: SessionManager
// The session the live chat is currently bound to.
let currentSessionId: string | null = null

// ── VTE Stage: pending write tracking (captures "before" at tool_call,
// emits "after" at tool_result so the client can render a before→after diff) ──
const pendingWrites = new Map<string, { path: string; before: string }>()
function resolveWsPath(p: string): string {
  if (!p) return ''
  return path.resolve(currentWorkspace, p)
}

// Global workspace registry (~/.vte-web-ide/workspaces.json)
const workspaceManager = new WorkspaceManager()

function post(msg: any): void {
  adapter.messaging.postMessage(msg)
}

/** List a directory and push the result to the client (refreshes a tree branch). */
async function listDirAndPost(dirPath: string): Promise<void> {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const items = entries
    .filter((e) => e.name !== 'node_modules' && e.name !== '.git')
    .map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      type: e.isDirectory() ? 'directory' : 'file',
      ext: e.isFile() ? path.extname(e.name).slice(1) : '',
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  post({ type: 'fs:listResult', path: dirPath, items })
}

/**
 * Resolve the effective model config with a 3-tier precedence:
 *   1. Per-workspace override  — `<workspace>/.vte/config.json` (if it has models)
 *   2. Host-global default     — `~/.vte-web-ide/config.json` (INHERITED by all workspaces)
 *   3. Environment fallback   — seed from VTE_API_KEY/MODEL into the GLOBAL default
 *
 * The global default is what makes model config persist across workspace switches:
 * once the user saves a model in ANY workspace, every fresh workspace inherits it.
 */
async function resolveConfig(): Promise<PersistedConfig> {
  const local = await persistence.load()
  if (local.models.length > 0) {
    // Migrate a legacy per-workspace config into the global default on first
    // run, so it also becomes the inherited config for other workspaces.
    const g = await globalPersistence.load()
    if (g.models.length === 0) {
      await globalPersistence.save(local)
    }
    return local
  }

  const g = await globalPersistence.load()
  if (g.models.length > 0) return g

  // Nothing configured anywhere yet — seed the GLOBAL default from env vars.
  const seeded: PersistedConfig = {
    models: API_KEY
      ? [{ name: MODEL, apiKey: API_KEY, apiBase: API_BASE, model: MODEL }]
      : [],
    activeModelIndex: 0,
    subAgentTimeout: 300,
    forceMultiAgent: false,
    reasoningLevel: 'medium',
  }
  await globalPersistence.save(seeded)
  return seeded
}

/**
 * Return the persistence instance that `resolveConfig()` actually READS from.
 * `resolveConfig` prefers a per-workspace override (a workspace that has its
 * own `.vte/config.json` with models) and falls back to the host-global
 * default. Any WRITE (saveModels / switchModel / setReasoningLevel) MUST
 * target the SAME instance, otherwise an added/edited model is written to the
 * global file while `resolveConfig` keeps returning the workspace-local copy —
 * making the save appear to "do nothing" (the exact bug reported for adding
 * a model). Keeping read and write targets identical fixes that for good.
 */
async function activeConfigPersistence(): Promise<ConfigPersistence> {
  const local = await persistence.load()
  if (local.models.length > 0) return persistence
  return globalPersistence
}

async function configData() {
  const c = await resolveConfig()
  return {
    type: 'configData',
    workspace: currentWorkspace,
    models: c.models.map((m) => ({ ...m, apiKey: m.apiKey ? '***' : '' })),
    activeModelIndex: c.activeModelIndex,
    subAgentTimeout: c.subAgentTimeout,
    forceMultiAgent: c.forceMultiAgent,
    reasoningLevel: c.reasoningLevel,
    mode: c.mode,
    taskMode: c.taskMode,
    temperature: c.temperature,
    topP: c.topP,
    maxTokens: c.maxTokens,
  }
}

// ── Conversation-session restore (multi-session, per-workspace) ──
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Active model name for session metadata / auto-save. */
async function activeModelName(): Promise<string> {
  try {
    const c = await resolveConfig()
    return c.models[c.activeModelIndex]?.model || MODEL
  } catch {
    return MODEL
  }
}

/**
 * Rebuild engine.messages from stored user/assistant turns so the LLM keeps
 * the right context, then push the raw messages to the client (useChat maps
 * them into its `messages` ref via the `chatHistory` message type).
 */
function bindSessionToEngine(messages: any[]): void {
  const engineMessages = messages
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && (m.text || m.content))
    .map((m: any) => ({ role: m.role, content: m.text || m.content }))
  ;(engine as any).messages = engineMessages
}

/**
 * Load the active (or most-recently-updated) session for the current
 * workspace and push it to the client. If none exists, posts `cleared`
 * so the client shows the welcome screen.
 */
async function restoreActiveSession(): Promise<void> {
  let activeId = sessionManager.getActiveSessionId()
  if (!activeId) {
    const list = await sessionManager.listSessions()
    if (list.length > 0) {
      activeId = [...list].sort((a, b) => b.updatedAt - a.updatedAt)[0].id
    }
  }
  if (!activeId) {
    post({ type: 'cleared' })
    return
  }
  const data = await sessionManager.getSession(activeId)
  currentSessionId = activeId
  sessionManager.setActiveSessionId(activeId)
  if (!data || data.messages.length === 0) {
    post({ type: 'cleared' })
    return
  }
  bindSessionToEngine(data.messages)
  post({ type: 'session:restored', sessionId: activeId })
  post({ type: 'chatHistory', messages: data.messages })
  console.log(`[web-ide] restored session ${activeId} (${data.messages.length} msgs) for ${currentWorkspace}`)
}

/** Explicit restore triggered from the session panel. */
async function restoreSessionById(id: string): Promise<void> {
  const data = await sessionManager.getSession(id)
  if (!data) {
    post({ type: 'session:error', text: '会话不存在' })
    return
  }
  bindSessionToEngine(data.messages)
  currentSessionId = id
  sessionManager.setActiveSessionId(id)
  post({ type: 'session:restored', sessionId: id })
  post({ type: 'chatHistory', messages: data.messages })
  console.log(`[web-ide] session ${id} restored into chat`)
}

/**
 * Forward an engine ViewUpdate to the client.
 *
 * Mirrors panel.ts onViewUpdate: emit a `thinking` message (for useChat to
 * open a new streaming bubble) when a thinking phase starts, then forward
 * the RAW update. Never wrap in {type:'update', update} — useChat expects
 * top-level message types.
 */
function emitUpdate(update: any): void {
  if (update.type === 'thinking_start') {
    post({ type: 'thinking' })
  } else if (update.type === 'permission_request') {
    post({
      type: 'permissionRequest',
      requestId: update.requestId,
      toolName: update.toolName,
      toolArgs: update.toolArgs,
      category: update.category,
    })
  } else if (update.type === 'question_request') {
    console.log(`[VTE-DIAG] → questionRequest emitted: id=${update.requestId} q="${(update.question || '').substring(0, 40)}" step=${update.stepCurrent ?? 1}/${update.stepTotal ?? 1}`)
    post({
      type: 'questionRequest',
      requestId: update.requestId,
      question: update.question,
      options: update.options,
      multiple: update.multiple,
      recommended: update.recommended,
      // Multi-step
      stepCurrent: update.stepCurrent ?? 1,
      stepTotal: update.stepTotal ?? 1,
      steps: update.steps ?? [],
      stepAnswers: (update as any).stepAnswers ?? [],
    })
  }
  // ── VTE Stage: derive file-touch events from tool calls ──
  if (update.type === 'tool_call') deriveStageFileTouch(update)
  else if (update.type === 'tool_result') flushStageFileWrite(update)

  // Forward the RAW update (useChat/useMultiAgent consume top-level types).
  post(update)
}

// ── VTE Stage: file-touch derivation (host-layer only, never the core) ──
function deriveStageFileTouch(u: any): void {
  const name = u.name as string
  const args = (u.arguments as Record<string, unknown>) || {}
  if (name === 'read') {
    const p = resolveWsPath(String(args.path || ''))
    if (p) post({ type: 'stage:file_touch', ts: Date.now(), agentId: 'main', path: p, op: 'read' })
    return
  }
  if (name === 'write' || name === 'edit') {
    const p = resolveWsPath(String(args.path || ''))
    if (!p) return
    console.log(`[VTE-Stage-Server] deriveStageFileTouch: name=${name}, args.path=${args.path}, resolved=${p}`)
    // ① Immediately signal "modifying" so the file tree shows a live spinner.
    //    Do NOT send stage:file_touch yet — that would immediately overwrite the
    //    spinner with a highlight.  We defer touch until tool_result arrives so
    //    the user actually sees the "modifying" state (especially important for
    //    fast sub-100ms edits where otherwise the flash is imperceptible).
    post({ type: 'stage:file_modifying', ts: Date.now(), agentId: 'main', path: p, op: name === 'write' ? 'write' : 'edit' })
    // Read the CURRENT file content now (before the tool executes) so we
    // have a real "before" to diff against once the write lands.
    let before = ''
    try { before = fs.readFileSync(p, 'utf-8') } catch { /* new file: nothing to diff against */ }
    console.log(`[VTE-Stage-Server] before content read: ${before.length} chars for ${p}`)
    pendingWrites.set(u.toolCallId, { path: p, before })
  }
  // 'list' and other tools do not touch a single highlightable file.
}

function flushStageFileWrite(u: any): void {
  const pending = pendingWrites.get(u.toolCallId)
  if (!pending) {
    console.log(`[VTE-Stage-Server] flushStageFileWrite: no pending write for toolCallId=${u.toolCallId}, skipping`)
    return
  }
  pendingWrites.delete(u.toolCallId)
  // The file has now been written — read it back as the "after".
  let after = ''
  try { after = fs.readFileSync(pending.path, 'utf-8') } catch { /* removed right after write */ }
  console.log(`[VTE-Stage-Server] flushStageFileWrite: path=${pending.path}, before=${pending.before.length} chars, after=${after.length} chars`)
  // Send touch NOW (not in deriveStageFileTouch) so "modifying" has time to show.
  post({ type: 'stage:file_touch', ts: Date.now(), agentId: 'main', path: pending.path, op: 'write' })
  // Send diff data for Monaco dock.
  post({
    type: 'stage:file_write_done',
    ts: Date.now(),
    agentId: 'main',
    path: pending.path,
    before: pending.before,
    after,
  })
}

/** Stream a canned reply so the full UI path (thinking→stream→response)
 *  can be verified without a real API key. Gated by VTE_MOCK=1. */
async function mockStream(text: string): Promise<void> {
  // Mirror the real engine's event order so the UI state machine is identical.
  post({ type: 'thinking' })
  const reply =
    `（Mock 模式）你说了：${text}\n` +
    `这是最小回显，用于验证 Web IDE 宿主链路 —— 无需真实 API。\n` +
    `设置 VTE_MOCK=0 并配置 VTE_API_KEY / VTE_MODEL 即可接入真实模型。`
  // Simulate a short "thinking" phase so the thinking block renders.
  post({ type: 'thinking_chunk', text: '正在思考你的请求…' })
  for (const ch of reply) {
    post({ type: 'stream_chunk', text: ch })
    await new Promise((r) => setTimeout(r, 6))
  }
  post({ type: 'response', text: reply })
}

async function handleChat(text: string, temperature = 0.7, topP = 1, maxTokens = 4096, regenerateFromUserIndex?: number): Promise<void> {
  try {
    // forceMultiAgent is the master switch: when ON, every chat goes through
    // the PM decomposition flow (mirrors panel.ts handleChat's behaviour).
    // Read from resolveConfig() (workspace-preferred, global fallback) so it
    // stays consistent with where saveModels() now writes it.
    const forceMA = (await resolveConfig()).forceMultiAgent
    if (forceMA) {
      post({ type: 'multiAgent:delegationStart', request: text })
      await handleDecomposeRequest(text)
      post({ type: 'multiAgent:delegationEnd' })
      return
    }
    if (MOCK) {
      await mockStream(text)
      return
    }
    // Editing a past message → branch from that point: drop it and everything
    // after, then re-send the (updated) text as the new turn at that position.
    if (typeof regenerateFromUserIndex === 'number' && regenerateFromUserIndex >= 0) {
      (engine as any).truncateHistoryAfterUserIndex?.(regenerateFromUserIndex)
    }
    const final = await engine.chat(text, temperature, topP, maxTokens)
    post({ type: 'response', text: final })
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error('[web-ide] chat error:', msg)
    post({ type: 'error', text: msg })
  }
}

// ── Multi-agent system ──

function initMultiAgent(): void {
  if (agentPool) return // Already initialized

  workOrderPool = new WorkOrderPool()
  agentCommunication = new AgentCommunication()
  agentPool = new AgentPool(adapter, workOrderPool, agentCommunication)

  const scheduleConfig: ScheduleConfig = {
    mode: 'pool',
    maxConcurrent: 5,
    autoAssign: true,
  }
  scheduler = new Scheduler(agentPool, workOrderPool, scheduleConfig)

  // Forward agent updates to webview
  agentPool.onAgentUpdate = (agentId, update) => {
    post({ type: 'multiAgent:agentUpdate', agentId, update })
    pushAgentStatuses()
  }
  // Auto-provisioned agents (spawned by the scheduler for parallelism)
  // need to show up in the dashboard immediately.
  agentPool.onAgentCreated = () => pushAgentStatuses()

  // Forward work order events to webview
  workOrderPool.onEvent(() => pushWorkOrders())

  // Forward communication messages to webview
  agentCommunication.onBroadcast((msg) => {
    post({
      type: 'multiAgent:agentMessage',
      agentId: msg.from,
      message: {
        id: Date.now(),
        role: 'system',
        text: `[${msg.from}] ${msg.type}: ${msg.content}`,
        timestamp: msg.timestamp,
      },
    })
  })

  console.log('[web-ide] multi-agent system initialized')
}

function pushAgentStatuses(): void {
  if (!agentPool) return
  post({ type: 'multiAgent:agents', agents: agentPool.getAgentStatuses() })
}

function pushWorkOrders(): void {
  if (!workOrderPool) return
  const orders = workOrderPool.getAll().map((o) => ({
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status,
    priority: o.priority,
    requiredRole: o.requiredRole,
    assignedAgentId: o.assignedAgentId,
    result: o.result,
    error: o.error,
    createdAt: o.createdAt,
  }))
  post({ type: 'multiAgent:workOrders', orders })
}

function getActiveCredentials() {
  return { model: MODEL, apiKey: API_KEY, apiBase: API_BASE }
}

function handleCreateAgent(
  roleId: string,
  model?: string,
  apiKey?: string,
  apiBase?: string,
  api?: string,
  thinkingStyle?: string,
  reasoningLevel?: string,
  isolation?: string,
): void {
  initMultiAgent()
  const role = BUILTIN_ROLES.find((r) => r.id === roleId)
  if (!role) {
    post({ type: 'error', text: `Unknown role: ${roleId}` })
    return
  }

  const creds = getActiveCredentials()
  const agent = agentPool.createAgent(role, {
    model: model || creds.model,
    apiKey: apiKey || creds.apiKey,
    apiBase: apiBase || creds.apiBase,
    ...(api ? { api: api as 'chat' | 'responses' } : {}),
    ...(thinkingStyle ? { thinkingStyle: thinkingStyle as any } : {}),
    ...(reasoningLevel ? { reasoningLevel: reasoningLevel as any } : {}),
    ...(isolation ? { isolation: isolation as 'shared' | 'snapshot' } : {}),
    workspaceRoot: currentWorkspace,
  })

  const agentApiKey = apiKey || creds.apiKey
  if (!agentApiKey) {
    post({ type: 'toast', level: 'warning', text: `${role.name} 已创建，但未配置 API Key。` })
  } else {
    post({ type: 'toast', level: 'success', text: `${role.name} 已创建 (${agent.id})` })
  }
  pushAgentStatuses()
}

function handleCreateOrder(
  title: string,
  description?: string,
  requiredRole?: string,
  dependencies?: string[],
  priority?: string,
  timeoutMs?: number,
): void {
  initMultiAgent()
  const order = workOrderPool.create({
    title,
    description,
    requiredRole,
    dependencies,
    priority: (priority as any) || 'normal',
    timeoutMs,
  })
  post({ type: 'toast', level: 'info', text: `工单已创建: ${title}` })
  pushWorkOrders()
  // Auto-schedule if scheduler is running
  scheduler.start()
}

function handleStartScheduler(mode?: string): void {
  initMultiAgent()
  if (mode) {
    ;(scheduler as any).config.mode = mode
  }
  scheduler.start()
  post({ type: 'toast', level: 'success', text: `调度器已启动 (${mode || 'pool'} 模式)` })
}

function handleStopScheduler(): void {
  if (scheduler) {
    scheduler.stop()
    post({ type: 'toast', level: 'info', text: '调度器已停止' })
  }
}

function handleGetConversation(agentId: string): void {
  if (!agentCommunication) return
  const history = agentCommunication.getHistory(agentId)
  post({ type: 'multiAgent:conversation', agentId, messages: history })
}

function handleStopAllAgents(): void {
  if (agentPool) {
    agentPool.stopAll()
    pushAgentStatuses()
  }
}

function handleAgentMessage(from: string, to: string | undefined, type: string, content: string): void {
  if (!agentCommunication) return
  agentCommunication.send(from, to, type as any, content)
}

/** Phase 3 — PM autonomous decomposition. */
async function handleDecomposeRequest(request?: string): Promise<void> {
  if (!request || !request.trim()) {
    post({ type: 'toast', level: 'warning', text: '请输入要拆解的需求' })
    return
  }
  initMultiAgent()

  const { model, apiKey, apiBase } = getActiveCredentials()
  // Forward the active LLM config so auto-provisioned sub-agents get a
  // working provider instead of an empty one.
  agentPool.setLlmConfig({ model, apiKey, apiBase })
  agentPool.setDefaultTimeout(300 * 1000)

  post({ type: 'toast', level: 'info', text: 'PM 正在拆解需求…' })
  let orders
  try {
    orders = await scheduler.decomposeRequest(request.trim(), { model, apiKey, apiBase })
  } catch (err: any) {
    post({ type: 'toast', level: 'error', text: `PM 拆解失败：${err?.message || err}` })
    return
  }

  pushWorkOrders()
  // Start the scheduler in parallel mode so the (auto-provisioned) role
  // agents run decomposed tasks concurrently.
  ;(scheduler as any).config.mode = 'parallel'
  scheduler.start()

  post({
    type: 'toast',
    level: 'success',
    text: `PM 已拆解为 ${orders.length} 个子任务，开始执行`,
  })
  console.log(`[web-ide] PM decomposed request into ${orders.length} work orders`)
}

// ── Workspace switching ──

/**
 * Switch the active workspace. Rebuilds the engine, context manager, and
 * config persistence for the new root — the WS connection and messaging
 * adapter stay alive (only adapter.workspace / adapter.git get a new root).
 *
 * Also resets the multi-agent system (stops all agents, clears work orders)
 * since sub-agents are bound to the old workspace.
 */
async function switchWorkspace(newPath: string): Promise<void> {
  const resolved = path.resolve(newPath)

  // Verify path exists
  try {
    const stat = await fs.promises.stat(resolved)
    if (!stat.isDirectory()) {
      post({ type: 'toast', level: 'error', text: `不是目录: ${resolved}` })
      return
    }
  } catch {
    post({ type: 'toast', level: 'error', text: `路径不存在: ${resolved}` })
    return
  }

  if (resolved === currentWorkspace) {
    post({ type: 'toast', level: 'info', text: '已在当前工作区' })
    return
  }

  console.log(`[web-ide] switching workspace: ${currentWorkspace} → ${resolved}`)

  // 1) Stop any running multi-agent activity
  if (agentPool) {
    agentPool.stopAll()
  }
  // Reset multi-agent refs so initMultiAgent() rebuilds on next use
  agentPool = undefined as any
  workOrderPool = undefined as any
  agentCommunication = undefined as any
  scheduler = undefined as any

  // 2) Update adapter root (keeps messaging/fs/shell alive)
  adapter.updateRoot(resolved)
  currentWorkspace = resolved
  // Rebuild the session store for the new workspace root.
  sessionManager = new SessionManager(resolved)
  currentSessionId = null

  // 3) Rebuild config persistence for new workspace.
  // resolveConfig() returns the per-workspace override if present, otherwise
  // the host-global default (INHERITED across workspaces), falling back to
  // env vars only when nothing has been configured yet.
  persistence = new ConfigPersistence(resolved)
  const swConfig = await resolveConfig()
  const swActive = swConfig.models[swConfig.activeModelIndex] || null

  // 4) Rebuild engine with new context manager + workspace
  const engineModel = swActive?.model || MODEL
  const engineApiKey = swActive?.apiKey || API_KEY
  const engineApiBase = swActive?.apiBase || API_BASE
  const ctx = new VTEContextManager(resolved)
  engine = new AgentEngine(ctx, engineModel, engineApiKey, engineApiBase, resolved)
  engine.setReasoningLevel((swConfig.reasoningLevel as any) || 'medium')
  engine.onViewUpdate = (u) => emitUpdate(u)

  // 5) Notify the client
  post({ type: 'workspace:switched', workspace: resolved })
  await restoreActiveSession() // restore THIS workspace's active session (or clear if none)
  post(await configData())
  // Push empty multi-agent state
  post({ type: 'multiAgent:agents', agents: [] })
  post({ type: 'multiAgent:workOrders', orders: [] })

  post({ type: 'toast', level: 'success', text: `已切换到: ${path.basename(resolved)}` })
  console.log(`[web-ide] workspace switched to ${resolved}`)
}

/** Push the current workspace list to the client. */
async function pushWorkspaceList(): Promise<void> {
  const entries = await workspaceManager.list()
  post({
    type: 'workspace:list',
    workspaces: entries,
    activePath: currentWorkspace,
  })
}

async function main(): Promise<void> {
  // 1) Register the SECOND host (pure Node, zero vscode import)
  adapter = new WebIDEHostAdapter(currentWorkspace)
  setHost(adapter)
  await adapter.initialize()
  sessionManager = new SessionManager(currentWorkspace)

  // 1b) Initialize config persistence. Model config is host-global
  // (inherited by every workspace) with an optional per-workspace override.
  persistence = new ConfigPersistence(currentWorkspace)
  const initConfig = await resolveConfig()
  const initActive = initConfig.models[initConfig.activeModelIndex] || null

  // 2) Build the engine using resolved (global / override / env) credentials
  const engineModel = initActive?.model || MODEL
  const engineApiKey = initActive?.apiKey || API_KEY
  const engineApiBase = initActive?.apiBase || API_BASE
  const ctx = new VTEContextManager(currentWorkspace)
  engine = new AgentEngine(ctx, engineModel, engineApiKey, engineApiBase, currentWorkspace)
  engine.setReasoningLevel((initConfig.reasoningLevel as any) || 'medium')
  // Restore persisted behavioral settings onto the engine at boot, so a
  // refreshed client that re-applies its saved mode/taskMode starts in
  // the same state (no silent revert to defaults).
  try { engine.setMode((initConfig.mode as any) || 'code') } catch { /* optional */ }
  try { engine.setTaskMode((initConfig.taskMode as any) || 'off') } catch { /* optional */ }
  engine.onViewUpdate = (u) => emitUpdate(u)

  // 2b) Register the initial workspace in the global registry
  await workspaceManager.add(currentWorkspace)
  console.log(`[web-ide] registered workspace: ${currentWorkspace}`)

  // 3) Route incoming browser messages
  adapter.messaging.onMessage(async (msg) => {
    switch (msg?.type) {
      // ── Lifecycle / config ──
      case 'ready':
      case 'getConfig':
        post(await configData())
        void restoreActiveSession()
        break

      // ── Chat ──
      case 'chat':
        void handleChat(msg.text, msg.temperature, msg.topP, msg.maxTokens, msg.regenerateFromUserIndex)
        break
      case 'permissionResponse':
        engine.resolvePermission(msg.decision)
        break
      case 'chat:save': {
        // Client pushes the current conversation (debounced on its side);
        // we persist it into the active session (auto-creating one on
        // the first save so every workspace keeps a list of sessions).
        const payload: ChatHistoryPayload = {
          version: 1,
          savedAt: Date.now(),
          messages: (msg.messages as ChatHistoryPayload['messages']) || [],
          tokenStats: msg.tokenStats,
        }
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(async () => {
          try {
            if (!currentSessionId) {
              const model = await activeModelName()
              const session = await sessionManager.createSession(undefined, model)
              currentSessionId = session.id
              sessionManager.setActiveSessionId(session.id)
              post({ type: 'session:created', session })
            }
            const model = await activeModelName()
            await sessionManager.autoSave(currentSessionId, {
              messages: payload.messages,
              model,
              tokenUsage: {
                prompt: (payload.tokenStats as any)?.totalPrompt ?? 0,
                completion: (payload.tokenStats as any)?.totalCompletion ?? 0,
              },
            })
            post({ type: 'chat:saved', savedAt: payload.savedAt, count: payload.messages.length })
          } catch (e: unknown) {
            console.error('[web-ide] session autosave failed:', e)
          }
        }, 400)
        break
      }
      case 'chat:load':
        void restoreActiveSession()
        break
      case 'clear':
        engine.clearHistory()
        // Start a fresh session so the previous conversation is preserved
        // in the session list instead of being discarded.
        try {
          const model = await activeModelName()
          const session = await sessionManager.createSession(undefined, model)
          currentSessionId = session.id
          sessionManager.setActiveSessionId(session.id)
        } catch (e: unknown) {
          console.error('[web-ide] create session on clear failed:', e)
        }
        post({ type: 'cleared' })
        break
      case 'abort':
        // Abort the in-flight LLM request AND any pending question dialog
        console.log('[VTE-DIAG] ← abort requested')
        engine.abort()
        post({ type: 'toast', level: 'info', text: '已请求停止' })
        break
      // ── Multi-session management (mirrors src/vscode/panel.ts) ──
      case 'session:create':
        try {
          const model = await activeModelName()
          const session = await sessionManager.createSession(msg.name, model)
          currentSessionId = session.id
          sessionManager.setActiveSessionId(session.id)
          post({ type: 'session:created', session })
          // Start a fresh, empty chat bound to the new session.
          post({ type: 'cleared' })
        } catch (e: any) {
          post({ type: 'session:error', text: `创建失败：${e?.message}` })
        }
        break
      case 'session:list':
        try {
          post({ type: 'session:list', sessions: await sessionManager.listSessions(), currentSessionId })
        } catch {
          post({ type: 'session:list', sessions: [], currentSessionId })
        }
        break
      case 'session:get':
        try {
          const session = await sessionManager.getSession(msg.sessionId)
          if (session) post({ type: 'session:data', session })
          else post({ type: 'session:error', text: '会话不存在' })
        } catch (e: any) {
          post({ type: 'session:error', text: `获取失败：${e?.message}` })
        }
        break
      case 'session:restore':
        await restoreSessionById(msg.sessionId)
        break
      case 'session:delete':
        try {
          await sessionManager.deleteSession(msg.sessionId)
          if (currentSessionId === msg.sessionId) {
            currentSessionId = null
            sessionManager.setActiveSessionId(null)
          }
          post({ type: 'session:deleted', sessionId: msg.sessionId })
        } catch (e: any) {
          post({ type: 'session:error', text: `删除失败：${e?.message}` })
        }
        break
      case 'session:deleteAll':
        try {
          const all = await sessionManager.listSessions()
          for (const s of all) await sessionManager.deleteSession(s.id)
          currentSessionId = null
          sessionManager.setActiveSessionId(null)
          post({ type: 'session:deleted', sessionId: 'all' })
          post({ type: 'cleared' })
          post({ type: 'toast', level: 'success', text: `已清空 ${all.length} 个会话` })
        } catch (e: any) {
          post({ type: 'session:error', text: `清空失败：${e?.message}` })
        }
        break
      case 'session:rename':
        try {
          await sessionManager.updateSession(msg.sessionId, { name: msg.name })
          post({ type: 'session:renamed', sessionId: msg.sessionId, name: msg.name })
        } catch (e: any) {
          post({ type: 'session:error', text: `重命名失败：${e?.message}` })
        }
        break
      case 'session:tag':
        try {
          await sessionManager.updateSession(msg.sessionId, { tags: msg.tags })
          post({ type: 'session:tagged', sessionId: msg.sessionId, tags: msg.tags })
        } catch (e: any) {
          post({ type: 'session:error', text: `打标失败：${e?.message}` })
        }
        break
      case 'session:search':
        try {
          post({ type: 'session:searchResult', sessions: await sessionManager.searchSessions(msg.query) })
        } catch {
          post({ type: 'session:searchResult', sessions: [] })
        }
        break
      case 'session:export':
        try {
          const data = await sessionManager.exportSession(msg.sessionId)
          post({ type: 'session:exported', sessionId: msg.sessionId, data })
        } catch (e: any) {
          post({ type: 'session:error', text: `导出失败：${e?.message}` })
        }
        break
      case 'session:import':
        try {
          const session = await sessionManager.importSession(msg.data)
          post({ type: 'session:imported', session })
        } catch (e: any) {
          post({ type: 'session:error', text: `导入失败：${e?.message}` })
        }
        break

      case 'setMode':
        // Persist the chosen work mode so it survives a refresh, apply it to
        // the engine, and broadcast it so every connected client stays in sync.
        if (msg.mode) {
          await (await activeConfigPersistence()).updateBehavior({ mode: msg.mode })
          try { engine.setMode(msg.mode) } catch { /* engine may not implement */ }
          post({ type: 'modeChanged', mode: msg.mode })
        }
        break
      case 'setTaskMode':
        if (msg.mode) {
          await (await activeConfigPersistence()).updateBehavior({ taskMode: msg.mode })
          try { engine.setTaskMode(msg.mode) } catch { /* engine may not implement */ }
        }
        break
      case 'feedback':
        // No-op feedback sink for web-ide (VSCode host logs it).
        break
      case 'getPermissionConfig':
        post({
          type: 'permissionConfig',
          config: {
            fileRead: 'allow', fileWrite: 'ask', terminal: 'ask', git: 'allow',
            diagnostics: 'allow', web: 'ask', task: 'allow', checkpoint: 'allow',
          },
        })
        break
      case 'setPermissionConfig':
        // Web IDE uses a fixed permissive policy; acknowledge but don't persist.
        break
      case 'getLspProfiles':
        post({ type: 'lspProfiles', profiles: {} })
        break
      case 'getLspConfigEditorData':
        post({ type: 'lspConfigEditor:data', profiles: {} })
        break
      case 'lsp:setup':
      case 'lsp:test':
        post({ type: 'lsp:testResult', success: false, message: 'LSP not available in Web IDE host' })
        break
      case 'switchModel':
        // Persist active model index to the SAME source resolveConfig() reads
        // from (workspace-local if it has its own models, else the global
        // default). Writing to global alone would be shadowed by a workspace
        // override, so the switch wouldn't stick.
        await (await activeConfigPersistence()).setActiveModel(msg.index)
        break
      case 'saveModels':
        // Persist model profiles to the SAME source resolveConfig() reads
        // from (API keys preserved when the client sends '***'). Writing to
        // global alone was the root cause of "新增模型时保存无效": a workspace
        // that already had its own .vte/config.json kept returning that local
        // copy, so an add/edit saved to global was invisible on reload.
        // ALSO persist every behavioral setting (mode / taskMode / sampling
        // params) so the "行为设置 → 保存 → 刷新" round-trip keeps them.
        await (await activeConfigPersistence()).updateModels(msg.models, msg.activeModelIndex, {
          subAgentTimeout: msg.subAgentTimeout,
          forceMultiAgent: msg.forceMultiAgent,
          mode: msg.mode,
          taskMode: msg.taskMode,
          temperature: msg.temperature,
          topP: msg.topP,
          maxTokens: msg.maxTokens,
        })
        post({ type: 'configSaved' })
        // Re-push updated configData with masked keys
        post(await configData())
        break
      case 'setReasoningLevel':
        if (msg.level) {
          await (await activeConfigPersistence()).setReasoningLevel(msg.level)
          engine.setReasoningLevel(msg.level)
        }
        break
      case 'questionResponse':
        // Forward question answer back to the engine (best-effort).
        console.log(`[VTE-DIAG] ← questionResponse: id=${msg.requestId} answers=${JSON.stringify(msg.answers)}`)
        try {
          ;(engine as any).resolveQuestion?.(msg.requestId, msg.answers)
          console.log(`[VTE-DIAG] ✓ resolveQuestion called — user answered: "${Array.isArray(msg.answers) ? msg.answers[0] : msg.answers}"`)
        } catch (e) { /* engine may not implement question flow */ console.error('[VTE-DIAG] resolveQuestion error:', e) }
        break
      case 'questionBack':
        // User clicked "back" in multi-step question dialog.
        console.log(`[VTE-DIAG] ← questionBack received`)
        try {
          ;(engine as any).goBack?.()
        } catch { /* ignore */ }
        break

      // ── Multi-agent management ──
      case 'multiAgent:createAgent':
        handleCreateAgent(
          msg.roleId,
          msg.model,
          msg.apiKey,
          msg.apiBase,
          msg.api,
          msg.thinkingStyle,
          msg.reasoningLevel,
          msg.isolation,
        )
        break
      case 'multiAgent:createOrder':
        handleCreateOrder(
          msg.title,
          msg.description,
          msg.requiredRole,
          msg.dependencies,
          msg.priority,
          msg.timeoutMs,
        )
        break
      case 'multiAgent:startScheduler':
        handleStartScheduler(msg.mode)
        break
      case 'multiAgent:stopScheduler':
        handleStopScheduler()
        break
      case 'multiAgent:getConversation':
        handleGetConversation(msg.agentId)
        break
      case 'multiAgent:stopAll':
        handleStopAllAgents()
        break
      case 'multiAgent:sendMessage':
        handleAgentMessage(msg.from, msg.to, msg.type, msg.content)
        break
      case 'multiAgent:decomposeRequest':
        void handleDecomposeRequest(msg.request)
        break

      // ── Workspace management ──
      case 'workspace:list':
        await pushWorkspaceList()
        break
      case 'workspace:add': {
        try {
          const entry = await workspaceManager.add(msg.path, msg.name)
          post({ type: 'toast', level: 'success', text: `已添加: ${entry.name}` })
          await pushWorkspaceList()
        } catch (e: any) {
          post({ type: 'toast', level: 'error', text: `添加失败: ${e?.message}` })
        }
        break
      }
      case 'workspace:remove': {
        // Don't allow removing the active workspace
        const entry = await workspaceManager.get(msg.id)
        if (entry && path.resolve(entry.path) === path.resolve(currentWorkspace)) {
          post({ type: 'toast', level: 'warning', text: '无法移除当前活跃的工作区' })
          break
        }
        await workspaceManager.remove(msg.id)
        post({ type: 'toast', level: 'info', text: '工作区已移除' })
        await pushWorkspaceList()
        break
      }
      case 'workspace:switch':
        await switchWorkspace(msg.path)
        await pushWorkspaceList()
        break
      case 'workspace:browse': {
        const items = await workspaceManager.browse(msg.path)
        const roots = workspaceManager.getBrowseRoots()
        post({ type: 'workspace:browseResult', path: msg.path || '', items, roots })
        break
      }

      // ── Skills management ──
      case 'skills:list':
        handleSkillsList()
        break
      case 'skills:get':
        handleSkillsGet(msg.skillPath)
        break
      case 'skills:save':
        handleSkillsSave(msg.skillPath, msg.content)
        break
      case 'skills:create':
        handleSkillsCreate(msg.name, msg.dir, msg.description)
        break
      case 'skills:delete':
        handleSkillsDelete(msg.skillPath)
        break

      // ── File system (left panel file tree) ──
      case 'fs:list': {
        const dirPath = msg.path || currentWorkspace
        try {
          await listDirAndPost(dirPath)
        } catch (e: any) {
          post({ type: 'fs:listResult', path: dirPath, items: [], error: e?.message })
        }
        break
      }
      case 'fs:create': {
        try {
          const dir = msg.path || currentWorkspace
          const kind: 'file' | 'folder' = msg.kind === 'folder' ? 'folder' : 'file'
          const name = String(msg.name || '').trim()
          if (!name) throw new Error('名称不能为空')
          const full = path.join(dir, name)
          if (kind === 'folder') {
            await fs.promises.mkdir(full, { recursive: true })
          } else {
            await fs.promises.mkdir(dir, { recursive: true })
            await fs.promises.writeFile(full, '', 'utf-8')
          }
          await listDirAndPost(dir)
          post({ type: 'fs:created', path: full, kind })
          post({ type: 'toast', level: 'success', text: `已创建 ${kind === 'folder' ? '文件夹' : '文件'}：${name}` })
        } catch (e: any) {
          post({ type: 'fs:error', action: 'create', error: e?.message })
        }
        break
      }
      case 'fs:delete': {
        try {
          const p = msg.path
          if (!p) throw new Error('缺少路径')
          const parent = path.dirname(p)
          await fs.promises.rm(p, { recursive: true, force: true })
          await listDirAndPost(parent)
          post({ type: 'fs:deleted', path: p })
          post({ type: 'toast', level: 'success', text: '已删除' })
        } catch (e: any) {
          post({ type: 'fs:error', action: 'delete', error: e?.message })
        }
        break
      }
      case 'fs:rename': {
        try {
          const p = msg.path
          const parent = path.dirname(p)
          const newName = String(msg.newName || '').trim()
          if (!newName) throw new Error('名称不能为空')
          const newPath = path.join(parent, newName)
          await fs.promises.rename(p, newPath)
          await listDirAndPost(parent)
          post({ type: 'fs:renamed', path: p, newPath, newName })
        } catch (e: any) {
          post({ type: 'fs:error', action: 'rename', error: e?.message })
        }
        break
      }
      case 'fs:read': {
        try {
          const content = await fs.promises.readFile(msg.path, 'utf-8')
          const stat = await fs.promises.stat(msg.path)
          post({ type: 'fs:readResult', path: msg.path, content, size: stat.size })
        } catch (e: any) {
          post({ type: 'fs:readResult', path: msg.path, content: '', error: e?.message })
        }
        break
      }
      case 'fs:write': {
        console.log('[fs:write] Received:', { path: msg.path, contentLen: msg.content?.length })
        try {
          if (typeof msg.path !== 'string' || typeof msg.content !== 'string') {
            throw new Error('invalid path or content')
          }
          await fs.promises.writeFile(msg.path, msg.content, 'utf-8')
          const stat = await fs.promises.stat(msg.path)
          console.log('[fs:write] Success:', { path: msg.path, size: stat.size })
          post({ type: 'fs:writeResult', path: msg.path, size: stat.size })
          post({ type: 'toast', level: 'success', text: `已保存 ${msg.path.split('/').pop()}` })
        } catch (e: any) {
          console.error('[fs:write] Error:', e?.message)
          post({ type: 'fs:writeResult', path: msg.path, error: e?.message })
          post({ type: 'toast', level: 'error', text: `保存失败: ${e?.message}` })
        }
        break
      }
      case 'git:status': {
        try {
          const git = adapter.git as WebIDEGit
          const [branch, status] = await Promise.all([git.getBranch(), git.getStatus()])
          const lines = status ? status.split('\n').filter(Boolean) : []
          const changes = lines.map((l) => {
            // --porcelain format: "XY filename" (2-char status + space + name)
            // The adapter trims the entire output, so the first line may lose
            // its leading space (e.g., " M file" → "M file"). Detect both forms.
            let statusCode: string
            let file: string
            if (l.length >= 3 && l.charAt(1) === ' ') {
              // "M filename" — leading space was trimmed (unstaged change)
              statusCode = ' ' + l.charAt(0)
              file = l.slice(2).trim()
            } else {
              // "XY filename" — normal 2-char status
              statusCode = l.slice(0, 2)
              file = l.slice(3)
            }
            statusCode = statusCode.trim()
            // Handle rename format: "R  old -> new"
            if (file.includes(' -> ')) {
              file = file.split(' -> ').pop() || file
            }
            return { status: statusCode, file }
          })
          post({ type: 'git:statusResult', branch, changes, total: changes.length })
        } catch (e: any) {
          post({ type: 'git:statusResult', branch: '', changes: [], total: 0, error: e?.message })
        }
        break
      }

      default:
        break
    }
  })

  // 4) HTTP (static client) + WebSocket (/ws)
  const distDir = path.join(__dirname, '../client/dist')
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0]
    if (urlPath === '/' || urlPath === '/index.html') {
      const indexFile = path.join(distDir, 'index.html')
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        fs.createReadStream(indexFile).pipe(res)
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<h2>VTE Web IDE</h2><p>Client not built yet. Run ' +
            '<code>npm run build</code> in <code>web-ide/</code>, then reload.</p>',
        )
      }
      return
    }
    // static assets
    const asset = path.join(distDir, urlPath)
    if (fs.existsSync(asset) && fs.statSync(asset).isFile()) {
      const ext = path.extname(asset)
      const mime: Record<string, string> = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.woff2': 'font/woff2',
      }
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
      fs.createReadStream(asset).pipe(res)
      return
    }
    res.writeHead(404)
    res.end('not found')
  })

  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws: WebSocket) => {
    console.log('[web-ide] client connected')
    adapter.messaging.bind(ws)
    // Send initial config + workspace list (async — reads from persistence)
    void configData().then((data) => {
      post(data)
      // Re-apply the persisted work mode to the client (useMode defaults to
      // 'code' on a fresh load, so without this the saved mode reverts).
      post({ type: 'modeChanged', mode: data.mode })
    })
    void pushWorkspaceList()
    ws.on('close', () => console.log('[web-ide] client disconnected'))
  })

  server.listen(PORT, () => {
    console.log(`[web-ide] listening on http://localhost:${PORT}  (ws: /ws)`)
    console.log(`[web-ide] workspace=${currentWorkspace}  model=${MODEL}  mock=${MOCK}`)
    console.log(`[web-ide] engine-fix-v2: resolveQuestion(2-param), _questionSkipped reset per-chat, step-answer logging active`)
  })
}

// ── Skills management (mirrors src/vscode/panel.ts handlers) ──
function getSkillDirs(): string[] {
  return ['.claude/skills', '.agents/skills', '.opencode/skills'].map((d) => path.join(currentWorkspace, d))
}

function parseSkillMeta(content: string): { name: string; description: string } {
  let name = ''
  let description = ''
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    const fm = fmMatch[1]
    const nameMatch = fm.match(/^name:\s*(.+)$/m)
    const descMatch = fm.match(/^description:\s*(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
    if (descMatch) description = descMatch[1].trim()
  }
  if (!name) {
    const titleMatch = content.match(/^#\s+(.+)$/m)
    if (titleMatch) name = titleMatch[1].trim()
  }
  if (!description) {
    const lines = content.split('\n')
    let foundTitle = false
    for (const line of lines) {
      if (line.startsWith('#')) { foundTitle = true; continue }
      if (foundTitle && line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
        description = line.trim().substring(0, 120)
        break
      }
    }
  }
  return { name, description }
}

function handleSkillsList() {
  const skills: Array<{ name: string; path: string; dir: string; description: string; builtin?: boolean }> = []
  const allDirs: string[] = []
  for (const bs of loadBuiltinSkills()) {
    skills.push({ name: bs.name, path: bs.path, dir: '内置', description: bs.description, builtin: true })
  }
  for (const dir of getSkillDirs()) {
    allDirs.push(dir)
    if (!fs.existsSync(dir)) continue
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFile = path.join(dir, entry.name, 'SKILL.md')
          if (fs.existsSync(skillFile)) {
            const content = fs.readFileSync(skillFile, 'utf-8')
            const meta = parseSkillMeta(content)
            skills.push({
              name: meta.name || entry.name,
              path: skillFile,
              dir: path.basename(path.dirname(dir)) + '/' + entry.name,
              description: meta.description || '',
            })
          }
        }
      }
    } catch {}
  }
  post({ type: 'skills:list', skills: skills.reverse(), dirs: allDirs })
}

function handleSkillsGet(skillPath: string) {
  try {
    const builtinContent = getBuiltinSkillContent(skillPath)
    if (builtinContent) {
      post({ type: 'skills:content', path: skillPath, content: builtinContent })
      return
    }
    const content = fs.readFileSync(skillPath, 'utf-8')
    post({ type: 'skills:content', path: skillPath, content })
  } catch (err: any) {
    post({ type: 'toast', level: 'error', text: `读取失败: ${err.message}` })
  }
}

function handleSkillsSave(skillPath: string, content: string) {
  try {
    fs.writeFileSync(skillPath, content, 'utf-8')
    post({ type: 'skills:saved', path: skillPath })
    post({ type: 'toast', level: 'success', text: '保存成功' })
  } catch (err: any) {
    post({ type: 'toast', level: 'error', text: `保存失败: ${err.message}` })
  }
}

function handleSkillsCreate(name: string, dir: string, description?: string) {
  try {
    const skillDir = path.join(dir, name)
    fs.mkdirSync(skillDir, { recursive: true })
    const skillFile = path.join(skillDir, 'SKILL.md')
    const desc = description || 'Describe what this skill does.'
    const content = `---
name: ${name}
description: ${desc}
---

# ${name}

## Description

${desc}

## Trigger

Describe when this skill should be activated.

## Usage

Describe how to use this skill.

## Examples

Example usage here
`
    fs.writeFileSync(skillFile, content, 'utf-8')
    post({ type: 'skills:created', name, path: skillFile })
    post({ type: 'toast', level: 'success', text: `Skill "${name}" 创建成功` })
  } catch (err: any) {
    post({ type: 'toast', level: 'error', text: `创建失败: ${err.message}` })
  }
}

function handleSkillsDelete(skillPath: string) {
  try {
    fs.rmSync(path.dirname(skillPath), { recursive: true, force: true })
    post({ type: 'skills:deleted', path: skillPath })
    post({ type: 'toast', level: 'success', text: '删除成功' })
  } catch (err: any) {
    post({ type: 'toast', level: 'error', text: `删除失败: ${err.message}` })
  }
}

main().catch((e) => {
  console.error('[web-ide] fatal:', e)
  process.exit(1)
})
