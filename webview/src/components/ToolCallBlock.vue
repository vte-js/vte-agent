<template>
  <div class="tool-flow">
    <div v-for="tc in toolCalls" :key="tc.id" class="tool-entry" :class="tc.status">
      <div class="tool-row">
        <span v-if="tc.status === 'running'" class="tool-spinner"></span>
        <span v-else-if="tc.status === 'done'" class="tool-check">✓</span>
        <span v-else class="tool-cross">✗</span>
        <AgentAvatar class="tool-avatar" compact />
        <span class="tool-label">{{ getToolLabel(tc.name) }}</span>
        <span v-if="tc.status === 'done' && tc.elapsed" class="tool-elapsed">{{ formatTime(tc.elapsed) }}</span>
      </div>
      <DiffViewer v-if="shouldShowDiff(tc)" :content="tc.result || ''" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ToolCallEvent } from '../composables/useChat'
import AgentAvatar from './AgentAvatar.vue'
import DiffViewer from './DiffViewer.vue'

defineProps<{
  toolCalls: ToolCallEvent[]
}>()

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
  question: '向用户提问',
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

.tool-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.03);
  font-size: 11px;
  width: fit-content;
  max-width: 100%;
}

.tool-entry.running .tool-row {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.15);
}

.tool-entry.done .tool-row {
  background: rgba(34, 197, 94, 0.05);
  border-color: rgba(34, 197, 94, 0.1);
}

.tool-entry.error .tool-row {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.1);
}

.tool-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(99, 102, 241, 0.25);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.tool-check {
  color: #22c55e;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.tool-cross {
  color: #ef4444;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.tool-avatar {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}

.tool-label {
  color: var(--vte-text-muted, #94a3b8);
  font-weight: 500;
  font-size: 11px;
}

.tool-entry.running .tool-label {
  color: var(--vte-text, #e2e8f0);
}

.tool-elapsed {
  color: var(--vte-text-muted, #475569);
  font-size: 11px;
  margin-left: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
