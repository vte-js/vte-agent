<template>
  <div class="lsp-status-panel" v-if="languages.length > 0 || showAlways">
    <div class="lsp-header" @click="expanded = !expanded">
      <div class="lsp-header-left">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="lsp-title">LSP 状态</span>
        <span class="lsp-count">{{ languages.length }} 语言</span>
      </div>
      <div class="lsp-header-right">
        <span class="lsp-cache" v-if="cacheSize > 0">缓存: {{ cacheSize }}</span>
        <svg :class="['lsp-chevron', { expanded }]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>

    <div class="lsp-content" v-show="expanded">
      <div class="lsp-lang-list">
        <div v-for="lang in languages" :key="lang.id" class="lsp-lang-item">
          <span :class="['lsp-status-dot', lang.status]"></span>
          <span class="lsp-lang-name">{{ lang.id }}</span>
          <span class="lsp-lang-strategy">{{ lang.strategy }}</span>
        </div>
      </div>

      <div class="lsp-actions">
        <button class="lsp-action-btn" @click="$emit('refresh')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          刷新
        </button>
        <button class="lsp-action-btn" @click="$emit('clearCache')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          清除缓存
        </button>
        <button class="lsp-action-btn" @click="$emit('test')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          测试连接
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface LspLanguage {
  id: string
  status: 'online' | 'offline' | 'circuit-breaker-open'
  strategy: string
}

defineProps<{
  languages: LspLanguage[]
  cacheSize?: number
  showAlways?: boolean
}>()

defineEmits<{
  refresh: []
  clearCache: []
  test: []
}>()

const expanded = ref(false)
</script>

<style scoped>
.lsp-status-panel {
  border-top: 1px solid var(--vte-border);
  background: var(--vte-bg-elevated);
}

.lsp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.lsp-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.lsp-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--vte-text);
}

.lsp-title {
  font-size: 12px;
  font-weight: 600;
}

.lsp-count {
  font-size: 10px;
  color: var(--vte-text-muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
}

.lsp-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lsp-cache {
  font-size: 10px;
  color: var(--vte-text-muted);
}

.lsp-chevron {
  color: var(--vte-text-muted);
  transition: transform 0.2s;
}

.lsp-chevron.expanded {
  transform: rotate(180deg);
}

.lsp-content {
  padding: 0 14px 10px;
}

.lsp-lang-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.lsp-lang-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  font-size: 11px;
}

.lsp-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.lsp-status-dot.online {
  background: #22c55e;
}

.lsp-status-dot.offline {
  background: #ef4444;
}

.lsp-status-dot.circuit-breaker-open {
  background: #f59e0b;
}

.lsp-lang-name {
  color: var(--vte-text);
}

.lsp-lang-strategy {
  color: var(--vte-text-muted);
  font-size: 10px;
}

.lsp-actions {
  display: flex;
  gap: 8px;
}

.lsp-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--vte-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vte-text-muted);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.lsp-action-btn:hover {
  border-color: var(--vte-primary);
  color: var(--vte-text);
  background: rgba(99, 102, 241, 0.06);
}
</style>
