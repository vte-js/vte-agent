<template>
  <Teleport to="body">
    <div v-if="visible" class="skills-overlay" @click.self="$emit('close')">
      <div class="skills-dialog">
        <div class="skills-header">
          <span class="skills-title">Skills 管理</span>
          <button class="skills-close" @click="$emit('close')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Content: list or editor -->
        <div class="skills-body">
          <!-- List view -->
          <div v-if="!editing" class="skills-list-view">
            <div class="skills-toolbar">
              <button class="skills-add-btn" @click="showCreate = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                新建 Skill
              </button>
            </div>
            <!-- Create form -->
            <div v-if="showCreate" class="skills-create">
              <div class="skills-create-row">
                <input v-model="newName" class="skills-input" placeholder="Skill 名称" />
                <select v-model="newDir" class="skills-select">
                  <option v-for="d in allSkillDirs" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <input v-model="newDesc" class="skills-input" placeholder="描述（可选）" @keydown.enter="createSkill" />
              <div class="skills-create-actions">
                <button class="skills-btn cancel" @click="showCreate = false">取消</button>
                <button class="skills-btn confirm" @click="createSkill" :disabled="!newName.trim()">创建</button>
              </div>
            </div>
            <!-- Search -->
            <div class="skills-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input v-model="searchQuery" class="skills-search-input" placeholder="搜索 Skills..." />
            </div>
            <!-- Skills list -->
            <div class="skills-list">
              <div v-if="filteredSkills.length === 0" class="skills-empty">{{ skills.length === 0 ? '暂无 Skills' : '无匹配结果' }}</div>
              <div v-for="skill in filteredSkills" :key="skill.path" class="skills-item" @click="openSkill(skill)">
                <div class="skills-item-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <div class="skills-item-info">
                  <div class="skills-item-header">
                    <span class="skills-item-name">{{ skill.name }}</span>
                    <span v-if="skill.builtin" class="skills-item-badge">内置</span>
                  </div>
                  <span v-if="skill.description" class="skills-item-desc">{{ skill.description }}</span>
                  <span class="skills-item-path">{{ skill.dir }}</span>
                </div>
                <button v-if="!skill.builtin" class="skills-item-del" @click.stop="deleteSkill(skill)" title="删除">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Editor view - fullscreen -->
          <div v-else class="skills-editor">
            <div class="skills-editor-header">
              <button class="skills-back" @click="editing = null">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                返回列表
              </button>
              <span class="skills-editor-name">{{ editing.name }}</span>
              <span v-if="editing.description" class="skills-editor-desc">{{ editing.description }}</span>
              <span class="skills-editor-path">{{ editing.dir }}</span>
              <button class="skills-btn confirm" @click="saveSkill" :disabled="!content">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
                保存
              </button>
            </div>
            <textarea v-model="content" class="skills-editor-content" placeholder="SKILL.md 内容..."></textarea>
          </div>
        </div>
      </div>
    </div>
    <!-- Delete confirmation dialog -->
    <ConfirmDialog
      :visible="!!deleteTarget"
      title="确认删除"
      :message="`确定要删除 Skill「${deleteTarget?.name}」吗？此操作不可撤销。`"
      type="danger"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useVsCode } from '../composables/useVsCode'
import ConfirmDialog from './ConfirmDialog.vue'

const { send, onMessage } = useVsCode()

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

interface Skill { name: string; path: string; dir: string; description: string; builtin?: boolean }

const skills = ref<Skill[]>([])
const searchQuery = ref('')
const editing = ref<Skill | null>(null)
const content = ref('')
const showCreate = ref(false)
const newName = ref('')
const newDesc = ref('')
const newDir = ref('')
const skillDirs = ref<string[]>([])
const deleteTarget = ref<Skill | null>(null)

// All available skill directories — full paths from server only
const allSkillDirs = computed(() => {
  const dirs = [...skillDirs.value]
  if (newDir.value && !dirs.includes(newDir.value)) {
    dirs.push(newDir.value)
  }
  if ((!newDir.value || !dirs.includes(newDir.value)) && dirs.length > 0) {
    newDir.value = dirs[0]
  }
  return dirs
})

const filteredSkills = computed(() => {
  if (!searchQuery.value.trim()) return skills.value
  const q = searchQuery.value.toLowerCase()
  return skills.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.dir.toLowerCase().includes(q)
  )
})

watch(() => props.visible, (val) => {
  if (val) {
    send({ type: 'skills:list' })
  }
})

onMessage((msg) => {
  if (msg.type === 'skills:list') {
    skills.value = msg.skills
    // Use full paths from the server
    if (msg.dirs && msg.dirs.length > 0) {
      skillDirs.value = msg.dirs
      if (!newDir.value || !msg.dirs.includes(newDir.value)) {
        newDir.value = msg.dirs[0]
      }
    }
  } else if (msg.type === 'skills:content') {
    content.value = msg.content
  } else if (msg.type === 'skills:saved') {
    send({ type: 'skills:list' })
    editing.value = null
    content.value = ''
  } else if (msg.type === 'skills:created') {
    // Open the newly created skill in editor
    const newSkill: Skill = { name: msg.name, path: msg.path, dir: '', description: '' }
    editing.value = newSkill
    content.value = ''
    send({ type: 'skills:get', skillPath: msg.path })
    send({ type: 'skills:list' })
    showCreate.value = false
    newName.value = ''
  } else if (msg.type === 'skills:deleted') {
    send({ type: 'skills:list' })
  }
})

function openSkill(skill: Skill) {
  editing.value = skill
  send({ type: 'skills:get', skillPath: skill.path })
}

function saveSkill() {
  if (!editing.value) return
  send({ type: 'skills:save', skillPath: editing.value.path, content: content.value })
}

function createSkill() {
  if (!newName.value.trim()) return
  send({ type: 'skills:create', name: newName.value.trim(), dir: newDir.value, description: newDesc.value.trim() })
  newName.value = ''
  newDesc.value = ''
}

function deleteSkill(skill: Skill) {
  deleteTarget.value = skill
}

function confirmDelete() {
  if (deleteTarget.value) {
    send({ type: 'skills:delete', skillPath: deleteTarget.value.path })
    deleteTarget.value = null
  }
}

function cancelDelete() {
  deleteTarget.value = null
}
</script>

<style scoped>
.skills-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.skills-dialog {
  width: 100%; max-width: 720px; max-height: calc(100vh - 32px);
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
}
.skills-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.skills-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.skills-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.skills-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }

.skills-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }

/* List view */
.skills-toolbar { padding: 12px 16px 8px; flex-shrink: 0; }
.skills-add-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border: 1px dashed rgba(99,102,241,0.3); border-radius: 6px;
  background: none; color: #818cf8; font-size: 12px; cursor: pointer;
  transition: all 0.12s;
}
.skills-add-btn:hover { border-color: #6366f1; background: rgba(99,102,241,0.05); }

.skills-create {
  padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;
}
.skills-create-row { display: flex; gap: 8px; }
.skills-create-row .skills-input { flex: 1; min-width: 0; }
.skills-create-row .skills-select { flex: 1; min-width: 0; }
.skills-input {
  flex: 1; min-width: 120px;
  padding: 7px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
  background: rgba(255,255,255,0.04); color: #e2e8f0; font-size: 12px; outline: none;
}
.skills-select {
  flex: 1; min-width: 150px;
  padding: 7px 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
  background: rgba(255,255,255,0.04); color: #e2e8f0; font-size: 12px; outline: none;
}
.skills-input:focus, .skills-select:focus { border-color: #6366f1; }
.skills-create-actions { display: flex; gap: 8px; justify-content: flex-end; width: 100%; }

.skills-empty { padding: 32px; text-align: center; color: #64748b; font-size: 12px; }

/* Search */
.skills-search {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.skills-search svg { color: #64748b; flex-shrink: 0; }
.skills-search-input {
  flex: 1; min-width: 0;
  padding: 6px 0; border: none; background: none;
  color: #e2e8f0; font-size: 12px; outline: none;
}
.skills-search-input::placeholder { color: #475569; }

.skills-list { flex: 1; min-height: 0; overflow-y: auto; }

.skills-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; cursor: pointer; transition: background 0.1s;
}
.skills-item:hover { background: rgba(255,255,255,0.03); }
.skills-item-icon { color: #818cf8; flex-shrink: 0; }
.skills-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.skills-item-name { font-size: 13px; font-weight: 500; color: #e2e8f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skills-item-header { display: flex; align-items: center; gap: 6px; }
.skills-item-badge {
  padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 500;
  background: rgba(99,102,241,0.15); color: #818cf8; flex-shrink: 0;
}
.skills-item-desc { font-size: 11px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }
.skills-item-path { font-size: 10px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skills-item-del {
  width: 24px; height: 24px; border: none; background: none; border-radius: 4px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; opacity: 0; transition: all 0.12s;
}
.skills-item:hover .skills-item-del { opacity: 1; }
.skills-item-del:hover { background: rgba(239,68,68,0.1); color: #ef4444; }

/* Editor view - fullscreen */
.skills-editor {
  position: fixed; inset: 0; z-index: 10000;
  background: #1e1e2e; display: flex; flex-direction: column;
}
.skills-editor-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.08);
  background: #1a1a2e; flex-shrink: 0; flex-wrap: wrap;
}
.skills-back {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border: none; background: none; border-radius: 6px;
  color: #94a3b8; font-size: 12px; cursor: pointer; flex-shrink: 0;
}
.skills-back:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
.skills-editor-name { font-size: 13px; font-weight: 600; color: #e2e8f0; flex-shrink: 0; }
.skills-editor-desc { font-size: 11px; color: #94a3b8; flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skills-editor-path { font-size: 11px; color: #64748b; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skills-editor-content {
  flex: 1; min-height: 0; width: 100%; padding: 16px 20px; border: none;
  background: transparent; color: #e2e8f0;
  font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
  font-size: 13px; line-height: 1.7; resize: none; outline: none;
  tab-size: 2;
}

/* Shared buttons */
.skills-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border-radius: 6px; border: none;
  font-size: 12px; cursor: pointer; transition: all 0.12s; flex-shrink: 0;
}
.skills-btn.cancel { background: rgba(255,255,255,0.06); color: #94a3b8; }
.skills-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.skills-btn.confirm { background: #6366f1; color: #fff; }
.skills-btn.confirm:hover { background: #818cf8; }
.skills-btn.confirm:disabled { opacity: 0.4; cursor: default; }
.skills-btn.danger { background: #ef4444; color: #fff; }
.skills-btn.danger:hover { background: #f87171; }
</style>
