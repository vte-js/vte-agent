<template>
  <label class="c-toggle">
    <input
      class="c-toggle-box"
      type="checkbox"
      :checked="modelValue"
      @change="onChange"
    />
    <span v-if="label || $slots.default" class="c-toggle-label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).checked)
}
</script>
