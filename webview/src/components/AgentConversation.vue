<template>
  <div class="agent-conversation" v-if="agent">
    <div class="conv-header">
      <span class="conv-role-badge" :style="{ background: getRoleColor(agent.role) }">
        {{ getRoleIcon(agent.role) }}
      </span>
      <div class="conv-info">
        <span class="conv-name">{{ agent.roleName }}</span>
        <span class="conv-status" :class="agent.status">{{ statusLabel }}</span>
      </div>
      <button class="conv-close" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="conv-messages" ref="messagesEl">
      <div v-if="history.length === 0" class="conv-empty">
        <span class="conv-empty-icon">{{ agent.role === 'dev' ? '💻' : agent.role === 'test' ? '🧪' : agent.role === 'review' ? '🔍' : '📋' }}</span>
        <span>{{ agent.roleName }} 空闲中</span>
      </div>
      <div
        v-for="(msg, idx) in history"
        :key="`${agent.id}-${idx}-${msg.timestamp}`"
        class="conv-msg"
        :class="msg.role"
      >
        <div class="conv-msg-header">
          <span class="conv-msg-role">{{ msg.role === 'user' ? '任务' : msg.role === 'assistant' ? agent.roleName : '系统' }}</span>
          <span class="conv-msg-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="conv-msg-text" v-html="renderMarkdown(msg.text)"></div>
      </div>
    </div>

    <div class="conv-input" v-if="agent.status === 'idle'">
      <input
        v-model="inputText"
        class="conv-input-field"
        placeholder="向 Agent 发送指令..."
        @keydown.enter="sendMessage"
      />
      <button class="conv-send-btn" @click="sendMessage" :disabled="!inputText.trim()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { renderMarkdown } from '../markdown'
import type { AgentStatus } from '../composables/useMultiAgent'

const props = defineProps<{
  agent: AgentStatus | null
  history: Array<{ role: string; text: string; timestamp: string }>
}>()

const emit = defineEmits<{
  close: []
  sendMessage: [text: string]
}>()

const inputText = ref('')
const messagesEl = ref<HTMLElement>()

const ROLE_COLORS: Record<string, string> = {
  pm: '#6366f1', dev: '#22c55e', test: '#f59e0b', review: '#8b5cf6', doc: '#ec4899',
}
const ROLE_ICONS: Record<string, string> = {
  pm: '📋', dev: '💻', test: '🧪', review: '🔍', doc: '📝',
}

function getRoleColor(role: string) { return ROLE_COLORS[role] || '#64748b' }
function getRoleIcon(role: string) { return ROLE_ICONS[role] || '🤖' }

const statusLabel = computed(() => {
  if (!props.agent) return ''
  const labels: Record<string, string> = { idle: '空闲', busy: '运行中', error: '错误' }
  return labels[props.agent.status] || props.agent.status
})

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function sendMessage() {
  if (!inputText.value.trim()) return
  emit('sendMessage', inputText.value.trim())
  inputText.value = ''
}

// Auto-scroll to bottom on new messages
watch(() => props.history.length, () => {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.agent-conversation {
  display: flex; flex-direction: column;
  border-left: 1px solid var(--vte-border);
  width: 320px; flex-shrink: 0;
  min-height: 0;
  background: var(--vte-bg, #1e1e1e);
}

.conv-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
}
.conv-role-badge {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.conv-info { flex: 1; display: flex; flex-direction: column; }
.conv-name { font-size: 12px; font-weight: 600; color: var(--vte-text); }
.conv-status { font-size: 10px; }
.conv-status.idle { color: #64748b; }
.conv-status.busy { color: #f59e0b; }
.conv-status.error { color: #ef4444; }
.conv-close {
  width: 24px; height: 24px; border: none; background: none;
  border-radius: 4px; color: var(--vte-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.conv-close:hover { background: rgba(255,255,255,0.08); }

.conv-messages {
  flex: 1; min-height: 0; overflow-y: auto; padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
}

.conv-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  color: var(--vte-text-muted); font-size: 12px;
}
.conv-empty-icon { font-size: 24px; }

.conv-msg {
  padding: 8px 10px; border-radius: 8px;
  background: rgba(255,255,255,0.03);
}
.conv-msg.user { background: rgba(99,102,241,0.08); }
.conv-msg.system { background: rgba(245,158,11,0.06); font-style: italic; }

.conv-msg-header {
  display: flex; justify-content: space-between; margin-bottom: 4px;
}
.conv-msg-role { font-size: 10px; font-weight: 600; color: var(--vte-text-muted); }
.conv-msg-time { font-size: 9px; color: var(--vte-text-muted); opacity: 0.6; }
.conv-msg-text { font-size: 12px; line-height: 1.5; color: var(--vte-text); word-break: break-word; }

.conv-input {
  display: flex; gap: 6px; padding: 8px 12px;
  border-top: 1px solid var(--vte-border); flex-shrink: 0;
}
.conv-input-field {
  flex: 1; padding: 6px 10px; border-radius: 6px;
  border: 1px solid var(--vte-border); background: var(--vte-input-bg);
  color: var(--vte-text); font-size: 12px; outline: none;
}
.conv-input-field:focus { border-color: var(--vte-primary); }
.conv-send-btn {
  width: 30px; height: 30px; border: none; border-radius: 6px;
  background: var(--vte-primary); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.conv-send-btn:hover { opacity: 0.9; }
.conv-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
