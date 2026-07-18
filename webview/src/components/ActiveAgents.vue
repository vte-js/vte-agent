<template>
  <!-- Compact floating strip — overlays at bottom of chat area, zero layout impact -->
  <div class="active-agents" :class="{ expanded: expanded }" @click="expanded = !expanded">
    <div class="aa-left">
      <span class="aa-pulse"></span>
      <span class="aa-label">正在协作</span>
      <span class="aa-count">{{ busyCount }}/{{ agents.length }}</span>
    </div>
    <div class="aa-chips">
      <span
        v-for="a in agents"
        :key="a.id"
        class="aa-chip"
        :class="statusClass(a.status)"
        :title="`${a.roleName} — ${statusText(a.status)}`"
      >
        {{ getRoleIcon(a.role) }}
        <span class="aa-dot" :style="{ background: getRoleColor(a.role) }"></span>
      </span>
    </div>
    <span v-if="expanded" class="aa-req">{{ request }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  agents: Array<{
    id: string
    role: string
    roleName: string
    status: 'idle' | 'busy' | 'error'
  }>
  request: string
}>()

const expanded = ref(false)

const busyCount = computed(() => props.agents.filter(a => a.status === 'busy').length)

const ROLE_COLORS: Record<string, string> = {
  pm: '#6366f1', dev: '#22c55e', test: '#f59e0b', review: '#8b5cf6', doc: '#ec4899',
}
const ROLE_ICONS: Record<string, string> = {
  pm: '📋', dev: '💻', test: '🧪', review: '🔍', doc: '📝',
}
function getRoleColor(role: string) { return ROLE_COLORS[role] || '#64748b' }
function getRoleIcon(role: string) { return ROLE_ICONS[role] || '🤖' }

function statusText(s: string) {
  if (s === 'busy') return '运行中'
  if (s === 'error') return '失败'
  return '空闲'
}
function statusClass(s: string) {
  if (s === 'busy') return 'busy'
  if (s === 'error') return 'error'
  return 'idle'
}
</script>

<style scoped>
.active-agents {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 28px;
  padding: 0 12px;
  background: color-mix(in srgb, var(--vte-bg, #1e1e1e) 88%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  z-index: 5;
  font-size: 11px;
  cursor: pointer;
  user-select: none;
  transition: height 0.2s ease;
  overflow: hidden;
  white-space: nowrap;
}
.active-agents.expanded {
  height: auto;
  min-height: 28px;
  padding: 6px 12px;
  flex-wrap: wrap;
  white-space: normal;
}
.active-agents:hover {
  background: color-mix(in srgb, var(--vte-bg, #1e1e1e) 94%, transparent);
}

.aa-left {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}
.aa-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5);
  animation: aaPulse 1.6s infinite;
  flex-shrink: 0;
}
@keyframes aaPulse {
  0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
  70% { box-shadow: 0 0 0 5px rgba(245, 158, 11, 0); }
  100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
}
.aa-label {
  font-weight: 600;
  color: var(--vte-text, #e2e8f0);
  flex-shrink: 0;
}
.aa-count {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  font-weight: 500;
  flex-shrink: 0;
}

.aa-chips {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.aa-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  line-height: 1.6;
}
.aa-chip.busy { background: rgba(245, 158, 11, 0.1); }
.aa-chip.idle { opacity: 0.45; }
.aa-chip.error { background: rgba(239, 68, 68, 0.1); }
.aa-icon { font-size: 11px; }
.aa-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

.aa-req {
  font-size: 10px;
  color: var(--vte-text-muted, #8896a8);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
</style>
