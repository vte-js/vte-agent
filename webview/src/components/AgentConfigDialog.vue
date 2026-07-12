<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="$emit('cancel')">
        <div class="dialog">
          <div class="dialog-header">
            <span class="dialog-title">配置 Agent</span>
            <button class="dialog-close" @click="$emit('cancel')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="dialog-body">
            <!-- Role display -->
            <div class="form-group">
              <div class="role-preview">
                <span class="role-icon" :style="{ background: roleColor }">{{ roleIcon }}</span>
                <div>
                  <div class="role-name">{{ role.name }}</div>
                  <div class="role-desc">{{ role.description }}</div>
                </div>
              </div>
            </div>

            <!-- Model config -->
            <div class="form-group">
              <label class="form-label">模型</label>
              <input v-model="form.model" class="form-input" placeholder="gpt-4" />
              <span class="form-hint">留空使用主 Agent 配置</span>
            </div>

            <!-- API Key -->
            <div class="form-group">
              <label class="form-label">API Key</label>
              <div class="input-row">
                <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" class="form-input" placeholder="sk-..." />
                <button class="btn-icon" @click="showKey = !showKey">
                  <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <span class="form-hint">留空使用主 Agent 配置</span>
            </div>

            <!-- API Base -->
            <div class="form-group">
              <label class="form-label">API Base URL</label>
              <input v-model="form.apiBase" class="form-input" placeholder="https://api.openai.com/v1" />
              <span class="form-hint">留空使用主 Agent 配置</span>
            </div>

            <!-- Execution mode -->
            <div class="form-group">
              <label class="form-label">执行环境</label>
              <div class="radio-group">
                <label class="radio-item">
                  <input type="radio" value="shared" v-model="form.isolation" />
                  共享工作区
                </label>
                <label class="radio-item">
                  <input type="radio" value="snapshot" v-model="form.isolation" />
                  隔离快照
                </label>
              </div>
            </div>
          </div>

          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="$emit('cancel')">取消</button>
            <button class="btn btn-confirm" @click="confirm">创建</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { AgentRole } from '../../src/agent/agent-role'

const props = defineProps<{
  visible: boolean
  role: AgentRole
  globalConfig: {
    model: string
    apiKey: string
    apiBase: string
  }
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [config: { model: string; apiKey: string; apiBase: string; isolation: string }]
}>()

const showKey = ref(false)

const ROLE_COLORS: Record<string, string> = {
  pm: '#6366f1', dev: '#22c55e', test: '#f59e0b', review: '#8b5cf6', doc: '#ec4899',
}
const ROLE_ICONS: Record<string, string> = {
  pm: '📋', dev: '💻', test: '🧪', review: '🔍', doc: '📝',
}

const roleColor = ROLE_COLORS[props.role.id] || '#64748b'
const roleIcon = ROLE_ICONS[props.role.id] || '🤖'

const form = reactive({
  model: '',
  apiKey: '',
  apiBase: '',
  isolation: 'shared' as string,
})

// Initialize with global config when dialog opens
watch(() => props.visible, (v) => {
  if (v) {
    form.model = ''
    form.apiKey = ''
    form.apiBase = ''
    form.isolation = props.role.isolation || 'shared'
    showKey.value = false
  }
})

function confirm() {
  emit('confirm', {
    model: form.model || props.globalConfig.model,
    apiKey: form.apiKey || props.globalConfig.apiKey,
    apiBase: form.apiBase || props.globalConfig.apiBase,
    isolation: form.isolation,
  })
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 16px;
}
.dialog {
  width: 400px; max-width: 100%; background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;
}
.dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.dialog-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }
.dialog-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.dialog-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }

.dialog-body { padding: 16px 20px; }

.role-preview {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
}
.role-icon {
  width: 36px; height: 36px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.role-name { font-size: 13px; font-weight: 600; color: #e2e8f0; }
.role-desc { font-size: 11px; color: #64748b; }

.form-group { margin-top: 14px; }
.form-label { display: block; font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
.form-input {
  width: 100%; padding: 8px 12px; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; background: rgba(0,0,0,0.2); color: #e2e8f0;
  font-size: 13px; font-family: inherit; outline: none; box-sizing: border-box;
}
.form-input:focus { border-color: rgba(99,102,241,0.5); }
.form-hint { font-size: 10px; color: #475569; margin-top: 4px; display: block; }

.input-row { display: flex; gap: 6px; }
.input-row .form-input { flex: 1; }
.btn-icon {
  width: 34px; height: 34px; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; background: rgba(0,0,0,0.2); color: #64748b;
  cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.btn-icon:hover { background: rgba(255,255,255,0.05); color: #94a3b8; }

.radio-group { display: flex; gap: 16px; }
.radio-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #e2e8f0; cursor: pointer; }
.radio-item input[type="radio"] { margin: 0; accent-color: #6366f1; }

.dialog-footer {
  display: flex; gap: 8px; padding: 12px 20px 16px;
  border-top: 1px solid rgba(255,255,255,0.06); justify-content: flex-end;
}
.btn {
  padding: 8px 16px; border-radius: 8px; border: none;
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.btn-cancel { background: rgba(255,255,255,0.06); color: #94a3b8; }
.btn-cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.btn-confirm { background: #6366f1; color: #fff; }
.btn-confirm:hover { background: #818cf8; }

.dialog-enter-active { transition: opacity 0.2s ease; }
.dialog-leave-active { transition: opacity 0.15s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
.dialog-enter-active .dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
