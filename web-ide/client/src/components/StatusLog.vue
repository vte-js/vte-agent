<script setup lang="ts">
import type { StatusEvent } from '../protocol'

const props = defineProps<{
  events: StatusEvent[]
  pending: { requestId: string; toolName: string; toolArgs: any } | null
}>()

const emit = defineEmits<{
  (e: 'resolve', decision: 'allow_once' | 'always_allow' | 'deny'): void
}>()
</script>

<template>
  <div class="ide-pane-inner">
    <div class="ide-pane-header">
      <span class="ide-pane-header-icon">
        <!-- activity icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      </span>
      工具 / Agent 状态
    </div>
    <div class="ide-pane-body">

      <!-- Permission request card -->
      <div v-if="pending" class="perm-card">
        <div class="perm-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          权限请求：{{ pending.toolName }}
        </div>
        <pre class="perm-args">{{ JSON.stringify(pending.toolArgs, null, 2) }}</pre>
        <div class="perm-actions">
          <button class="btn-perm-allow" @click="emit('resolve', 'allow_once')">允许一次</button>
          <button class="btn-perm-deny" @click="emit('resolve', 'always_allow')">始终允许</button>
          <button class="btn-perm-deny" @click="emit('resolve', 'deny')">拒绝</button>
        </div>
      </div>

      <!-- Event timeline -->
      <div
        v-for="e in events"
        :key="e.id"
        class="evt-item"
        :class="'evt-' + e.kind"
      >
        <div class="evt-head">
          <span class="evt-name" :class="'evt-' + e.kind">
            <!-- Tool call icon -->
            <svg v-if="e.kind === 'tool_call'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <!-- Tool result icon -->
            <svg v-else-if="e.kind === 'tool_result'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <!-- Info icon -->
            <svg v-else-if="e.kind === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <!-- Permission icon -->
            <svg v-else-if="e.kind === 'permission'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <!-- Default / error icon -->
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {{ e.title }}
          </span>
          <span v-if="e.elapsed != null" class="evt-time">{{ e.elapsed }}ms</span>
        </div>
        <div v-if="e.detail" class="evt-detail">{{ e.detail }}</div>
      </div>

      <!-- Empty state -->
      <div v-if="!events.length && !pending" class="status-empty">
        <div class="status-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <div class="status-empty-text">工具调用与委派活动<br>将在此实时展示</div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.ide-pane-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
