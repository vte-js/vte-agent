<template>
  <!-- Tool-call-only message: no avatar, no bubble, just the tool entry -->
  <div v-if="msg.role === 'assistant' && !msg.text && msg.toolCalls?.length && !msg.thinkingPhase" class="tool-inline">
    <ToolCallBlock :tool-calls="msg.toolCalls" />
  </div>
  <div v-else class="mg" :class="msg.role">
    <div v-if="msg.role === 'assistant'" class="ml">
      <AgentAvatar class="ml-icon" :speaking="isStreaming" compact />
      VTE Agent
    </div>
    <!-- Thinking: shared block (live indicator + collapsible) -->
    <ThinkingBlock
      v-if="msg.role === 'assistant' && (msg.thinkingPhase || !!msg.thinkingText)"
      :thinking="msg.thinkingText || ''"
      :streaming="isStreaming"
      :has-body="!!msg.text"
      :duration="msg.thinkingDuration"
    />
    <div v-if="msg.text || msg.images?.length || msg.context?.length || isError || (msg.role === 'assistant' && msg.thinkingText && msg.text) || msg.role !== 'assistant'" class="mb">
      <!-- Context file cards -->
      <div v-if="msg.role === 'user' && msg.context?.length" class="msg-context">
        <div v-for="(f, idx) in msg.context" :key="idx" class="ctx-file-card">
          <div class="ctx-file-icon" :class="getFileExt(f.name)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="ctx-file-info">
            <span class="ctx-file-name">{{ f.name }}</span>
            <span class="ctx-file-path">{{ getShortPath(f.path) }}</span>
          </div>
        </div>
      </div>
      <!-- Image attachments -->
      <div v-if="msg.role === 'user' && msg.images?.length" class="msg-images">
        <img v-for="(img, idx) in msg.images" :key="idx" :src="img.dataUrl" :alt="img.name" class="msg-image" @click="previewImage(img)" />
      </div>
      <!-- Error message with special styling -->
      <div v-if="msg.role === 'assistant' && isError" class="mt error-msg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>{{ errorText }}</span>
      </div>
      <MessageBody v-else-if="msg.role === 'assistant'" :text="msg.text" :streaming="isStreaming" />
      <div v-else class="mt">{{ msg.text }}</div>
      <!-- Tool calls below text so they stay visible at bottom -->
      <ToolCallBlock v-if="msg.role === 'assistant' && msg.toolCalls?.length" :tool-calls="msg.toolCalls" />
      <TaskPanel v-if="msg.role === 'assistant' && msg.tasks?.length" :tasks="msg.tasks!" />
      <button v-if="msg.role === 'assistant' && mode === 'plan'" class="exec-plan" @click="$emit('executePlan', msg.text)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        切换到编码模式并执行
      </button>
    </div>
    <!-- Toolbar OUTSIDE the bubble — hide for empty / thinking-only assistant messages -->
    <div v-if="!editing && (msg.role !== 'assistant' || msg.text || msg.toolCalls?.length)" class="msg-toolbar">
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
    <ImagePreview :src="previewSrc" :name="previewName" @close="previewSrc = ''" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage } from '../composables/useChat'
import type { AgentMode } from '../composables/useMode'
import ThinkingBlock from './ThinkingBlock.vue'
import MessageBody from './MessageBody.vue'
import VTooltip from './VTooltip.vue'
import ToolCallBlock from './ToolCallBlock.vue'
import TaskPanel from './TaskPanel.vue'
import AgentAvatar from './AgentAvatar.vue'
import FeedbackModal from './FeedbackModal.vue'
import ImagePreview from './ImagePreview.vue'

const props = defineProps<{
  msg: ChatMessage
  mode: AgentMode
}>()

const emit = defineEmits<{
  executePlan: [text: string]
  delete: []
  edit: [text: string, id: number, context: import('../protocol').ContextAttachment[]]
  feedback: [rating: 'up' | 'down', comment?: string]
}>()

const editing = ref(false)
const editText = ref('')
const editInput = ref<HTMLTextAreaElement>()

const isError = computed(() => props.msg.text?.startsWith('⚠️') || false)
const errorText = computed(() => props.msg.text?.replace(/^⚠️\s*/, '') || '')
const copied = ref(false)
const feedback = ref<'up' | 'down' | null>(null)
const showFeedbackModal = ref(false)
const isStreaming = computed(() => (props.msg as any).streaming === true)
const previewSrc = ref('')
const previewName = ref('')

function previewImage(img: { dataUrl: string; name: string }) {
  previewSrc.value = img.dataUrl
  previewName.value = img.name
}

function getFileExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return ext
}

function getShortPath(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return '.../' + parts.slice(-2).join('/')
}

function onPreviewKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') previewSrc.value = ''
}

import { onMounted, onUnmounted } from 'vue'
onMounted(() => window.addEventListener('keydown', onPreviewKeydown))
onUnmounted(() => window.removeEventListener('keydown', onPreviewKeydown))

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
  emit('edit', props.msg.text, props.msg.id, props.msg.context || [])
}
</script>

<style scoped>
.tool-inline {
  padding: 0;
}
</style>
