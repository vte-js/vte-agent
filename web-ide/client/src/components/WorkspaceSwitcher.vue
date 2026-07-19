<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useVsCode } from '@webview/composables/useVsCode'
import VTooltip from '@webview/components/VTooltip.vue'

interface WorkspaceEntry {
  id: string
  name: string
  path: string
  addedAt: number
  lastUsedAt: number
}

interface BrowseItem {
  name: string
  path: string
}

const { send, onMessage } = useVsCode()

const workspaces = ref<WorkspaceEntry[]>([])
const activePath = ref('')
const expanded = ref(false)
const loading = ref(false)

// Add form
const showAddForm = ref(false)
const newPath = ref('')
const newName = ref('')
const addError = ref('')
const adding = ref(false)

// Path browser
const showBrowser = ref(false)
const browsePath = ref('')
const browseItems = ref<BrowseItem[]>([])
const browseRoots = ref<BrowseItem[]>([])
const browsing = ref(false)

const activeWorkspace = computed(() =>
  workspaces.value.find((w) => w.path === activePath.value) || null,
)

const activeName = computed(() => {
  if (activeWorkspace.value) return activeWorkspace.value.name
  if (activePath.value) return activePath.value.split('/').pop() || activePath.value
  return '—'
})

onMounted(() => {
  onMessage((msg: any) => {
    if (msg.type === 'workspace:list') {
      workspaces.value = msg.workspaces || []
      activePath.value = msg.activePath || ''
      loading.value = false
    } else if (msg.type === 'workspace:switched') {
      activePath.value = msg.workspace
      expanded.value = false
    } else if (msg.type === 'workspace:browseResult') {
      browseItems.value = msg.items || []
      browseRoots.value = msg.roots || []
      browsing.value = false
    }
  })
  refresh()
})

function refresh(): void {
  loading.value = true
  send({ type: 'workspace:list' })
}

function toggle(): void {
  expanded.value = !expanded.value
  if (expanded.value) refresh()
}

function switchTo(wsPath: string): void {
  if (wsPath === activePath.value) {
    expanded.value = false
    return
  }
  send({ type: 'workspace:switch', path: wsPath })
}

function removeWorkspace(id: string, name: string): void {
  if (!confirm(`确定要移除工作区 "${name}" 吗？\n（仅从列表移除，不会删除文件）`)) return
  send({ type: 'workspace:remove', id })
}

function openAddForm(): void {
  showAddForm.value = true
  newPath.value = ''
  newName.value = ''
  addError.value = ''
  showBrowser.value = false
}

function closeAddForm(): void {
  showAddForm.value = false
  showBrowser.value = false
}

async function submitAdd(): Promise<void> {
  if (!newPath.value.trim()) {
    addError.value = '请输入路径'
    return
  }
  adding.value = true
  addError.value = ''
  send({ type: 'workspace:add', path: newPath.value.trim(), name: newName.value.trim() || undefined })
  // Wait for the list to refresh (server sends workspace:list after add)
  setTimeout(() => {
    adding.value = false
    showAddForm.value = false
    newPath.value = ''
    newName.value = ''
  }, 500)
}

function openBrowser(): void {
  showBrowser.value = true
  browsePath.value = ''
  send({ type: 'workspace:browse' })
  browsing.value = true
}

function browseTo(dirPath: string): void {
  browsePath.value = dirPath
  browsing.value = true
  send({ type: 'workspace:browse', path: dirPath })
}

function selectPath(p: string): void {
  newPath.value = p
  showBrowser.value = false
}

function closeBrowser(): void {
  showBrowser.value = false
}

function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<template>
  <div class="ws-switcher">
    <!-- Current workspace header (click to toggle) -->
    <div class="ws-current" @click="toggle">
      <svg class="ws-folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/>
      </svg>
      <div class="ws-current-info">
        <span class="ws-current-name">{{ activeName }}</span>
        <span class="ws-current-path" :title="activePath">{{ activePath || '—' }}</span>
      </div>
      <svg
        class="ws-chevron"
        :class="{ expanded }"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      >
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </div>

    <!-- Workspace list dropdown -->
    <div v-if="expanded" class="ws-dropdown">
      <div v-if="loading" class="ws-loading">
        <span class="tree-spinner" /> 加载中…
      </div>

      <template v-else>
        <!-- Registered workspaces -->
        <div class="ws-list" v-if="workspaces.length > 0">
          <div
            v-for="ws in workspaces"
            :key="ws.id"
            class="ws-item"
            :class="{ active: ws.path === activePath }"
            @click="switchTo(ws.path)"
          >
            <svg class="ws-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/>
            </svg>
            <div class="ws-item-info">
              <span class="ws-item-name">{{ ws.name }}</span>
              <span class="ws-item-path" :title="ws.path">{{ ws.path }}</span>
            </div>
            <span v-if="ws.path === activePath" class="ws-active-badge">当前</span>
            <span v-else class="ws-item-time">{{ formatTime(ws.lastUsedAt) }}</span>
            <VTooltip text="移除" pos="top">
              <button
                v-if="ws.path !== activePath"
                class="ws-remove-btn"
                @click.stop="removeWorkspace(ws.id, ws.name)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </VTooltip>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else class="ws-empty">
          <span>暂无已注册的工作区</span>
        </div>

        <!-- Add workspace button / form -->
        <div class="ws-add-section">
          <button v-if="!showAddForm" class="ws-add-btn" @click="openAddForm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            添加工作区
          </button>

          <div v-else class="ws-add-form">
            <div class="ws-form-row">
              <label class="ws-label">路径</label>
              <div class="ws-path-input-group">
                <input
                  v-model="newPath"
                  class="ws-input"
                  placeholder="/path/to/project"
                  @keyup.enter="submitAdd"
                />
                <VTooltip text="浏览" pos="top">
                  <button class="ws-browse-btn" @click="showBrowser ? closeBrowser() : openBrowser()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/>
                    </svg>
                  </button>
                </VTooltip>
              </div>
            </div>

            <!-- Path browser -->
            <div v-if="showBrowser" class="ws-browser">
              <div class="ws-browser-roots">
                <button
                  v-for="r in browseRoots"
                  :key="r.path"
                  class="ws-root-chip"
                  @click="browseTo(r.path)"
                >
                  {{ r.name }}
                </button>
              </div>
              <div v-if="browsing" class="ws-browser-loading">
                <span class="tree-spinner" /> 加载中…
              </div>
              <div v-else class="ws-browser-list">
                <div v-if="browsePath" class="ws-browser-up" @click="browseTo(browsePath.split('/').slice(0, -1).join('/') || '/')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
                  上级目录
                </div>
                <div
                  v-for="item in browseItems"
                  :key="item.path"
                  class="ws-browser-item"
                  @click="browseTo(item.path)"
                  @dblclick="selectPath(item.path)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/>
                  </svg>
                  <span>{{ item.name }}</span>
                  <button class="ws-pick-btn" @click.stop="selectPath(item.path)">选择</button>
                </div>
                <div v-if="browseItems.length === 0 && !browsing" class="ws-browser-empty">
                  无子目录
                </div>
              </div>
              <div class="ws-browser-hint">双击目录进入，点"选择"确认</div>
            </div>

            <div class="ws-form-row">
              <label class="ws-label">名称</label>
              <input
                v-model="newName"
                class="ws-input"
                placeholder="（可选）显示名称"
                @keyup.enter="submitAdd"
              />
            </div>

            <div v-if="addError" class="ws-form-error">{{ addError }}</div>

            <div class="ws-form-actions">
              <button class="ws-cancel-btn" @click="closeAddForm">取消</button>
              <button class="ws-submit-btn" :disabled="adding" @click="submitAdd">
                {{ adding ? '添加中…' : '添加' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
