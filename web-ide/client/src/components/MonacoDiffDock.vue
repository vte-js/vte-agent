<script setup lang="ts">
/**
 * VTE Stage — Monaco Diff Dock (floating overlay panel, NOT inline).
 *
 * Changes from M1 original:
 *  - Floating fixed-position panel (draggable header), no longer wedged between
 *    chat and input. Saves vertical space and feels like a "peek" view.
 *  - Scrolls to the FIRST changed line after setModel (not always line 1).
 *  - Basic syntax highlighting by file extension using monaco's lightweight
 *    built-in language modes (tokenizer-level only, no worker, no full LSP).
 *
 * Robustness fixes (post-M1 optimization):
 *  - Teleport readiness: retry containerRef up to 5 times with nextTick.
 *  - try/catch around every Monaco call so silent failures are surfaced.
 *  - Fallback raw-text preview if Monaco fails to initialize.
 *  - Console diagnostics for debugging blank-dock issues.
 */
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

;(self as any).MonacoEnvironment = {
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
const dockRef = ref<HTMLElement | null>(null)
const fileName = ref('')
const filePath = ref('')
const loading = ref(false)
const editorReady = ref(false)
const collapsed = ref(false)

// ── Fallback state: if Monaco fails to init, show raw text instead ──
const fallbackText = ref('')
const monacoError = ref('')

let editor: any = null
let beforeModel: any = null
let afterModel: any = null
let pendingDiff: any = null
let raf = 0

// ── Dragging ──
let dragState: { sx: number; sy: number; ox: number; oy: number } | null = null
function onDragStart(e: MouseEvent) {
  if (!(e.target instanceof HTMLElement)) return
  const hdr = e.target.closest('.md-header')
  if (!hdr || !dockRef.value) return
  e.preventDefault()
  const r = dockRef.value.getBoundingClientRect()
  dragState = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragUp)
}
function onDragMove(e: MouseEvent) {
  if (!dragState || !dockRef.value) return
  const dx = e.clientX - dragState.sx
  const dy = e.clientY - dragState.sy
  let nx = dragState.ox + dx
  let ny = dragState.oy + dy
  const w = dockRef.value.offsetWidth
  const h = dockRef.value.offsetHeight
  nx = Math.max(0, Math.min(window.innerWidth - w, nx))
  ny = Math.max(0, Math.min(window.innerHeight - h, ny))
  dockRef.value.style.left = `${nx}px`
  dockRef.value.style.top = `${ny}px`
  dockRef.value.style.right = 'auto'
  dockRef.value.style.bottom = 'auto'
}
function onDragUp() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragUp)
}

// Map extension → monaco language id (lightweight tokenizer-level highlighting).
function langForPath(p: string): string {
  const ext = p.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',
    vue:'html',css:'css',scss:'scss',less:'less',
    html:'html',htm:'htm',json:'json',
    md:'markdown',mdx:'markdown',
    py:'python',rs:'rust',go:'go',java:'java',
    sh:'shellscript',bash:'shellscript',zsh:'shellscript',
    yaml:'yaml',yml:'yaml',toml:'toml',
    xml:'xml',svg:'xml',
    env:'plaintext',gitignore:'plaintext',log:'plaintext',txt:'plaintext',
    lock:'json',
  }
  return map[ext] || 'plaintext'
}

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
  try {
    if (beforeModel) { beforeModel.dispose(); beforeModel = null }
    if (afterModel) { afterModel.dispose(); afterModel = null }
  } catch (e) {
    console.warn('[VTE-Stage] disposeModels error:', e)
  }
}

/** Set diff content and scroll to the first changed line. */
function updateDiff(d: { path: string; before: string; after: string }): void {
  if (!editor) {
    // Monaco not ready — set fallback text
    console.warn('[VTE-Stage] updateDiff called but editor is null — using fallback')
    setFallback(d)
    return
  }

  // Also update fallback in case user collapses and we need it
  fallbackText.value = formatFallback(d)

  try {
    disposeModels()
    fileName.value = d.path.split('/').pop() || d.path
    filePath.value = d.path
    const lang = langForPath(d.path)
    beforeModel = monaco.editor.createModel(d.before || '', lang)
    afterModel = monaco.editor.createModel(d.after || '', lang)
    editor.setModel({ original: beforeModel, modified: afterModel })
    console.log(`[VTE-Stage] Diff model set: ${fileName.value} (before=${d.before.length} chars, after=${d.after.length} chars)`)
    // Force a layout pass. With automaticLayout the ResizeObserver normally
    // handles resize, but when the diff editor is created and immediately
    // setModel()'d inside a flex container whose height resolves a tick
    // later, Monaco can paint with 0-sized panes and STAY BLANK (no error,
    // so the fallback never triggers). An explicit layout() — plus a deferred
    // one on the next frame — guarantees the split actually renders the
    // before/after content. This is the root cause of "diff popup empty".
    try { editor.layout() } catch {}
    requestAnimationFrame(() => { try { editor.layout() } catch {} })
    // Scroll to first changed region instead of always line 1.
    nextTick(() => {
      try {
        const changes = editor.getLineChanges?.()
        if (changes && changes.length > 0) {
          editor.revealLineInCenter(Math.max(1, changes[0].modifiedStartLineNumber))
          return
        }
      } catch { /* fallback */ }
      try { editor.revealLine(1) } catch {}
    })
  } catch (e) {
    console.error('[VTE-Stage] updateDiff error:', e)
    monacoError.value = String(e)
    setFallback(d)
  }
}

/** Raw-text fallback when Monaco fails. */
function formatFallback(d: { path: string; before: string; after: string }): string {
  const beforeLines = d.before.split('\n')
  const afterLines = d.after.split('\n')
  const maxLines = Math.max(beforeLines.length, afterLines.length)
  let out = `/* ${d.path} */\n`
  out += `─`.repeat(50) + ` BEFORE (${beforeLines.length} lines) ` + `─`.repeat(20) + '\n'
  for (let i = 0; i < Math.min(beforeLines.length, 50); i++) {
    out += (afterLines[i] !== beforeLines[i] ? '- ' : '  ') + beforeLines[i] + '\n'
  }
  if (beforeLines.length > 50) out += `  ... (${beforeLines.length - 50} more lines)\n`
  out += `─`.repeat(50) + ` AFTER  (${afterLines.length} lines) ` + `─`.repeat(21) + '\n'
  for (let i = 0; i < Math.min(afterLines.length, 50); i++) {
    out += (afterLines[i] !== beforeLines[i] ? '+ ' : '  ') + afterLines[i] + '\n'
  }
  if (afterLines.length > 50) out += `  ... (${afterLines.length - 50} more lines)\n`
  return out
}
function setFallback(d: { path: string; before: string; after: string }): void {
  fileName.value = d.path.split('/').pop() || d.path
  filePath.value = d.path
  fallbackText.value = formatFallback(d)
}

/** Retry containerRef up to 5 times (Teleport may need time to materialize). */
async function waitForContainer(maxRetries = 5): Promise<HTMLElement | null> {
  for (let i = 0; i < maxRetries; i++) {
    if (containerRef.value) return containerRef.value
    await new Promise(r => setTimeout(r, 50 + i * 30)) // progressive backoff: 50, 80, 110, 140, 170ms
  }
  return containerRef.value // might still be null
}

async function initEditor(): Promise<void> {
  if (editor) return

  const container = await waitForContainer()
  if (!container) {
    console.error('[VTE-Stage] containerRef is null after retries — Monaco cannot initialize')
    monacoError.value = 'container_ref_null'
    return
  }

  loading.value = true
  try {
    applyTheme()
    console.log(`[VTE-Stage] Creating DiffEditor in container (offsetWidth=${container.offsetWidth}, offsetHeight=${container.offsetHeight})...`)
    editor = monaco.editor.createDiffEditor(container, {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 12.5,
      fontFamily: "'SF Mono', Monaco, Menlo, Consolas, monospace",
      padding: { top: 8 },
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
    console.log(`[VTE-Stage] DiffEditor created OK`)
    if (props.diff) updateDiff(props.diff)
  } catch (e) {
    console.error('[VTE-Stage] createDiffEditor failed:', e)
    loading.value = false
    monacoError.value = String(e instanceof Error ? e.message : e)
    if (props.diff) setFallback(props.diff)
  }
}

// Coalesce bursts of writes into a single update per animation frame.
watch(
  () => props.diff,
  (d) => {
    if (!d) return
    collapsed.value = false // auto-expand on new diff
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      if (editorReady.value && !monacoError.value) updateDiff(d)
      else if (monacoError.value) setFallback(d)
      else pendingDiff = d
    })
  },
  { deep: false },
)

onMounted(async () => {
  await nextTick()
  await initEditor()
  if (pendingDiff && !monacoError.value) {
    updateDiff(pendingDiff)
    pendingDiff = null
  } else if (pendingDiff && monacoError.value) {
    setFallback(pendingDiff)
    pendingDiff = null
  }
})

onBeforeUnmount(() => {
  disposeModels()
  if (editor) { try { editor.dispose() } catch {} editor = null }
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && diff"
      ref="dockRef"
      class="monaco-dock-float"
      :class="{ collapsed }"
      @mousedown="onDragStart"
    >
      <div class="md-header">
        <div class="md-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="md-ico">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <span class="md-fname">{{ fileName || '—' }}</span>
          <span class="md-path" :title="filePath">{{ filePath }}</span>
          <span v-if="!monacoError" class="md-badge">实时改动</span>
          <span v-else class="md-badge md-badge-warn">渲染异常</span>
        </div>
        <div class="md-actions">
          <button class="md-btn" :title="collapsed ? '展开' : '折叠'" @click.stop="collapsed = !collapsed">
            <svg v-if="collapsed" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
          <button class="md-close" title="关闭 (Esc)" @click.stop="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <!-- Monaco editor area -->
      <div v-show="!collapsed" ref="containerRef" class="md-editor">
        <div v-if="loading" class="md-loading">正在加载编辑器…</div>
      </div>
      <!-- Fallback: raw text when Monaco fails -->
      <div v-show="!collapsed && monacoError" class="md-fallback">
        <pre class="md-fallback-text">{{ fallbackText }}</pre>
      </div>
      <!-- Mini bar when collapsed -->
      <div v-if="collapsed" class="md-collapsed-bar">
        <span>{{ fileName }}</span>
        <span class="md-collapsed-hint">点击展开查看改动</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.monaco-dock-float {
  position: fixed;
  right: 24px;
  bottom: 80px;
  width: 580px;
  max-height: min(420px, calc(100vh - 160px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vte-border, #3c3c3c);
  border-radius: 10px;
  background: var(--vte-bg, #1e1e1e);
  box-shadow:
    0 8px 32px rgba(0,0,0,0.45),
    0 0 0 1px rgba(255,255,255,0.04);
  z-index: 999;
  overflow: hidden;
  animation: dock-in 0.2s ease-out both;
}
@keyframes dock-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.monaco-dock-float.collapsed {
  max-height: auto;
  width: 340px;
}
.md-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-bottom: 1px solid var(--vte-border, #3c3c3c);
  background: var(--vte-bg-elevated, #252526);
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
  border-radius: 10px 10px 0 0;
}
.md-header:active { cursor: grabbing; }

.md-title {
  display: flex;
  align-items: center;
  gap: 7px;
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
  max-width: 220px;
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
.md-badge-warn {
  color: var(--vte-error, #f48771);
  background: rgba(244,135,113,0.15);
}

.md-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.md-btn {
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  display: flex;
}
.md-btn:hover { background: rgba(255,255,255,0.07); color: var(--vte-text, #ccc); }
.md-close {
  border: none;
  background: none;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  display: flex;
}
.md-close:hover { background: rgba(255,255,255,0.07); color: var(--vte-error, #f48771); }

.md-editor { position: relative; flex: 1 1 auto; min-height: 140px; max-height: calc(min(420px, calc(100vh - 210px))); overflow: hidden; }
.md-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vte-text-muted, #999);
  font-size: 12px;
}

/* Fallback raw-text display when Monaco fails */
.md-fallback {
  flex: 1 1 auto;
  min-height: 140px;
  max-height: calc(min(420px, calc(100vh - 210px)));
  overflow: auto;
  background: var(--vte-bg, #1e1e1e);
}
.md-fallback-text {
  margin: 8px 12px;
  font-size: 11.5px;
  font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace;
  color: var(--vte-text, #ccc);
  white-space: pre;
  tab-size: 2;
  line-height: 1.45;
}
/* Highlight changed lines in fallback */
.md-collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  color: var(--vte-text-muted, #999);
  cursor: pointer;
}
.md-collapsed-hint {
  color: var(--vte-primary, #6366f1);
  font-size: 10px;
}
</style>
