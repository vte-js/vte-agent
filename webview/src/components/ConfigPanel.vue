<template>
  <!-- Toast -->
  <Toast :visible="showToast" message="配置已保存" type="success" />

  <!-- Full-screen config panel -->
  <Teleport to="body">
    <Transition name="cfg-panel">
      <div v-if="visible" class="cfg-fullscreen">
        <div class="cfg-header">
          <div class="cfg-header-left">
            <button class="cfg-back" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="cfg-title">配置设置</span>
          </div>
        </div>

        <div class="cfg-content">
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
            <div class="cfg-field">
              <label class="cfg-label">名称</label>
              <input class="cfg-input" v-model="profileName" placeholder="My GPT-4"/>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">API 密钥</label>
              <div class="cfg-input-wrap">
                <input class="cfg-input" :type="showKey ? 'text' : 'password'" v-model="apiKey" placeholder="sk-..."/>
                <button class="cfg-input-eye" @click="showKey = !showKey">
                  <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">API 地址</label>
              <input class="cfg-input" v-model="apiBase" placeholder="https://api.openai.com/v1"/>
            </div>
            <div class="cfg-field">
              <label class="cfg-label">模型</label>
              <input class="cfg-input" v-model="modelName" placeholder="gpt-4"/>
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
            <div class="cfg-param">
              <span class="cfg-param-label">Temperature</span>
              <div class="cfg-param-slider">
                <input type="range" :value="temperature" min="0" max="2" step="0.1" @input="$emit('update:temperature', parseFloat(($event.target as HTMLInputElement).value))"/>
                <span class="cfg-param-value">{{ temperature.toFixed(1) }}</span>
              </div>
            </div>
            <div class="cfg-param">
              <span class="cfg-param-label">Top P</span>
              <div class="cfg-param-slider">
                <input type="range" :value="topP" min="0" max="1" step="0.05" @input="$emit('update:topP', parseFloat(($event.target as HTMLInputElement).value))"/>
                <span class="cfg-param-value">{{ topP.toFixed(1) }}</span>
              </div>
            </div>
            <div class="cfg-param">
              <span class="cfg-param-label">Max Tokens</span>
              <div class="cfg-param-slider">
                <input type="range" :value="maxTokens" min="256" max="16384" step="256" @input="$emit('update:maxTokens', parseInt(($event.target as HTMLInputElement).value))"/>
                <span class="cfg-param-value">{{ maxTokens }}</span>
              </div>
            </div>
          </div>

          <!-- Save Button -->
          <div class="cfg-save">
            <button class="cfg-save-btn" @click="onSave">保存配置</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { AgentMode } from '../composables/useMode'
import type { TaskMode } from '../protocol'
import type { ModelProfile } from '../composables/useConfig'
import ModelSelector from './ModelSelector.vue'
import Toast from './Toast.vue'

const props = defineProps<{
  visible: boolean
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
}>()

const emit = defineEmits<{
  close: []
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
const showToast = ref(false)

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
  emit('save', { apiKey: apiKey.value, apiBase: apiBase.value, model: modelName.value })
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2000)
}
</script>

<style scoped>
.cfg-fullscreen {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--vte-bg, #1e1e1e);
  display: flex; flex-direction: column;
}

.cfg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px; border-bottom: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated, #252526);
}
.cfg-header-left {
  display: flex; align-items: center; gap: 12px;
  height: 32px; /* Match back button height */
}

.cfg-back {
  width: 32px; height: 32px; border-radius: 8px; border: none;
  background: none; color: var(--vte-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.cfg-back:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vte-text); }

.cfg-title {
  font-size: 16px; font-weight: 600; color: var(--vte-text);
  line-height: 32px; margin: 0;
}

.cfg-content {
  flex: 1; overflow-y: auto; padding: 16px;
  max-width: 600px; margin: 0 auto; width: 100%;
}

.cfg-section {
  margin-bottom: 24px;
}
.cfg-section-label {
  font-size: 12px; font-weight: 600; color: var(--vte-text-muted);
  text-transform: uppercase; letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.cfg-field {
  margin-bottom: 16px;
}
.cfg-label {
  display: block; font-size: 12px; color: var(--vte-text-muted);
  margin-bottom: 6px;
}
.cfg-input {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--vte-border); background: var(--vte-input-bg);
  color: var(--vte-text); font-size: 13px; outline: none;
  transition: border-color 0.15s;
}
.cfg-input:focus { border-color: var(--vte-primary); }
.cfg-input::placeholder { color: var(--vte-text-muted); opacity: 0.5; }

.cfg-input-wrap {
  position: relative; display: flex; align-items: center;
}
.cfg-input-wrap .cfg-input { padding-right: 40px; }
.cfg-input-eye {
  position: absolute; right: 8px;
  width: 28px; height: 28px; border: none; background: none;
  color: var(--vte-text-muted); cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
}
.cfg-input-eye:hover { color: var(--vte-text); }

.cfg-mode-list {
  display: flex; flex-direction: column; gap: 8px;
}
.cfg-mode-opt {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 8px; border: 1px solid var(--vte-border);
  cursor: pointer; transition: all 0.15s;
}
.cfg-mode-opt:hover { border-color: var(--vte-primary); }
.cfg-mode-opt.selected { border-color: var(--vte-primary); background: rgba(99,102,241,0.05); }

.cfg-mode-dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid var(--vte-border); flex-shrink: 0;
}
.cfg-mode-dot.code { border-color: #22c55e; background: #22c55e; }
.cfg-mode-dot.plan { border-color: #3b82f6; background: #3b82f6; }
.cfg-mode-dot.off { border-color: #64748b; background: #64748b; }
.cfg-mode-dot.llm { border-color: #a855f7; background: #a855f7; }
.cfg-mode-dot.plugin { border-color: #f59e0b; background: #f59e0b; }

.cfg-mode-name { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.cfg-mode-desc { font-size: 11px; color: var(--vte-text-muted); margin-top: 2px; }

.cfg-param {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.cfg-param-label { font-size: 13px; color: var(--vte-text); }
.cfg-param-slider {
  display: flex; align-items: center; gap: 12px; width: 200px;
}
.cfg-param-slider input[type="range"] {
  flex: 1; height: 4px; border-radius: 2px;
  background: var(--vte-border); outline: none; cursor: pointer;
}
.cfg-param-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: var(--vte-primary); cursor: pointer;
}
.cfg-param-value {
  font-size: 12px; color: var(--vte-text-muted); min-width: 40px; text-align: right;
}

.cfg-save {
  padding-top: 24px; border-top: 1px solid var(--vte-border);
}
.cfg-save-btn {
  width: 100%; padding: 12px; border-radius: 8px; border: none;
  background: var(--vte-primary); color: #fff; font-size: 14px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.cfg-save-btn:hover { opacity: 0.9; }
.cfg-save-btn.success { background: var(--vte-success); }

/* Transition */
.cfg-panel-enter-active { transition: opacity 0.2s ease; }
.cfg-panel-leave-active { transition: opacity 0.15s ease; }
.cfg-panel-enter-from, .cfg-panel-leave-to { opacity: 0; }
</style>
