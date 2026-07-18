<template>
  <div class="detail-catch" @click="$emit('close')"></div>
  <div class="work-order-detail">
    <div class="detail-header">
      <div class="detail-title-wrap">
        <span class="detail-title">{{ order.title }}</span>
        <span class="detail-id">{{ order.id }}</span>
      </div>
      <button class="detail-close" @click="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="detail-badges">
      <span class="detail-badge" :class="statusClass">{{ statusLabel }}</span>
      <span v-if="order.priority" class="detail-badge priority" :class="order.priority">{{ priorityLabel }}</span>
      <span v-if="order.requiredRole" class="detail-badge role">{{ order.requiredRole }}</span>
      <span v-if="order.assignedAgentId" class="detail-badge agent">{{ order.assignedAgentId }}</span>
    </div>

    <div class="detail-body">
      <section v-if="order.description" class="detail-section">
        <div class="section-label">描述</div>
        <div class="section-text" v-html="renderMarkdown(order.description)"></div>
      </section>

      <section v-if="order.status === 'done' && order.result" class="detail-section">
        <div class="section-label">执行结果</div>
        <div class="section-text result" v-html="renderMarkdown(order.result)"></div>
      </section>

      <section v-if="order.status === 'failed' && order.error" class="detail-section">
        <div class="section-label">错误信息</div>
        <div class="section-text error">{{ order.error }}</div>
      </section>

      <section class="detail-section">
        <div class="section-label">创建时间</div>
        <div class="section-text muted">{{ formatTime(order.createdAt) }}</div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { renderMarkdown } from '../markdown'
import type { WorkOrderStatus } from '../composables/useMultiAgent'

const props = defineProps<{
  order: WorkOrderStatus
}>()

const emit = defineEmits<{
  close: []
}>()

const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    pending: '待处理', assigned: '已分配', running: '执行中',
    done: '已完成', failed: '失败',
  }
  return labels[props.order.status] || props.order.status
})
const statusClass = computed(() => 'status-' + props.order.status)

const priorityLabel = computed(() => {
  const labels: Record<string, string> = {
    critical: '紧急', high: '高', normal: '普通', low: '低',
  }
  return labels[props.order.priority] || props.order.priority
})

function formatTime(ts: string) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.detail-catch {
  position: absolute; inset: 0; z-index: 29;
  background: transparent;
}
.work-order-detail {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 340px; z-index: 30;
  display: flex; flex-direction: column;
  border-left: 1px solid var(--vte-border);
  background: var(--vte-bg, #1e1e1e);
  box-shadow: -10px 0 30px rgba(0,0,0,0.45);
}

.detail-header {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 12px; border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
}
.detail-title-wrap { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.detail-title { font-size: 13px; font-weight: 600; color: var(--vte-text); line-height: 1.4; word-break: break-word; }
.detail-id { font-size: 10px; color: var(--vte-text-muted); opacity: 0.7; margin-top: 2px; }
.detail-close {
  width: 24px; height: 24px; border: none; background: none;
  border-radius: 4px; color: var(--vte-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.detail-close:hover { background: rgba(255,255,255,0.08); }

.detail-badges {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 12px; border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
}
.detail-badge {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
  background: rgba(255,255,255,0.08); color: var(--vte-text-muted);
}
.detail-badge.status-pending { background: rgba(99,102,241,0.15); color: #818cf8; }
.detail-badge.status-assigned { background: rgba(99,102,241,0.15); color: #818cf8; }
.detail-badge.status-running { background: rgba(245,158,11,0.15); color: #f59e0b; }
.detail-badge.status-done { background: rgba(34,197,94,0.15); color: #22c55e; }
.detail-badge.status-failed { background: rgba(239,68,68,0.15); color: #ef4444; }
.detail-badge.priority.critical { background: rgba(239,68,68,0.15); color: #ef4444; }
.detail-badge.priority.high { background: rgba(245,158,11,0.15); color: #f59e0b; }
.detail-badge.priority.normal { background: rgba(99,102,241,0.1); color: #818cf8; }
.detail-badge.priority.low { background: rgba(100,116,139,0.1); color: #64748b; }
.detail-badge.role { background: rgba(99,102,241,0.1); color: #818cf8; }
.detail-badge.agent { background: rgba(245,158,11,0.1); color: #f59e0b; }

.detail-body {
  flex: 1; min-height: 0; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 16px;
}
.detail-section { display: flex; flex-direction: column; gap: 6px; }
.section-label { font-size: 11px; font-weight: 600; color: var(--vte-text-muted); }
.section-text {
  font-size: 12px; line-height: 1.6; color: var(--vte-text);
  word-break: break-word; white-space: pre-wrap;
}
.section-text.result { color: #a5b4fc; }
.section-text.error { color: #ef4444; white-space: pre-wrap; }
.section-text.muted { color: var(--vte-text-muted); }
</style>
