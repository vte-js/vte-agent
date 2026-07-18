<template>
  <div class="panel">
    <div class="panel-title">模型与参数</div>
    <div class="p-row">
      <span class="p-label">模型</span>
      <ModelSelect size="sm" :model-value="model" :options="modelOptions" @update:model-value="(v) => $emit('update:model', v)" />
    </div>
    <div class="p-row">
      <span class="p-label">随机性</span>
      <SliderControl :min="0" :max="2" :step="0.1" :value="temperature" :decimal="true" @update="(v) => $emit('update:temperature', v)" />
    </div>
    <div class="p-row">
      <span class="p-label">Top P</span>
      <SliderControl :min="0" :max="1" :step="0.05" :value="topP" :decimal="true" @update="(v) => $emit('update:topP', v)" />
    </div>
    <div class="p-row">
      <span class="p-label">最大令牌数</span>
      <SliderControl :min="256" :max="16384" :step="256" :value="maxTokens" @update="(v) => $emit('update:maxTokens', v)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ModelSelect from './ModelSelect.vue'
import SliderControl from './SliderControl.vue'
import { MODEL_OPTIONS } from '../protocol'

const modelOptions = MODEL_OPTIONS

defineProps<{
  model: string
  temperature: number
  topP: number
  maxTokens: number
}>()

defineEmits<{
  'update:model': [value: string]
  'update:temperature': [value: number]
  'update:topP': [value: number]
  'update:maxTokens': [value: number]
}>()
</script>
