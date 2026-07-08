<template>
  <div class="panel" v-if="expanded">
    <div class="panel-title">Token 消耗</div>
    <div class="td-grid">
      <div class="td-cell">
        <div class="td-val">{{ stats.requestCount }}</div>
        <div class="td-label">请求</div>
      </div>
      <div class="td-cell">
        <div class="td-val">{{ fmtK(stats.totalPrompt) }}</div>
        <div class="td-label">输入</div>
      </div>
      <div class="td-cell">
        <div class="td-val">{{ fmtK(stats.totalCompletion) }}</div>
        <div class="td-label">输出</div>
      </div>
      <div class="td-cell highlight">
        <div class="td-val">${{ stats.totalCost.toFixed(4) }}</div>
        <div class="td-label">费用</div>
      </div>
    </div>
    <div v-if="Object.keys(stats.perModel).length > 0" class="td-models">
      <div v-for="(data, model) in stats.perModel" :key="model" class="td-model-row">
        <span class="td-model-name">{{ model }}</span>
        <span class="td-model-info">{{ data.count }}次 · {{ fmtK(data.tokens) }} · ${{ data.cost.toFixed(4) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TokenStatsData } from './TokenStats'

const props = defineProps<{
  stats: TokenStatsData
  expanded: boolean
}>()

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}
</script>
