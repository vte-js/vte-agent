<template>
  <div class="tl" :class="status">
    <span v-if="status === 'running'" class="tl-spin"></span>
    <svg v-else-if="status === 'done'" class="tl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <svg v-else class="tl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
    <code class="tl-name">{{ localizeToolName(name) }}</code>
    <span v-if="status === 'done' && elapsed != null" class="tl-elapsed">{{ formatDuration(elapsed) }}</span>
  </div>
</template>

<script setup lang="ts">
import { localizeToolName, formatDuration } from '../utils/tool-utils'

defineProps<{
  name: string
  status: 'running' | 'done' | 'error'
  /** Elapsed time in ms, shown when status === 'done'. */
  elapsed?: number
}>()
</script>

<style scoped>
.tl {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 0; font-size: 11.5px;
  line-height: 1.7; color: var(--vte-text-muted, #999);
}
.tl.running { color: var(--vte-primary, #6366f1); }
.tl.done { color: var(--vte-text-muted, #777); }
.tl.error { color: #ef4444; }

.tl-spin {
  width: 6px; height: 6px; border-radius: 50%;
  border: 1.5px solid currentColor; border-top-color: transparent;
  animation: tl-spin .8s linear infinite;
  display: inline-block; vertical-align: middle;
}
@keyframes tl-spin { to { transform: rotate(360deg); } }

.tl-icon { flex-shrink: 0; }
.tl-name {
  font-family: var(--vte-mono, monospace); font-size: 11px; font-weight: 500;
  background: transparent; padding: 0;
}
.tl-elapsed {
  font-size: 9px; margin-left: 2px;
  color: var(--vte-text-muted, #666); opacity: .6;
}
</style>
