<template>
  <NotificationManager />
  <div class="main-area" :class="{ hidden: config.configVisible.value || sessionsVisible }">
  <MessageList
    :messages="chat.messages.value"
    :mode="mode.mode.value"
    :tool-tick="chat.toolUpdateTick.value"
    @execute-plan="onExecutePlan"
    @delete-message="chat.deleteMessage"
    @start-edit="(text, id, ctx) => { editRef = text; editContext = ctx || []; editingMessageId = id }"
    @feedback="onFeedback"
  />
  </div>
  <!-- Config panel -->
  <ConfigPanel
    :visible="config.configVisible.value"
    :models="config.models.value"
    :active-model-index="config.activeModelIndex.value"
    :initial-api-key="config.apiKey.value"
    :initial-api-base="config.apiBase.value"
    :initial-model="config.model.value"
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
  <InputArea
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
    @toggle-token="toggleTokenPanel"
    @cancel-edit="() => { editRef = ''; editContext = []; editingMessageId = null }"
    @select-model="config.selectModel"
    @save-model="onSaveModel"
    @delete-model="onDeleteModel"
    @update:reasoning-level="config.setReasoningLevel"
    @open-lsp="lspPanelVisible = true"
  />
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
import { useChat } from './composables/useChat'
import { useMode } from './composables/useMode'
import { useConfig } from './composables/useConfig'
import { useTaskMode } from './composables/useTaskMode'
import { useVsCode } from './composables/useVsCode'
import { useNotification } from './composables/useNotification'
import type { TaskMode } from './protocol'

const mode = useMode()
const config = useConfig()
const taskMode = useTaskMode()
const chat = useChat(() => mode.mode.value)

const sessionsVisible = ref(false)
const skillsVisible = ref(false)
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

function onSaveConfig(cfg: { apiKey: string; apiBase: string; model: string }) {
  config.apiKey.value = cfg.apiKey
  config.apiBase.value = cfg.apiBase
  config.model.value = cfg.model
  paramsModel.value = cfg.model
  config.saveConfig()
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
