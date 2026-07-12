<template>
  <Teleport to="body">
    <Transition name="config-editor-panel">
      <div v-if="visible" class="config-editor-fullscreen">
        <div class="config-editor-header">
          <div class="config-editor-header-left">
            <button class="config-editor-back" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="config-editor-title">LSP 配置编辑器</span>
          </div>
          <span class="config-editor-scope">.github/agent-lsp.json</span>
        </div>

        <div class="config-editor-body">
          <!-- Left: Profile List -->
          <div class="config-editor-left" :style="{ width: leftPanelWidth + 'px' }">
            <div class="profile-list">
              <div
                v-for="p in sortedProfiles"
                :key="p.languageId"
                class="profile-item"
                :class="{ selected: selectedId === p.languageId }"
                @click="selectProfile(p.languageId)"
              >
                <span class="profile-name">{{ p.languageId }}</span>
                <span class="profile-ext">{{ p.fileExtensions?.[0] || '' }}</span>
              </div>
            </div>
            <div class="list-actions">
              <button class="btn btn-primary btn-sm" @click="showPresetMenu = true">+ 添加预设</button>
              <button
                class="btn btn-danger btn-sm"
                :disabled="!selectedId"
                @click="deleteProfile"
              >
                删除
              </button>
            </div>
          </div>

          <!-- Resize Handle -->
          <div
            class="config-editor-resize-handle"
            @mousedown="startResize"
          ></div>

          <!-- Right: Profile Detail -->
          <div class="config-editor-right">
            <div v-if="!selectedProfile" class="empty-state">
              选择一个语言配置进行编辑
            </div>
            <div v-else class="profile-form">
              <!-- Language ID -->
              <div class="form-group">
                <label class="form-label">语言 ID</label>
                <input type="text" class="form-input" :value="selectedProfile.languageId" readonly />
              </div>

              <!-- Strategy -->
              <div class="form-group">
                <label class="form-label">策略</label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input type="radio" name="strategy" value="builtin" v-model="editStrategy" />
                    内置 (VSCode API)
                  </label>
                  <label class="radio-item">
                    <input type="radio" name="strategy" value="direct" v-model="editStrategy" />
                    直连 (LSP Server)
                  </label>
                </div>
              </div>

              <!-- Tools -->
              <div class="form-group">
                <label class="form-label">工具</label>
                <div class="checkbox-group">
                  <label v-for="tool in allTools" :key="tool" class="checkbox-item">
                    <input type="checkbox" :value="tool" v-model="editTools" />
                    {{ tool }}
                  </label>
                </div>
              </div>

              <!-- Timeout -->
              <div class="form-group">
                <label class="form-label">超时时间 (ms)</label>
                <input type="number" class="form-input" v-model.number="editTimeout" min="1000" max="30000" />
              </div>

              <!-- File Extensions -->
              <div class="form-group">
                <label class="form-label">文件扩展名 (逗号分隔)</label>
                <input type="text" class="form-input" v-model="editExtensions" />
              </div>

              <!-- Direct Mode Fields -->
              <div v-if="editStrategy === 'direct'" class="direct-fields">
                <div class="direct-fields-title">直连模式设置</div>
                <div class="form-group">
                  <label class="form-label">命令</label>
                  <input type="text" class="form-input" v-model="editCommand" placeholder="例如: rust-analyzer" />
                </div>
                <div class="form-group">
                  <label class="form-label">参数 (逗号分隔)</label>
                  <input type="text" class="form-input" v-model="editArgs" />
                </div>
              </div>

              <!-- Actions -->
              <div class="form-actions">
                <button class="btn btn-primary" @click="saveProfile">保存</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <Transition name="config-editor-panel">
      <div v-if="showPresetMenu" class="preset-dialog-overlay" @click.self="showPresetMenu = false">
        <div class="preset-dialog">
          <div class="preset-dialog-header">
            <span class="preset-dialog-title">选择预设语言</span>
            <button class="preset-dialog-close" @click="showPresetMenu = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="preset-dialog-body">
            <div
              v-for="preset in availablePresets"
              :key="preset.id"
              class="preset-dialog-item"
              @click="addPreset(preset)"
            >
              <span class="preset-dialog-item-id">{{ preset.id }}</span>
              <span class="preset-dialog-item-ext">{{ preset.ext }}</span>
            </div>
            <div v-if="availablePresets.length === 0" class="preset-dialog-empty">
              所有预设已添加
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { LspProfile } from '../protocol'

const props = defineProps<{
  visible: boolean
  profiles: Record<string, LspProfile>
}>()

const emit = defineEmits<{
  close: []
  save: [profile: LspProfile]
  delete: [languageId: string]
  add: [profile: LspProfile]
}>()

const allTools = ['definition', 'references', 'hover', 'documentSymbol']

// Resize state
const leftPanelWidth = ref(220)
const isResizing = ref(false)
let startX = 0
let startWidth = 0

function startResize(e: MouseEvent) {
  isResizing.value = true
  startX = e.clientX
  startWidth = leftPanelWidth.value
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: MouseEvent) {
  if (!isResizing.value) return
  const diff = e.clientX - startX
  const newWidth = Math.max(150, Math.min(600, startWidth + diff))
  leftPanelWidth.value = newWidth
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})

const DEFAULT_PRESETS = [
  { id: 'typescript', ext: '.ts, .tsx' },
  { id: 'javascript', ext: '.js, .jsx' },
  { id: 'typescriptreact', ext: '.tsx' },
  { id: 'javascriptreact', ext: '.jsx' },
  { id: 'python', ext: '.py' },
  { id: 'rust', ext: '.rs' },
  { id: 'go', ext: '.go' },
  { id: 'java', ext: '.java' },
  { id: 'c', ext: '.c, .h' },
  { id: 'cpp', ext: '.cpp' },
  { id: 'csharp', ext: '.cs' },
  { id: 'ruby', ext: '.rb' },
  { id: 'php', ext: '.php' },
  { id: 'swift', ext: '.swift' },
  { id: 'kotlin', ext: '.kt' },
  { id: 'json', ext: '.json' },
  { id: 'yaml', ext: '.yaml' },
  { id: 'markdown', ext: '.md' },
  { id: 'html', ext: '.html' },
  { id: 'css', ext: '.css' },
  { id: 'scss', ext: '.scss' },
  { id: 'shellscript', ext: '.sh' },
  { id: 'sql', ext: '.sql' },
]

const selectedId = ref<string | null>(null)
const showPresetMenu = ref(false)

// Edit state
const editStrategy = ref<string>('builtin')
const editTools = ref<string[]>([])
const editTimeout = ref(5000)
const editExtensions = ref('')
const editCommand = ref('')
const editArgs = ref('')

const sortedProfiles = computed(() => {
  return Object.values(props.profiles)
    .filter((p): p is LspProfile => p != null && !!p.languageId)
    .sort((a, b) => a.languageId.localeCompare(b.languageId))
})

const selectedProfile = computed(() => {
  if (!selectedId.value) return null
  return props.profiles[selectedId.value] || null
})

const availablePresets = computed(() => {
  const existingIds = new Set(Object.keys(props.profiles))
  return DEFAULT_PRESETS.filter(p => !existingIds.has(p.id))
})

// Sync edit state when selection changes
watch(selectedProfile, (p) => {
  if (p) {
    editStrategy.value = p.strategy || 'builtin'
    editTools.value = [...(p.tools || [])]
    editTimeout.value = p.timeoutMs || 5000
    editExtensions.value = (p.fileExtensions || []).join(', ')
    editCommand.value = p.command || ''
    editArgs.value = (p.args || []).join(', ')
  }
})

function selectProfile(id: string) {
  selectedId.value = selectedId.value === id ? null : id
}

function addPreset(preset: { id: string; ext: string }) {
  emit('add', {
    languageId: preset.id,
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: [],
    timeoutMs: 5000,
  })
  showPresetMenu.value = false
  selectedId.value = preset.id
}

function saveProfile() {
  if (!selectedProfile.value) return

  const extensions = editExtensions.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s)

  const args = editArgs.value
    .split(',')
    .map(s => s.trim())
    .filter(s => s)

  const updated: LspProfile = {
    languageId: selectedProfile.value.languageId,
    tools: editTools.value,
    strategy: editStrategy.value,
    fileExtensions: extensions,
    timeoutMs: editTimeout.value,
    command: editStrategy.value === 'direct' && editCommand.value ? editCommand.value : undefined,
    args: editStrategy.value === 'direct' && args.length ? args : undefined,
  }

  emit('save', updated)
}

function deleteProfile() {
  if (!selectedId.value) return
  emit('delete', selectedId.value)
  selectedId.value = null
}

watch(() => props.visible, (v) => {
  if (!v) {
    showPresetMenu.value = false
  }
})
</script>

<style scoped>
.config-editor-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--vte-bg, #1e1e1e);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.config-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
}

.config-editor-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-editor-back {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  border-radius: 8px;
  color: var(--vte-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.config-editor-back:hover {
  background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08));
  color: var(--vte-text);
}

.config-editor-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--vte-text);
  margin: 0;
}

.config-editor-scope {
  font-size: 11px;
  color: var(--vte-text-muted);
  padding: 2px 8px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
}

.config-editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Left Panel ── */
.config-editor-left {
  min-width: 150px;
  max-width: 600px;
  border-right: none;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

/* ── Resize Handle ── */
.config-editor-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--vte-border);
  transition: background 0.15s;
  flex-shrink: 0;
}
.config-editor-resize-handle:hover {
  background: var(--vte-primary, #6366f1);
}

.profile-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.profile-item {
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  transition: background 0.15s;
}
.profile-item:hover {
  background: rgba(255,255,255,0.03);
}
.profile-item.selected {
  background: rgba(99,102,241,0.15);
}

.profile-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--vte-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-ext {
  font-size: 11px;
  color: var(--vte-text-muted);
  flex-shrink: 0;
}

.list-actions {
  padding: 8px;
  border-top: 1px solid var(--vte-border);
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* ── Right Panel ── */
.config-editor-right {
  flex: 1;
  min-width: 300px;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vte-text-muted);
  font-size: 14px;
}

.profile-form {
  max-width: 600px;
}

/* ── Form Elements ── */
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 6px;
  color: var(--vte-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--vte-border);
  border-radius: 6px;
  background: var(--vte-bg-elevated, rgba(255,255,255,0.03));
  color: var(--vte-text);
  font-size: 13px;
  font-family: var(--vscode-font-family);
}
.form-input:focus {
  outline: none;
  border-color: var(--vte-primary);
}
.form-input:read-only {
  opacity: 0.6;
  cursor: default;
}

/* Radio */
.radio-group {
  display: flex;
  gap: 16px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--vte-text);
  cursor: pointer;
}
.radio-item input[type="radio"] {
  margin: 0;
  accent-color: var(--vte-primary);
}

/* Checkbox */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--vte-text);
  cursor: pointer;
}
.checkbox-item input[type="checkbox"] {
  margin: 0;
  accent-color: var(--vte-primary);
}

/* Direct Fields */
.direct-fields {
  border: 1px solid var(--vte-border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  background: rgba(255,255,255,0.02);
}

.direct-fields-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--vte-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 10px;
}

/* Actions */
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--vte-border);
}

/* ── Buttons ── */
.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: var(--vscode-font-family);
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-primary {
  background: var(--vte-primary, #6366f1);
  color: #fff;
}
.btn-primary:hover { opacity: 0.9; }

.btn-danger {
  background: transparent;
  color: #ef4444;
  border: 1px solid rgba(239,68,68,0.3);
}
.btn-danger:hover {
  background: rgba(239,68,68,0.1);
}
.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 11px;
}

/* ── Preset Dialog ── */
.preset-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.preset-dialog {
  width: 320px;
  max-width: 90vw;
  max-height: 400px;
  background: var(--vte-bg-elevated, #252526);
  border: 1px solid var(--vte-border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preset-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--vte-border);
}

.preset-dialog-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vte-text);
}

.preset-dialog-close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: 6px;
  color: var(--vte-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preset-dialog-close:hover {
  background: rgba(255,255,255,0.08);
  color: var(--vte-text);
}

.preset-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.preset-dialog-item {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.15s;
}
.preset-dialog-item:hover {
  background: rgba(99,102,241,0.1);
}

.preset-dialog-item-id {
  font-size: 13px;
  font-weight: 500;
  color: var(--vte-text);
}

.preset-dialog-item-ext {
  font-size: 11px;
  color: var(--vte-text-muted);
}

.preset-dialog-empty {
  padding: 20px;
  font-size: 13px;
  color: var(--vte-text-muted);
  text-align: center;
}

/* ── Transition ── */
.config-editor-panel-enter-active { transition: opacity 0.2s ease; }
.config-editor-panel-leave-active { transition: opacity 0.15s ease; }
.config-editor-panel-enter-from,
.config-editor-panel-leave-to { opacity: 0; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--vte-border);
  border-radius: 3px;
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .config-editor-header {
    padding: 12px 16px;
  }
  .config-editor-body {
    flex-direction: column;
  }
  .config-editor-left {
    width: 100% !important;
    min-width: 0;
    max-width: none;
    border-right: none;
    border-bottom: 1px solid var(--vte-border);
    max-height: 200px;
  }
  .config-editor-resize-handle {
    display: none;
  }
  .config-editor-right {
    min-width: 0;
    padding: 12px;
  }
  .radio-group {
    flex-direction: column;
    gap: 8px;
  }
  .checkbox-group {
    flex-direction: column;
    gap: 8px;
  }
}

@media (min-width: 481px) and (max-width: 640px) {
  .config-editor-header {
    padding: 14px 18px;
  }
  .config-editor-left {
    width: 180px !important;
    min-width: 160px;
  }
  .config-editor-right {
    padding: 16px;
  }
}
</style>
