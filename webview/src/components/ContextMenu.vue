<template>
  <div v-if="visible" class="ctx-menu">
    <button v-for="item in items" :key="item.key" class="ctx-menu-item" @click="$emit('select', item.key)">
      <div class="ctx-menu-icon" :class="item.key">
        <component :is="item.icon" />
      </div>
      <div class="ctx-item-text">
        <span class="ctx-item-label">{{ item.label }}</span>
        <span class="ctx-item-desc">{{ item.description }}</span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { ContextMenuItem } from './context-menu-items'

defineProps<{
  visible: boolean
  items: ContextMenuItem[]
}>()

defineEmits<{
  select: [key: string]
}>()
</script>

<style scoped>
.ctx-menu {
  position: absolute; bottom: 100%; left: 0; z-index: 100;
  margin-bottom: 4px; min-width: 200px;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 4px;
  box-shadow: 0 -8px 24px rgba(0,0,0,0.4);
}
.ctx-menu-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 8px 10px; border: none; border-radius: 8px;
  background: none; color: var(--vte-text); font-size: 12px;
  cursor: pointer; transition: background 0.1s; text-align: left;
}
.ctx-menu-item:hover { background: rgba(99,102,241,0.1); }
.ctx-menu-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.ctx-menu-icon.file { background: rgba(59,130,246,0.12); color: #3b82f6; }
.ctx-menu-icon.folder { background: rgba(245,158,11,0.12); color: #f59e0b; }
.ctx-menu-icon.doc { background: rgba(168,85,247,0.12); color: #a855f7; }
.ctx-menu-icon.skills { background: rgba(34,197,94,0.12); color: #22c55e; }
.ctx-menu-icon.terminal { background: rgba(99,102,241,0.12); color: #818cf8; }
.ctx-menu-icon.git { background: rgba(239,68,68,0.12); color: #ef4444; }
.ctx-item-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ctx-item-label { font-size: 12px; font-weight: 500; color: var(--vte-text); }
.ctx-item-desc { font-size: 10px; color: var(--vte-text-muted); opacity: 0.7; }
</style>
