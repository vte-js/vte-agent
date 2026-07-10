<template>
  <div class="diff-viewer" v-if="blocks.length > 0">
    <div class="diff-header" @click="expanded = !expanded">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span class="diff-title">代码修改</span>
      <span class="diff-stats">
        <span class="diff-add">+{{ stats.additions }}</span>
        <span class="diff-del">-{{ stats.deletions }}</span>
      </span>
      <svg class="diff-arrow" :class="{ rotated: !expanded }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <Transition name="diff-expand">
      <div v-if="expanded" class="diff-body">
        <div v-for="(block, bi) in visibleBlocks" :key="bi" class="diff-block">
          <div v-if="block.header" class="diff-hunk-header">{{ block.header }}</div>
          <div class="diff-lines">
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
import { computed, ref, onMounted } from 'vue'
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

const props = defineProps<{
  content: string
}>()

const expanded = ref(true)
const showAll = ref(false)
const maxBlocks = 5

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
    if (grammar) {
      return Prism.highlight(code, grammar, lang)
    }
  } catch {}
  return escapeHtml(code)
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseDiff(raw: string): DiffBlock[] {
  const blocks: DiffBlock[] = []
  let current: DiffBlock | null = null
  let oldLine = 0
  let newLine = 0

  for (const rawLine of raw.split('\n')) {
    // File header
    if (rawLine.startsWith('diff --git')) {
      if (current && current.lines.length > 0) blocks.push(current)
      const filename = rawLine.replace('diff --git a/', '').split(' ')[0]
      current = { header: rawLine, filename, lines: [] }
      oldLine = 0
      newLine = 0
      continue
    }

    // Skip --- and +++ file headers
    if (rawLine.startsWith('--- ') || rawLine.startsWith('+++ ')) {
      if (!current) current = { lines: [] }
      continue
    }

    // Replace git index line with empty line
    if (rawLine.startsWith('index ')) {
      if (!current) current = { lines: [] }
      current.lines.push({ type: 'ctx', prefix: '', text: '' })
      continue
    }

    // Hunk header
    if (rawLine.startsWith('@@')) {
      if (!current) current = { lines: [] }
      const match = rawLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)/)
      if (match) {
        oldLine = parseInt(match[1])
        newLine = parseInt(match[2])
        const funcName = match[3]?.trim()
        if (funcName) {
          current.lines.push({ type: 'header', prefix: '', text: funcName })
        }
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

function highlightLine(text: string, filename?: string): string {
  const lang = filename ? detectLanguage(filename) : 'typescript'
  return highlightCode(text, lang)
}

function getLineNum(line: DiffLine): string {
  if (line.type === 'add') return line.newNum?.toString() || ''
  if (line.type === 'del') return line.oldNum?.toString() || ''
  return line.oldNum?.toString() || ''
}

const blocks = computed(() => parseDiff(props.content))

const visibleBlocks = computed(() => {
  if (showAll.value || blocks.value.length <= maxBlocks) return blocks.value
  return blocks.value.slice(0, maxBlocks)
})

const stats = computed(() => {
  let additions = 0
  let deletions = 0
  for (const block of blocks.value) {
    for (const line of block.lines) {
      if (line.type === 'add') additions++
      if (line.type === 'del') deletions++
    }
  }
  return { additions, deletions }
})
</script>

<style scoped>
.diff-viewer { border-radius: 8px; border: 1px solid var(--vte-border); overflow: hidden; margin: 6px 0; width: 100%; box-sizing: border-box; }

.diff-header {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: rgba(99,102,241,0.06); cursor: pointer; user-select: none;
}
.diff-header:hover { background: rgba(99,102,241,0.1); }
.diff-title { font-size: 12px; font-weight: 600; color: var(--vte-text); }
.diff-stats { display: flex; gap: 6px; font-size: 11px; font-weight: 600; margin-left: auto; }
.diff-add { color: #22c55e; }
.diff-del { color: #ef4444; }
.diff-arrow { color: var(--vte-text-muted); transition: transform 0.15s; }
.diff-arrow.rotated { transform: rotate(-90deg); }

.diff-body { background: rgba(0,0,0,0.15); max-height: min(400px, 50vh); overflow-y: auto; overflow-x: hidden; }

.diff-block { border-top: 1px solid var(--vte-border); }
.diff-hunk-header { padding: 4px 12px; font-size: 11px; color: var(--vte-text-muted); font-family: monospace; background: rgba(0,0,0,0.1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.diff-lines { font-family: 'SF Mono', 'Menlo', 'Consolas', monospace; font-size: 12px; line-height: 1.5; }
.diff-line { display: flex; padding-left: 12px; white-space: pre-wrap; word-break: break-all; min-height: 1.5em; }
.diff-line-num { width: 12px; min-width: 12px; text-align: left; color: #4a5568; user-select: none; flex-shrink: 0; font-size: 11px; }
.diff-line-prefix { width: 16px; min-width: 16px; text-align: center; user-select: none; flex-shrink: 0; font-weight: 500; color: #64748b; }
.diff-line-text { flex: 1; min-width: 0; word-break: break-all; padding-left: 4px; }

.diff-line.add { background: rgba(16,185,129,0.08); }
.diff-line.add .diff-line-prefix { color: #10b981; }
.diff-line.add .diff-line-text { color: #a7f3d0; }

.diff-line.del { background: rgba(239,68,68,0.06); }
.diff-line.del .diff-line-prefix { color: #f87171; }
.diff-line.del .diff-line-text { color: #fecaca; }

.diff-line.ctx { color: #94a3b8; }

.diff-line.header { color: #818cf8; font-style: italic; font-size: 11px; }

.diff-more {
  padding: 8px 12px; text-align: center; font-size: 11px; color: #6366f1;
  cursor: pointer; border-top: 1px solid var(--vte-border);
}
.diff-more:hover { background: rgba(99,102,241,0.08); }

.diff-expand-enter-active { transition: all 0.2s ease; }
.diff-expand-leave-active { transition: all 0.15s ease; }
.diff-expand-enter-from, .diff-expand-leave-to { opacity: 0; max-height: 0; }

/* Prism.js token colors (dark theme) */
.diff-line-text :deep(.token) { color: #c4b5fd; }
.diff-line-text :deep(.token.keyword) { color: #c084fc; }
.diff-line-text :deep(.token.string) { color: #86efac; }
.diff-line-text :deep(.token.number) { color: #fbbf24; }
.diff-line-text :deep(.token.comment) { color: #64748b; font-style: italic; }
.diff-line-text :deep(.token.function) { color: #67e8f9; }
.diff-line-text :deep(.token.operator) { color: #f472b6; }
.diff-line-text :deep(.token.punctuation) { color: #94a3b8; }
.diff-line-text :deep(.token.class-name) { color: #fcd34d; }
.diff-line-text :deep(.token.boolean) { color: #fbbf24; }
.diff-line-text :deep(.token.property) { color: #93c5fd; }
.diff-line-text :deep(.token.tag) { color: #f87171; }
.diff-line-text :deep(.token.attr-name) { color: #fbbf24; }
.diff-line-text :deep(.token.attr-value) { color: #86efac; }
</style>
