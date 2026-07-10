<template>
  <NotificationManager />
  <div class="main-area" :class="{ hidden: config.configVisible.value || sessionsVisible }">
  <MessageList
    :messages="chat.messages.value"
    :mode="mode.mode.value"
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
    @send="onSend"
    @stop="onStop"
    @toggle-token="toggleTokenPanel"
    @cancel-edit="() => { editRef = ''; editContext = []; editingMessageId = null }"
    @select-model="config.selectModel"
    @save-model="onSaveModel"
    @delete-model="onDeleteModel"
    @update:reasoning-level="config.setReasoningLevel"
  />
  <SkillsPanel :visible="skillsVisible" @close="skillsVisible = false" />
  <AuthorizationDialog
    :visible="showAuthDialog"
    :tool-name="authToolName"
    :tool-args="authToolArgs"
    @allow_once="onAuthDecision('allow_once')"
    @always_allow="onAuthDecision('always_allow')"
    @deny="onAuthDecision('deny')"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import SessionManager from './components/SessionManager.vue'
import NotificationManager from './components/NotificationManager.vue'
import MessageList from './components/MessageList.vue'
import TokenStatsPanel from './components/TokenStats.vue'
import InputArea from './components/InputArea.vue'
import SkillsPanel from './components/SkillsPanel.vue'
import AuthorizationDialog from './components/AuthorizationDialog.vue'
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

const paramsModel = ref('gpt-4o')
const temperature = ref(0.7)
const topP = ref(1.0)
const maxTokens = ref(4096)

onMounted(() => {
  config.init()
  watch(() => config.model.value, (v) => { if (v) paramsModel.value = v }, { immediate: true })

  // Listen for toast, skills panel, and permission messages
  const { onMessage } = useVsCode()
  const { notify } = useNotification()
  onMessage((msg) => {
    if (msg.type === 'skills:openPanel') {
      skillsVisible.value = true
    } else if (msg.type === 'sessions:openPanel') {
      sessionsVisible.value = true
    } else if (msg.type === 'toast') {
      notify(msg.level, msg.text)
    } else if (msg.type === 'permissionRequest') {
      // Show authorization dialog
      authRequestId.value = msg.requestId
      authToolName.value = msg.toolName
      authToolArgs.value = msg.toolArgs
      showAuthDialog.value = true
    }
  })
})

function onAuthDecision(decision: 'allow_once' | 'always_allow' | 'deny') {
  const { send } = useVsCode()
  send({ type: 'permissionResponse', requestId: authRequestId.value, decision })
  showAuthDialog.value = false
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
