<template>
  <AppHeader @open-config="toggleConfig" @run-tests="runTests" @clear="chat.clear()" />
  <div class="main-area" :class="{ hidden: configVisible }">
  <MessageList
    :messages="chat.messages.value"
    :mode="mode.mode.value"
    @execute-plan="onExecutePlan"
    @delete-message="chat.deleteMessage"
    @start-edit="editRef = $event"
  />
  </div>
  <div class="config-overlay" v-if="configVisible">
    <ConfigPanel
      :initial-api-key="config.apiKey.value"
      :initial-api-base="config.apiBase.value"
      :initial-model="config.model.value"
      :mode="mode.mode.value"
      :task-mode="taskMode.taskMode.value"
      :temperature="temperature"
      :top-p="topP"
      :max-tokens="maxTokens"
      :saved="configSaved"
      @save="onSaveConfig"
      @update:mode="onSelectMode"
      @update:task-mode="onSelectTaskMode"
      @update:temperature="(v) => temperature = v"
      @update:top-p="(v) => topP = v"
      @update:max-tokens="(v) => maxTokens = v"
    />
  </div>
  <TokenStatsPanel :stats="chat.tokenStats.value" :expanded="tokenPanelOpen" />
  <InputArea
    :token-stats="chat.tokenStats.value"
    :busy="chat.busy.value"
    :edit-ref="editRef"
    @send="onSend"
    @stop="onStop"
    @toggle-token="toggleTokenPanel"
    @cancel-edit="editRef = ''"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ConfigPanel from './components/ConfigPanel.vue'
import MessageList from './components/MessageList.vue'
import TokenStatsPanel from './components/TokenStats.vue'
import InputArea from './components/InputArea.vue'
import { useChat } from './composables/useChat'
import { useMode } from './composables/useMode'
import { useConfig } from './composables/useConfig'
import { useTaskMode } from './composables/useTaskMode'
import { useVsCode } from './composables/useVsCode'
import type { TaskMode } from './protocol'

const mode = useMode()
const config = useConfig()
const taskMode = useTaskMode()
const chat = useChat(() => mode.mode.value)

const configVisible = ref(false)
const tokenPanelOpen = ref(false)
const configSaved = ref(false)
const editRef = ref('')

const paramsModel = ref('gpt-4o')
const temperature = ref(0.7)
const topP = ref(1.0)
const maxTokens = ref(4096)

onMounted(() => {
  config.init()
  watch(() => config.model.value, (v) => { if (v) paramsModel.value = v }, { immediate: true })
})

function toggleConfig() {
  configVisible.value = !configVisible.value
  tokenPanelOpen.value = false
}

function onSend(text: string) {
  if (editRef.value) {
    // Edit mode: resend the edited message
    const editId = chat.messages.value.find(m => m.role === 'user' && m.text === editRef.value && 'timestamp' in m)
    if (editId) chat.resendMessage(editId.id, text, paramsModel.value, temperature.value, topP.value, maxTokens.value)
    editRef.value = ''
  } else {
    chat.sendChat(text, paramsModel.value, temperature.value, topP.value, maxTokens.value)
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
  configSaved.value = true
  setTimeout(() => configSaved.value = false, 2000)
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

function toggleTokenPanel() {
  tokenPanelOpen.value = !tokenPanelOpen.value
  configVisible.value = false
}

function runTests() {
  const { send } = useVsCode()
  send({ type: 'runTests' } as any)
}
</script>
