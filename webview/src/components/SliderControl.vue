<template>
  <div class="c-slider-wrap">
    <div class="c-slider" ref="trackEl" @mousedown="startDrag" @click="onClick">
      <div class="c-slider-track"></div>
      <div class="c-slider-fill" :style="{ width: pct + '%' }"></div>
      <div class="c-slider-thumb" :style="{ left: pct + '%' }"></div>
    </div>
    <span class="c-slider-val">{{ displayVal }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  min: number
  max: number
  step: number
  value: number
  decimal?: boolean
}>()

const emit = defineEmits<{
  update: [value: number]
}>()

const trackEl = ref<HTMLElement>()

const pct = computed(() => ((props.value - props.min) / (props.max - props.min)) * 100)
const displayVal = computed(() => props.decimal ? props.value.toFixed(1) : Math.round(props.value).toString())

function calcVal(clientX: number) {
  if (!trackEl.value) return props.value
  const rect = trackEl.value.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const raw = props.min + pct * (props.max - props.min)
  const rounded = Math.round(raw / props.step) * props.step
  return Math.max(props.min, Math.min(props.max, rounded))
}

function onClick(e: MouseEvent) {
  emit('update', calcVal(e.clientX))
}

function startDrag(e: MouseEvent) {
  const onMove = (ev: MouseEvent) => emit('update', calcVal(ev.clientX))
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
