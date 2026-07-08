<template>
  <div class="panel">
    <div class="panel-title">执行模式</div>
    <div class="mode-opt" :class="{ selected: mode === 'plan' }" @click="$emit('select', 'plan')">
      <div class="mode-opt-dot plan"></div>
      <div>
        <div class="mode-opt-name">规划模式</div>
        <div class="mode-opt-desc">分析代码并生成结构化的实施计划。只读访问文件。</div>
      </div>
    </div>
    <div class="mode-opt" :class="{ selected: mode === 'code' }" @click="$emit('select', 'code')">
      <div class="mode-opt-dot code"></div>
      <div>
        <div class="mode-opt-name">编码模式</div>
        <div class="mode-opt-desc">直接编辑、编写和执行代码。完全工具访问权限。</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AgentMode } from '../composables/useMode'

defineProps<{
  mode: AgentMode
}>()

defineEmits<{
  select: [mode: AgentMode]
}>()
</script>
