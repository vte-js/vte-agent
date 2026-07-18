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
      <div v-if="processedHistory.length === 0" class="conv-empty">
        <span class="conv-empty-icon">{{ agent.role === 'dev' ? '💻' : agent.role === 'test' ? '🧪' : agent.role === 'review' ? '🔍' : '📋' }}</span>
        <span>{{ agent.roleName }} 空闲中</span>
      </div>
      <template v-for="(msg, idx) in processedHistory" :key="`${agent.id}-${idx}-${msg.timestamp}`">
        <!-- Tool call: lightweight shared line -->
        <ToolLine v-if="msg.kind === 'tool'" :name="msg.tool?.name || ''" :status="msg.tool?.status || 'done'" />

        <!-- Assistant turn: thinking + body + timestamp grouped -->
        <div v-else-if="msg.role === 'assistant'" class="conv-turn">
          <ThinkingBlock
            :thinking="msg.thinking || ''"
            :streaming="msg.streaming"
            :has-body="!!msg.text"
            :duration="msg.thinkingDuration"
          />
          <MessageBody v-if="msg.text" :text="msg.text" :streaming="msg.streaming" />
          <span class="conv-ts">{{ formatTime(msg.timestamp) }}</span>
        </div>

        <!-- User / system message: minimal -->
        <div v-else class="conv-msg-mini" :class="msg.role">
          <span class="conv-msg-label">{{ msg.role === 'user' ? '任务' : '系统' }}</span>
          <span class="conv-msg-text" v-html="renderMarkdown(msg.text)"></span>
        </div>
      </template>
    </div>

    <div class="conv-input">
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
import ThinkingBlock from './ThinkingBlock.vue'
import ToolLine from './ToolLine.vue'
import MessageBody from './MessageBody.vue'
import type { AgentStatus, AgentHistoryMessage } from '../composables/useMultiAgent'

const props = defineProps<{
  agent: AgentStatus | null
  history: AgentHistoryMessage[]
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

/** Fill missing thinkingDuration from timestamps (frontend safety net). */
const processedHistory = computed(() => {
  const src = props.history
  if (!src.length) return src
  // One-pass: remember each message's parsed ts for neighbor diff lookup.
  const parsed = src.map(m => ({ m, ts: new Date(m.timestamp).getTime() }))
  const out = parsed.map(({ m, ts }, idx) => {
    if (m.role === 'assistant' && m.kind === 'text' && m.thinking?.trim() && m.thinkingDuration == null) {
      const prevTs = idx > 0 ? parsed[idx - 1].ts : ts
      const diff = ts - prevTs
      return { ...m, thinkingDuration: diff > 0 ? diff : 2000 }
    }
    return m
  })
  return out
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
watch(() => processedHistory.value.length, () => {
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
  flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px;
  display: flex; flex-direction: column; gap: 2px;
}

.conv-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  color: var(--vte-text-muted); font-size: 12px;
}
.conv-empty-icon { font-size: 24px; }

/* ── Assistant turn (thinking + body + time grouped) ── */
.conv-turn {
  padding: 4px 0;
}

/* Timestamp — subtle at end of turn */
.conv-ts {
  display: block; text-align: right;
  font-size: 9px; color: var(--vte-text-muted, #666);
  opacity: .45; margin-top: 3px;
}

/* ── User / system message: minimal single line or compact block ── */
.conv-msg-mini {
  padding: 3px 0; font-size: 12px;
}
.conv-msg-mini.user .conv-msg-label {
  font-weight: 600; font-size: 10px;
  color: var(--vte-primary, #6366f1); margin-right: 4px;
}
.conv-msg-mini.system .conv-msg-label {
  font-weight: 600; font-size: 10px;
  color: var(--vte-text-muted, #888); margin-right: 4px;
}
.conv-msg-mini .conv-msg-text {
  color: var(--vte-text-muted, #aaa);
}

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
