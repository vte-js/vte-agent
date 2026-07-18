<template>
  <div class="tool-flow">
    <div v-for="tc in toolCalls" :key="tc.id" class="tool-entry" :class="tc.status">
      <ToolLine :name="tc.name" :status="tc.status" :elapsed="tc.elapsed" />
      <DiffViewer v-if="shouldShowDiff(tc)" :content="tc.result || ''" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToolCallEvent } from '../composables/useChat'
import ToolLine from './ToolLine.vue'
import DiffViewer from './DiffViewer.vue'

defineProps<{
  toolCalls: ToolCallEvent[]
}>()

function shouldShowDiff(tc: ToolCallEvent): boolean {
  if (tc.status !== 'done' || !tc.result) return false
  if (['edit', 'write'].includes(tc.name)) return true
  if (tc.name === 'git' && tc.arguments?.command?.includes('diff')) return true
  return tc.result.includes('@@') || tc.result.startsWith('diff --git')
}
</script>

<style scoped>
.tool-flow {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 4px 0;
}

.tool-entry {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
</style>
