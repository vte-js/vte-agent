<script setup lang="ts">
import { computed } from 'vue'

interface TreeItem {
  name: string
  path: string
  type: 'directory' | 'file'
  ext: string
}

const props = defineProps<{
  item: TreeItem
  depth: number
  expanded: Set<string>
  loading: Set<string>
  selectedPath: string
  getChildren: (dirPath: string) => TreeItem[]
  renameInput: { path: string; current: string } | null
  createInput: { parentPath: string; kind: 'file' | 'folder' } | null
  /** VTE Stage: per-path touch info (op + timestamp). Keyed by absolute path. */
  touched?: Record<string, { op: string; ts: number }>
  /** VTE Stage: paths actively being modified by LLM (tool_call sent, awaiting tool_result). */
  modifying?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle', item: TreeItem): void
  (e: 'select', item: TreeItem): void
  (e: 'contextmenu', ev: MouseEvent, item: TreeItem, kind: string): void
}>()

// Stage highlight: match this node's path against the touched map.
const touchClass = computed(() => {
  const t = props.touched?.[props.item.path]
  if (!t) return {}
  return { touched: true, [`touched-${t.op}`]: true }
})

// Stage modifying: LLM is actively writing/editing this file right now.
const isModifying = computed(() => props.modifying?.has(props.item.path) ?? false)

const FILE_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#f7df1e',
  vue: '#42b883', css: '#264de4', scss: '#cc6699', less: '#1d365d',
  html: '#e34c26', json: '#cbcb41', md: '#083fa1',
  py: '#3572A5', rs: '#dea584', go: '#00ADD8', java: '#ed8b00',
  sh: '#89e051', yaml: '#cb171e', yml: '#cb171e', toml: '#9c4221',
  xml: '#e34c26', svg: '#ffb13b', png: '#a074c4', jpg: '#a074c4',
  gif: '#a074c4', ico: '#a074c4', env: '#ecd53f', gitignore: '#f14e32',
  dockerignore: '#384d54', editorconfig: '#fff', prettierrignore: '#cbcb41',
  lock: '#555', log: '#999', txt: '#999',
}
function fileColor(ext: string): string {
  return FILE_COLORS[ext.toLowerCase()] || FILE_COLORS[ext] || 'var(--vte-text-secondary, #888)'
}

const isDir = computed(() => props.item.type === 'directory')
const isExpanded = computed(() => props.expanded.has(props.item.path))
const isLoading = computed(() => props.loading.has(props.item.path))
const children = computed(() => props.getChildren(props.item.path))
const isNested = computed(() => props.depth > 0)
const isRenaming = computed(() => props.renameInput?.path === props.item.path)
const hasCreateInput = computed(() => props.createInput?.parentPath === props.item.path)
</script>

<template>
  <!-- ═══ DIRECTORY ═══ -->
  <template v-if="isDir">
    <div
      class="tree-item dir"
      :class="[{ nested: isNested, selected: selectedPath === item.path }, touchClass]"
      @click.stop="emit('toggle', item)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item, 'dir')"
    >
      <svg class="tree-chevron" :class="{ expanded: isExpanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 6l6 6-6 6"/></svg>
      <svg class="tree-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 3z"/></svg>
      <span class="tree-label">{{ item.name }}</span>
    </div>

    <!-- Recursive children container -->
    <div v-if="isExpanded" class="tree-children">
      <!-- Loading state -->
      <template v-if="isLoading">
        <div class="tree-item nested loading-sub"><span class="tree-spinner"/><span class="tree-label muted">加载中…</span></div>
      </template>
      <template v-else>
        <!-- Recursively render each child -->
        <TreeNode
          v-for="child in children"
          :key="child.path"
          :item="child"
          :depth="depth + 1"
          :expanded="expanded"
          :loading="loading"
          :selected-path="selectedPath"
          :get-children="getChildren"
          :rename-input="renameInput"
          :create-input="createInput"
          :touched="touched"
          :modifying="modifying"
          @toggle="(it) => emit('toggle', it)"
          @select="(it) => emit('select', it)"
          @contextmenu="(ev, it, k) => emit('contextmenu', ev, it, k)"
        />
        <!-- Create input row for this directory -->
        <div v-if="hasCreateInput" class="tree-item nested editing file" @click.stop @contextmenu.prevent>
          <svg v-if="createInput!.kind === 'folder'" class="tree-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <svg v-else class="tree-file-icon" style="color: var(--vte-accent, #6366f1)" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          <input
            ref="createRef"
            v-model="$parent.inputName"
            class="tree-edit-input"
            :placeholder="createInput!.kind === 'folder' ? '新文件夹名称' : '新文件名称'"
            @keyup.enter="$parent.commitCreate()"
            @keyup.esc="$parent.createInput = null"
            @blur="$parent.commitCreate()"
          />
        </div>
      </template>
    </div>
  </template>

  <!-- ═══ FILE (renaming?) ═══ -->
  <template v-else-if="isRenaming">
    <div class="tree-item file editing" :class="{ nested: isNested }" @click.stop @contextmenu.prevent>
      <svg class="tree-file-icon" :style="{ color: fileColor(item.ext) }" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <input
        ref="renameRef"
        v-model="$parent.inputName"
        class="tree-edit-input"
        placeholder="新名称"
        @keyup.enter="$parent.commitRename()"
        @keyup.esc="$parent.renameInput = null"
        @blur="$parent.commitRename()"
      />
    </div>
  </template>

  <!-- ═══ FILE (normal) ═══ -->
  <template v-else>
    <div
      class="tree-item file"
      :class="[{ nested: isNested, selected: selectedPath === item.path, modifying: isModifying }, touchClass]"
      @click.stop="emit('select', item)"
      @contextmenu.prevent.stop="emit('contextmenu', $event, item, 'file')"
    >
      <svg v-if="isModifying" class="tree-modifying-spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.5-6.5L17 7m-10 10l1.5 1.5M18.5 16.5L17 15M7 9L5.5 7.5"/><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1.2s" repeatCount="indefinite"/></svg>
      <svg v-else class="tree-file-icon" :style="{ color: fileColor(item.ext) }" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
      <span class="tree-label">{{ item.name }}</span>
      <span v-if="isModifying" class="tree-modifying-tag">修改中</span>
    </div>
  </template>
</template>
