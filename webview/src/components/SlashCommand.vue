<template>
  <div v-if="visible" class="slash-panel">
    <div class="slash-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>快捷指令</span>
    </div>
    <div class="slash-search">
      <input ref="searchEl" v-model="searchQuery" class="slash-search-input" placeholder="搜索指令..." @keydown="onKeydown" />
    </div>
    <div class="slash-body">
      <div v-if="filteredCommands.length === 0" class="slash-empty">无匹配指令</div>
      <div v-for="(cmd, idx) in filteredCommands" :key="cmd.name"
        class="slash-item" :class="{ active: idx === activeIndex }"
        @click="selectCommand(cmd)" @mouseenter="activeIndex = idx">
        <div class="slash-item-icon" :style="{ background: cmd.color || 'rgba(99,102,241,0.15)', color: cmd.iconColor || '#818cf8' }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="slash-item-info">
          <span class="slash-item-name">/{{ cmd.name }}</span>
          <span class="slash-item-desc">{{ cmd.description }}</span>
        </div>
        <span class="slash-item-tag">{{ cmd.category }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

export interface SlashCommandItem {
  name: string
  description: string
  category: string
  icon: string
  color?: string
  iconColor?: string
  action: string
}

const props = defineProps<{
  visible: boolean
  commands: SlashCommandItem[]
}>()

const emit = defineEmits<{
  close: []
  select: [command: SlashCommandItem]
}>()

const searchEl = ref<HTMLInputElement>()
const searchQuery = ref('')
const activeIndex = ref(0)

const filteredCommands = computed(() => {
  if (!searchQuery.value.trim()) return props.commands
  const q = searchQuery.value.toLowerCase()
  return props.commands.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q)
  )
})

watch(() => props.visible, (val) => {
  if (val) {
    searchQuery.value = ''
    activeIndex.value = 0
    nextTick(() => searchEl.value?.focus())
  }
})

watch(searchQuery, () => { activeIndex.value = 0 })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredCommands.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredCommands.value[activeIndex.value]) {
      selectCommand(filteredCommands.value[activeIndex.value])
    }
  } else if (e.key === 'Escape') {
    emit('close')
  }
}

function selectCommand(cmd: SlashCommandItem) {
  emit('select', cmd)
  emit('close')
}
</script>

<style scoped>
.slash-panel {
  position: absolute; bottom: 100%; left: 0; z-index: 100;
  margin-bottom: 4px; width: 320px; max-width: calc(100vw - 28px); max-height: 380px;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; box-shadow: 0 -8px 32px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; overflow: hidden;
}
.slash-header {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 14px 0; font-size: 11px; font-weight: 500;
  color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;
}
.slash-search { padding: 8px 12px; }
.slash-search-input {
  width: 100%; padding: 8px 10px; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; background: rgba(255,255,255,0.04);
  color: #e2e8f0; font-size: 13px; outline: none;
}
.slash-search-input:focus { border-color: #6366f1; }
.slash-search-input::placeholder { color: #475569; }

.slash-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 8px; }
.slash-empty { padding: 24px; text-align: center; color: #64748b; font-size: 12px; }

.slash-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 10px; border-radius: 8px; cursor: pointer;
  transition: background 0.1s;
}
.slash-item:hover, .slash-item.active { background: rgba(99,102,241,0.1); }
.slash-item-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.slash-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.slash-item-name { font-size: 13px; font-weight: 500; color: #e2e8f0; }
.slash-item-desc { font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.slash-item-tag {
  padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 500;
  background: rgba(255,255,255,0.05); color: #64748b; flex-shrink: 0;
}
</style>
