<template>
  <VTooltip :text="tooltipText">
    <div class="token-ring-wrap" @click="$emit('toggle')">
      <svg class="token-ring" viewBox="0 0 36 36">
        <circle class="ring-bg" cx="18" cy="18" r="15" />
        <circle class="ring-fill" cx="18" cy="18" r="15"
          :stroke-dasharray="`${ringDash} ${ringGap}`"
          stroke-dashoffset="25"
        />
      </svg>
    </div>
  </VTooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import VTooltip from './VTooltip.vue'

const props = defineProps<{
  cost: number
}>()

defineEmits<{
  toggle: []
}>()

const circumference = 2 * Math.PI * 15

const ringDash = computed(() => {
  const pct = Math.min(props.cost / 0.1, 1)
  return circumference * pct
})

const ringGap = computed(() => circumference - ringDash.value)

const tooltipText = computed(() => {
  if (props.cost === 0) return '暂无消耗 · 点击查看详情'
  return `已消耗 $${props.cost.toFixed(4)} · 点击查看详情`
})
</script>
