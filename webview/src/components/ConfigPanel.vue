<template>
  <div class="cfg">
    <div class="cfg-title">配置</div>

    <!-- Model Profiles -->
    <div class="cfg-section">
      <div class="cfg-section-label">模型配置</div>
      <ModelSelector
        :models="models"
        :active-index="activeModelIndex"
        @select="$emit('selectModel', $event)"
        @save="(i, p) => $emit('saveModel', i, p)"
        @delete="$emit('deleteModel', $event)"
      />
    </div>

    <!-- API Settings -->
    <div class="cfg-section">
      <div class="cfg-section-label">当前模型设置</div>
      <div class="fld">
        <label class="fld-lbl">名称</label>
        <input class="c-input" v-model="profileName" placeholder="My GPT-4"/>
      </div>
      <div class="fld">
        <label class="fld-lbl">API 密钥</label>
        <div class="c-input-wrap">
          <input class="c-input" :type="showKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..."/>
          <VTooltip :text="showKey ? '隐藏密钥' : '显示密钥'">
            <button class="c-input-eye" @click="showKey = !showKey">
              <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            </button>
          </VTooltip>
        </div>
      </div>
      <div class="fld">
        <label class="fld-lbl">API 地址</label>
        <input class="c-input" v-model="apiBase" placeholder="https://api.openai.com/v1"/>
      </div>
      <div class="fld">
        <label class="fld-lbl">模型</label>
        <input class="c-input" v-model="modelName" placeholder="gpt-4"/>
      </div>
    </div>

    <!-- Mode Settings -->
    <div class="cfg-section">
      <div class="cfg-section-label">执行模式</div>
      <div class="cfg-mode-list">
        <div class="cfg-mode-opt" :class="{ selected: mode === 'code' }" @click="$emit('update:mode', 'code')">
          <span class="cfg-mode-dot code"></span>
          <div>
            <div class="cfg-mode-name">编码模式</div>
            <div class="cfg-mode-desc">直接编辑、编写和执行代码</div>
          </div>
        </div>
        <div class="cfg-mode-opt" :class="{ selected: mode === 'plan' }" @click="$emit('update:mode', 'plan')">
          <span class="cfg-mode-dot plan"></span>
          <div>
            <div class="cfg-mode-name">规划模式</div>
            <div class="cfg-mode-desc">分析代码并生成实施计划，只读</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Mode Settings -->
    <div class="cfg-section">
      <div class="cfg-section-label">任务清单</div>
      <div class="cfg-mode-list">
        <div class="cfg-mode-opt" :class="{ selected: taskMode === 'off' }" @click="$emit('update:taskMode', 'off')">
          <span class="cfg-mode-dot off"></span>
          <div>
            <div class="cfg-mode-name">关闭</div>
            <div class="cfg-mode-desc">不使用任务清单跟踪</div>
          </div>
        </div>
        <div class="cfg-mode-opt" :class="{ selected: taskMode === 'llm-auto' }" @click="$emit('update:taskMode', 'llm-auto')">
          <span class="cfg-mode-dot llm"></span>
          <div>
            <div class="cfg-mode-name">LLM 自判断</div>
            <div class="cfg-mode-desc">LLM 自行决定，插件校验是否偷懒</div>
          </div>
        </div>
        <div class="cfg-mode-opt" :class="{ selected: taskMode === 'plugin-auto' }" @click="$emit('update:taskMode', 'plugin-auto')">
          <span class="cfg-mode-dot plugin"></span>
          <div>
            <div class="cfg-mode-name">插件自判断</div>
            <div class="cfg-mode-desc">插件分析复杂度，自动指导 LLM</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Parameter Settings -->
    <div class="cfg-section">
      <div class="cfg-section-label">模型参数</div>
      <div class="p-row">
        <span class="p-label">Temperature</span>
        <div class="p-slider-wrap">
          <input type="range" class="p-slider" :value="temperature" min="0" max="2" step="0.1" @input="$emit('update:temperature', parseFloat(($event.target as HTMLInputElement).value))"/>
          <span class="p-val">{{ temperature.toFixed(1) }}</span>
        </div>
      </div>
      <div class="p-row">
        <span class="p-label">Top P</span>
        <div class="p-slider-wrap">
          <input type="range" class="p-slider" :value="topP" min="0" max="1" step="0.05" @input="$emit('update:topP', parseFloat(($event.target as HTMLInputElement).value))"/>
          <span class="p-val">{{ topP.toFixed(1) }}</span>
        </div>
      </div>
      <div class="p-row">
        <span class="p-label">Max Tokens</span>
        <div class="p-slider-wrap">
          <input type="range" class="p-slider" :value="maxTokens" min="256" max="16384" step="256" @input="$emit('update:maxTokens', parseInt(($event.target as HTMLInputElement).value))"/>
          <span class="p-val">{{ maxTokens }}</span>
        </div>
      </div>
    </div>

    <div class="save-row">
      <button class="save-btn" @click="onSave">保存配置</button>
      <span v-if="saved" class="save-ok">已保存</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AgentMode } from '../composables/useMode'
import type { TaskMode } from '../protocol'
import type { ModelProfile } from '../composables/useConfig'
import VTooltip from './VTooltip.vue'
import ModelSelector from './ModelSelector.vue'

const props = defineProps<{
  models: ModelProfile[]
  activeModelIndex: number
  initialApiKey: string
  initialApiBase: string
  initialModel: string
  mode: AgentMode
  taskMode: TaskMode
  temperature: number
  topP: number
  maxTokens: number
  saved: boolean
}>()

const emit = defineEmits<{
  save: [config: { apiKey: string; apiBase: string; model: string }]
  selectModel: [index: number]
  saveModel: [index: number, profile: { name: string; apiKey: string; apiBase: string; model: string }]
  deleteModel: [index: number]
  'update:mode': [mode: AgentMode]
  'update:taskMode': [taskMode: TaskMode]
  'update:temperature': [value: number]
  'update:topP': [value: number]
  'update:maxTokens': [value: number]
}>()

const profileName = ref('')
const apiKey = ref(props.initialApiKey)
const apiBase = ref(props.initialApiBase)
const modelName = ref(props.initialModel)
const showKey = ref(false)

watch(() => props.activeModelIndex, () => {
  const m = props.models[props.activeModelIndex]
  if (m) {
    profileName.value = m.name
    apiKey.value = m.apiKey
    apiBase.value = m.apiBase
    modelName.value = m.model
  }
}, { immediate: true })

watch(() => props.initialApiKey, (v) => apiKey.value = v)
watch(() => props.initialApiBase, (v) => apiBase.value = v)
watch(() => props.initialModel, (v) => modelName.value = v)

function onSave() {
  emit('updateProfile', {
    name: profileName.value || 'Unnamed',
    apiKey: apiKey.value,
    apiBase: apiBase.value,
    model: modelName.value,
  })
  emit('save', { apiKey: apiKey.value, apiBase: apiBase.value, model: modelName.value })
}
</script>
