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
    <div v-if="msg.role === 'assistant' && msg.thinkingText" class="think-content">
      <div class="tc-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>思考过程</span>
      </div>
      <div class="tc-body">{{ msg.thinkingText }}</div>
    </div>
    <div v-if="msg.text || msg.role !== 'assistant' || !msg.thinkingPhase" class="mb">
      <ToolCallBlock v-if="msg.role === 'assistant' && msg.toolCalls?.length" :tool-calls="msg.toolCalls" />
      <div v-if="msg.role === 'assistant'" class="mt" v-html="renderedText"></div>
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
      <VTooltip v-if="msg.role === 'user'" text="编辑并重新发送">
        <button class="mt-btn" @click="startEdit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </VTooltip>
      <VTooltip text="删除消息">
        <button class="mt-btn" @click="$emit('delete')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </VTooltip>
    </div>
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

const props = defineProps<{
  msg: ChatMessage
  mode: AgentMode
}>()

const emit = defineEmits<{
  executePlan: [text: string]
  delete: []
  edit: [text: string]
}>()

const editing = ref(false)
const editText = ref('')
const editInput = ref<HTMLTextAreaElement>()

const renderedText = computed(() => renderMarkdown(props.msg.text))
const copied = ref(false)
const isStreaming = computed(() => (props.msg as any).streaming === true)

function copyText() {
  navigator.clipboard.writeText(props.msg.text)
  copied.value = true
  setTimeout(() => copied.value = false, 1200)
}

function startEdit() {
  emit('edit', props.msg.text)
}
</script>
