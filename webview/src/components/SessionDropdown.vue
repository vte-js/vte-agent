<template>
  <Transition name="sd-fade">
    <div v-if="visible" class="session-dropdown" @click.stop>
      <div class="sd-head">
        <span class="sd-title">会话</span>
        <button class="sd-new" @click="onNew">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新建
        </button>
        <button class="sd-close" @click="$emit('close')" title="关闭">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="sd-search">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          v-model="query"
          class="sd-search-input"
          placeholder="搜索会话..."
          @input="onSearch"
        />
        <button v-if="query" class="sd-search-clear" @click="clearSearch" title="清除">×</button>
      </div>

      <div class="sd-list">
        <div v-if="sessions.length === 0" class="sd-empty">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>{{ query ? '无匹配会话' : '暂无会话' }}</span>
          <span v-if="!query" class="sd-empty-hint">开始对话后会话会自动保存</span>
        </div>

        <div
          v-for="s in sessions"
          :key="s.id"
          class="sd-item"
          :class="{ active: s.id === currentSessionId }"
          @click="onRestore(s.id)"
        >
          <div class="sd-item-main">
            <input
              v-if="renamingId === s.id"
              v-model="renameValue"
              v-focus
              class="sd-rename-input"
              @click.stop
              @keydown.enter="confirmRename"
              @keydown.esc="cancelRename"
              @blur="confirmRename"
            />
            <div v-else class="sd-item-name">
              <span v-if="s.id === currentSessionId" class="sd-dot" title="当前会话"></span>
              {{ s.name }}
            </div>
            <div class="sd-item-meta">
              <span>{{ formatDate(s.createdAt) }}</span>
              <span class="sd-dot-sep">·</span>
              <span>{{ s.messageCount }} 条</span>
              <span v-if="s.model" class="sd-dot-sep">·</span>
              <span v-if="s.model" class="sd-item-model">{{ s.model }}</span>
            </div>
          </div>

          <div class="sd-item-actions" @click.stop>
            <template v-if="confirmId === s.id">
              <button class="sd-confirm" @click="confirmDelete(s.id)">删除?</button>
              <button class="sd-cancel" @click="confirmId = null">取消</button>
            </template>
            <template v-else>
              <button class="sd-ico" title="重命名" @click="startRename(s)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="sd-ico danger" title="删除" @click="confirmId = s.id">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div v-if="successMessage" class="sd-toast">{{ successMessage }}</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSession } from '../composables/useSession'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const {
  sessions,
  currentSessionId,
  successMessage,
  createSession,
  listSessions,
  restoreSession,
  deleteSession,
  renameSession,
  searchSessions,
} = useSession()

const query = ref('')
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const confirmId = ref<string | null>(null)
let searchTimer: ReturnType<typeof setTimeout> | null = null

// v-focus: autofocus the rename input when it mounts
const vFocus = { mounted: (el: HTMLElement) => el.focus() }

watch(
  () => props.visible,
  (v) => {
    if (v) {
      query.value = ''
      renamingId.value = null
      confirmId.value = null
      listSessions()
    }
  }
)

function onNew() {
  createSession()
  emit('close')
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (query.value.trim()) searchSessions(query.value.trim())
    else listSessions()
  }, 200)
}

function clearSearch() {
  query.value = ''
  listSessions()
}

function onRestore(id: string) {
  restoreSession(id)
  emit('close')
}

function startRename(s: { id: string; name: string }) {
  renamingId.value = s.id
  renameValue.value = s.name
}

function confirmRename() {
  const id = renamingId.value
  if (!id) return
  const name = renameValue.value.trim()
  if (name) renameSession(id, name)
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function confirmDelete(id: string) {
  deleteSession(id)
  confirmId.value = null
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.session-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--vte-bg-elevated, #252526);
  border: 1px solid var(--vte-border, #3c3c3c);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  color: var(--vte-text, #cccccc);
  font-size: 12px;
  overflow: hidden;
  z-index: 50;
}

.sd-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--vte-border, #3c3c3c);
}
.sd-title {
  font-weight: 600;
  font-size: 13px;
  flex: 1;
}
.sd-new {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid var(--vte-border, #3c3c3c);
  background: #6366f1;
  color: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: filter 0.15s;
}
.sd-new:hover { filter: brightness(1.1); }
.sd-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  border-radius: 6px;
}
.sd-close:hover { background: rgba(255, 255, 255, 0.08); color: var(--vte-text, #ccc); }

.sd-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 10px;
  padding: 0 8px;
  height: 30px;
  border-radius: 7px;
  background: var(--vte-input-bg, #1e1e1e);
  border: 1px solid var(--vte-input-border, #3c3c3c);
  color: var(--vte-text-muted, #999);
}
.sd-search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  color: var(--vte-text, #ccc);
  font-size: 12px;
  font-family: inherit;
}
.sd-search-input::placeholder { color: var(--vte-text-muted, #999); opacity: 0.6; }
.sd-search-clear {
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0 2px;
}
.sd-search-clear:hover { color: var(--vte-text, #ccc); }

.sd-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 6px 8px;
}

.sd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 16px;
  color: var(--vte-text-muted, #999);
  text-align: center;
}
.sd-empty-hint { font-size: 10px; opacity: 0.7; }

.sd-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s;
}
.sd-item:hover { background: rgba(255, 255, 255, 0.05); }
.sd-item.active { background: rgba(99, 102, 241, 0.16); }
.sd-item.active:hover { background: rgba(99, 102, 241, 0.22); }

.sd-item-main {
  flex: 1;
  min-width: 0;
}
.sd-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--vte-text, #ccc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sd-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6366f1;
}
.sd-item-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--vte-text-muted, #999);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sd-dot-sep { opacity: 0.5; }
.sd-item-model {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sd-rename-input {
  width: 100%;
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid #6366f1;
  background: var(--vte-input-bg, #1e1e1e);
  color: var(--vte-text, #ccc);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.sd-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s;
}
.sd-item:hover .sd-item-actions,
.sd-item.active .sd-item-actions { opacity: 1; }
.sd-ico {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  border-radius: 6px;
}
.sd-ico:hover { background: rgba(255, 255, 255, 0.1); color: var(--vte-text, #ccc); }
.sd-ico.danger:hover { background: rgba(229, 72, 77, 0.18); color: #e5484d; }

.sd-confirm {
  padding: 3px 7px;
  border-radius: 5px;
  border: 1px solid rgba(229, 72, 77, 0.5);
  background: rgba(229, 72, 77, 0.16);
  color: #e5484d;
  font-size: 10.5px;
  cursor: pointer;
}
.sd-confirm:hover { background: rgba(229, 72, 77, 0.28); }
.sd-cancel {
  padding: 3px 7px;
  border-radius: 5px;
  border: 1px solid var(--vte-border, #3c3c3c);
  background: none;
  color: var(--vte-text-muted, #999);
  font-size: 10.5px;
  cursor: pointer;
}
.sd-cancel:hover { color: var(--vte-text, #ccc); }

.sd-toast {
  position: absolute;
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
}

.sd-fade-enter-active,
.sd-fade-leave-active { transition: opacity 0.13s ease, transform 0.13s ease; }
.sd-fade-enter-from,
.sd-fade-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
