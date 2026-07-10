<template>
  <!-- Full-screen session panel -->
  <Teleport to="body">
    <Transition name="session-panel">
      <div v-if="visible" class="session-fullscreen">
        <div class="session-header">
          <div class="session-header-left">
            <button class="session-back" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="session-title">会话历史</span>
            <span class="session-count">{{ sessions.length }} 个会话</span>
          </div>
          <div class="session-header-right">
            <div class="session-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input v-model="searchQuery" placeholder="搜索会话..." @input="onSearch" />
            </div>
            <button class="session-action-btn primary" @click="onCreate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              新建会话
            </button>
            <label class="session-action-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              导入
              <input type="file" accept=".json" style="display: none" @change="onImport" />
            </label>
          </div>
        </div>

        <!-- Session list -->
        <div class="session-content">
          <div v-if="sessions.length === 0" class="session-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span class="session-empty-title">暂无会话</span>
            <span class="session-empty-hint">开始对话后会话会自动保存</span>
          </div>

          <div v-else class="session-list">
            <div v-for="session in sessions" :key="session.id" class="session-item" @click="onRestore(session.id)">
              <div class="session-item-main">
                <div class="session-item-name">{{ session.name }}</div>
                <div class="session-item-meta">
                  <span>{{ formatDate(session.createdAt) }}</span>
                  <span>{{ session.messageCount }}条消息</span>
                  <span>{{ session.model }}</span>
                </div>
                <div v-if="session.thumbnail" class="session-item-preview">{{ session.thumbnail }}</div>
              </div>
              <div class="session-item-actions" @click.stop>
                <button class="session-item-btn" @click="onExport(session.id)" title="导出">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
                <button class="session-item-btn delete" @click="onDelete(session.id)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
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
import { useSession } from '../composables/useSession'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  restore: [sessionId: string]
}>()

import { useNotification } from '../composables/useNotification'

const {
  sessions,
  error,
  successMessage,
  createSession,
  listSessions,
  restoreSession,
  deleteSession,
  searchSessions,
  exportSession,
  importSession,
} = useSession()

const { success, error: notifyError } = useNotification()

const searchQuery = ref('')

watch(() => props.visible, (val) => {
  if (val) {
    listSessions()
  }
})

watch(() => successMessage.value, (msg) => {
  if (msg) success(msg)
})

watch(() => error.value, (msg) => {
  if (msg) notifyError(msg)
})

function onCreate() {
  createSession()
}

function onRestore(id: string) {
  restoreSession(id)
  emit('restore', id)
  emit('close')
}

function onDelete(id: string) {
  deleteSession(id)
}

function onExport(id: string) {
  exportSession(id)
}

function onImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const data = e.target?.result as string
    importSession(data)
  }
  reader.readAsText(file)
  input.value = ''
}

function onSearch() {
  if (searchQuery.value.trim()) {
    searchSessions(searchQuery.value)
  } else {
    listSessions()
  }
}

function formatDate(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.session-fullscreen {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--vte-bg, #1e1e1e);
  display: flex; flex-direction: column;
}

.session-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated, #252526);
  flex-wrap: wrap; gap: 12px;
}
.session-header-left { display: flex; align-items: center; gap: 12px; }
.session-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.session-back {
  width: 32px; height: 32px; border-radius: 8px; border: none;
  background: none; color: var(--vte-text-muted); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.15s; flex-shrink: 0;
}
.session-back:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vte-text); }

.session-title { font-size: 16px; font-weight: 600; color: var(--vte-text); }
.session-count { font-size: 12px; color: var(--vte-text-muted); }

.session-search {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-radius: 8px;
  background: var(--vte-input-bg); border: 1px solid var(--vte-border);
  min-width: 150px; flex: 1; max-width: 300px;
}
.session-search svg { color: var(--vte-text-muted); flex-shrink: 0; }
.session-search input {
  flex: 1; background: none; border: none; outline: none;
  color: var(--vte-text); font-size: 13px; min-width: 0;
}
.session-search input::placeholder { color: var(--vte-text-muted); }

.session-action-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 8px; border: 1px solid var(--vte-border);
  background: none; color: var(--vte-text-muted); font-size: 13px;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.session-action-btn:hover { border-color: var(--vte-primary); color: var(--vte-text); }
.session-action-btn.primary {
  background: var(--vte-primary); border-color: var(--vte-primary); color: #fff;
}
.session-action-btn.primary:hover { opacity: 0.9; }

.session-content {
  flex: 1; overflow-y: auto; padding: 16px;
  width: 100%; box-sizing: border-box;
}

.session-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; gap: 12px; color: var(--vte-text-muted);
}
.session-empty svg { opacity: 0.3; }
.session-empty-title { font-size: 16px; font-weight: 500; }
.session-empty-hint { font-size: 13px; }

.session-list {
  display: flex; flex-direction: column; gap: 8px;
}

.session-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-radius: 8px;
  border: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated);
  cursor: pointer; transition: all 0.15s;
}
.session-item:hover {
  border-color: var(--vte-primary);
  background: rgba(99,102,241,0.03);
}

.session-item-main {
  flex: 1; min-width: 0;
}
.session-item-name {
  font-size: 14px; font-weight: 500; color: var(--vte-text);
  margin-bottom: 4px;
}
.session-item-meta {
  display: flex; gap: 12px; font-size: 12px; color: var(--vte-text-muted);
}
.session-item-preview {
  font-size: 12px; color: var(--vte-text-muted); margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.session-item-actions {
  display: flex; gap: 4px; margin-left: 12px; flex-shrink: 0;
  opacity: 0; transition: opacity 0.15s;
}
.session-item:hover .session-item-actions { opacity: 1; }

.session-item-btn {
  width: 28px; height: 28px; border-radius: 6px; border: none;
  background: none; color: var(--vte-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.session-item-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vte-text); }
.session-item-btn.delete:hover { color: #ef4444; }

/* Transition */
.session-panel-enter-active { transition: opacity 0.2s ease; }
.session-panel-leave-active { transition: opacity 0.15s ease; }
.session-panel-enter-from, .session-panel-leave-to { opacity: 0; }
</style>
