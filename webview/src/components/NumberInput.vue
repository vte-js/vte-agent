<template>
  <input
    class="c-num-input"
    type="number"
    :value="display"
    :min="min"
    :max="max"
    :step="step"
    :placeholder="placeholder"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

// Keep a local editable string so the field can be cleared/re-typed freely
// while focused; commit the clamped number on blur / change.
const focused = ref(false)
const local = ref('')

const display = computed(() => (focused.value ? local.value : String(props.modelValue)))

function clamp(n: number): number {
  let v = n
  if (props.min != null) v = Math.max(props.min, v)
  if (props.max != null) v = Math.min(props.max, v)
  return v
}

function onFocus() {
  focused.value = true
  local.value = String(props.modelValue)
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  local.value = raw
  const n = parseFloat(raw)
  if (!Number.isNaN(n)) emit('update:modelValue', clamp(n))
}

function onBlur() {
  focused.value = false
  const n = parseFloat(local.value)
  emit('update:modelValue', Number.isNaN(n) ? props.modelValue : clamp(n))
}
</script>
