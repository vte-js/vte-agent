<template>
  <div class="panel">
    <div class="panel-title">任务清单模式</div>
    <div class="mode-opt" :class="{ selected: taskMode === 'off' }" @click="$emit('select', 'off')">
      <div class="mode-opt-dot off"></div>
      <div>
        <div class="mode-opt-name">关闭</div>
        <div class="mode-opt-desc">不使用任务清单跟踪</div>
      </div>
    </div>
    <div class="mode-opt" :class="{ selected: taskMode === 'llm-auto' }" @click="$emit('select', 'llm-auto')">
      <div class="mode-opt-dot llm"></div>
      <div>
        <div class="mode-opt-name">LLM 自判断</div>
        <div class="mode-opt-desc">LLM 自行决定是否创建任务，插件校验是否偷懒跳过</div>
      </div>
    </div>
    <div class="mode-opt" :class="{ selected: taskMode === 'plugin-auto' }" @click="$emit('select', 'plugin-auto')">
      <div class="mode-opt-dot plugin"></div>
      <div>
        <div class="mode-opt-name">插件自判断</div>
        <div class="mode-opt-desc">插件分析任务复杂度，自动指导 LLM 是否使用任务清单</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskMode } from '../protocol'

defineProps<{
  taskMode: TaskMode
}>()

defineEmits<{
  select: [mode: TaskMode]
}>()
</script>
