<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useVsCode } from '@webview/composables/useVsCode'

const { send, onMessage } = useVsCode()

interface GitChange {
  status: string
  file: string
}

const branch = ref('')
const changes = ref<GitChange[]>([])
const total = ref(0)
const error = ref('')
const expanded = ref(false)
const loading = ref(false)

let cleanup: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

async function refresh(): Promise<void> {
  loading.value = true
  send({ type: 'git:status' })
}

onMounted(() => {
  const off = onMessage((msg: any) => {
    if (msg.type === 'git:statusResult') {
      loading.value = false
      branch.value = msg.branch || ''
      changes.value = msg.changes || []
      total.value = msg.total || 0
      error.value = msg.error || ''
    }
  })
  cleanup = off
  refresh()
  // Poll every 10s for git updates
  pollTimer = setInterval(refresh, 10000)
})

onUnmounted(() => {
  if (cleanup) cleanup()
  if (pollTimer) clearInterval(pollTimer)
})

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    M: 'Modified',
    A: 'Added',
    D: 'Deleted',
    R: 'Renamed',
    '??': 'Untracked',
    UU: 'Conflict',
  }
  return map[s] || s
}

function statusColor(s: string): string {
  const map: Record<string, string> = {
    M: 'var(--vte-warning, #f0ad4e)',
    A: 'var(--vte-success, #4ec9b0)',
    D: 'var(--vte-error, #f48771)',
    '??': 'var(--vte-text-muted, #888)',
    UU: 'var(--vte-error, #f48771)',
  }
  return map[s] || 'var(--vte-text-muted)'
}
</script>

<template>
  <div class="git-status-card">
    <div class="git-header" @click="expanded = !expanded">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6M18 9a9 9 0 0 1-9 9"/>
      </svg>
      <span class="git-branch">{{ branch || '—' }}</span>
      <span v-if="total > 0" class="git-badge">{{ total }}</span>
      <span v-else-if="!error" class="git-clean">clean</span>
      <svg
        class="git-chevron"
        :class="{ expanded }"
        v-if="total > 0"
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      >
        <path d="M9 6l6 6-6 6"/>
      </svg>
      <button v-if="loading" class="git-refresh-btn" @click.stop>
        <span class="tree-spinner"/>
      </button>
    </div>
    <div v-if="expanded && changes.length > 0" class="git-changes">
      <div v-for="(c, i) in changes.slice(0, 50)" :key="i" class="git-change-row">
        <span class="git-change-status" :style="{ color: statusColor(c.status) }">{{ c.status }}</span>
        <span class="git-change-file" :title="c.file">{{ c.file }}</span>
      </div>
      <div v-if="changes.length > 50" class="git-more">+{{ changes.length - 50 }} more</div>
    </div>
    <div v-if="error" class="git-error">{{ error }}</div>
  </div>
</template>
