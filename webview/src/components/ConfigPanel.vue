<template>
  <Toast :visible="showToast" message="配置已保存" type="success" />

  <Teleport to="body">
    <Transition name="cfg-panel">
      <div v-if="visible" class="cfg-overlay" @click.self="$emit('close')">
        <div class="cfg-modal">
          <div class="cfg-header">
            <div class="cfg-header-left">
              <span class="cfg-title">VTE Agent 设置</span>
            </div>
            <button class="cfg-close" @click="$emit('close')" title="关闭">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="cfg-layout">
            <!-- Left navigation -->
            <nav class="cfg-nav">
              <button
                v-for="cat in categories"
                :key="cat.key"
                class="cfg-nav-item"
                :class="{ active: activeCategory === cat.key }"
                @click="activeCategory = cat.key"
              >
                <span class="cfg-nav-icon" v-html="cat.icon" />
                <span class="cfg-nav-label">{{ cat.label }}</span>
              </button>
            </nav>

            <!-- Right content -->
            <div class="cfg-main">
              <!-- ═══════════════════════════
                   Category: 模型配置
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'model'" class="cfg-section">
                <div class="cfg-group">
                  <div class="cfg-group-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>模型配置</span>
                  </div>
                  <div class="cfg-group-body">
                    <ModelSelector
                      :models="models"
                      :active-index="activeModelIndex"
                      @select="$emit('selectModel', $event)"
                      @save="(i, p) => $emit('saveModel', i, p)"
                      @delete="$emit('deleteModel', $event)"
                    />
                  </div>
                </div>
              </div>

              <!-- ═══════════════════════════
                   Category: 执行行为
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'behavior'" class="cfg-section">
                <div class="cfg-group">
                  <div class="cfg-group-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <span>执行行为</span>
                  </div>
                  <div class="cfg-group-body">
                    <!-- Mode selection -->
                    <div class="cfg-subsection">
                      <div class="cfg-subsection-label">工作模式</div>
                      <div class="cfg-mode-grid">
                        <div class="cfg-mode-card" :class="{ selected: mode === 'code' }" @click="$emit('update:mode', 'code')">
                          <div class="cfg-mode-icon code">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                          </div>
                          <div class="cfg-mode-info">
                            <div class="cfg-mode-name">编码模式</div>
                            <div class="cfg-mode-desc">直接编辑、编写和执行代码</div>
                          </div>
                        </div>
                        <div class="cfg-mode-card" :class="{ selected: mode === 'plan' }" @click="$emit('update:mode', 'plan')">
                          <div class="cfg-mode-icon plan">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                          </div>
                          <div class="cfg-mode-info">
                            <div class="cfg-mode-name">规划模式</div>
                            <div class="cfg-mode-desc">分析代码并生成实施计划，只读</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Task mode -->
                    <div class="cfg-subsection">
                      <div class="cfg-subsection-label">任务清单</div>
                      <div class="cfg-seg-control">
                        <button class="cfg-seg-btn" :class="{ active: taskMode === 'off' }" @click="$emit('update:taskMode', 'off')">关闭</button>
                        <button class="cfg-seg-btn" :class="{ active: taskMode === 'llm-auto' }" @click="$emit('update:taskMode', 'llm-auto')">LLM 自判断</button>
                        <button class="cfg-seg-btn" :class="{ active: taskMode === 'plugin-auto' }" @click="$emit('update:taskMode', 'plugin-auto')">插件自判断</button>
                      </div>
                    </div>

                    <!-- Sub-agent timeout -->
                    <div class="cfg-subsection">
                      <div class="cfg-subsection-label">子 Agent 超时（秒）</div>
                      <NumberInput v-model="subAgentTimeout" :min="30" :step="30" />
                      <div class="cfg-hint">多 Agent 协作时，每个子 Agent 单任务执行的超时时间。复杂任务（如开发 CLI）建议 300 以上。</div>
                    </div>

                    <!-- Force multi-agent delegation -->
                    <div class="cfg-subsection">
                      <Toggle v-model="forceMultiAgent" label="强制多 Agent 委派" />
                      <div class="cfg-hint">开启后，每条对话都走「PM 拆解 → 并行子 Agent → 汇总」链路，绕过路由判断。适合测试多 Agent 流程。</div>
                    </div>

                    <!-- Permission control (only in code mode) -->
                    <div v-if="mode === 'code'" class="cfg-subsection">
                      <div class="cfg-subsection-label">
                        权限控制
                        <span class="cfg-badge">仅 Code 模式</span>
                      </div>
                      <div class="cfg-perm-grid">
                        <div v-for="cat in PERMISSION_CATEGORIES" :key="cat.key" class="cfg-perm-item">
                          <div class="cfg-perm-info">
                            <span class="cfg-perm-name">{{ cat.label }}</span>
                            <span class="cfg-perm-desc">{{ cat.description }}</span>
                          </div>
                          <select class="cfg-perm-select" :value="permissionConfig[cat.key]" @change="onPermissionChange(cat.key, ($event.target as HTMLSelectElement).value)">
                            <option value="allow">允许</option>
                            <option value="ask">询问</option>
                            <option value="deny">拒绝</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ═══════════════════════════
                   Category: 智能 / LSP
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'intelligence'" class="cfg-section">
                <div class="cfg-group">
                  <div class="cfg-group-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>LSP 代码智能</span>
                    <span class="cfg-badge">按需调用</span>
                  </div>
                  <div class="cfg-group-body">
                    <div class="cfg-subsection">
                      <div class="cfg-subsection-label">已配置语言</div>
                      <div class="cfg-lsp-lang-list">
                        <div v-for="(profile, langId) in lspProfiles" :key="langId" class="cfg-lsp-lang-item">
                          <div class="cfg-lsp-lang-info">
                            <span class="cfg-lsp-lang-name">{{ langId }}</span>
                            <span class="cfg-lsp-lang-exts">{{ profile.fileExtensions.join(', ') }}</span>
                          </div>
                          <div class="cfg-lsp-tools">
                            <label v-for="tool in profile.tools" :key="tool" class="cfg-lsp-tool-tag">
                              {{ tool }}
                            </label>
                          </div>
                        </div>
                        <div v-if="Object.keys(lspProfiles).length === 0" class="cfg-lsp-empty">
                          未检测到 LSP 配置。点击下方按钮自动检测。
                        </div>
                      </div>
                    </div>
                    <div class="cfg-subsection">
                      <div class="cfg-subsection-label">测试 LSP</div>
                      <div class="cfg-lsp-test">
                        <button class="cfg-lsp-test-btn" @click="$emit('lsp:setup')">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 2v20M2 12h20"/></svg>
                          Setup LSP
                        </button>
                        <button class="cfg-lsp-test-btn" @click="$emit('lsp:test')">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          测试连接
                        </button>
                        <span class="cfg-lsp-test-hint">在对话中使用 lsp_goto_definition 等工具测试</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ═══════════════════════════
                   Category: 高级 / 生成参数
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'advanced'" class="cfg-section">
                <div class="cfg-group">
                  <div class="cfg-group-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                    <span>生成参数</span>
                  </div>
                  <div class="cfg-group-body">
                    <div class="cfg-params">
                      <div class="cfg-param">
                        <div class="cfg-param-header">
                          <span class="cfg-param-label">Temperature</span>
                          <span class="cfg-param-value">{{ temperature.toFixed(1) }}</span>
                        </div>
                        <input type="range" class="cfg-slider" :value="temperature" min="0" max="2" step="0.1" @input="$emit('update:temperature', parseFloat(($event.target as HTMLInputElement).value))"/>
                        <div class="cfg-param-range"><span>精确</span><span>创意</span></div>
                      </div>
                      <div class="cfg-param">
                        <div class="cfg-param-header">
                          <span class="cfg-param-label">Top P</span>
                          <span class="cfg-param-value">{{ topP.toFixed(2) }}</span>
                        </div>
                        <input type="range" class="cfg-slider" :value="topP" min="0" max="1" step="0.01" @input="$emit('update:topP', parseFloat(($event.target as HTMLInputElement).value))"/>
                        <div class="cfg-param-range"><span>集中</span><span>多样</span></div>
                      </div>
                      <div class="cfg-param">
                        <div class="cfg-param-header">
                          <span class="cfg-param-label">Max Tokens</span>
                          <span class="cfg-param-value">{{ maxTokens.toLocaleString() }}</span>
                        </div>
                        <input type="range" class="cfg-slider" :value="maxTokens" min="256" max="16384" step="256" @input="$emit('update:maxTokens', parseInt(($event.target as HTMLInputElement).value))"/>
                        <div class="cfg-param-range"><span>256</span><span>16K</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ═══════════════════════════
                   Category: Skills 管理
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'skills'" class="cfg-section cfg-section--flush">
                <SkillsManager :active="activeCategory === 'skills'" />
              </div>

              <!-- ═══════════════════════════
                   Category: 快捷命令
                   ═══════════════════════════ -->
              <div v-show="activeCategory === 'commands'" class="cfg-section">
                <div class="cfg-group">
                  <div class="cfg-group-header">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <span>快捷命令</span>
                    <span class="cfg-badge">只读</span>
                  </div>
                  <div class="cfg-group-body">
                    <div class="cfg-hint">以下命令可在输入框输入 <code>/</code> 唤起选择。点击命令会作为 Skill 上下文注入对话。</div>
                    <div class="cmd-list">
                      <div v-for="cmd in slashCommands" :key="cmd.name" class="cmd-item">
                        <div class="cmd-icon" :style="{ background: cmd.color || 'rgba(99,102,241,0.15)', color: cmd.iconColor || '#818cf8' }">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                        </div>
                        <div class="cmd-info">
                          <div class="cmd-name">/{{ cmd.name }}</div>
                          <div class="cmd-desc">{{ cmd.description }}</div>
                        </div>
                        <div class="cmd-meta">
                          <span class="cmd-tag">{{ cmd.category }}</span>
                          <span class="cmd-action">{{ cmd.action }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Save bar (global) -->
              <div class="cfg-save-bar">
                <button class="cfg-save-btn" @click="onSave">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                  保存配置
                </button>
              </div>
            </div>
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
import type { ModelProfile, PermissionConfig } from '../composables/useConfig'
import { PERMISSION_CATEGORIES } from '../composables/useConfig'
import ModelSelector from './ModelSelector.vue'
import Toast from './Toast.vue'
import NumberInput from './NumberInput.vue'
import Toggle from './Toggle.vue'
import SkillsManager from './SkillsManager.vue'
import { BUILTIN_SLASH_COMMANDS } from '../slash-commands'

interface LspProfile {
  languageId: string
  tools: string[]
  strategy: string
  fileExtensions: string[]
  timeoutMs?: number
}

const props = defineProps<{
  visible: boolean
  models: ModelProfile[]
  activeModelIndex: number
  initialSubAgentTimeout?: number
  initialForceMultiAgent?: boolean
  mode: AgentMode
  taskMode: TaskMode
  temperature: number
  topP: number
  maxTokens: number
  permissionConfig: PermissionConfig
  lspProfiles: Record<string, LspProfile>
}>()

const emit = defineEmits<{
  close: []
  save: [config: { subAgentTimeout?: number; forceMultiAgent?: boolean }]
  selectModel: [index: number]
  saveModel: [index: number, profile: { name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses' }]
  deleteModel: [index: number]
  'update:mode': [mode: AgentMode]
  'update:taskMode': [taskMode: TaskMode]
  'update:temperature': [value: number]
  'update:topP': [value: number]
  'update:maxTokens': [value: number]
  'update:permission': [config: PermissionConfig]
  'lsp:setup': []
  'lsp:test': []
}>()

// Navigation categories
const categories = [
  { key: 'model', label: '模型', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
  { key: 'behavior', label: '行为', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
  { key: 'intelligence', label: '智能', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
  { key: 'advanced', label: '高级', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>' },
  { key: 'skills', label: 'Skills', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
  { key: 'commands', label: '快捷命令', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' },
]
const activeCategory = ref('model')

const slashCommands = BUILTIN_SLASH_COMMANDS

const subAgentTimeout = ref(props.initialSubAgentTimeout ?? 300)
const forceMultiAgent = ref(props.initialForceMultiAgent ?? false)
const showToast = ref(false)

watch(() => props.visible, (v) => {
  if (v) {
    subAgentTimeout.value = props.initialSubAgentTimeout ?? 300
    forceMultiAgent.value = props.initialForceMultiAgent ?? false
  }
}, { immediate: true })

watch(() => props.initialSubAgentTimeout, (v) => { if (v != null) subAgentTimeout.value = v })
watch(() => props.initialForceMultiAgent, (v) => { if (v != null) forceMultiAgent.value = v })

function onPermissionChange(key: string, value: string) {
  const newConfig = { ...props.permissionConfig, [key]: value }
  emit('update:permission', newConfig)
}

function onSave() {
  emit('save', { subAgentTimeout: subAgentTimeout.value, forceMultiAgent: forceMultiAgent.value })
  showToast.value = true
  setTimeout(() => { showToast.value = false }, 2000)
}
</script>

<style scoped>
.cfg-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.cfg-modal {
  width: min(860px, 100%);
  height: 86vh;
  display: flex; flex-direction: column;
  background: var(--vte-bg, #1e1e1e);
  border: 1px solid var(--vte-border);
  border-radius: 14px;
  box-shadow: 0 24px 70px rgba(0,0,0,0.55);
  overflow: hidden;
}
.cfg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
  background: var(--vte-bg-elevated, rgba(255,255,255,0.02));
}
.cfg-header-left { display: flex; align-items: center; gap: 12px; }
.cfg-title { font-size: 16px; font-weight: 600; color: var(--vte-text); margin: 0; }
.cfg-close {
  width: 32px; height: 32px; border: none; background: none; border-radius: 8px;
  color: var(--vte-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.cfg-close:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); color: var(--vte-text); }

/* ═══════════════════════════
   Two-column layout
   ═══════════════════════════ */
.cfg-layout {
  flex: 1; display: flex; min-height: 0;
}
.cfg-nav {
  width: 168px; flex-shrink: 0;
  border-right: 1px solid var(--vte-border);
  overflow-y: auto; padding: 12px 8px;
  background: var(--vte-bg-elevated, rgba(255,255,255,0.02));
  display: flex; flex-direction: column; gap: 2px;
}
.cfg-nav-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 9px 12px; border: none; background: none;
  border-radius: 8px; color: var(--vte-text-muted);
  font-size: 13px; cursor: pointer; text-align: left;
  transition: all 0.12s;
}
.cfg-nav-item:hover { background: rgba(255,255,255,0.05); color: var(--vte-text); }
.cfg-nav-item.active { background: rgba(99,102,241,0.12); color: var(--vte-primary); font-weight: 500; }
.cfg-nav-icon { display: flex; flex-shrink: 0; color: currentColor; }
.cfg-nav-icon :deep(svg) { display: block; }

.cfg-main { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cfg-section {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: 20px; display: flex; flex-direction: column; gap: 16px;
}
.cfg-section--flush { padding: 0; }
.cfg-save-bar {
  flex-shrink: 0; padding: 12px 20px;
  border-top: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated, rgba(255,255,255,0.02));
}

/* ═══════════════════════════
   Group Card
   ═══════════════════════════ */
.cfg-group {
  border: 1px solid var(--vte-border); border-radius: 12px;
  background: var(--vte-bg-elevated);
}
.cfg-group-header {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px; border-bottom: 1px solid var(--vte-border);
  background: rgba(255,255,255,0.02);
}
.cfg-group-header svg { color: var(--vte-primary); flex-shrink: 0; }
.cfg-group-header span { font-size: 14px; font-weight: 600; color: var(--vte-text); }
.cfg-group-body { padding: 16px; }

/* ═══════════════════════════
   Subsection
   ═══════════════════════════ */
.cfg-subsection { margin-bottom: 16px; }
.cfg-subsection:last-child { margin-bottom: 0; }
.cfg-subsection-label {
  font-size: 12px; font-weight: 500; color: var(--vte-text-muted);
  margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
}

.cfg-hint {
  margin-top: 6px; font-size: 11px; line-height: 1.5; color: var(--vte-text-muted);
  opacity: 0.8;
}
.cfg-hint code {
  padding: 1px 5px; border-radius: 4px; font-size: 11px;
  background: rgba(99,102,241,0.12); color: #818cf8;
  font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
}
.cfg-badge {
  padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 500;
  background: rgba(99,102,241,0.12); color: #818cf8;
}

/* ═══════════════════════════
   Mode Cards (2-column)
   ═══════════════════════════ */
.cfg-mode-grid {
  display: flex; flex-wrap: wrap; gap: 10px;
}
.cfg-mode-card {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 10px;
  border: 1.5px solid var(--vte-border); cursor: pointer;
  transition: all 0.15s;
  flex: 1; min-width: 200px;
}
.cfg-mode-card:hover { border-color: rgba(99,102,241,0.4); }
.cfg-mode-card.selected { border-color: var(--vte-primary); background: rgba(99,102,241,0.06); }
.cfg-mode-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.cfg-mode-icon.code { background: rgba(34,197,94,0.12); color: #22c55e; }
.cfg-mode-icon.plan { background: rgba(168,85,247,0.12); color: #a855f7; }
.cfg-mode-info { min-width: 0; }
.cfg-mode-name { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.cfg-mode-desc { font-size: 11px; color: var(--vte-text-muted); margin-top: 2px; }

/* ═══════════════════════════
   Segmented Control (Task Mode)
   ═══════════════════════════ */
.cfg-seg-control {
  display: flex; background: rgba(255,255,255,0.04);
  border-radius: 8px; padding: 3px; border: 1px solid var(--vte-border);
}
.cfg-seg-btn {
  flex: 1; padding: 7px 12px; border: none; border-radius: 6px;
  background: none; color: var(--vte-text-muted); font-size: 12px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.cfg-seg-btn:hover { color: var(--vte-text); }
.cfg-seg-btn.active { background: var(--vte-primary); color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,0.3); }

/* ═══════════════════════════
   Permission Grid
   ═══════════════════════════ */
.cfg-perm-grid {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.cfg-perm-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
  flex: 1; min-width: 200px;
}
.cfg-perm-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cfg-perm-name { font-size: 12px; font-weight: 500; color: var(--vte-text); }
.cfg-perm-desc { font-size: 10px; color: var(--vte-text-muted); }
.cfg-perm-select {
  padding: 4px 8px; border-radius: 6px; border: 1px solid var(--vte-border);
  background: var(--vte-input-bg); color: var(--vte-text); font-size: 11px;
  cursor: pointer; outline: none; flex-shrink: 0;
}
.cfg-perm-select:focus { border-color: var(--vte-primary); }

/* ═══════════════════════════
   Sliders
   ═══════════════════════════ */
.cfg-params { display: flex; flex-direction: column; gap: 20px; }
.cfg-param {}
.cfg-param-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 8px;
}
.cfg-param-label { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.cfg-param-value {
  font-size: 13px; font-weight: 600; color: var(--vte-primary);
  font-variant-numeric: tabular-nums;
}
.cfg-slider {
  width: 100%; height: 6px; border-radius: 3px; outline: none;
  -webkit-appearance: none; appearance: none;
  background: linear-gradient(to right, var(--vte-primary) 0%, var(--vte-primary) 50%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.1) 100%);
}
.cfg-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 18px; height: 18px; border-radius: 50%;
  background: #fff; border: 2px solid var(--vte-primary);
  box-shadow: 0 2px 6px rgba(0,0,0,0.3); cursor: pointer;
  transition: transform 0.15s;
}
.cfg-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.cfg-param-range {
  display: flex; justify-content: space-between;
  font-size: 10px; color: var(--vte-text-muted); margin-top: 4px; opacity: 0.6;
}

/* ═══════════════════════════
   LSP Configuration
   ═══════════════════════════ */
.cfg-lsp-lang-list {
  display: flex; flex-direction: column; gap: 8px;
}
.cfg-lsp-lang-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
}
.cfg-lsp-lang-info { display: flex; flex-direction: column; gap: 2px; }
.cfg-lsp-lang-name { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.cfg-lsp-lang-exts { font-size: 11px; color: var(--vte-text-muted); }
.cfg-lsp-tools { display: flex; flex-wrap: wrap; gap: 4px; }
.cfg-lsp-tool-tag {
  padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 500;
  background: rgba(99,102,241,0.1); color: #818cf8;
}
.cfg-lsp-empty {
  font-size: 12px; color: var(--vte-text-muted); padding: 12px;
  text-align: center; border: 1px dashed var(--vte-border); border-radius: 8px;
}
.cfg-lsp-test {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.cfg-lsp-test-btn {
  padding: 8px 14px; border-radius: 8px; border: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated); color: var(--vte-text); font-size: 12px;
  font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;
  transition: all 0.15s;
}
.cfg-lsp-test-btn:hover { border-color: var(--vte-primary); background: rgba(99,102,241,0.06); }
.cfg-lsp-test-hint { font-size: 11px; color: var(--vte-text-muted); }

/* ═══════════════════════════
   Slash command list (read-only registry)
   ═══════════════════════════ */
.cmd-list { display: flex; flex-direction: column; gap: 8px; }
.cmd-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; border-radius: 10px;
  border: 1px solid var(--vte-border); background: var(--vte-bg-elevated);
}
.cmd-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.cmd-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cmd-name { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.cmd-desc { font-size: 11px; color: var(--vte-text-muted); }
.cmd-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.cmd-tag {
  padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 500;
  background: rgba(255,255,255,0.05); color: var(--vte-text-muted);
}
.cmd-action {
  font-size: 10px; color: var(--vte-text-muted); opacity: 0.7;
  font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
}

/* ═══════════════════════════
   Save Button
   ═══════════════════════════ */
.cfg-save-btn {
  width: 100%; padding: 12px; border-radius: 10px; border: none;
  background: var(--vte-primary); color: #fff; font-size: 14px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.cfg-save-btn:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
.cfg-save-btn:active { transform: translateY(0); }

/* ═══════════════════════════
   Transition
   ═══════════════════════════ */
.cfg-panel-enter-active, .cfg-panel-leave-active { transition: opacity 0.2s ease; }
.cfg-panel-enter-active .cfg-modal, .cfg-panel-leave-active .cfg-modal { transition: transform 0.2s ease, opacity 0.2s ease; }
.cfg-panel-enter-from, .cfg-panel-leave-to { opacity: 0; }
.cfg-panel-enter-from .cfg-modal, .cfg-panel-leave-to .cfg-modal { transform: translateY(10px) scale(0.97); opacity: 0; }
</style>
