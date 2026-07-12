<template>
  <div class="msgs" ref="listEl" @scroll="onScroll">
    <div v-if="messages.length === 0" class="empty">
      <div class="empty-icon-wrap">
        <AgentAvatar />
      </div>
      <div class="empty-title">VTE Agent</div>
      <div class="empty-sub">AI Code Agent</div>
      <div class="empty-hints">
        <div class="empty-hint">搜索项目中的 TypeScript 文件</div>
        <div class="empty-hint">读取 src/index.ts 的内容</div>
        <div class="empty-hint">帮我重构这个函数</div>
      </div>
    </div>
    <template v-for="msg in messages" :key="msg.id">
      <MessageBubble :msg="msg as ChatMessage" :mode="mode"
        @execute-plan="(text) => $emit('executePlan', text)"
        @delete="$emit('deleteMessage', (msg as ChatMessage).id)"
        @edit="(text, id, ctx) => $emit('startEdit', text, id, ctx)"
        @feedback="(rating, comment) => $emit('feedback', (msg as ChatMessage).id, rating, comment)"
      />
    </template>
  </div>
  <!-- Scroll to top — outside scroll container so it floats independently -->
  <Transition name="st-fade">
    <button v-if="showScrollTop" class="st-btn" @click="scrollToTop" title="返回顶部">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    </button>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import MessageBubble from './MessageBubble.vue'
import AgentAvatar from './AgentAvatar.vue'
import type { ChatMessage, TaskSnapshotMessage, FlowMessage } from '../composables/useChat'
import type { AgentMode } from '../composables/useMode'

const props = defineProps<{
  messages: FlowMessage[]
  mode: AgentMode
  toolTick?: number
}>()

defineEmits<{
  executePlan: [text: string]
  deleteMessage: [id: number]
  startEdit: [text: string, id: number, context: import('../protocol').ContextAttachment[]]
  feedback: [messageId: number, rating: 'up' | 'down', comment?: string]
}>()

const listEl = ref<HTMLElement>()
const showScrollTop = ref(false)

function onScroll() {
  if (!listEl.value) return
  const { scrollTop } = listEl.value
  // Show button when scrolled down more than 400px from top
  showScrollTop.value = scrollTop > 400
}

function scrollToTop() {
  listEl.value?.scrollTo({ top: 0, behavior: 'smooth' })
  // Hide button immediately, re-check after smooth scroll finishes
  showScrollTop.value = false
  setTimeout(() => onScroll(), 500)
}

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
})

// Auto-scroll on tool call updates (but only if user is near bottom)
watch(() => props.toolTick, () => {
  nextTick(() => {
    if (!listEl.value) return
    const { scrollTop, scrollHeight, clientHeight } = listEl.value
    // Only auto-scroll if user is already near bottom (within 200px)
    if (scrollHeight - scrollTop - clientHeight < 200) {
      listEl.value.scrollTop = listEl.value.scrollHeight
    }
  })
})
</script>

<style scoped>
.st-btn {
  position: absolute;
  bottom: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  background: var(--vte-bg-elevated, rgba(30,30,46,0.85));
  backdrop-filter: blur(8px);
  color: var(--vte-text-muted, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  z-index: 10;
}
.st-btn:hover {
  background: var(--vte-bg-elevated, rgba(30,30,46,0.95));
  color: var(--vte-text, #e2e8f0);
  border-color: var(--vte-primary, rgba(99,102,241,0.3));
}

.st-fade-enter-active, .st-fade-leave-active {
  transition: opacity 0.15s ease;
}
.st-fade-enter-from, .st-fade-leave-to {
  opacity: 0;
}
</style>
