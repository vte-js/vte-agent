<template>
  <div class="c-select" :class="{ open }" @click.stop="open = !open">
    <div class="c-select-trigger">
      <span>{{ modelValue }}</span>
      <span class="c-select-arrow"></span>
    </div>
    <div v-if="open" class="c-select-list">
      <div
        v-for="opt in options"
        :key="opt.value"
        class="c-select-item"
        :class="{ selected: opt.value === modelValue }"
        @click.stop="select(opt.value)"
      >{{ opt.label }}</div>
      <div class="c-select-divider"></div>
      <div class="c-select-custom">
        <input
          class="c-input"
          :value="customInput"
          @input="customInput = ($event.target as HTMLInputElement).value"
          @keydown.enter.stop="applyCustom"
          @click.stop
          placeholder="自定义模型名称..."
        />
        <button class="c-select-apply" @click.stop="applyCustom">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const customInput = ref('')

function select(val: string) {
  emit('update:modelValue', val)
  open.value = false
}

function applyCustom() {
  const val = customInput.value.trim()
  if (val) {
    emit('update:modelValue', val)
    customInput.value = ''
    open.value = false
  }
}

function close() { open.value = false }
onMounted(() => document.addEventListener('click', close))
onUnmounted(() => document.removeEventListener('click', close))
</script>
