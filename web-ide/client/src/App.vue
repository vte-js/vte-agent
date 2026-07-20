<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, reactive, defineAsyncComponent } from 'vue'
import { useVsCode } from '@webview/composables/useVsCode'
import { useChat } from '@webview/composables/useChat'
import { useMode } from '@webview/composables/useMode'
import { useConfig } from '@webview/composables/useConfig'
import { useMultiAgent } from '@webview/composables/useMultiAgent'
import { useNotification } from '@webview/composables/useNotification'
import { useSession } from '@webview/composables/useSession'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import css_ from 'highlight.js/lib/languages/css'
import bash from 'highlight.js/lib/languages/bash'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import toml_ from 'highlight.js/lib/languages/ini'
import markdown from 'highlight.js/lib/languages/markdown'
import 'highlight.js/styles/vs2015.css'
import MessageList from '@webview/components/MessageList.vue'
import InputArea from '@webview/components/InputArea.vue'
import ActiveAgents from '@webview/components/ActiveAgents.vue'
import AgentDashboard from '@webview/components/AgentDashboard.vue'
import WorkOrderBoard from '@webview/components/WorkOrderBoard.vue'
import WorkOrderDetail from '@webview/components/WorkOrderDetail.vue'
import AgentConversation from '@webview/components/AgentConversation.vue'
import TokenStatsPanel from '@webview/components/TokenStats.vue'
import AuthorizationDialog from '@webview/components/AuthorizationDialog.vue'
import QuestionDialog from '@webview/components/QuestionDialog.vue'
import NotificationManager from '@webview/components/NotificationManager.vue'
import ConfigPanel from '@webview/components/ConfigPanel.vue'
import { renderMarkdown } from '@webview/markdown'
import SessionDropdown from '@webview/components/SessionDropdown.vue'
import VTooltip from '@webview/components/VTooltip.vue'
import ProjectTree from './components/ProjectTree.vue'
import GitStatus from './components/GitStatus.vue'
import WorkspaceSwitcher from './components/WorkspaceSwitcher.vue'
// VTE Stage — Monaco diff dock is lazy-loaded so its chunk + worker
// only ship to the browser on the first agent write.
const MonacoDiffDock = defineAsyncComponent(() => import('./components/MonacoDiffDock.vue'))

// ── Composables (all self-contained, talk to host via useHost → WS) ──
const mode = useMode()
const config = useConfig()
const chat = useChat(() => mode.mode.value)
const multiAgent = useMultiAgent()
const { notify } = useNotification()
const { send, onMessage, signalReady } = useVsCode()
const { createSession, sessions, currentSessionId } = useSession()

// ── UI state ──
const connected = ref(false)
const workspace = ref('')
const agentDashboardVisible = ref(true)
const workOrderBoardVisible = ref(true)
const tokenPanelOpen = ref(false)
const editRef = ref('')
const editContext = ref<any[]>([])
const editingMessageId = ref<number | null>(null)

// ── VTE Stage: file-touch highlight map + active Monaco diff + live modifying set ──
const touchedMap = reactive<Record<string, { op: string; ts: number }>>({})
const activeDiff = ref<{ path: string; before: string; after: string; agentId: string } | null>(null)
const modifyingSet = ref<Set<string>>(new Set())

// Auto-clear: highlights and diff fade out after inactivity.
const STAGE_FADE_MS = 8000 // 8s of no new touches → clear everything
let fadeTimer: ReturnType<typeof setTimeout> | null = null
function resetFadeTimer() {
  if (fadeTimer) clearTimeout(fadeTimer)
  fadeTimer = setTimeout(clearStageEffects, STAGE_FADE_MS)
}
function clearStageEffects() {
  // Keep only entries newer than FADE_MS (guard against race).
  const cutoff = Date.now() - STAGE_FADE_MS - 500
  for (const [k, v] of Object.entries(touchedMap)) {
    if (v.ts < cutoff) delete touchedMap[k]
  }
  if (Object.keys(touchedMap).length === 0) activeDiff.value = null
}

// Permission dialog
const showAuthDialog = ref(false)
const authToolName = ref('')
const authToolArgs = ref<Record<string, unknown>>({})
const authRequestId = ref('')

// Question dialog
const showQuestionDialog = ref(false)
const questionRequestId = ref('')
const questionText = ref('')
const questionOptions = ref<Array<{ label: string; description?: string }>>([])
const questionMultiple = ref(false)
const questionRecommended = ref('')
// Multi-step
const questionStepCurrent = ref(1)
const questionStepTotal = ref(1)
const questionStepTitles = ref<string[]>([])
const questionStepAnswers = ref<Array<{ step: number; answer: string }>>([])

// Delegation strip
const delegationActive = ref(false)
const delegationRequest = ref('')

// Work order detail
const selectedOrderId = ref<string | null>(null)
const selectedOrder = computed(() =>
  multiAgent.workOrders.value.find((o) => o.id === selectedOrderId.value) || null,
)

// Current session display name (fallback to "对话")
const sessionTitle = computed(() => {
  if (!currentSessionId.value) return '对话'
  const s = sessions.value.find(s => s.id === currentSessionId.value)
  return s?.name || '对话'
})

// File preview (left panel tree → inline preview panel)
const previewFile = ref('')
const previewContent = ref('')
const previewVisible = ref(false)
const previewEl = ref<HTMLElement | null>(null)
// Edit mode
const previewEditing = ref(false)
const previewDraft = ref('')
const previewSaving = ref(false)
const previewDirty = computed(() => previewEditing.value && previewDraft.value !== previewContent.value)
// Markdown preview toggle (only for .md / .markdown files)
const previewMode = ref<'source' | 'rendered'>('source')
const isMarkdown = computed(() => /\.(md|markdown|mdx)$/i.test(previewFile.value))
const renderedMarkdown = computed(() => (isMarkdown.value ? renderMarkdown(previewContent.value) : ''))

// Register highlight.js languages
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('javascript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('css', css_)
hljs.registerLanguage('scss', css_)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('toml', toml_)
hljs.registerLanguage('markdown', markdown)

// Detect language from file extension
function detectLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',
    vue:'html',css:'css',scss:'scss',less:'css',
    html:'html',htm:'html',
    json:'json',md:'markdown',
    py:'python',rs:'rust',go:'go',java:'java',
    sh:'bash',bash:'bash',zsh:'bash',
    yaml:'yaml',yml:'yaml',toml:'toml',
    xml:'xml',svg:'xml',xsl:'xml',
    env:'env',gitignore:'',lock:'json',log:'plaintext',txt:'plaintext',
  }
  return map[ext] || 'plaintext'
}

// Highlighted content (safe HTML)
const highlightedContent = computed(() => {
  if (!previewContent.value) return ''
  const lang = detectLang(previewFile.value)
  if (!lang || lang === 'plaintext' || lang === 'env') {
    return escapeHtml(previewContent.value)
  }
  try {
    return hljs.highlight(previewContent.value, { language: lang }).value
  } catch {
    return escapeHtml(previewContent.value)
  }
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Conversation-session panel (full-screen history manager)
const showSessions = ref(false)

// Chat params
const temperature = ref(0.7)
const topP = ref(1.0)
const maxTokens = ref(4096)
// Re-apply persisted sampling params when the server pushes configData on
// (re)connect, so a refresh restores them instead of reverting to defaults.
watch(() => config.temperature.value, (v) => { if (v != null) temperature.value = v }, { immediate: true })
watch(() => config.topP.value, (v) => { if (v != null) topP.value = v }, { immediate: true })
watch(() => config.maxTokens.value, (v) => { if (v != null) maxTokens.value = v }, { immediate: true })

// ── Resizable panes (left & right widths) ──
const leftWidth = ref(272)
const rightWidth = ref(380)
const leftDragging = ref(false)
const rightDragging = ref(false)

/*
 * Single-grid layout: ide-root is a 5-column × 2-row grid.
 * Row 1 = header (spans all columns).
 * Row 2 = left-pane | resizer | center | resizer | right-pane.
 * Resizers span BOTH rows → full-height vertical lines.
 */
const rootGridStyle = computed(() => ({
  gridTemplateColumns: `${leftWidth.value}px 6px 1fr 6px ${rightWidth.value}px`,
  gridTemplateRows: `var(--ide-header-h) 1fr`,
}))
let dragState: { side: 'left' | 'right'; startX: number; startW: number } | null = null
function onResizeMove(e: MouseEvent) {
  if (!dragState) return
  const dx = e.clientX - dragState.startX
  if (dragState.side === 'left') {
    leftWidth.value = Math.min(560, Math.max(200, dragState.startW + dx))
  } else {
    rightWidth.value = Math.min(640, Math.max(240, dragState.startW - dx))
  }
}
function onResizeUp() {
  dragState = null
  leftDragging.value = false
  rightDragging.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
function startDrag(side: 'left' | 'right', e: MouseEvent) {
  e.preventDefault()
  dragState = { side, startX: e.clientX, startW: side === 'left' ? leftWidth.value : rightWidth.value }
  if (side === 'left') leftDragging.value = true
  else rightDragging.value = true
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// ── Resizable input area height ──
const inputHeight = ref(180)
const inputDragging = ref(false)
let inputDragState: { startY: number; startH: number } | null = null
function onInputResizeMove(e: MouseEvent) {
  if (!inputDragState) return
  const dy = e.clientY - inputDragState.startY
  // Dragging up (negative dy) grows the input area.
  inputHeight.value = Math.min(520, Math.max(120, inputDragState.startH - dy))
}
function onInputResizeUp() {
  inputDragState = null
  inputDragging.value = false
  document.removeEventListener('mousemove', onInputResizeMove)
  document.removeEventListener('mouseup', onInputResizeUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
function startInputDrag(e: MouseEvent) {
  // Only activate drag when clicking near the top edge (within 8px)
  const target = e.currentTarget as HTMLElement
  if (e.offsetY > 8) return
  e.preventDefault()
  inputDragState = { startY: e.clientY, startH: inputHeight.value }
  inputDragging.value = true
  document.addEventListener('mousemove', onInputResizeMove)
  document.addEventListener('mouseup', onInputResizeUp)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

// Derived config for AgentDashboard
const globalConfig = computed(() => ({
  model: config.model.value,
  apiKey: config.apiKey.value,
  apiBase: config.apiBase.value,
}))

onMounted(() => {
  signalReady()
  config.init()

  onMessage((msg: any) => {
    if (msg.type === 'configData') {
      connected.value = true
      if (msg.workspace) workspace.value = msg.workspace
    } else if (msg.type === 'workspace:switched') {
      workspace.value = msg.workspace
    } else if (msg.type === 'toast') {
      notify(msg.level, msg.text)
    } else if (msg.type === 'permissionRequest') {
      authRequestId.value = msg.requestId
      authToolName.value = msg.toolName
      authToolArgs.value = msg.toolArgs
      showAuthDialog.value = true
    } else if (msg.type === 'questionRequest') {
      console.log('[WEB-IDE-DIAG] questionRequest received:', { requestId: msg.requestId, question: msg.question?.substring(0, 50), options: msg.options?.length, step: `${msg.stepCurrent ?? 1}/${msg.stepTotal ?? 1}` })
      questionRequestId.value = msg.requestId
      questionText.value = msg.question
      questionOptions.value = msg.options || []
      questionMultiple.value = !!msg.multiple
      questionRecommended.value = msg.recommended || ''
      // Multi-step
      questionStepCurrent.value = msg.stepCurrent ?? 1
      questionStepTotal.value = msg.stepTotal ?? 1
      questionStepTitles.value = msg.steps || []
      questionStepAnswers.value = (msg as any).stepAnswers || []
      showQuestionDialog.value = true
      console.log('[WEB-IDE-DIAG] showQuestionDialog set to true, visible=', showQuestionDialog.value)
    } else if (msg.type === 'multiAgent:delegationStart') {
      delegationActive.value = true
      delegationRequest.value = msg.request
    } else if (msg.type === 'multiAgent:delegationEnd') {
      delegationActive.value = false
    } else if (msg.type === 'fs:readResult') {
      if (!msg.error) {
        previewFile.value = msg.path
        previewContent.value = msg.content
        previewEditing.value = false
        previewDraft.value = msg.content
        previewMode.value = /\.(md|markdown|mdx)$/i.test(msg.path) ? 'rendered' : 'source'
        previewVisible.value = true
      } else {
        notify('error', `无法读取文件: ${msg.error}`)
      }
    } else if (msg.type === 'fs:writeResult') {
      console.log('[PREVIEW-SAVE] Received fs:writeResult:', { path: msg.path, error: msg.error, size: msg.size })
      previewSaving.value = false
      if (!msg.error) {
        // Sync saved content as the new baseline; stay in edit mode.
        previewContent.value = previewDraft.value
      } else {
        notify('error', `保存失败: ${msg.error}`)
      }
    } else if (msg.type === 'stage:file_touch') {
      touchedMap[msg.path] = { op: msg.op, ts: Date.now() }
      resetFadeTimer()
    } else if (msg.type === 'stage:file_modifying') {
      modifyingSet.value = new Set([...modifyingSet.value, msg.path])
      resetFadeTimer()
    } else if (msg.type === 'stage:file_write_done') {
      // Remove from "modifying" set (write completed), then set highlight + diff.
      console.log(`[VTE-Stage] file_write_done: path=${msg.path}, before=${(msg.before||'').length} chars, after=${(msg.after||'').length} chars`)
      const next = new Set(modifyingSet.value)
      next.delete(msg.path)
      modifyingSet.value = next
      touchedMap[msg.path] = { op: 'write', ts: Date.now() }
      activeDiff.value = { path: msg.path, before: msg.before || '', after: msg.after || '', agentId: msg.agentId }
      resetFadeTimer()
    } else if (msg.type === 'response' || msg.type === 'error') {
      // LLM turn is done — clear file-tree highlights and diff popup immediately.
      // The 8s fade timer is a safety net; this is the explicit "turn complete" signal.
      clearStageEffects()
    }
  })
  window.addEventListener('keydown', onEscKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onEscKey)
})

// ── Handlers ──
function onSend(text: string, images: any[], context: any[]) {
  // Clear stale stage effects from previous turn
  Object.keys(touchedMap).forEach(k => delete touchedMap[k])
  activeDiff.value = null
  modifyingSet.value = new Set()
  if (editingMessageId.value !== null) {
    // Editing a past message → branch from that position, not append to the end.
    chat.resendMessage(
      editingMessageId.value,
      text,
      config.model.value,
      temperature.value,
      topP.value,
      maxTokens.value,
      editContext.value,
    )
    onCancelEdit()
  } else {
    chat.sendChat(text, config.model.value, temperature.value, topP.value, maxTokens.value, images, context)
  }
}
function onStop() {
  chat.stop()
}
function onExecutePlan(planText: string) {
  chat.executePlan(planText, config.model.value, temperature.value, topP.value, maxTokens.value)
}
function onFeedback(messageId: number, rating: 'up' | 'down', comment?: string) {
  chat.sendFeedback(messageId, rating, comment)
}
function onDeleteMessage(id: number) {
  chat.deleteMessage(id)
}
function onStartEdit(text: string, id: number, ctx: any[]) {
  editRef.value = text
  editContext.value = ctx || []
  editingMessageId.value = id
}
function onCancelEdit() {
  editRef.value = ''
  editContext.value = []
  editingMessageId.value = null
}
function onSaveModel(index: number, profile: any) {
  if (index === -1) {
    config.addModel(profile)
  } else {
    config.updateModel(index, profile)
  }
}
function onDeleteModel(index: number) {
  config.deleteModel(index)
}
function onSaveConfig(cfg: { subAgentTimeout?: number; forceMultiAgent?: boolean; mode?: string; taskMode?: string; temperature?: number; topP?: number; maxTokens?: number }) {
  if (cfg.subAgentTimeout != null) config.subAgentTimeout.value = cfg.subAgentTimeout
  if (cfg.forceMultiAgent != null) config.forceMultiAgent.value = cfg.forceMultiAgent
  // Work mode: setMode persists it on the server (via setMode handler) AND
  // re-syncs the local useMode ref through the broadcast modeChanged.
  if (cfg.mode) mode.setMode(cfg.mode as any)
  // Task mode: keep the local ref in sync (drives the ConfigPanel prop) and
  // persist the choice on the server even though Web IDE doesn't act on it yet.
  if (cfg.taskMode) {
    config.taskMode.value = cfg.taskMode as any
    send({ type: 'setTaskMode', mode: cfg.taskMode } as any)
  }
  if (cfg.temperature != null) temperature.value = cfg.temperature
  if (cfg.topP != null) topP.value = cfg.topP
  if (cfg.maxTokens != null) maxTokens.value = cfg.maxTokens
  // Persist the whole behavior bundle so a refresh keeps every setting.
  config.saveConfig(cfg)
}
function onSelectMode(m: 'plan' | 'code') {
  mode.setMode(m)
}
function onToggleToken() {
  tokenPanelOpen.value = !tokenPanelOpen.value
}
function onAuthDecision(decision: 'allow_once' | 'always_allow' | 'deny') {
  showAuthDialog.value = false
  send({ type: 'permissionResponse', requestId: authRequestId.value, decision } as any)
}
function onQuestionSubmit(answers: string[]) {
  showQuestionDialog.value = false
  send({ type: 'questionResponse', requestId: questionRequestId.value, answers } as any)
}
function onQuestionBack() {
  send({ type: 'questionBack' } as any)
}
function onSelectFile(filePath: string) {
  send({ type: 'fs:read', path: filePath } as any)
}
function onClosePreview() {
  if (previewDirty.value) {
    if (!window.confirm('有未保存的修改，确定关闭吗？')) return
  }
  previewVisible.value = false
  previewEditing.value = false
  previewMode.value = 'source'
}
function onEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && activeDiff.value) {
    activeDiff.value = null
    e.preventDefault()
  } else if (e.key === 'Escape' && previewVisible.value) {
    onClosePreview()
    e.preventDefault()
  }
  // Cmd/Ctrl+S saves while editing
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && previewVisible.value && previewEditing.value) {
    e.preventDefault()
    onSavePreview()
  }
}
function onStartEditPreview() {
  previewDraft.value = previewContent.value
  previewEditing.value = true
}
function onCancelEditPreview() {
  if (previewDirty.value) {
    if (!window.confirm('放弃未保存的修改？')) return
  }
  previewDraft.value = previewContent.value
  previewEditing.value = false
}
function onSavePreview() {
  if (!previewDirty.value || previewSaving.value) return
  previewSaving.value = true
  console.log('[PREVIEW-SAVE] Sending fs:write:', { path: previewFile.value, contentLen: previewDraft.value?.length })
  send({ type: 'fs:write', path: previewFile.value, content: previewDraft.value } as any)
  // Safety timeout: if no response within 10s, reset saving state
  setTimeout(() => {
    if (previewSaving.value) {
      console.warn('[PREVIEW-SAVE] Timeout waiting for fs:writeResult — resetting')
      previewSaving.value = false
      notify('error', '保存超时，请检查服务端日志')
    }
  }, 10000)
}
function onEditorTab(e: KeyboardEvent) {
  const ta = e.target as HTMLTextAreaElement
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const v = previewDraft.value
  previewDraft.value = v.slice(0, start) + '  ' + v.slice(end)
  nextTick(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
}
function onClearChat() {
  chat.clear()
  showSessions.value = false
}

function onNewSession() {
  createSession()
  showSessions.value = false
}
</script>

<template>
  <NotificationManager />
  <!--
    Single CSS Grid: 5 columns x 2 rows.
    Col:  [left] [resizer-L] [center] [resizer-R] [right]
    Row 1: per-zone headers (one per pane column)
    Row 2: panes
    Resizers span row 1→-1 (full-height vertical lines).
    EVERY child has explicit grid-column — no auto-placement drift.
  -->
  <div class="ide-root" :style="rootGridStyle">

    <!-- ═══ Row 1, Col 1: left-zone header ═══ -->
    <div class="ide-hdr-cell ide-hdr-left">
        <svg class="ide-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#a855f7"/>
              <stop offset="100%" stop-color="#6366f1"/>
            </linearGradient>
            <linearGradient id="fg" x1="50%" y1="5%" x2="50%" y2="95%">
              <stop offset="0%" stop-color="#ddd6fe"/>
              <stop offset="100%" stop-color="#a78bfa"/>
            </linearGradient>
            <linearGradient id="ac" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc"/>
              <stop offset="100%" stop-color="#818cf8"/>
            </linearGradient>
            <clipPath id="fc"><circle cx="50" cy="50" r="38"/></clipPath>
            <mask id="fm">
              <rect width="100" height="100" fill="white"/>
              <ellipse cx="38" cy="48" rx="5.5" ry="4.2" fill="black" transform="rotate(-8 38 48)"/>
              <ellipse cx="62" cy="48" rx="5.5" ry="4.2" fill="black" transform="rotate(8 62 48)"/>
              <ellipse cx="50" cy="60.5" rx="2.8" ry="2.2" fill="black"/>
            </mask>
          </defs>
          <path fill-rule="evenodd" d="M50 2a48 48 0 1 0 0 96 48 48 0 0 0 0-96Zm0 6a42 42 0 1 1 0 84 42 42 0 0 1 0-84Z" fill="url(#rg)"/>
          <g clip-path="url(#fc)" mask="url(#fm)" fill="url(#fg)">
            <path d="M21 9L36 35L17 37.5Z"/>
            <path d="M79 9L64 35L83 37.5Z"/>
            <path d="M17.5 37.5Q17.5 55 33 63L50 74L67 63Q82.5 55 82.5 37.5L64 35Q50 43 36 35Z"/>
          </g>
          <g clip-path="url(#fc)" mask="url(#fm)" stroke="url(#ac)" stroke-width="1.2" stroke-linejoin="round" fill="none" opacity=".45">
            <path d="M21 9L36 35L17 37.5Z"/>
            <path d="M79 9L64 35L83 37.5Z"/>
            <path d="M17.5 37.5Q17.5 55 33 63L50 74L67 63Q82.5 55 82.5 37.5L64 35Q50 43 36 35Z"/>
          </g>
        </svg>
        <span class="ide-title">VTE Agent<span class="ide-title-sub">Web IDE</span></span>
      </div>

    <!-- Row 1, Col 3: center-zone header -->
    <div class="ide-hdr-cell ide-hdr-center">
      <div class="pane-header-title pane-header-session-title">
        {{ sessionTitle }}
      </div>
      <div class="pane-header-actions">
        <VTooltip text="新建会话" pos="top">
          <button class="pane-hdr-new" @click="onNewSession">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>新建会话</span>
          </button>
        </VTooltip>
        <div class="sess-drop-wrap">
          <VTooltip text="会话历史" pos="top">
            <button class="pane-hdr-btn" :class="{ active: showSessions }" @click="showSessions = !showSessions">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
            </button>
          </VTooltip>
          <div v-if="showSessions" class="sd-backdrop" @click="showSessions = false"></div>
          <SessionDropdown :visible="showSessions" @close="showSessions = false" />
        </div>
        <VTooltip text="清空对话" pos="top">
          <button class="pane-hdr-btn" @click="onClearChat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </VTooltip>
      </div>
    </div>

    <!-- Row 1, Col 5: right-zone header -->
    <div class="ide-hdr-cell ide-hdr-right">
      <div class="pane-header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span>概览</span>
      </div>
      <div class="pane-header-actions">
        <VTooltip text="Agent 面板" pos="top">
          <button class="toggle-btn" :class="{ active: agentDashboardVisible }" @click="agentDashboardVisible = !agentDashboardVisible">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <span>Agent</span>
          </button>
        </VTooltip>
        <VTooltip text="工单面板" pos="top">
          <button class="toggle-btn" :class="{ active: workOrderBoardVisible }" @click="workOrderBoardVisible = !workOrderBoardVisible">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            <span>工单</span>
          </button>
        </VTooltip>
        <VTooltip :text="connected ? '已连接' : '连接中…'" pos="top">
          <span class="ide-status-dot" :class="{ disconnected: !connected }" />
        </VTooltip>
        <VTooltip :text="config.configVisible.value ? '关闭设置' : '设置'" pos="top">
          <button class="ide-hdr-icon-btn" :class="{ active: config.configVisible.value }" @click="config.toggleConfig()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06-.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </VTooltip>
      </div>
    </div>    <!-- ═══ Left resizer (col 2, row-span: full height) ═══ -->
    <div class="ide-resizer" :class="{ 'is-dragging': leftDragging }" style="grid-column:2" title="拖动调整左侧宽度" @mousedown="startDrag('left', $event)"></div>

    <!-- ═══ Right resizer (col 4, row-span: full height) ═══ -->
    <div class="ide-resizer" :class="{ 'is-dragging': rightDragging }" style="grid-column:4" title="拖动调整右侧宽度" @mousedown="startDrag('right', $event)"></div>

    <!-- ═══ Row 2: body panes ═══ -->

    <!-- Left pane -->
    <aside class="ide-pane ide-left">
      <div class="left-scroll">
        <div class="proj-card ws-card"><WorkspaceSwitcher /></div>
        <div class="proj-card">
          <div class="proj-card-head">
            <svg class="proj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/></svg>
            <span>文件</span>
          </div>
          <ProjectTree v-if="workspace" :root="workspace" :touched="touchedMap" :modifying="modifyingSet" @select="onSelectFile" />
        </div>
        <GitStatus />
      </div>
    </aside>

    <!-- Center: chat -->
    <main class="ide-pane ide-center">
      <div class="chat-wrap">
        <MessageList
          :messages="chat.messages.value"
          :mode="mode.mode.value"
          :tool-tick="chat.toolUpdateTick.value"
          @execute-plan="onExecutePlan"
          @delete-message="onDeleteMessage"
          @start-edit="onStartEdit"
          @feedback="onFeedback"
          @suggest="onSend"
        />
        <QuestionDialog
          v-if="showQuestionDialog"
          :key="'q-' + questionStepCurrent + '-' + questionRequestId"
          :visible="showQuestionDialog"
          :question="questionText"
          :options="questionOptions"
          :multiple="questionMultiple"
          :recommended="questionRecommended"
          mode="inline"
          :step-current="questionStepCurrent"
          :step-total="questionStepTotal"
          :steps="questionStepTitles"
          :step-answers="questionStepAnswers"
          @submit="onQuestionSubmit"
          @back="onQuestionBack"
        />
        <AgentConversation
          v-if="multiAgent.activeAgentId.value"
          :agent="multiAgent.agents.value.find((a) => a.id === multiAgent.activeAgentId.value) || null"
          :history="multiAgent.agents.value.find((a) => a.id === multiAgent.activeAgentId.value)?.conversationHistory || []"
          @close="multiAgent.activeAgentId.value = null"
          @send-message="(text: string) => multiAgent.sendAgentMessage(multiAgent.activeAgentId.value!, text)"
        />
        <ActiveAgents v-if="delegationActive" :agents="multiAgent.agents.value" :request="delegationRequest" />
        <MonacoDiffDock
          v-if="activeDiff"
          :diff="activeDiff"
          :visible="true"
          @close="activeDiff = null"
        />
        <div class="chat-input-zone" :style="{ height: inputHeight + 'px' }" @mousedown="startInputDrag($event)">
          <InputArea
            :fill="true"
            :token-stats="chat.tokenStats.value"
            :busy="chat.busy.value"
            :edit-ref="editRef"
            :edit-context="editContext"
            :models="config.models.value"
            :active-model-index="config.activeModelIndex.value"
            :reasoning-level="config.reasoningLevel.value"
            :next-step-suggestion="chat.nextStepSuggestion.value"
            @send="onSend"
            @stop="onStop"
            @toggle-token="onToggleToken"
            @cancel-edit="onCancelEdit"
            @select-model="config.selectModel"
            @save-model="onSaveModel"
            @delete-model="onDeleteModel"
            @update:reasoning-level="config.setReasoningLevel"
            @open-lsp="() => notify('info', 'LSP 面板在 Web IDE 暂未启用')"
          />
        </div>
      </div>
    </main>

    <!-- Right pane -->
    <aside class="ide-pane ide-right">
      <div class="right-scroll">
        <AgentDashboard
          v-if="agentDashboardVisible"
          :agents="multiAgent.agents.value"
          :stats="multiAgent.stats.value"
          :selected-agent-id="multiAgent.activeAgentId.value"
          :scheduler-running="false"
          :global-config="globalConfig"
          @create-agent="(roleId: string, agentConfig: any) => multiAgent.createAgentWithConfig(roleId, agentConfig)"
          @start-scheduler="(m: string) => multiAgent.startScheduler(m)"
          @select-agent="multiAgent.selectAgent"
        />
        <WorkOrderBoard
          v-if="workOrderBoardVisible"
          :orders="multiAgent.workOrders.value"
          @create-order="multiAgent.createWorkOrder({ title: '新任务', requiredRole: 'dev' })"
          @decompose="(request: string) => multiAgent.decomposeRequest(request)"
          @select="(id: string) => selectedOrderId = id"
        />
        <TokenStatsPanel v-if="chat.tokenStats.value.requestCount > 0" :stats="chat.tokenStats.value" :expanded="tokenPanelOpen" />
      </div>
    </aside>

    <!-- ═══ Overlays (grid-column: 1 / -1, positioned above everything) ═══ -->
    <WorkOrderDetail v-if="selectedOrder" :order="selectedOrder" @close="selectedOrderId = null" />
    <AuthorizationDialog
      :visible="showAuthDialog"
      :tool-name="authToolName"
      :tool-args="authToolArgs"
      @allow_once="onAuthDecision('allow_once')"
      @always_allow="onAuthDecision('always_allow')"
      @deny="onAuthDecision('deny')"
    />

    <!-- Centered file preview modal -->
    <Teleport to="body">
      <div v-if="previewVisible" class="file-preview-modal" @click.self="onClosePreview">
        <div class="file-preview-dialog">
          <div class="fp-header">
            <div class="fp-title-row">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="fp-icon"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              <span class="fp-filename">{{ previewFile.split('/').pop() }}</span>
            </div>
            <span class="fp-path" :title="previewFile">{{ previewFile }}<span v-if="previewDirty" class="fp-dirty">●</span></span>
            <div class="fp-actions">
              <template v-if="isMarkdown && !previewEditing">
                <div class="fp-mode-toggle">
                  <button class="fp-mode-btn" :class="{ active: previewMode === 'rendered' }" @click="previewMode = 'rendered'">预览</button>
                  <button class="fp-mode-btn" :class="{ active: previewMode === 'source' }" @click="previewMode = 'source'">源码</button>
                </div>
              </template>
              <template v-if="!previewEditing">
                <button class="fp-btn" title="编辑文件" @click="onStartEditPreview">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  <span>编辑</span>
                </button>
              </template>
              <template v-else>
                <button class="fp-btn ghost" title="取消编辑" @click="onCancelEditPreview">取消</button>
                <button class="fp-btn primary" :disabled="!previewDirty || previewSaving" title="保存 (Cmd/Ctrl+S)" @click="onSavePreview">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
                  <span>{{ previewSaving ? '保存中…' : '保存' }}</span>
                </button>
              </template>
              <button class="fp-close" title="关闭 (Esc)" @click="onClosePreview">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
          <div class="fp-body" ref="previewEl">
            <div v-if="!previewEditing && isMarkdown && previewMode === 'rendered'" class="md-preview" v-html="renderedMarkdown"></div>
            <pre v-else-if="!previewEditing"><code v-html="highlightedContent"></code></pre>
            <textarea
              v-else
              v-model="previewDraft"
              class="fp-editor"
              spellcheck="false"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              @keydown.tab.prevent="onEditorTab"
            ></textarea>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfigPanel
      :visible="config.configVisible.value"
      :models="config.models.value"
      :active-model-index="config.activeModelIndex.value"
      :initial-sub-agent-timeout="config.subAgentTimeout.value"
      :initial-force-multi-agent="config.forceMultiAgent.value"
      :mode="mode.mode.value"
      :task-mode="config.taskMode.value as any"
      :temperature="temperature"
      :top-p="topP"
      :max-tokens="maxTokens"
      :permission-config="config.permissionConfig.value"
      :lsp-profiles="config.lspProfiles.value"
      @close="config.configVisible.value = false"
      @save="onSaveConfig"
      @select-model="config.selectModel"
      @save-model="onSaveModel"
      @delete-model="onDeleteModel"
      @update:mode="onSelectMode"
      @update:task-mode="(m: string) => { config.taskMode.value = m as any; send({ type: 'setTaskMode', mode: m } as any); notify('info', '任务模式在 Web IDE 暂未启用（选择已保存）') }"
      @update:temperature="(v: number) => (temperature = v)"
      @update:top-p="(v: number) => (topP = v)"
      @update:max-tokens="(v: number) => (maxTokens = v)"
      @update:permission="(c) => send({ type: 'setPermissionConfig', config: c } as any)"
      @lsp:setup="() => notify('info', 'LSP 设置在 Web IDE 暂未启用')"
      @lsp:test="() => notify('info', 'LSP 测试在 Web IDE 暂未启用')"
    />
  </div>
</template>
