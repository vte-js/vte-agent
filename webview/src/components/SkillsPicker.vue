<template>
  <Teleport to="body">
    <div v-if="visible" class="picker-overlay" @click.self="$emit('close')">
      <div class="picker-dialog">
        <div class="picker-header">
          <span class="picker-title">选择 Skills</span>
          <button class="picker-close" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <!-- Search -->
        <div class="picker-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="searchQuery" class="picker-search-input" placeholder="搜索 Skills..." />
        </div>
        <!-- List -->
        <div class="picker-body">
          <div v-if="filteredSkills.length === 0" class="picker-empty">暂无 Skills</div>
          <label v-for="skill in filteredSkills" :key="skill.path" class="picker-item">
            <input type="checkbox" :value="skill.path" v-model="selected" class="picker-checkbox" />
            <div class="picker-item-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div class="picker-item-info">
              <span class="picker-item-name">{{ skill.name }}</span>
              <span v-if="skill.description" class="picker-item-desc">{{ skill.description }}</span>
            </div>
          </label>
        </div>
        <!-- Footer -->
        <div class="picker-footer">
          <button class="picker-btn select-all" @click="toggleAll">全选</button>
          <button class="picker-btn manage" @click="$emit('manage')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            管理
          </button>
          <span class="picker-count">{{ selected.length }} / {{ skills.length }} 已选</span>
          <div class="picker-actions">
            <button class="picker-btn cancel" @click="$emit('close')">取消</button>
            <button class="picker-btn confirm" :disabled="selected.length === 0" @click="confirm">添加 ({{ selected.length }})</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Skill { name: string; path: string; description: string }

const props = defineProps<{
  visible: boolean
  skills: Skill[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [paths: string[]]
  manage: []
}>()

const searchQuery = ref('')
const selected = ref<string[]>([])

const filteredSkills = computed(() => {
  if (!searchQuery.value.trim()) return props.skills
  const q = searchQuery.value.toLowerCase()
  return props.skills.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q)
  )
})

watch(() => props.visible, (val) => {
  if (val) {
    selected.value = []
    searchQuery.value = ''
  }
})

function toggleAll() {
  if (selected.value.length === filteredSkills.value.length) {
    selected.value = []
  } else {
    selected.value = filteredSkills.value.map(s => s.path)
  }
}

function confirm() {
  emit('confirm', [...selected.value])
  emit('close')
}
</script>

<style scoped>
.picker-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.picker-dialog {
  width: 100%; max-width: 480px; max-height: calc(100vh - 32px);
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.picker-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.picker-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.picker-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.picker-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }

.picker-search {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.picker-search svg { color: #64748b; flex-shrink: 0; }
.picker-search-input {
  flex: 1; min-width: 0;
  padding: 6px 0; border: none; background: none;
  color: #e2e8f0; font-size: 12px; outline: none;
}
.picker-search-input::placeholder { color: #475569; }

.picker-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 0; }
.picker-empty { padding: 32px; text-align: center; color: #64748b; font-size: 12px; }

.picker-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; cursor: pointer; transition: background 0.1s;
}
.picker-item:hover { background: rgba(255,255,255,0.03); }
.picker-checkbox { accent-color: #6366f1; width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
.picker-item-icon { color: #818cf8; flex-shrink: 0; }
.picker-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.picker-item-name { font-size: 12px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-item-desc { font-size: 10px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.picker-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.picker-btn {
  padding: 6px 14px; border-radius: 6px; border: none;
  font-size: 12px; cursor: pointer; transition: all 0.12s;
}
.picker-btn.select-all { background: none; color: #818cf8; padding: 6px 8px; }
.picker-btn.select-all:hover { background: rgba(99,102,241,0.1); }
.picker-btn.manage {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; color: #64748b; padding: 6px 8px;
}
.picker-btn.manage:hover { background: rgba(255,255,255,0.06); color: #94a3b8; }
.picker-btn.cancel { background: rgba(255,255,255,0.06); color: #94a3b8; }
.picker-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.picker-btn.confirm { background: #6366f1; color: #fff; }
.picker-btn.confirm:hover { background: #818cf8; }
.picker-btn.confirm:disabled { opacity: 0.4; cursor: default; }
.picker-count { font-size: 11px; color: #64748b; flex: 1; }
.picker-actions { display: flex; gap: 8px; }
</style>
