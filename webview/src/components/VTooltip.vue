<template>
  <div class="vtooltip-wrap" ref="wrapEl" @mouseenter="showTooltip" @mouseleave="hideTooltip">
    <slot />
  </div>
  <Teleport to="body">
    <Transition name="tip-fade">
      <div v-if="visible && text" class="vtooltip" :style="tooltipStyle">{{ text }}</div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

const props = defineProps<{
  text: string
  pos?: 'top' | 'bottom'
}>()

const wrapEl = ref<HTMLElement>()
const visible = ref(false)
const tooltipStyle = ref<Record<string, string>>({})

let hideTimer: ReturnType<typeof setTimeout> | null = null

function showTooltip() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  if (!wrapEl.value || !props.text) return
  const rect = wrapEl.value.getBoundingClientRect()
  const gap = 8
  if (props.pos === 'top') {
    tooltipStyle.value = {
      position: 'fixed',
      left: rect.left + rect.width / 2 + 'px',
      top: rect.bottom + gap + 'px',
      transform: 'translateX(-50%)',
    }
  } else {
    tooltipStyle.value = {
      position: 'fixed',
      left: rect.left + rect.width / 2 + 'px',
      top: rect.top - gap + 'px',
      transform: 'translateX(-50%) translateY(-100%)',
    }
  }
  visible.value = true
}

function hideTooltip() {
  hideTimer = setTimeout(() => { visible.value = false }, 100)
}

onUnmounted(() => { if (hideTimer) clearTimeout(hideTimer) })
</script>
