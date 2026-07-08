<template>
  <div class="mermaid-wrap">
    <div v-if="loading" class="mermaid-loading">加载图表中...</div>
    <div ref="container" class="mermaid-container"></div>
    <div v-if="error" class="mermaid-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
  code: string
  id: string
}>()

const container = ref<HTMLElement>()
const error = ref('')
const loading = ref(true)

let mermaidLib: any = null
let initialized = false
let counter = 0

async function initMermaid() {
  if (mermaidLib) return
  const mod = await import('mermaid')
  mermaidLib = mod.default || mod
  mermaidLib.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#6366f1',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#818cf8',
      lineColor: '#64748b',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
      fontFamily: 'var(--vscode-font-family)',
      fontSize: '12px',
    },
  })
  initialized = true
}

async function render() {
  if (!container.value || !props.code.trim()) return
  loading.value = true
  error.value = ''

  try {
    await initMermaid()
    counter++
    const { svg } = await mermaidLib.render(`mermaid-${props.id}-${counter}`, props.code.trim())
    container.value.innerHTML = svg
  } catch (err: any) {
    error.value = err.message || '图表渲染失败'
    container.value.innerHTML = ''
  } finally {
    loading.value = false
  }
}

onMounted(render)
watch(() => props.code, render)
</script>
