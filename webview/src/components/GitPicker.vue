<template>
  <Teleport to="body">
    <div v-if="visible" class="git-overlay" @click.self="$emit('close')">
      <div class="git-dialog">
        <div class="git-header">
          <span class="git-title">Git 上下文</span>
          <button class="git-close" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <!-- Tab bar -->
        <div class="git-tabs">
          <button class="git-tab" :class="{ active: tab === 'changes' }" @click="tab = 'changes'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            工作区变更
            <span v-if="changes.length" class="git-badge">{{ changes.length }}</span>
          </button>
          <button class="git-tab" :class="{ active: tab === 'commits' }" @click="tab = 'commits'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="4"/><line x1="1.05" y1="12" x2="7" y2="12"/><line x1="17.01" y1="12" x2="22.96" y2="12"/></svg>
            最近提交
            <span v-if="commits.length" class="git-badge">{{ commits.length }}</span>
          </button>
        </div>
        <!-- Content -->
        <div class="git-body">
          <div v-if="tab === 'changes'" class="git-list">
            <div v-if="changes.length === 0" class="git-empty">没有工作区变更</div>
            <label v-for="f in changes" :key="f" class="git-item">
              <input type="checkbox" :value="f" v-model="selectedChanges" />
              <span class="git-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </span>
              <span class="git-item-name">{{ f }}</span>
            </label>
          </div>
          <div v-else class="git-list">
            <div v-if="commits.length === 0" class="git-empty">没有提交历史</div>
            <label v-for="c in commits" :key="c.hash" class="git-item">
              <input type="checkbox" :value="c.hash" v-model="selectedCommits" />
              <span class="git-item-icon commit-icon">{{ c.hash.slice(0, 7) }}</span>
              <span class="git-item-name">{{ c.message }}</span>
            </label>
          </div>
        </div>
        <!-- Footer -->
        <div class="git-footer">
          <span class="git-count">{{ tab === 'changes' ? selectedChanges.length : selectedCommits.length }} 项已选</span>
          <div class="git-actions">
            <button class="git-btn cancel" @click="$emit('close')">取消</button>
            <button class="git-btn confirm" :disabled="currentSelected.length === 0" @click="confirm">
              添加 ({{ currentSelected.length }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  visible: boolean
  changes: string[]
  commits: Array<{ hash: string; message: string }>
}>()

const emit = defineEmits<{
  close: []
  confirm: [type: 'changes' | 'commits', items: string[]]
}>()

const tab = ref<'changes' | 'commits'>('changes')
const selectedChanges = ref<string[]>([])
const selectedCommits = ref<string[]>([])

const currentSelected = computed(() => {
  return tab.value === 'changes' ? selectedChanges.value : selectedCommits.value
})

function confirm() {
  const type = tab.value
  const items = type === 'changes' ? [...selectedChanges.value] : [...selectedCommits.value]
  if (items.length > 0) {
    emit('confirm', type, items)
  }
}
</script>

<style scoped>
.git-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.git-dialog {
  width: 480px; max-width: 90vw; max-height: 70vh;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.git-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 0;
}
.git-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.git-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.git-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.git-close svg { width: 14px; height: 14px; }

.git-tabs {
  display: flex; gap: 2px; padding: 10px 16px 0;
}
.git-tab {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border: none; border-radius: 6px;
  background: none; color: #64748b; font-size: 12px; cursor: pointer;
  transition: all 0.12s;
}
.git-tab:hover { background: rgba(255,255,255,0.04); color: #94a3b8; }
.git-tab.active { background: rgba(99,102,241,0.12); color: #818cf8; }
.git-badge {
  min-width: 16px; height: 16px; border-radius: 8px;
  background: rgba(99,102,241,0.2); color: #818cf8;
  font-size: 10px; display: flex; align-items: center; justify-content: center;
  padding: 0 4px;
}

.git-body {
  flex: 1; overflow-y: auto; padding: 8px 16px;
}
.git-list { display: flex; flex-direction: column; gap: 2px; }
.git-empty { padding: 24px; text-align: center; color: #64748b; font-size: 12px; }
.git-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-radius: 6px; cursor: pointer;
  transition: background 0.1s;
}
.git-item:hover { background: rgba(255,255,255,0.04); }
.git-item input[type="checkbox"] {
  accent-color: #6366f1; width: 14px; height: 14px; cursor: pointer;
}
.git-item-icon { color: #64748b; flex-shrink: 0; }
.commit-icon {
  background: rgba(99,102,241,0.12); color: #818cf8;
  padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: monospace;
}
.git-item-name {
  font-size: 12px; color: #e2e8f0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}

.git-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.06);
}
.git-count { font-size: 11px; color: #64748b; }
.git-actions { display: flex; gap: 8px; }
.git-btn {
  padding: 6px 14px; border-radius: 6px; border: none;
  font-size: 12px; cursor: pointer; transition: all 0.12s;
}
.git-btn.cancel { background: rgba(255,255,255,0.06); color: #94a3b8; }
.git-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.git-btn.confirm { background: #6366f1; color: #fff; }
.git-btn.confirm:hover { background: #818cf8; }
.git-btn.confirm:disabled { opacity: 0.4; cursor: default; }
</style>
