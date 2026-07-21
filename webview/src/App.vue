<template>
  <NotificationManager />
  <div class="main-area" :class="{ hidden: config.configVisible.value || sessionsVisible }">
    <!-- Multi-agent toggle bar -->
    <div class="agent-toggle-bar">
      <button class="toggle-btn" :class="{ active: agentDashboardVisible }" @click="agentDashboardVisible = !agentDashboardVisible">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span>Agent</span>
      </button>
      <button class="toggle-btn" :class="{ active: workOrderBoardVisible }" @click="workOrderBoardVisible = !workOrderBoardVisible">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>
        <span>工单</span>
      </button>
    </div>
    <!-- Agent Dashboard (toggleable) -->
    <AgentDashboard
      v-if="agentDashboardVisible"
      :agents="multiAgent.agents.value"
      :stats="multiAgent.stats.value"
      :selected-agent-id="multiAgent.activeAgentId.value"
      :scheduler-running="false"
      :global-config="{ model: config.model.value, apiKey: config.apiKey.value, apiBase: config.apiBase.value }"
      @create-agent="(roleId, agentConfig) => multiAgent.createAgentWithConfig(roleId, agentConfig)"
      @start-scheduler="(m) => multiAgent.startScheduler(m)"
      @select-agent="multiAgent.selectAgent"
    />
    <!-- Work Order Board (toggleable) -->
    <WorkOrderBoard
      v-if="workOrderBoardVisible"
      :orders="multiAgent.workOrders.value"
      @create-order="multiAgent.createWorkOrder({ title: '新任务', requiredRole: 'dev' })"
      @decompose="(request) => multiAgent.decomposeRequest(request)"
      @select="(id) => selectedOrderId = id"
    />
    <!-- Main content area with optional agent conversation sidebar -->
    <div class="main-content-row" :class="{ 'has-sidebar': multiAgent.activeAgentId.value }">
      <MessageList
      :messages="chat.messages.value"
      :mode="mode.mode.value"
      :tool-tick="chat.toolUpdateTick.value"
      @execute-plan="onExecutePlan"
    @delete-message="chat.deleteMessage"
    @start-edit="(text, id, ctx) => { editRef = text; editContext = ctx || []; editingMessageId = id }"
    @feedback="onFeedback"
    />
    <!-- Agent Conversation Sidebar -->
    <AgentConversation
      v-if="multiAgent.activeAgentId.value"
      :agent="multiAgent.agents.value.find(a => a.id === multiAgent.activeAgentId.value) || null"
      :history="multiAgent.agents.value.find(a => a.id === multiAgent.activeAgentId.value)?.conversationHistory || []"
      @close="multiAgent.activeAgentId.value = null"
      @send-message="(text) => multiAgent.sendAgentMessage(multiAgent.activeAgentId.value!, text)"
    />
    <!-- Active-agent floating strip (overlays chat bottom, zero layout impact) -->
    <ActiveAgents
      v-if="delegationActive"
      :agents="multiAgent.agents.value"
      :request="delegationRequest"
    />
    </div>
    <!-- Input area -->
    <InputArea
      :token-stats="chat.tokenStats.value"
      :busy="chat.busy.value"
      :edit-ref="editRef"
      :edit-context="editContext"
      :models="config.models.value"
      :active-model-index="config.activeModelIndex.value"
      :reasoning-level="config.reasoningLevel.value"
      :active-capability="config.activeCapability.value"
      :next-step-suggestion="chat.nextStepSuggestion.value"
      @send="onSend"
      @stop="onStop"
      @toggle-token="toggleTokenPanel"
      @cancel-edit="() => { editRef = ''; editContext = []; editingMessageId = null }"
      @select-model="config.selectModel"
      @save-model="onSaveModel"
      @delete-model="onDeleteModel"
      @update:reasoning-level="config.setReasoningLevel"
      @open-lsp="lspPanelVisible = true"
    />
    <!-- Work Order Detail overlay (absolute, pinned to main-area right edge) -->
    <WorkOrderDetail
      v-if="selectedOrder"
      :order="selectedOrder"
      @close="selectedOrderId = null"
    />
  </div>
  <ConfigPanel
    :visible="config.configVisible.value"
    :models="config.models.value"
    :active-model-index="config.activeModelIndex.value"
    :initial-sub-agent-timeout="config.subAgentTimeout.value"
    :initial-force-multi-agent="config.forceMultiAgent.value"
    :mode="mode.mode.value"
    :task-mode="taskMode.taskMode.value"
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
    @update:task-mode="onSelectTaskMode"
    @update:temperature="(v) => temperature = v"
    @update:top-p="(v) => topP = v"
    @update:max-tokens="(v) => maxTokens = v"
    @update:permission="config.updatePermissionConfig"
    @lsp:setup="config.setupLsp"
    @lsp:test="config.testLsp"
  />
  <!-- Session panel -->
  <SessionManager
    :visible="sessionsVisible"
    @close="sessionsVisible = false"
    @restore="onSessionRestore"
  />
  <TokenStatsPanel :stats="chat.tokenStats.value" :expanded="tokenPanelOpen" />
  <SkillsPanel :visible="skillsVisible" @close="skillsVisible = false" />
  <LspControlPanel
    :visible="lspPanelVisible"
    :languages="lspLanguages"
    :cache-stats="lspCacheStats"
    @close="lspPanelVisible = false"
    @test="config.testLsp"
    @refresh="onLspRefresh"
    @clear-cache="onLspClearCache"
    @setup="config.setupLsp"
    @open-config-editor="onOpenConfigEditor"
    @delete="onLspDelete"
  />
  <LspConfigEditor
    :visible="config.configEditorVisible.value"
    :profiles="config.lspConfigProfiles.value"
    @close="onCloseConfigEditor"
    @save="config.saveLspProfile"
    @delete="config.deleteLspProfile"
    @add="config.addLspProfile"
  />
  <AuthorizationDialog
    :visible="showAuthDialog"
    :tool-name="authToolName"
    :tool-args="authToolArgs"
    @allow_once="onAuthDecision('allow_once')"
    @always_allow="onAuthDecision('always_allow')"
    @deny="onAuthDecision('deny')"
  />
  <QuestionDialog
    :visible="showQuestionDialog"
    :question="questionText"
    :options="questionOptions"
    :multiple="questionMultiple"
    :recommended="questionRecommended"
    @submit="onQuestionSubmit"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import SessionManager from './components/SessionManager.vue'
import NotificationManager from './components/NotificationManager.vue'
import MessageList from './components/MessageList.vue'
import TokenStatsPanel from './components/TokenStats.vue'
import InputArea from './components/InputArea.vue'
import SkillsPanel from './components/SkillsPanel.vue'
import AuthorizationDialog from './components/AuthorizationDialog.vue'
import QuestionDialog from './components/QuestionDialog.vue'
import LspControlPanel from './components/LspControlPanel.vue'
import LspConfigEditor from './components/LspConfigEditor.vue'
import AgentDashboard from './components/AgentDashboard.vue'
import WorkOrderBoard from './components/WorkOrderBoard.vue'
import WorkOrderDetail from './components/WorkOrderDetail.vue'
import AgentConversation from './components/AgentConversation.vue'
import ActiveAgents from './components/ActiveAgents.vue'
import { useChat } from './composables/useChat'
import { useMode } from './composables/useMode'
import { useConfig } from './composables/useConfig'
import { useTaskMode } from './composables/useTaskMode'
import { useMultiAgent } from './composables/useMultiAgent'
import { useVsCode } from './composables/useVsCode'
import { useNotification } from './composables/useNotification'
import type { TaskMode } from './protocol'

const mode = useMode()
const config = useConfig()
const taskMode = useTaskMode()
const chat = useChat(() => mode.mode.value)
const multiAgent = useMultiAgent()

const sessionsVisible = ref(false)
const skillsVisible = ref(false)
const agentDashboardVisible = ref(false)
const workOrderBoardVisible = ref(false)
const selectedOrderId = ref<string | null>(null)
const selectedOrder = computed(() =>
  multiAgent.workOrders.value.find(o => o.id === selectedOrderId.value) || null
)
const tokenPanelOpen = ref(false)
const editRef = ref('')
const editContext = ref<import('./protocol').ContextAttachment[]>([])
const editingMessageId = ref<number | null>(null)

// Permission dialog state
const showAuthDialog = ref(false)
const authToolName = ref('')
const authToolArgs = ref<Record<string, unknown>>({})
const authRequestId = ref('')

// Question dialog state
const showQuestionDialog = ref(false)
const questionRequestId = ref('')
const questionText = ref('')
const questionOptions = ref<Array<{ label: string; description?: string }>>([])
const questionMultiple = ref(false)
const questionRecommended = ref('')

// LSP panel state
const lspPanelVisible = ref(false)

// Auto-delegation active-agent strip (main chat)
const delegationActive = ref(false)
const delegationRequest = ref('')

// Last assistant text for dynamic placeholder
const lastAssistantText = computed(() => {
  const msgs = chat.messages.value
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i] as any
    if (m.role === 'assistant' && m.text) return m.text
  }
  return ''
})
interface LspLang {
  id: string
  status: 'online' | 'offline' | 'circuit-breaker-open'
  strategy: string
  tools: string[]
  successRate: number
  cacheHits: number
  successCount: number
  failureCount: number
  lastError?: string
}
const lspLanguages = ref<LspLang[]>([])
const lspCacheStats = ref({ size: 0, hitRate: 0, ttl: 300, maxSize: 1000 })

const paramsModel = ref('gpt-4o')
const temperature = ref(0.7)
const topP = ref(1.0)
const maxTokens = ref(4096)

onMounted(() => {
  watch(() => config.model.value, (v) => { if (v) paramsModel.value = v }, { immediate: true })

  // Load LSP languages from profiles
  watch(() => config.lspProfiles.value, (profiles) => {
    const langs: LspLang[] = []
    for (const [id, profile] of Object.entries(profiles)) {
      langs.push({
        id,
        status: 'online',
        strategy: profile.strategy,
        tools: profile.tools || [],
        successRate: 100,
        cacheHits: 0,
        successCount: 0,
        failureCount: 0,
      })
    }
    lspLanguages.value = langs
  }, { immediate: true })

  // Listen for toast, skills panel, and permission messages
  const { onMessage, signalReady } = useVsCode()
  const { notify } = useNotification()
  onMessage((msg) => {
    if (msg.type === 'skills:openPanel') {
      skillsVisible.value = true
    } else if (msg.type === 'sessions:openPanel') {
      sessionsVisible.value = true
    } else if (msg.type === 'lspConfigEditor:open') {
      config.openConfigEditor()
    } else if (msg.type === 'toast') {
      notify(msg.level, msg.text)
    } else if (msg.type === 'permissionRequest') {
      // Show authorization dialog
      authRequestId.value = msg.requestId
      authToolName.value = msg.toolName
      authToolArgs.value = msg.toolArgs
      showAuthDialog.value = true
    } else if (msg.type === 'questionRequest') {
      // Show question dialog
      questionRequestId.value = msg.requestId
      questionText.value = msg.question
      questionOptions.value = msg.options || []
      questionMultiple.value = msg.multiple || false
      questionRecommended.value = msg.recommended || ''
      showQuestionDialog.value = true
    } else if (msg.type === 'lsp:cacheStats') {
      lspCacheStats.value.size = msg.stats?.size ?? 0
    } else if (msg.type === 'lsp:statsUpdate') {
      // Update language stats from LSP service
      const stats = msg.stats
      if (stats?.callsByLanguage) {
        lspLanguages.value = lspLanguages.value.map(lang => ({
          ...lang,
          successCount: stats.callsByLanguage[lang.id] ?? 0,
          successRate: stats.callsByLanguage[lang.id] ? 100 : 0,
        }))
      }
      if (stats) {
        lspCacheStats.value.size = stats.cacheHits + stats.cacheMisses
        lspCacheStats.value.hitRate = stats.totalCalls > 0
          ? Math.round((stats.cacheHits / stats.totalCalls) * 100)
          : 0
      }
    } else if (msg.type === 'multiAgent:delegationStart') {
      // Main agent auto-delegated: show active-agent strip above input.
      delegationActive.value = true
      delegationRequest.value = msg.request || ''
    } else if (msg.type === 'multiAgent:delegationEnd') {
      // Sub-agents finished; hide the strip (synthesis begins).
      delegationActive.value = false
    }
  })

  // Signal ready to extension, then request initial data
  // The extension will send data back after receiving ready
  signalReady()
})

function onAuthDecision(decision: 'allow_once' | 'always_allow' | 'deny') {
  const { send } = useVsCode()
  send({ type: 'permissionResponse', requestId: authRequestId.value, decision })
  showAuthDialog.value = false
}

function onQuestionSubmit(answer: string) {
  const { send } = useVsCode()
  send({ type: 'questionResponse', requestId: questionRequestId.value, answer })
  showQuestionDialog.value = false
}

// LSP handlers
function onLspRefresh() {
  const { send } = useVsCode()
  send({ type: 'lsp:refreshStatus' })
}

function onLspClearCache() {
  const { send } = useVsCode()
  send({ type: 'lsp:clearCache' })
}

function onLspDelete(languageId: string) {
  config.deleteLspProfile(languageId)
}

function onOpenConfigEditor() {
  lspPanelVisible.value = false
  config.openConfigEditor()
}

function onCloseConfigEditor() {
  config.configEditorVisible.value = false
  lspPanelVisible.value = true
}

function toggleConfig() {
  config.configVisible.value = !config.configVisible.value
  tokenPanelOpen.value = false
}

function onNewSession() {
  const { send } = useVsCode()
  send({ type: 'session:create' })
}

function onSend(text: string, images?: import('./protocol').ImageAttachment[], context?: import('./protocol').ContextAttachment[]) {
  if (editingMessageId.value !== null) {
    const id = editingMessageId.value
    chat.resendMessage(id, text, paramsModel.value, temperature.value, topP.value, maxTokens.value, context)
    editRef.value = ''
    editingMessageId.value = null
  } else {
    chat.sendChat(text, paramsModel.value, temperature.value, topP.value, maxTokens.value, images, context)
  }
}

function onStop() {
  chat.stop()
}

function onSaveConfig(cfg: { subAgentTimeout?: number; forceMultiAgent?: boolean; mode?: string; taskMode?: string; temperature?: number; topP?: number; maxTokens?: number }) {
  if (cfg.subAgentTimeout != null) config.subAgentTimeout.value = cfg.subAgentTimeout
  if (cfg.forceMultiAgent != null) config.forceMultiAgent.value = cfg.forceMultiAgent
  // Forward EVERY behavior / sampling field to saveConfig() so the 保存
  // button round-trips mode / taskMode / temperature / topP / maxTokens.
  // Previously cfg was dropped here, so only subAgentTimeout + forceMultiAgent
  // were persisted and the rest reverted to defaults on reload.
  if (cfg.mode != null) config.mode.value = cfg.mode as any
  if (cfg.taskMode != null) config.taskMode.value = cfg.taskMode as any
  if (cfg.temperature != null) config.temperature.value = cfg.temperature
  if (cfg.topP != null) config.topP.value = cfg.topP
  if (cfg.maxTokens != null) config.maxTokens.value = cfg.maxTokens
  config.saveConfig(cfg)
}

function onSaveModel(index: number, profile: { name: string; apiKey: string; apiBase: string; model: string }) {
  if (index === -1) {
    // New model
    config.addModel(profile)
  } else {
    // Edit existing
    config.updateModel(index, profile)
  }
}

function onDeleteModel(index: number) {
  config.deleteModel(index)
}

function onSelectMode(m: 'plan' | 'code') {
  mode.setMode(m)
}

function onSelectTaskMode(m: TaskMode) {
  taskMode.setTaskMode(m)
}

function onExecutePlan(text: string) {
  chat.executePlan(text, paramsModel.value, temperature.value, topP.value, maxTokens.value)
  mode.setMode('code')
}

function onFeedback(messageId: number, rating: 'up' | 'down', comment?: string) {
  chat.sendFeedback(messageId, rating, comment)
}

function toggleTokenPanel() {
  tokenPanelOpen.value = !tokenPanelOpen.value
  configVisible.value = false
}

function onSessionRestore(sessionId: string) {
  // Session restored, the chat history will be synced via chatHistory message
  sessionsVisible.value = false
}

function runTests() {
  const { send } = useVsCode()
  send({ type: 'runTests' } as any)
}
</script>
