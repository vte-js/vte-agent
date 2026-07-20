<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useVsCode } from '@webview/composables/useVsCode'
import TreeNode from '@webview/components/TreeNode.vue'

interface TreeItem {
  name: string
  path: string
  type: 'directory' | 'file'
  ext: string
}

const { send, onMessage } = useVsCode()

const props = defineProps<{
  root: string
  /** VTE Stage: per-path touch info (op + ts), keyed by absolute path. */
  touched?: Record<string, { op: string; ts: number }>
  /** VTE Stage: paths actively being modified by LLM. */
  modifying?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'select', path: string): void
}>()

// ── Single source of truth ──
const childrenMap = ref<Map<string, TreeItem[]>>(new Map())
const expanded = ref<Set<string>>(new Set())
const loading = ref<Set<string>>(new Set())
const selectedPath = ref('')

// ── Context menu & file operations ──
type MenuTarget = { kind: 'root' | 'dir' | 'file'; path: string }
const ctxMenu = ref<{ x: number; y: number; target: MenuTarget } | null>(null)
const createInput = ref<{ parentPath: string; kind: 'file' | 'folder' } | null>(null)
const renameInput = ref<{ path: string; current: string } | null>(null)
const deleteConfirm = ref<{ x: number; y: number; path: string; name: string } | null>(null)
const inputName = ref('')
const createRef = ref<HTMLInputElement | null>(null)
const renameRef = ref<HTMLInputElement | null>(null)

function pathDir(p: string): string {
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : p
}
function baseName(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1)
}

function onContextMenu(ev: MouseEvent, target: MenuTarget): void {
  ev.preventDefault()
  createInput.value = null
  renameInput.value = null
  deleteConfirm.value = null
  ctxMenu.value = { x: ev.clientX, y: ev.clientY, target }
}

function closeOverlays(): void {
  ctxMenu.value = null
  createInput.value = null
  renameInput.value = null
  deleteConfirm.value = null
}

function startCreate(target: MenuTarget, kind: 'file' | 'folder'): void {
  const parentPath = target.kind === 'file' ? pathDir(target.path) : target.path
  ctxMenu.value = null
  createInput.value = { parentPath, kind }
  inputName.value = ''
  nextTick(() => createRef.value?.focus())
}

function commitCreate(): void {
  const ci = createInput.value
  if (!ci) return
  const name = inputName.value.trim()
  if (!name) { createInput.value = null; return }
  send({ type: 'fs:create', path: ci.parentPath, kind: ci.kind, name })
  createInput.value = null
}

function startRename(target: MenuTarget): void {
  ctxMenu.value = null
  renameInput.value = { path: target.path, current: baseName(target.path) }
  inputName.value = baseName(target.path)
  nextTick(() => {
    renameRef.value?.focus()
    renameRef.value?.select()
  })
}

function commitRename(): void {
  const ri = renameInput.value
  if (!ri) return
  const newName = inputName.value.trim()
  if (!newName || newName === ri.current) { renameInput.value = null; return }
  send({ type: 'fs:rename', path: ri.path, newName })
  renameInput.value = null
}

function askDelete(target: MenuTarget): void {
  const m = ctxMenu.value!
  ctxMenu.value = null
  deleteConfirm.value = { x: m.x, y: m.y, path: target.path, name: baseName(target.path) }
}

function doDelete(): void {
  const d = deleteConfirm.value
  if (!d) return
  send({ type: 'fs:delete', path: d.path })
  deleteConfirm.value = null
}

// ── Load directory ──
function loadDir(dirPath: string): void {
  if (childrenMap.value.has(dirPath)) {
    const exp = new Set(expanded.value)
    if (exp.has(dirPath)) exp.delete(dirPath)
    else exp.add(dirPath)
    expanded.value = exp
    return
  }
  const ld = new Set(loading.value)
  ld.add(dirPath)
  loading.value = ld
  send({ type: 'fs:list', path: dirPath })
}

function toggleDir(item: TreeItem): void {
  loadDir(item.path)
}

function selectFile(item: TreeItem): void {
  selectedPath.value = item.path
  emit('select', item.path)
}

function onNodeContextmenu(ev: MouseEvent, item: TreeItem, kind: string): void {
  onContextMenu(ev, { kind: kind as any, path: item.path })
}

// ── Reset ──
function resetState(): void {
  childrenMap.value = new Map()
  expanded.value = new Set()
  loading.value = new Set()
  selectedPath.value = ''
  closeOverlays()
}

// ── Message handler ──
let isMounted = true

onMounted(() => {
  isMounted = true
  onMessage((msg: any) => {
    if (!isMounted) return
    if (msg.type !== 'fs:listResult') return
    const ld = new Set(loading.value)
    ld.delete(msg.path)
    loading.value = ld
    if (msg.error) return
    const map = new Map(childrenMap.value)
    map.set(msg.path, msg.items)
    childrenMap.value = map
    const exp = new Set(expanded.value)
    exp.add(msg.path)
    expanded.value = exp
  })
  loadDir(props.root)
  window.addEventListener('click', closeOverlays)
})

onUnmounted(() => {
  isMounted = false
  window.removeEventListener('click', closeOverlays)
})

watch(
  () => props.root,
  (newRoot, oldRoot) => {
    if (newRoot && newRoot !== oldRoot) {
      resetState()
      setTimeout(() => loadDir(newRoot), 0)
    }
  },
)

const rootItems = () => childrenMap.value.get(props.root) || []

function getChildren(dirPath: string) { return childrenMap.value.get(dirPath) || [] }

// ── VTE Stage: auto-reveal touched files in the (lazy) tree ──
function parentDir(p: string): string {
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : p
}
// When a file is touched, expand + load its ancestor dirs so the
// highlight is actually visible (the tree loads directories on demand).
function ensureVisible(filePath: string): void {
  let dir = parentDir(filePath)
  const root = props.root
  const seen = new Set<string>()
  while (dir.startsWith(root) && !seen.has(dir)) {
    seen.add(dir)
    if (!expanded.value.has(dir)) {
      const exp = new Set(expanded.value)
      exp.add(dir)
      expanded.value = exp
    }
    if (!childrenMap.value.has(dir)) loadDir(dir)
    const parent = parentDir(dir)
    if (parent === dir) break
    dir = parent
  }
}
watch(
  () => props.touched,
  (map) => {
    if (!map) return
    for (const p of Object.keys(map)) ensureVisible(p)
  },
  { deep: true },
)
</script>

<template>
  <div class="proj-tree" @contextmenu.prevent="onContextMenu($event, { kind: 'root', path: root })">

    <!-- ═══ EMPTY STATE ═══ -->
    <div v-if="rootItems().length === 0" class="tree-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
        <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/>
      </svg>
      <span>加载中…</span>
    </div>

    <!-- ═══ TREE LIST (recursive via TreeNode) ═══ -->
    <div v-else class="tree-list">
      <!-- Root-level items rendered by TreeNode -->
        <TreeNode
          v-for="item in rootItems()"
          :key="item.path"
          :item="item"
          :depth="0"
          :expanded="expanded"
          :loading="loading"
          :selected-path="selectedPath"
          :get-children="getChildren"
          :rename-input="renameInput"
          :create-input="createInput"
          :touched="touched"
          :modifying="modifying"
          @toggle="toggleDir"
          @select="selectFile"
          @contextmenu="onNodeContextmenu"
        />

      <!-- Create row for ROOT -->
      <div v-if="createInput && createInput.parentPath === root" class="tree-item file editing" @click.stop @contextmenu.prevent>
        <svg v-if="createInput.kind === 'folder'" class="tree-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <svg v-else class="tree-file-icon" style="color: var(--vte-accent, #6366f1)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <input ref="createRef" v-model="inputName" class="tree-edit-input" :placeholder="createInput.kind === 'folder' ? '新文件夹名称' : '新文件名称'" @keyup.enter="commitCreate" @keyup.esc="createInput = null" @blur="commitCreate"/>
      </div>
    </div>

    <!-- Context menu -->
    <div v-if="ctxMenu" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop @contextmenu.prevent>
      <template v-if="ctxMenu.target.kind !== 'file'">
        <div class="ctx-item" @click="startCreate(ctxMenu.target, 'file')">
          <svg class="ctx-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
          新建文件
        </div>
        <div class="ctx-item" @click="startCreate(ctxMenu.target, 'folder')">
          <svg class="ctx-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          新建文件夹
        </div>
      </template>
      <template v-if="ctxMenu.target.kind !== 'root'">
        <div class="ctx-sep"></div>
        <div class="ctx-item" @click="startRename(ctxMenu.target)">
          <svg class="ctx-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
          重命名
        </div>
        <div class="ctx-item danger" @click="askDelete(ctxMenu.target)">
          <svg class="ctx-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          删除
        </div>
      </template>
    </div>

    <!-- Delete confirmation -->
    <div v-if="deleteConfirm" class="float-confirm" :style="{ left: deleteConfirm.x + 'px', top: deleteConfirm.y + 'px' }" @click.stop @contextmenu.prevent>
      <div class="float-confirm-text">删除「{{ deleteConfirm.name }}」？</div>
      <div class="float-confirm-btns">
        <button class="fc-btn ok" @click="doDelete">删除</button>
        <button class="fc-btn cancel" @click="deleteConfirm = null">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.proj-tree { position: relative; }

/* Context menu */
.ctx-menu {
  position: fixed;
  z-index: 200;
  min-width: 160px;
  background: var(--vte-dropdown-bg, #252526);
  border: 1px solid var(--vte-border, #3c3c3c);
  border-radius: 7px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  padding: 5px;
  font-size: 13px;
  color: var(--vte-text, #cccccc);
  user-select: none;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  letter-spacing: 0.2px;
}
.ctx-item:hover { background: var(--vte-list-hover, #2a2d2e); }
.ctx-item:hover .ctx-ico { opacity: 1; }
.ctx-item.danger { color: var(--vte-danger, #e5484d); }
.ctx-item.danger:hover { background: rgba(229, 72, 77, 0.15); }
.ctx-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  opacity: 0.65;
  transition: opacity 0.12s ease;
}
.ctx-ico svg { width: 15px; height: 15px; }
.ctx-sep { height: 1px; background: var(--vte-border, #3c3c3c); margin: 5px 4px; opacity: 0.6; }

/* Inline edit row */
.tree-item.editing {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 0;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 5px;
}
.tree-item.editing .tree-file-icon,
.tree-item.editing .tree-folder-icon { flex-shrink: 0; }
.tree-edit-input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  font-size: 12.5px;
  font-family: inherit;
  background: var(--vte-input-bg, #1e1e1e);
  color: var(--vte-text, #ccc);
  border: 1px solid var(--vte-accent, #6366f1);
  border-radius: 4px;
  outline: none;
  transition: box-shadow 0.12s;
}
.tree-edit-input:focus { box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3); }
.tree-edit-input::placeholder { color: var(--vte-text-muted, #999); opacity: 0.6; }

/* Delete confirm float */
.float-confirm {
  position: fixed;
  z-index: 210;
  min-width: 200px;
  background: var(--vte-dropdown-bg, #252526);
  border: 1px solid var(--vte-border, #3c3c3c);
  border-radius: 6px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  padding: 12px;
  color: var(--vte-text, #cccccc);
  font-size: 13px;
}
.float-confirm-text { margin-bottom: 10px; }
.float-confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }
.fc-btn {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid var(--vte-border, #3c3c3c);
  background: transparent;
  color: var(--vte-text, #cccccc);
  cursor: pointer;
}
.fc-btn.ok { background: var(--vte-danger, #e5484d); border-color: var(--vte-danger, #e5484d); color: #fff; }
.fc-btn.cancel:hover { background: var(--vte-list-hover, #2a2d2e); }

/* ═══ VTE Stage — file touched highlight (driven by stage:file_touch) ═══ */
:deep(.tree-item.touched) { position: relative; }
:deep(.tree-item.touched-read) {
  background: var(--vte-stage-read-bg);
}
:deep(.tree-item.touched-read) .tree-label {
  color: var(--vte-stage-read);
}
:deep(.tree-item.touched-write) {
  background: var(--vte-stage-write-bg);
  box-shadow: inset 2px 0 0 var(--vte-stage-write);
  animation: stage-pulse 1.6s ease-in-out infinite;
}
:deep(.tree-item.touched-edit) {
  background: var(--vte-stage-edit-bg);
  box-shadow: inset 2px 0 0 var(--vte-stage-edit);
  animation: stage-pulse-edit 1.6s ease-in-out infinite;
}
:deep(.tree-item.touched-delete) {
  background: var(--vte-stage-delete-bg);
  box-shadow: inset 2px 0 0 var(--vte-stage-delete);
}
@keyframes stage-pulse {
  0%, 100% { background: var(--vte-stage-write-bg); }
  50% { background: rgba(99, 102, 241, 0.28); }
}
@keyframes stage-pulse-edit {
  0%, 100% { background: var(--vte-stage-edit-bg); }
  50% { background: rgba(245, 158, 11, 0.26); }
}

/* ═══ VTE Stage — "modifying" live state (LLM actively editing) ═══ */
:deep(.tree-item.modifying) {
  background: var(--vte-stage-modifying-bg, rgba(99,102,241,0.12));
  box-shadow: inset 2px 0 0 var(--vte-primary, #6366f1);
}
:deep(.tree-item.modifying) .tree-label {
  color: var(--vte-primary, #6366f1);
  font-style: italic;
}
:deep(.tree-modifying-spinner) {
  color: var(--vte-primary, #6366f1);
  flex-shrink: 0;
  animation: stage-spin 1.2s linear infinite;
}
@keyframes stage-spin {
  to { transform: rotate(360deg); }
}
:deep(.tree-modifying-tag) {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  color: var(--vte-primary, #6366f1);
  background: rgba(99,102,241,0.15);
  letter-spacing: 0.5px;
}
</style>
