<template>
  <Teleport to="body">
    <Transition name="lsp-panel">
      <div v-if="visible" class="lsp-fullscreen">
        <div class="lsp-header">
          <div class="lsp-header-left">
            <button class="lsp-back" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <span class="lsp-title">LSP 控制面板</span>
          </div>
          <div class="lsp-header-right">
            <button class="lsp-header-btn" @click="$emit('openConfigEditor')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              编辑配置
            </button>
          </div>
        </div>

        <div class="lsp-content">
          <!-- Languages Section -->
          <div class="lsp-section">
            <div class="lsp-section-header">
              <span class="lsp-section-title">已配置语言</span>
              <span class="lsp-section-count">{{ languages.length }} 个</span>
            </div>
            <div class="lsp-lang-table">
              <div class="lsp-table-header">
                <span class="lsp-col-status">状态</span>
                <span class="lsp-col-name">Language ID</span>
                <span class="lsp-col-strategy">Strategy</span>
                <span class="lsp-col-tools">Tools</span>
                <span class="lsp-col-rate">成功率</span>
                <span class="lsp-col-action"></span>
              </div>
              <div
                v-for="lang in languages"
                :key="lang.id"
                class="lsp-table-row"
                :class="{ selected: selectedLang === lang.id }"
                @click="selectLang(lang.id)"
              >
                <span :class="['lsp-col-status', lang.status]">
                  <span class="status-dot"></span>
                </span>
                <span class="lsp-col-name">{{ lang.id }}</span>
                <span class="lsp-col-strategy">
                  <span class="strategy-badge">{{ lang.strategy }}</span>
                </span>
                <span class="lsp-col-tools">{{ lang.tools.join(', ') }}</span>
                <span class="lsp-col-rate">{{ lang.successRate }}%</span>
                <button class="lsp-delete-btn" @click.stop="confirmDelete(lang.id)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Selected Language Detail -->
          <div class="lsp-section" v-if="selectedLangData">
            <div class="lsp-section-header">
              <span class="lsp-section-title">{{ selectedLang }} 详细信息</span>
            </div>
            <div class="lsp-detail-grid">
              <div class="lsp-detail-item">
                <span class="detail-label">状态</span>
                <span :class="['detail-value', selectedLangData.status]">{{ selectedLangData.status }}</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">策略</span>
                <span class="detail-value">{{ selectedLangData.strategy }}</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">缓存命中</span>
                <span class="detail-value">{{ selectedLangData.cacheHits }} 次</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">成功次数</span>
                <span class="detail-value">{{ selectedLangData.successCount }}</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">失败次数</span>
                <span class="detail-value">{{ selectedLangData.failureCount }}</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">最近错误</span>
                <span class="detail-value error">{{ selectedLangData.lastError || '无' }}</span>
              </div>
            </div>
          </div>

          <!-- Cache Stats -->
          <div class="lsp-section">
            <div class="lsp-section-header">
              <span class="lsp-section-title">缓存统计</span>
            </div>
            <div class="lsp-detail-grid">
              <div class="lsp-detail-item">
                <span class="detail-label">缓存条目</span>
                <span class="detail-value">{{ cacheStats.size }}</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">命中率</span>
                <span class="detail-value">{{ cacheStats.hitRate }}%</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">TTL</span>
                <span class="detail-value">{{ cacheStats.ttl }}s</span>
              </div>
              <div class="lsp-detail-item">
                <span class="detail-label">最大容量</span>
                <span class="detail-value">{{ cacheStats.maxSize }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="lsp-actions">
            <button class="lsp-action-btn primary" @click="$emit('test')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              测试 LSP 连接
            </button>
            <button class="lsp-action-btn" @click="$emit('refresh')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              刷新状态
            </button>
            <button class="lsp-action-btn danger" @click="$emit('clearCache')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              清除缓存
            </button>
            <button class="lsp-action-btn" @click="$emit('setup')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Setup Wizard
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <ConfirmDialog
    :visible="showDeleteConfirm"
    title="删除语言配置"
    :message="deleteConfirmMessage"
    type="danger"
    confirm-text="删除"
    @confirm="handleDeleteConfirm"
    @cancel="handleDeleteCancel"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'

interface LspLanguage {
  id: string
  status: 'online' | 'offline' | 'circuit-breaker-open'
  strategy: string
  tools: string[]
  successRate: number
  cacheHits: number
  successCount: number
  failureCount: number
  lastError?: string
}

interface CacheStats {
  size: number
  hitRate: number
  ttl: number
  maxSize: number
}

const props = defineProps<{
  visible: boolean
  languages: LspLanguage[]
  cacheStats: CacheStats
}>()

const emit = defineEmits<{
  close: []
  test: []
  refresh: []
  clearCache: []
  setup: []
  openConfigEditor: []
  delete: [languageId: string]
}>()

const selectedLang = ref<string | null>(null)
const showDeleteConfirm = ref(false)
const deleteTargetId = ref('')

const deleteConfirmMessage = computed(() => {
  return `确定要删除语言配置 "${deleteTargetId.value}" 吗？此操作不可恢复。`
})

const selectedLangData = computed(() => {
  if (!selectedLang.value) return null
  return props.languages.find(l => l.id === selectedLang.value) ?? null
})

function selectLang(id: string) {
  selectedLang.value = selectedLang.value === id ? null : id
}

function confirmDelete(id: string) {
  deleteTargetId.value = id
  showDeleteConfirm.value = true
}

function handleDeleteConfirm() {
  emit('delete', deleteTargetId.value)
  showDeleteConfirm.value = false
  deleteTargetId.value = ''
}

function handleDeleteCancel() {
  showDeleteConfirm.value = false
  deleteTargetId.value = ''
}
</script>

<style scoped>
.lsp-fullscreen {
  position: fixed; inset: 0; z-index: 9999;
  background: var(--vte-bg, #1e1e1e);
  display: flex; flex-direction: column;
  overflow: hidden;
}

.lsp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--vte-border);
  flex-shrink: 0;
}

.lsp-header-left { display: flex; align-items: center; gap: 12px; }

.lsp-back {
  width: 32px; height: 32px; border: none; background: none; border-radius: 8px;
  color: var(--vte-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.lsp-back:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.08)); color: var(--vte-text); }

.lsp-title { font-size: 16px; font-weight: 600; color: var(--vte-text); margin: 0; }

.lsp-header-right { display: flex; gap: 8px; justify-content: flex-end; }

.lsp-header-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border: 1px solid var(--vte-border); border-radius: 6px;
  background: transparent; color: var(--vte-text); font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.lsp-header-btn:hover { border-color: var(--vte-primary); background: rgba(99,102,241,0.06); }

.lsp-content {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 20px;
}

.lsp-section {
  border: 1px solid var(--vte-border); border-radius: 12px;
  background: var(--vte-bg-elevated);
}

.lsp-section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--vte-border);
}

.lsp-section-title { font-size: 14px; font-weight: 600; color: var(--vte-text); }
.lsp-section-count { font-size: 12px; color: var(--vte-text-muted); }

/* Table */
.lsp-lang-table { padding: 8px; }

.lsp-table-header {
  display: grid; grid-template-columns: 50px 1fr 100px 1fr 80px 36px;
  padding: 8px 12px; font-size: 11px; font-weight: 600;
  color: var(--vte-text-muted); border-bottom: 1px solid var(--vte-border);
}

.lsp-table-row {
  display: grid; grid-template-columns: 50px 1fr 100px 1fr 80px 36px;
  padding: 10px 12px; border-radius: 6px; cursor: pointer;
  transition: background 0.15s; align-items: center;
}
.lsp-table-row:hover { background: rgba(255,255,255,0.03); }
.lsp-table-row.selected { background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.3); }

.lsp-col-status { display: flex; align-items: center; justify-content: center; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.lsp-col-status.online .status-dot { background: #22c55e; }
.lsp-col-status.offline .status-dot { background: #ef4444; }
.lsp-col-status.circuit-breaker-open .status-dot { background: #f59e0b; }

.lsp-col-name { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.lsp-col-tools { font-size: 11px; color: var(--vte-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lsp-col-rate { font-size: 12px; font-weight: 600; color: var(--vte-text); text-align: right; }

.lsp-delete-btn {
  width: 28px; height: 28px; border: none; background: transparent;
  border-radius: 6px; color: var(--vte-text-muted); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: all 0.15s;
}
.lsp-table-row:hover .lsp-delete-btn { opacity: 1; }
.lsp-delete-btn:hover { background: rgba(239,68,68,0.12); color: #ef4444; }

.strategy-badge {
  padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
  background: rgba(99,102,241,0.1); color: #818cf8;
}

/* Detail Grid */
.lsp-detail-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px; padding: 16px;
}

.lsp-detail-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px; border-radius: 8px;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04);
}

.detail-label { font-size: 11px; color: var(--vte-text-muted); }
.detail-value { font-size: 13px; font-weight: 500; color: var(--vte-text); }
.detail-value.online { color: #22c55e; }
.detail-value.offline { color: #ef4444; }
.detail-value.circuit-breaker-open { color: #f59e0b; }
.detail-value.error { font-size: 11px; color: var(--vte-text-muted); word-break: break-all; }

/* Actions */
.lsp-actions {
  display: flex; gap: 10px; flex-wrap: wrap;
}

.lsp-action-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px; border: 1px solid var(--vte-border); border-radius: 8px;
  background: transparent; color: var(--vte-text); font-size: 13px;
  font-weight: 500; cursor: pointer; transition: all 0.15s;
}
.lsp-action-btn:hover { border-color: var(--vte-primary); background: rgba(99,102,241,0.06); }
.lsp-action-btn.primary { background: var(--vte-primary); color: #fff; border-color: var(--vte-primary); }
.lsp-action-btn.primary:hover { opacity: 0.9; }
.lsp-action-btn.danger { border-color: rgba(239,68,68,0.3); color: #ef4444; }
.lsp-action-btn.danger:hover { background: rgba(239,68,68,0.06); }

/* Transition */
.lsp-panel-enter-active { transition: opacity 0.2s ease; }
.lsp-panel-leave-active { transition: opacity 0.15s ease; }
.lsp-panel-enter-from, .lsp-panel-leave-to { opacity: 0; }

/* Responsive - small screens */
@media (max-width: 480px) {
  .lsp-header {
    padding: 12px 16px;
  }
  .lsp-content {
    padding: 12px;
  }
  .lsp-table-header,
  .lsp-table-row {
    grid-template-columns: 40px 1fr 80px 36px;
  }
  .lsp-col-tools, .lsp-col-rate {
    display: none;
  }
  .lsp-actions {
    flex-direction: column;
  }
  .lsp-action-btn {
    width: 100%;
    justify-content: center;
  }
}

/* Responsive - medium screens */
@media (min-width: 481px) and (max-width: 640px) {
  .lsp-header {
    padding: 14px 18px;
  }
  .lsp-content {
    padding: 16px;
  }
}
</style>
