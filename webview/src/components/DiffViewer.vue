<template>
  <div class="diff-viewer" v-if="blocks.length > 0">
    <div class="diff-header" @click="expanded = !expanded">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span class="diff-title">代码修改</span>
      <span v-if="firstFilename" class="diff-filename">{{ firstFilename }}</span>
      <span class="diff-stats">
        <span class="diff-add">+{{ stats.additions }}</span>
        <span class="diff-del">-{{ stats.deletions }}</span>
      </span>
      <svg class="diff-arrow" :class="{ rotated: !expanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <Transition name="diff-expand">
      <div v-if="expanded" ref="diffBodyEl" class="diff-body">
        <div v-for="(block, bi) in visibleBlocks" :key="bi" class="diff-block">
          <div v-if="block.header" class="diff-hunk-header">{{ block.header }}</div>

          <!-- Side-by-side view (wide screens) -->
          <div v-if="isWide" class="diff-side-by-side">
            <div class="diff-side diff-side-left">
              <div class="diff-side-title">旧代码</div>
              <div class="diff-lines">
                <div
                  v-for="(pair, pi) in buildPairs(block)"
                  :key="'l-'+pi"
                  class="diff-line"
                  :class="pair.left?.type || 'empty'"
                >
                  <span class="diff-line-num">{{ pair.left?.oldNum ?? '' }}</span>
                  <span class="diff-line-prefix">{{ pair.left?.prefix || '' }}</span>
                  <span class="diff-line-text" v-html="pair.left ? highlightLine(pair.left.text, block.filename) : ''"></span>
                </div>
              </div>
            </div>
            <div class="diff-side-divider"></div>
            <div class="diff-side diff-side-right">
              <div class="diff-side-title">新代码</div>
              <div class="diff-lines">
                <div
                  v-for="(pair, pi) in buildPairs(block)"
                  :key="'r-'+pi"
                  class="diff-line"
                  :class="pair.right?.type || 'empty'"
                >
                  <span class="diff-line-num">{{ pair.right?.newNum ?? '' }}</span>
                  <span class="diff-line-prefix">{{ pair.right?.prefix || '' }}</span>
                  <span class="diff-line-text" v-html="pair.right ? highlightLine(pair.right.text, block.filename) : ''"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Unified view (narrow screens) -->
          <div v-else class="diff-lines">
            <div
              v-for="(line, li) in block.lines"
              :key="li"
              class="diff-line"
              :class="line.type"
            >
              <span class="diff-line-num">{{ getLineNum(line) }}</span>
              <span class="diff-line-prefix">{{ line.prefix }}</span>
              <span class="diff-line-text" v-html="highlightLine(line.text, block.filename)"></span>
            </div>
          </div>
        </div>
        <div v-if="blocks.length > maxBlocks && !showAll" class="diff-more" @click="showAll = true">
          显示剩余 {{ blocks.length - maxBlocks }} 个文件...
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-markdown'

interface DiffLine {
  type: 'add' | 'del' | 'ctx' | 'header'
  prefix: string
  text: string
  oldNum?: number
  newNum?: number
}

interface DiffBlock {
  header?: string
  filename?: string
  lines: DiffLine[]
}

interface DiffPair {
  left?: DiffLine   // old side (del or ctx)
  right?: DiffLine  // new side (add or ctx)
}

const props = defineProps<{
  content: string
}>()

const expanded = ref(true)
const showAll = ref(false)
const maxBlocks = 5
const isWide = ref(false)
const diffBodyEl = ref<HTMLElement>()

// ── Responsive detection ──
function checkWidth() {
  if (diffBodyEl.value) {
    isWide.value = diffBodyEl.value.clientWidth >= 560
  }
}

onMounted(() => {
  checkWidth()
  window.addEventListener('resize', checkWidth)
})
onUnmounted(() => {
  window.removeEventListener('resize', checkWidth)
})

// ── Language detection ──
const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', css: 'css', py: 'python', sh: 'bash',
  bash: 'bash', md: 'markdown', html: 'html', vue: 'typescript',
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return EXT_LANG_MAP[ext] || 'typescript'
}

function highlightCode(code: string, lang: string): string {
  if (!code.trim()) return ''
  try {
    const grammar = Prism.languages[lang]
    if (grammar) return Prism.highlight(code, grammar, lang)
  } catch {}
  return escapeHtml(code)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Diff parsing ──
function parseDiff(raw: string): DiffBlock[] {
  const blocks: DiffBlock[] = []
  let current: DiffBlock | null = null
  let oldLine = 0
  let newLine = 0

  for (const rawLine of raw.split('\n')) {
    if (rawLine.startsWith('diff --git')) {
      if (current && current.lines.length > 0) blocks.push(current)
      const filename = rawLine.replace('diff --git a/', '').split(' ')[0]
      current = { header: rawLine, filename, lines: [] }
      oldLine = 0; newLine = 0
      continue
    }
    if (rawLine.startsWith('--- ') || rawLine.startsWith('+++ ')) {
      if (!current) current = { lines: [] }
      continue
    }
    if (rawLine.startsWith('index ')) {
      if (!current) current = { lines: [] }
      continue
    }
    if (rawLine.startsWith('@@')) {
      if (!current) current = { lines: [] }
      const match = rawLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)/)
      if (match) {
        oldLine = parseInt(match[1]); newLine = parseInt(match[2])
        const funcName = match[3]?.trim()
        if (funcName) current.lines.push({ type: 'header', prefix: '', text: funcName })
      }
      continue
    }
    if (!current) current = { lines: [] }

    if (rawLine.startsWith('+')) {
      current.lines.push({ type: 'add', prefix: '+', text: rawLine.slice(1), newNum: newLine++ })
    } else if (rawLine.startsWith('-')) {
      current.lines.push({ type: 'del', prefix: '-', text: rawLine.slice(1), oldNum: oldLine++ })
    } else if (rawLine.startsWith(' ')) {
      current.lines.push({ type: 'ctx', prefix: ' ', text: rawLine.slice(1), oldNum: oldLine++, newNum: newLine++ })
    } else if (rawLine === '') {
      current.lines.push({ type: 'ctx', prefix: '', text: '' })
    } else {
      current.lines.push({ type: 'ctx', prefix: ' ', text: rawLine })
    }
  }
  if (current && current.lines.length > 0) blocks.push(current)
  return blocks
}

// ── Build side-by-side pairs ──
function buildPairs(block: DiffBlock): DiffPair[] {
  const pairs: DiffPair[] = []
  const lines = block.lines.filter(l => l.type !== 'header')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'ctx') {
      // Context line — appears on both sides
      pairs.push({ left: line, right: line })
      i++
    } else if (line.type === 'del') {
      // Collect consecutive deletes
      const dels: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'del') {
        dels.push(lines[i]); i++
      }
      // Collect consecutive adds
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'add') {
        adds.push(lines[i]); i++
      }
      // Pair them up
      const maxLen = Math.max(dels.length, adds.length)
      for (let j = 0; j < maxLen; j++) {
        pairs.push({ left: dels[j], right: adds[j] })
      }
    } else if (line.type === 'add') {
      // Add without preceding delete
      pairs.push({ left: undefined, right: line })
      i++
    } else {
      i++
    }
  }
  return pairs
}

// ── Highlight & line numbers ──
function highlightLine(text: string, filename?: string): string {
  const lang = filename ? detectLanguage(filename) : 'typescript'
  return highlightCode(text, lang)
}

function getLineNum(line: DiffLine): string {
  if (line.type === 'add') return line.newNum?.toString() || ''
  if (line.type === 'del') return line.oldNum?.toString() || ''
  return line.oldNum?.toString() || ''
}

// ── Computed ──
const blocks = computed(() => parseDiff(props.content))

const visibleBlocks = computed(() => {
  if (showAll.value || blocks.value.length <= maxBlocks) return blocks.value
  return blocks.value.slice(0, maxBlocks)
})

const stats = computed(() => {
  let additions = 0, deletions = 0
  for (const block of blocks.value) {
    for (const line of block.lines) {
      if (line.type === 'add') additions++
      if (line.type === 'del') deletions++
    }
  }
  return { additions, deletions }
})

const firstFilename = computed(() => {
  for (const block of blocks.value) {
    if (block.filename) return block.filename
  }
  return ''
})
</script>

<style scoped>
.diff-viewer { border-radius: 8px; overflow: hidden; margin: 4px 0; width: 100%; box-sizing: border-box; }

.diff-header {
  display: flex; align-items: center; gap: 6px; padding: 6px 10px;
  cursor: pointer; user-select: none;
}
.diff-header:hover { background: rgba(99,102,241,0.06); }
.diff-title { font-size: 11.5px; font-weight: 600; color: var(--vte-text); }
.diff-filename { font-size: 10.5px; color: var(--vte-text-muted); font-family: 'SF Mono', Menlo, Consolas, monospace; opacity: 0.7; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-stats { display: flex; gap: 5px; font-size: 10.5px; font-weight: 600; margin-left: auto; }
.diff-add { color: #22c55e; }
.diff-del { color: #ef4444; }
.diff-arrow { color: var(--vte-text-muted); transition: transform 0.15s; flex-shrink: 0; }
.diff-arrow.rotated { transform: rotate(-90deg); }

.diff-body { background: rgba(0,0,0,0.06); max-height: min(360px, 45vh); overflow-y: auto; overflow-x: hidden; }

.diff-block { border-top: 1px solid rgba(255,255,255,0.05); }
.diff-hunk-header { padding: 3px 12px; font-size: 10.5px; color: var(--vte-text-muted); font-family: monospace; background: rgba(0,0,0,0.08); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── Side-by-side layout ── */
.diff-side-by-side { display: flex; }
.diff-side { flex: 1; min-width: 0; }
.diff-side-title { padding: 3px 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--vte-text-muted); background: rgba(0,0,0,0.06); border-bottom: 1px solid rgba(255,255,255,0.04); opacity: 0.6; }
.diff-side-left .diff-side-title { color: #f87171; }
.diff-side-right .diff-side-title { color: #10b981; }
.diff-side-divider { width: 1px; background: var(--vte-border); flex-shrink: 0; }

/* ── Lines ── */
.diff-lines { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 11.5px; line-height: 1.45; }
.diff-line { display: flex; padding-left: 6px; white-space: pre-wrap; word-break: break-all; min-height: 1.45em; }
.diff-line-num { width: 26px; min-width: 26px; text-align: right; padding-right: 8px; color: #3d4a5c; user-select: none; flex-shrink: 0; font-size: 10.5px; }
.diff-line-prefix { width: 14px; min-width: 14px; text-align: center; user-select: none; flex-shrink: 0; font-weight: 500; color: #5a6577; }
.diff-line-text { flex: 1; min-width: 0; word-break: break-all; padding-left: 3px; }

.diff-line.add { background: rgba(16,185,129,0.07); }
.diff-line.add .diff-line-prefix { color: #10b981; }
.diff-line.add .diff-line-text { color: #bbf7d0; }

.diff-line.del { background: rgba(239,68,68,0.05); }
.diff-line.del .diff-line-prefix { color: #f87171; }
.diff-line.del .diff-line-text { color: #fecaca; }

.diff-line.ctx { color: #8896a8; }
.diff-line.header { color: #818cf8; font-style: italic; font-size: 10.5px; }
.diff-line.empty { min-height: 1.45em; }

.diff-more {
  padding: 6px 12px; text-align: center; font-size: 10.5px; color: #6366f1;
  cursor: pointer; border-top: 1px solid rgba(255,255,255,0.04);
}
.diff-more:hover { background: rgba(99,102,241,0.06); }

.diff-expand-enter-active { transition: all 0.2s ease; }
.diff-expand-leave-active { transition: all 0.15s ease; }
.diff-expand-enter-from, .diff-expand-leave-to { opacity: 0; max-height: 0; }

/* Prism.js token colors (dark theme) */
.diff-line-text :deep(.token) { color: #c4b5fd; }
.diff-line-text :deep(.token.keyword) { color: #c084fc; }
.diff-line-text :deep(.token.string) { color: #86efac; }
.diff-line-text :deep(.token.number) { color: #fbbf24; }
.diff-line-text :deep(.token.comment) { color: #525d6e; font-style: italic; }
.diff-line-text :deep(.token.function) { color: #67e8f9; }
.diff-line-text :deep(.token.operator) { color: #f472b6; }
.diff-line-text :deep(.token.punctuation) { color: #8896a8; }
.diff-line-text :deep(.token.class-name) { color: #fcd34d; }
.diff-line-text :deep(.token.boolean) { color: #fbbf24; }
.diff-line-text :deep(.token.property) { color: #93c5fd; }
.diff-line-text :deep(.token.tag) { color: #f87171; }
.diff-line-text :deep(.token.attr-name) { color: #fbbf24; }
.diff-line-text :deep(.token.attr-value) { color: #86efac; }
</style>
