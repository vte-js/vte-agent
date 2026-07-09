<template>
  <div class="msgs" ref="listEl">
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
      <TaskPanel v-if="msg.type === 'task_snapshot'" :tasks="(msg as TaskSnapshotMessage).tasks" />
      <MessageBubble v-else :msg="msg as ChatMessage" :mode="mode"
        @execute-plan="(text) => $emit('executePlan', text)"
        @delete="$emit('deleteMessage', (msg as ChatMessage).id)"
        @edit="(text) => $emit('startEdit', text)"
        @feedback="(rating, comment) => $emit('feedback', (msg as ChatMessage).id, rating, comment)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import MessageBubble from './MessageBubble.vue'
import TaskPanel from './TaskPanel.vue'
import AgentAvatar from './AgentAvatar.vue'
import type { ChatMessage, TaskSnapshotMessage, FlowMessage } from '../composables/useChat'
import type { AgentMode } from '../composables/useMode'

const props = defineProps<{
  messages: FlowMessage[]
  mode: AgentMode
}>()

defineEmits<{
  executePlan: [text: string]
  deleteMessage: [id: number]
  startEdit: [text: string]
  feedback: [messageId: number, rating: 'up' | 'down', comment?: string]
}>()

const listEl = ref<HTMLElement>()

watch(() => props.messages.length, () => {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
})
</script>
