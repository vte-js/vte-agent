<template>
  <div class="msgs" ref="listEl" @scroll="onScroll">
    <div v-if="messages.length === 0" class="empty">
      <div class="empty-fox">
        <div class="empty-fox-inner"><AgentAvatar /></div>
      </div>
      <h1 class="empty-title">VTE Agent</h1>
      <p class="empty-sub">AI 编程助手 · 多智能体协作 · 代码理解与生成</p>
      <div class="empty-hints">
        <button
          v-for="hint in hints"
          :key="hint.text"
          class="empty-hint"
          type="button"
          @click="$emit('suggest', hint.text)"
        >
          <span class="empty-hint-icon" v-html="hint.svg"></span>
          <span class="empty-hint-text">{{ hint.text }}</span>
        </button>
      </div>
      <p class="empty-foot">在下方输入消息，或点选上方示例开始对话</p>
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

const hints: { text: string; svg: string }[] = [
  {
    text: '搜索项目中的 TypeScript 文件',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  },
  {
    text: '读取 src/index.ts 的内容',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  },
  {
    text: '帮我重构这个函数',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  },
  {
    text: '解释这段代码的逻辑',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg>',
  },
]

defineEmits<{
  executePlan: [text: string]
  deleteMessage: [id: number]
  startEdit: [text: string, id: number, context: import('../protocol').ContextAttachment[]]
  feedback: [messageId: number, rating: 'up' | 'down', comment?: string]
  suggest: [text: string]
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
.msgs {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 36px; /* extra bottom padding for floating agent strip */
}
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
