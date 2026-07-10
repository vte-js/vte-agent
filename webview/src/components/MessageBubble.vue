<template>
  <div class="mg" :class="msg.role">
    <div class="ml">
      <AgentAvatar v-if="msg.role === 'assistant'" class="ml-icon" :speaking="isStreaming" compact />
      {{ msg.role === 'user' ? '你' : 'VTE Agent' }}
    </div>
    <!-- Thinking: animation below name, content below animation -->
    <div v-if="msg.role === 'assistant' && msg.thinkingPhase && !msg.text" class="think-anim">
      <div class="dots"><span></span><span></span><span></span></div>
      <span class="think-t">思考中...</span>
    </div>
    <!-- Thinking content - collapsible, hidden by default -->
    <div v-if="msg.role === 'assistant' && msg.thinkingText && msg.text" class="think-collapsible">
      <button class="think-toggle" @click="showThinking = !showThinking">
        <svg :class="{ rotated: showThinking }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
        <span>思考过程</span>
      </button>
      <div v-if="showThinking" class="think-content">
        <div class="tc-body">{{ msg.thinkingText }}</div>
      </div>
    </div>
    <div v-if="msg.text || msg.role !== 'assistant' || !msg.thinkingPhase" class="mb">
      <!-- Image attachments -->
      <div v-if="msg.role === 'user' && msg.images?.length" class="msg-images">
        <img v-for="(img, idx) in msg.images" :key="idx" :src="img.dataUrl" :alt="img.name" class="msg-image" />
      </div>
      <ToolCallBlock v-if="msg.role === 'assistant' && msg.toolCalls?.length" :tool-calls="msg.toolCalls" />
      <!-- Error message with special styling -->
      <div v-if="msg.role === 'assistant' && isError" class="mt error-msg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ errorText }}</span>
      </div>
      <div v-else-if="msg.role === 'assistant'" class="mt" v-html="renderedText"></div>
      <div v-else class="mt">{{ msg.text }}</div>
      <span v-if="isStreaming" class="stream-cursor"></span>
      <button v-if="msg.role === 'assistant' && mode === 'plan'" class="exec-plan" @click="$emit('executePlan', msg.text)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        切换到编码模式并执行
      </button>
    </div>
    <!-- Toolbar OUTSIDE the bubble -->
    <div v-if="!editing" class="msg-toolbar">
      <span v-if="msg.role === 'user' && msg.timestamp" class="msg-time">{{ msg.timestamp }}</span>
      <VTooltip text="复制内容">
        <button class="mt-btn" @click="copyText">
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span v-if="copied" class="copy-ok">已复制</span>
        </button>
      </VTooltip>
      <!-- Thumbs up/down for assistant messages -->
      <template v-if="msg.role === 'assistant' && !isStreaming">
        <VTooltip :text="feedback === 'up' ? '已赞' : '觉得有用'">
          <button class="mt-btn fb-btn up" :class="{ active: feedback === 'up' }" @click="onFeedback('up')">
            <svg viewBox="0 0 24 24" :fill="feedback === 'up' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          </button>
        </VTooltip>
        <VTooltip :text="feedback === 'down' ? '已踩' : '觉得不准'">
          <button class="mt-btn fb-btn down" :class="{ active: feedback === 'down' }" @click="onFeedback('down')">
            <svg viewBox="0 0 24 24" :fill="feedback === 'down' ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
          </button>
        </VTooltip>
      </template>
      <VTooltip v-if="msg.role === 'user'" text="编辑并重新发送">
        <button class="mt-btn" @click="startEdit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </VTooltip>
      <VTooltip v-if="msg.role === 'user'" text="删除消息">
        <button class="mt-btn" @click="$emit('delete')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </VTooltip>
    </div>
    <FeedbackModal :visible="showFeedbackModal" @close="showFeedbackModal = false" @submit="onFeedbackSubmit" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage } from '../composables/useChat'
import type { AgentMode } from '../composables/useMode'
import { renderMarkdown } from '../markdown'
import VTooltip from './VTooltip.vue'
import ToolCallBlock from './ToolCallBlock.vue'
import AgentAvatar from './AgentAvatar.vue'
import FeedbackModal from './FeedbackModal.vue'

const props = defineProps<{
  msg: ChatMessage
  mode: AgentMode
}>()

const emit = defineEmits<{
  executePlan: [text: string]
  delete: []
  edit: [text: string]
  feedback: [rating: 'up' | 'down', comment?: string]
}>()

const editing = ref(false)
const editText = ref('')
const editInput = ref<HTMLTextAreaElement>()
const showThinking = ref(false)

const renderedText = computed(() => renderMarkdown(props.msg.text))
const isError = computed(() => props.msg.text?.startsWith('⚠️') || false)
const errorText = computed(() => props.msg.text?.replace(/^⚠️\s*/, '') || '')
const copied = ref(false)
const feedback = ref<'up' | 'down' | null>(null)
const showFeedbackModal = ref(false)
const isStreaming = computed(() => (props.msg as any).streaming === true)

function copyText() {
  navigator.clipboard.writeText(props.msg.text)
  copied.value = true
  setTimeout(() => copied.value = false, 1200)
}

function onFeedback(rating: 'up' | 'down') {
  if (rating === 'up') {
    feedback.value = feedback.value === 'up' ? null : 'up'
    if (feedback.value === 'up') emit('feedback', 'up')
  } else {
    showFeedbackModal.value = true
  }
}

function onFeedbackSubmit(comment: string) {
  feedback.value = 'down'
  emit('feedback', 'down', comment)
  showFeedbackModal.value = false
}

function startEdit() {
  emit('edit', props.msg.text)
}
</script>
