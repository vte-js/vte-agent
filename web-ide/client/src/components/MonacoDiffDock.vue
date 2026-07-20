<script setup lang="ts">
/**
 * VTE Stage — Monaco Diff Dock (M1 resident panel, NOT a modal).
 *
 * Performance design (web-worker scheduling):
 *  - We import ONLY `monaco-editor/esm/vs/editor/editor.api` (the editor
 *    core), never the full `monaco-editor` meta package. That avoids pulling
 *    in every language contribution (TS/JSON/CSS/HTML services).
 *  - MonacoEnvironment.getWorker returns a SINGLE base `editor.worker`. No
 *    language workers are spawned, so the heavy TS/JSON language services
 *    never run on a worker thread. Diff computation is handled by that one
 *    base worker off the main thread — the UI stays responsive while the
 *    agent streams.
 *  - The component is lazy-loaded (defineAsyncComponent on the host), so the
 *    monaco chunk + worker only download on the FIRST write event.
 *  - A single DiffEditor instance is created and REUSED across files
 *    (setModel on each change) — no create/dispose churn.
 *  - Bursts of writes inside one frame are coalesced via requestAnimationFrame.
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

;(self as any).MonacoEnvironment = {
  // Only the base editor worker — diffing does not need language services.
  getWorker() {
    return new EditorWorker()
  },
}

const props = defineProps<{
  diff: { path: string; before: string; after: string; agentId: string } | null
  visible: boolean
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const containerRef = ref<HTMLElement | null>(null)
const fileName = ref('')
const filePath = ref('')
const loading = ref(false)
const editorReady = ref(false)

let editor: any = null
let beforeModel: any = null
let afterModel: any = null
let pendingDiff: any = null
let raf = 0

// Read the live --vte-* tokens so the editor matches the host theme.
function applyTheme(): void {
  const cs = getComputedStyle(document.documentElement)
  const bg = cs.getPropertyValue('--vte-bg').trim() || '#1e1e1e'
  const fg = cs.getPropertyValue('--vte-text').trim() || '#cccccc'
  const border = cs.getPropertyValue('--vte-border').trim() || '#3c3c3c'
  monaco.editor.defineTheme('vte-stage', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editorGutter.background': bg,
      'editorLineNumber.foreground': 'rgba(204,204,204,0.35)',
      'editorWidget.border': border,
      'editor.selectionBackground': 'rgba(99,102,241,0.30)',
      'diffEditor.insertedTextBackground': 'rgba(78,201,176,0.18)',
      'diffEditor.removedTextBackground': 'rgba(244,135,113,0.18)',
      'diffEditor.insertedLineBackground': 'rgba(78,201,176,0.10)',
      'diffEditor.removedLineBackground': 'rgba(244,135,113,0.10)',
    },
  })
  monaco.editor.setTheme('vte-stage')
}

function disposeModels(): void {
  if (beforeModel) { beforeModel.dispose(); beforeModel = null }
  if (afterModel) { afterModel.dispose(); afterModel = null }
}

// plaintext is intentional: keeps ALL highlighting off the language workers,
// the diff coloring (green/red) is the actual signal we want to show.
function updateDiff(d: { path: string; before: string; after: string }): void {
  if (!editor) return
  disposeModels()
  fileName.value = d.path.split('/').pop() || d.path
  filePath.value = d.path
  beforeModel = monaco.editor.createModel(d.before || '', 'plaintext')
  afterModel = monaco.editor.createModel(d.after || '', 'plaintext')
  editor.setModel({ original: beforeModel, modified: afterModel })
  editor.revealLine(1)
}

async function initEditor(): Promise<void> {
  if (!containerRef.value || editor) return
  loading.value = true
  applyTheme()
  editor = monaco.editor.createDiffEditor(containerRef.value, {
    readOnly: true,
    originalEditable: false,
    renderSideBySide: true,
    automaticLayout: true, // avoids manual ResizeObserver wiring
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 12.5,
    fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace",
    padding: { top: 8 },
    // perf: disable costly editor features we don't need in the stage dock
    folding: false,
    matchBrackets: 'never',
    occurrencesHighlight: 'off',
    renderWhitespace: 'none',
    wordWrap: 'off',
    smoothScrolling: false,
    cursorBlinking: 'solid',
  })
  editorReady.value = true
  loading.value = false
  if (props.diff) updateDiff(props.diff)
}

// Coalesce bursts of writes into a single update per animation frame.
watch(
  () => props.diff,
  (d) => {
    if (!d) return
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      if (editorReady.value) updateDiff(d)
      else pendingDiff = d
    })
  },
  { deep: false },
)

onMounted(async () => {
  await nextTick()
  await initEditor()
  if (pendingDiff) {
    updateDiff(pendingDiff)
    pendingDiff = null
  }
})

onBeforeUnmount(() => {
  disposeModels()
  if (editor) { editor.dispose(); editor = null }
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="monaco-dock">
    <div class="md-header">
      <div class="md-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="md-ico">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        <span class="md-fname">{{ fileName || '—' }}</span>
        <span class="md-path" :title="filePath">{{ filePath }}</span>
        <span class="md-badge">实时改动 · Monaco Diff</span>
      </div>
      <button class="md-close" title="关闭 (Esc)" @click="emit('close')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
    <div ref="containerRef" class="md-editor">
      <div v-if="loading" class="md-loading">正在加载 Monaco 编辑器…</div>
    </div>
  </div>
</template>

<style scoped>
.monaco-dock {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  height: 260px;
  border-top: 1px solid var(--vte-border, #3c3c3c);
  background: var(--vte-bg, #1e1e1e);
  min-height: 0;
}
.md-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vte-border, #3c3c3c);
  background: var(--vte-bg-elevated, #252526);
  flex: 0 0 auto;
}
.md-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}
.md-ico { color: var(--vte-primary, #6366f1); flex-shrink: 0; }
.md-fname { font-weight: 600; color: var(--vte-text, #ccc); white-space: nowrap; }
.md-path {
  color: var(--vte-text-muted, #999);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.md-badge {
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  color: var(--vte-primary, #6366f1);
  background: var(--vte-primary-muted, rgba(99,102,241,0.15));
  white-space: nowrap;
}
.md-close {
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  display: flex;
  flex-shrink: 0;
}
.md-close:hover { background: rgba(255,255,255,0.07); color: var(--vte-text, #ccc); }
.md-editor { position: relative; flex: 1 1 auto; min-height: 0; }
.md-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vte-text-muted, #999);
  font-size: 12px;
}
</style>
