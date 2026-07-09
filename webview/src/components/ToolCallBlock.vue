<template>
  <div class="tool-block">
    <div v-if="toolCalls.length === 1" class="tool-item" :class="toolCalls[0].status">
      <div class="tool-row">
        <span v-if="toolCalls[0].status === 'running'" class="tool-spinner"></span>
        <span v-else class="tool-done">✓</span>
        <AgentAvatar class="tool-icon" compact />
        <span class="tool-name">{{ getToolLabel(toolCalls[0].name) }}</span>
        <span v-if="toolCalls[0].status === 'done' && toolCalls[0].elapsed" class="tool-time">{{ formatTime(toolCalls[0].elapsed) }}</span>
      </div>
      <!-- Show diff for edit/write operations -->
      <DiffViewer v-if="shouldShowDiff(toolCalls[0])" :content="toolCalls[0].result || ''" />
    </div>

    <div v-else class="tool-group">
      <div class="tool-group-header">
        <span v-if="!allDone" class="tool-spinner"></span>
        <span v-else class="tool-done">✓</span>
        <AgentAvatar class="tool-icon" compact />
        <span class="tool-group-count">调用了 {{ toolCalls.length }} 个工具</span>
      </div>
      <!-- Show diffs for each tool call in group -->
      <div v-for="tc in toolCalls" :key="tc.id" class="tool-group-item">
        <div class="tool-group-step">
          <span v-if="tc.status === 'done'" class="tool-done-sm">✓</span>
          <span v-else-if="tc.status === 'error'" class="tool-error-sm">✗</span>
          <span v-else class="tool-spinner-sm"></span>
          <span class="tool-step-name">{{ getToolLabel(tc.name) }}</span>
          <span v-if="tc.elapsed" class="tool-time">{{ formatTime(tc.elapsed) }}</span>
        </div>
        <DiffViewer v-if="shouldShowDiff(tc)" :content="tc.result || ''" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCallEvent } from '../composables/useChat'
import AgentAvatar from './AgentAvatar.vue'
import DiffViewer from './DiffViewer.vue'

const props = defineProps<{
  toolCalls: ToolCallEvent[]
}>()

const allDone = computed(() => props.toolCalls.every(tc => tc.status === 'done' || tc.status === 'error'))

const TOOL_LABELS: Record<string, string> = {
  webfetch: '抓取网页',
  read: '读取文件',
  edit: '编辑文件',
  write: '写入文件',
  list: '列目录',
  search: '搜索内容',
  bash: '执行命令',
  grep: '搜索内容',
  glob: '搜索文件',
  diagnostics: '代码诊断',
  git: 'Git 操作',
  task_create: '创建任务',
  task_update: '更新任务',
  task_list: '任务列表',
  task_delete: '删除任务',
}

function getToolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function shouldShowDiff(tc: ToolCallEvent): boolean {
  if (tc.status !== 'done' || !tc.result) return false
  // Show diff for edit/write/bash tools that might contain diff output
  if (['edit', 'write'].includes(tc.name)) return true
  // Show diff for git diff commands
  if (tc.name === 'git' && tc.arguments?.command?.includes('diff')) return true
  // Check if result looks like a diff
  return tc.result.includes('@@') || tc.result.startsWith('diff --git')
}
</script>
