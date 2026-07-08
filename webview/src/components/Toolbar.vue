<template>
  <div class="inp-bar">
    <button class="bar-btn" :class="{ active: modePanelOpen }" @click="$emit('toggleMode')" title="Mode">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
    </button>
    <div style="flex:1"></div>
    <button class="bar-btn" :class="{ active: paramsPanelOpen }" @click="$emit('toggleParams')" title="Parameters">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modePanelOpen: boolean
  paramsPanelOpen: boolean
}>()

defineEmits<{
  toggleMode: []
  toggleParams: []
}>()
</script>
