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
                <input v-model="form.apiKey" type="password" placeholder="sk-..." class="model-form-input" />
              </div>
              <div class="model-form-field">
                <label>API 地址</label>
                <input v-model="form.apiBase" placeholder="https://api.openai.com/v1" class="model-form-input" />
              </div>
              <div class="model-form-field">
                <label>模型</label>
                <input v-model="form.model" placeholder="gpt-4" class="model-form-input" />
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

export interface ModelProfile {
  name: string
  apiKey: string
  apiBase: string
  model: string
}

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
const form = ref<ModelProfile>({ name: '', apiKey: '', apiBase: '', model: '' })

const currentName = computed(() => props.models[props.activeIndex]?.model || '选择模型')

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
  form.value = { name: '', apiKey: '', apiBase: 'https://api.openai.com/v1', model: 'gpt-4' }
  editing.value = true
}

function startEdit(i: number) {
  editIndex.value = i
  form.value = { ...props.models[i] }
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

function saveEdit() {
  emit('save', editIndex.value, { ...form.value })
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
  width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(0,0,0,0.2); color: #e2e8f0; font-size: 13px; outline: none;
  box-sizing: border-box;
}
.model-form-input:focus { border-color: #6366f1; }
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

/* Transition */
.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .model-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
