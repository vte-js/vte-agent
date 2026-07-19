<template>
  <!-- Trigger button -->
  <button class="model-trigger" @click="openModal">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/><circle cx="12" cy="12" r="3"/></svg>
    <span class="model-trigger-name">{{ currentName }}</span>
    <svg class="model-trigger-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
  </button>

  <!-- Modal -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modalOpen" class="model-overlay" @click.self="closeModal">
        <div class="model-dialog">
          <div class="model-dialog-header">
            <span class="model-dialog-title">模型管理</span>
            <button class="model-dialog-close" @click="closeModal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="model-dialog-body">
            <!-- Model list -->
            <div v-if="!editing" class="model-list">
              <div
                v-for="(m, i) in models"
                :key="i"
                class="model-item"
                :class="{ active: i === activeIndex }"
                @click="selectModel(i)"
              >
                <div class="model-item-info">
                  <span class="model-item-name">{{ m.name }}</span>
                  <span class="model-item-detail">{{ m.model }}</span>
                </div>
                <div class="model-item-actions">
                  <button class="model-item-btn" @click.stop="startEdit(i)" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button v-if="models.length > 1" class="model-item-btn del" @click.stop="deleteModel(i)" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              <div class="model-add-btn" @click="startAdd">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加新模型
              </div>
            </div>

            <!-- Edit form -->
            <div v-else class="model-form">
              <div class="model-form-title">{{ editIndex === -1 ? '添加模型' : '编辑模型' }}</div>
              <div class="model-form-field">
                <label>名称</label>
                <input v-model="form.name" placeholder="My GPT-4" class="model-form-input" />
              </div>
              <div class="model-form-field">
                <label>API 密钥</label>
                <div class="api-key-wrap">
                  <input
                    :value="keyInputDisplay"
                    @input="onKeyInput"
                    :type="showKey ? 'text' : 'password'"
                    :placeholder="keyPlaceholder"
                    :readonly="isKeyMaskedDisplay"
                    class="model-form-input"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <div class="api-key-actions">
                    <!-- Masked state: clear button (lets the user input a new key) -->
                    <button
                      v-if="isKeyMaskedDisplay"
                      type="button"
                      class="api-key-action"
                      title="清空并输入新值"
                      @click="form.apiKey = ''"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <!-- Editable state: eye toggle for plaintext preview while typing -->
                    <button
                      v-else
                      type="button"
                      class="api-key-action"
                      :title="showKey ? '隐藏' : '显示明文'"
                      @click="showKey = !showKey"
                    >
                      <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    </button>
                  </div>
                </div>
                <div v-if="wasKeyMasked" class="api-key-hint">
                  密钥已保存（出于安全考虑不可查看，18 个 <code>•</code> 为固定占位）。
                  点 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="9" height="9" style="vertical-align:-1px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  清空后输入新值即可替换；留空保存则保留原密钥。
                </div>
              </div>
              <div class="model-form-field">
                <label>API 地址</label>
                <input v-model="form.apiBase" placeholder="https://api.openai.com/v1" class="model-form-input" />
              </div>
              <div class="model-form-field">
                <label>模型</label>
                <input v-model="form.model" placeholder="gpt-4" class="model-form-input" />
              </div>
              <div class="model-form-field">
                <label>API 协议</label>
                <ModelSelect
                  :model-value="form.api"
                  :options="apiProtocolOptions"
                  :allow-custom="false"
                  @update:model-value="(v: string) => form.api = v as ApiProtocolChoice"
                />
              </div>
              <div class="model-form-actions">
                <button class="model-form-cancel" @click="cancelEdit">取消</button>
                <button class="model-form-save" @click="saveEdit">保存</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ModelSelect from './ModelSelect.vue'

export interface ModelProfile {
  name: string
  apiKey: string
  apiBase: string
  model: string
  api?: 'chat' | 'responses'
}

// '' means "auto" (infer from base URL + model name)
export type ApiProtocolChoice = '' | 'chat' | 'responses'

const props = defineProps<{
  models: ModelProfile[]
  activeIndex: number
}>()

const emit = defineEmits<{
  select: [index: number]
  save: [index: number, profile: ModelProfile]
  delete: [index: number]
}>()

const modalOpen = ref(false)
const editing = ref(false)
const editIndex = ref(-1)
const form = ref<{ name: string; apiKey: string; apiBase: string; model: string; api: ApiProtocolChoice }>({ name: '', apiKey: '', apiBase: '', model: '', api: '' })
/** Show the API key as plaintext while the user is typing. Defaults to
 *  hidden (password dots). The "view original saved key" feature is NOT
 *  possible because the host never sends the real key to the browser —
 *  it only sends the '***' sentinel. */
const showKey = ref(false)
/** True when editing a profile whose key was already saved on the host
 *  (and is therefore masked as '***' on the wire). Used to switch the
 *  field into read-only "saved" display mode and to render the hint. */
const wasKeyMasked = ref(false)
/** Fixed-width placeholder shown when the saved key is being represented
 *  without revealing its content. 18 dots reads as "a real key is here"
 *  rather than the misleading 3-char '***' (which browsers also render
 *  as 3 password dots). */
const SAVED_KEY_PLACEHOLDER = '••••••••••••••••••'

const currentName = computed(() => props.models[props.activeIndex]?.model || '选择模型')

const keyPlaceholder = computed(() => {
  if (editIndex.value === -1) return 'sk-...'
  return '输入新值替换'
})

/** Display value for the API key input. When the form carries the '***'
 *  sentinel, show a fixed 18-dot placeholder so the field doesn't look
 *  empty or like just 3 password dots. */
const keyInputDisplay = computed(() => {
  if (form.value.apiKey === '***') return SAVED_KEY_PLACEHOLDER
  return form.value.apiKey
})
const isKeyMaskedDisplay = computed(() => form.value.apiKey === '***')

function onKeyInput(e: Event) {
  const target = e.target as HTMLInputElement
  form.value.apiKey = target.value
}

// API protocol options for the inline dropdown ('' === auto-infer)
const apiProtocolOptions = [
  { value: '', label: '自动（按地址 + 模型推断）' },
  { value: 'chat', label: 'Chat Completions' },
  { value: 'responses', label: 'Responses API' },
]

function maskKey(key: string) {
  if (!key) return '未设置'
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

function openModal() {
  modalOpen.value = true
  editing.value = false
}

function closeModal() {
  modalOpen.value = false
  editing.value = false
}

function selectModel(i: number) {
  emit('select', i)
  closeModal()
}

function startAdd() {
  editIndex.value = -1
  form.value = { name: '', apiKey: '', apiBase: 'https://api.openai.com/v1', model: 'gpt-4', api: '' }
  editing.value = true
  showKey.value = false
  wasKeyMasked.value = false
}

function startEdit(i: number) {
  editIndex.value = i
  const m = props.models[i]
  // The host never sends the real key over the wire; it always arrives as
  // '***' when a key has been saved. We keep that sentinel in the form so
  // (a) the user sees "***" instead of the browser rendering three dots,
  // and (b) the sentinel is preserved on save — the host treats '***' as
  // "keep the existing key" instead of overwriting it with empty.
  const masked = m.apiKey === '***'
  form.value = {
    name: m.name,
    apiKey: masked ? '***' : m.apiKey,
    apiBase: m.apiBase,
    model: m.model,
    api: m.api ?? '',
  }
  editing.value = true
  showKey.value = false
  wasKeyMasked.value = masked
}

function cancelEdit() {
  editing.value = false
}

function saveEdit() {
  const api = form.value.api === '' ? undefined : form.value.api
  // Treat empty submit on a previously-masked profile as "keep existing".
  if (wasKeyMasked.value && form.value.apiKey.trim() === '') {
    form.value.apiKey = '***'
  }
  const profile: ModelProfile = {
    name: form.value.name,
    apiKey: form.value.apiKey,
    apiBase: form.value.apiBase,
    model: form.value.model,
    ...(api ? { api } : {}),
  }
  emit('save', editIndex.value, profile)
  editing.value = false
}

function deleteModel(i: number) {
  emit('delete', i)
}
</script>

<style scoped>
.model-trigger {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px; border: 1px solid var(--vte-border);
  background: var(--vte-input-bg); color: var(--vte-text-muted); font-size: 11px;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.model-trigger:hover { border-color: rgba(99,102,241,0.4); color: var(--vte-text); background: rgba(99,102,241,0.05); }
.model-trigger-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.model-trigger-arrow { opacity: 0.5; transition: transform 0.15s; }
.model-trigger:hover .model-trigger-arrow { opacity: 1; transform: translateY(1px); }

/* Modal */
.model-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.model-dialog {
  width: 420px; max-width: 90vw; max-height: 80vh;
  border-radius: 14px; background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.model-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 0;
}
.model-dialog-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.model-dialog-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.model-dialog-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.model-dialog-close svg { width: 14px; height: 14px; }
.model-dialog-body { padding: 16px 20px 20px; overflow-y: auto; }

/* Model list */
.model-list { display: flex; flex-direction: column; gap: 6px; }
.model-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 8px; border: 1px solid transparent;
  cursor: pointer; transition: all 0.12s;
}
.model-item:hover { background: rgba(255,255,255,0.04); }
.model-item.active { border-color: #6366f1; background: rgba(99,102,241,0.08); }
.model-item-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.model-item-name { font-size: 13px; font-weight: 600; color: #e2e8f0; }
.model-item-detail { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.1s; }
.model-item:hover .model-item-actions { opacity: 1; }
.model-item-btn {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #94a3b8; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.model-item-btn:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.model-item-btn.del:hover { color: #ef4444; }

.model-add-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border-radius: 8px; border: 1px dashed rgba(99,102,241,0.3);
  font-size: 12px; color: #6366f1; cursor: pointer; transition: all 0.12s;
}
.model-add-btn:hover { border-color: #6366f1; background: rgba(99,102,241,0.05); }

/* Form */
.model-form { display: flex; flex-direction: column; gap: 10px; }
.model-form-title { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
.model-form-field label { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.model-form-input {
  width: 100%; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--vte-input-border);
  background: var(--vte-input-bg); color: var(--vte-text); font-size: 13px; outline: none;
  box-sizing: border-box; min-height: 34px;
}
.model-form-input:focus { border-color: var(--vte-primary); }
.model-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.model-form-cancel {
  padding: 7px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
  background: none; color: #94a3b8; font-size: 13px; cursor: pointer;
}
.model-form-cancel:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }
.model-form-save {
  padding: 7px 16px; border-radius: 8px; border: none;
  background: #6366f1; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;
}
.model-form-save:hover { background: #5558e6; }

/* API key field with clear / eye actions */
.api-key-wrap { position: relative; }
.api-key-wrap .model-form-input {
  padding-right: 36px;
  font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, Menlo, Consolas, monospace);
  letter-spacing: 1px;  /* extra spacing makes 18 dots read as a real key */
}
.api-key-wrap .model-form-input[readonly] {
  cursor: default;     /* hint that this isn't a normal editable field */
  color: var(--vte-text-muted);
}
.api-key-actions { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); display: flex; gap: 2px; }
.api-key-action {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: none; border-radius: 5px;
  color: #94a3b8; cursor: pointer;
  transition: background .12s, color .12s;
}
.api-key-action:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.api-key-hint {
  font-size: 11px; color: #94a3b8; line-height: 1.6;
  margin-top: 6px; padding: 6px 8px;
  border-radius: 6px; background: rgba(99,102,241,0.06);
  border: 1px solid rgba(99,102,241,0.15);
}
.api-key-hint code {
  font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, Menlo, Consolas, monospace);
  font-size: 10.5px; padding: 1px 4px; border-radius: 3px;
  background: rgba(255,255,255,0.06); color: #c7d2fe;
}

/* Transition */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .model-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
