<template>
  <div class="inp">
    <!-- Outer shell: gray bg, rounded, border, focus highlight -->
    <div class="inp-outer">
      <!-- Top toolbar — uses outer's gray bg -->
      <div class="inp-tool-top">
        <VTooltip text="添加图片">
          <button class="tool-btn" @click="triggerImageUpload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </button>
        </VTooltip>
        <input
          ref="fileInputEl"
          type="file"
          accept="image/*"
          multiple
          style="display: none"
          @change="onFileSelect"
        />
        <VTooltip text="添加上下文">
          <button class="tool-btn" @click="showCtxMenu = !showCtxMenu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
          </button>
        </VTooltip>
        <ContextMenu :visible="showCtxMenu" :items="DEFAULT_CONTEXT_ITEMS" @select="requestContext" />
        <SlashCommand
          :visible="showSlashCmd"
          :commands="slashCommands"
          @close="showSlashCmd = false"
          @select="onSlashSelect"
        />
      </div>
      <!-- Inner: own bg, covers outer's gray, textarea + bottom toolbar -->
      <div class="inp-inner">
        <!-- Context file preview chips -->
        <div v-if="contextFiles.length > 0" class="context-preview">
          <div v-for="(f, idx) in contextFiles" :key="f.path" class="context-chip">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="context-chip-name">{{ f.name }}</span>
            <button class="context-chip-remove" @click="removeContext(idx)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <!-- Image preview -->
        <div v-if="images.length > 0" class="image-preview">
          <div v-for="(img, idx) in images" :key="idx" class="image-item">
            <img :src="img.dataUrl" :alt="img.name" />
            <button class="image-remove" @click="removeImage(idx)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div v-if="editRef" class="edit-ref">
          <svg class="edit-ref-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span class="edit-ref-text">{{ editRef }}</span>
          <VTooltip text="取消引用">
            <button class="edit-ref-close" @click="cancelEdit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </VTooltip>
        </div>
        <textarea
          ref="textareaEl"
          v-model="text"
          :placeholder="editRef ? '编辑消息...' : '输入 / 打开快捷指令，或 @ 附加文件上下文'"
          @keydown.enter.exact.prevent="onSend"
          @input="onInput"
        ></textarea>
        <div class="inp-tool-bottom">
          <ModelSelector
            :models="models"
            :active-index="activeModelIndex"
            @select="$emit('selectModel', $event)"
            @save="(i, p) => $emit('saveModel', i, p)"
            @delete="$emit('deleteModel', $event)"
          />
          <div class="inp-reasoning-wrap" style="position: relative">
            <VTooltip text="推理强度">
              <button class="reasoning-btn" :class="reasoningLevel" @click="showReasoningPicker = !showReasoningPicker">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span>{{ reasoningLabel }}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </VTooltip>
            <ReasoningPicker
              :visible="showReasoningPicker"
              :model-value="reasoningLevel"
              @update:model-value="$emit('update:reasoningLevel', $event)"
              @close="showReasoningPicker = false"
            />
          </div>
          <div class="inp-spacer"></div>
          <TokenRing :cost="tokenStats.totalCost" @toggle="$emit('toggleToken')" />
          <VTooltip v-if="!busy" text="发送消息">
            <button class="bar-btn-send" :disabled="!canSend" @click="onSend">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
            </button>
          </VTooltip>
          <VTooltip v-else text="停止生成">
            <button class="bar-btn-stop" @click="$emit('stop')">
              <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          </VTooltip>
        </div>
      </div>
    </div>
    <GitPicker
      :visible="showGitPicker"
      :changes="gitChanges"
      :commits="gitCommits"
      @close="showGitPicker = false"
      @confirm="onGitConfirm"
    />
    <SkillsPicker
      :visible="showSkillsPicker"
      :skills="skillsList"
      @close="showSkillsPicker = false"
      @confirm="onSkillsConfirm"
      @manage="openSkillsManager"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TokenStatsData } from './TokenStats'
import type { ModelProfile } from '../composables/useConfig'
import type { ContextAttachment, ReasoningLevel } from '../protocol'
import { useVsCode } from '../composables/useVsCode'
import TokenRing from './TokenRing.vue'
import VTooltip from './VTooltip.vue'
import ModelSelector from './ModelSelector.vue'
import ReasoningPicker from './ReasoningPicker.vue'
import GitPicker from './GitPicker.vue'
import SkillsPicker from './SkillsPicker.vue'
import SlashCommand, { type SlashCommandItem } from './SlashCommand.vue'
import ContextMenu from './ContextMenu.vue'
import { DEFAULT_CONTEXT_ITEMS } from './context-menu-items'

export interface ImageAttachment {
  name: string
  dataUrl: string
  mimeType: string
}

const { send, onMessage } = useVsCode()

const props = defineProps<{
  tokenStats: TokenStatsData
  busy: boolean
  editRef: string
  editContext: ContextAttachment[]
  models: ModelProfile[]
  activeModelIndex: number
  reasoningLevel: ReasoningLevel
}>()

const emit = defineEmits<{
  send: [text: string, images: ImageAttachment[], context: ContextAttachment[]]
  stop: []
  toggleToken: []
  cancelEdit: []
  selectModel: [index: number]
  saveModel: [index: number, profile: ModelProfile]
  deleteModel: [index: number]
  'update:reasoningLevel': [level: ReasoningLevel]
}>()

const text = ref('')
const textareaEl = ref<HTMLTextAreaElement>()
const fileInputEl = ref<HTMLInputElement>()
const images = ref<ImageAttachment[]>([])
const contextFiles = ref<ContextAttachment[]>([])
const showCtxMenu = ref(false)
const showSlashCmd = ref(false)
const showReasoningPicker = ref(false)
const slashCommands = ref<SlashCommandItem[]>([])

// Close menu on click outside
import { onMounted, onUnmounted } from 'vue'
let ignoreClick = false
function handleClickOutside(e: MouseEvent) {
  if (ignoreClick) { ignoreClick = false; return }
  const target = e.target as HTMLElement
  // Only close context menu if clicking outside tool buttons and context menu
  if (showCtxMenu.value && !target.closest('.tool-btn') && !target.closest('.ctx-menu')) {
    showCtxMenu.value = false
  }
  // Only close slash panel if clicking outside the panel AND not on textarea
  if (showSlashCmd.value && !target.closest('.slash-panel') && !(target.tagName === 'TEXTAREA')) {
    showSlashCmd.value = false
  }
}
onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

const canSend = computed(() => {
  return text.value.trim() || images.value.length > 0 || contextFiles.value.length > 0
})

const reasoningLabel = computed(() => {
  const labels: Record<string, string> = { low: '低', medium: '中', high: '高' }
  return labels[props.reasoningLevel] || '中'
})

// Listen for file picker, git data, and skills data from extension host
const showGitPicker = ref(false)
const gitChanges = ref<string[]>([])
const gitCommits = ref<Array<{ hash: string; message: string }>>([])
const showSkillsPicker = ref(false)
const skillsList = ref<Array<{ name: string; path: string; description: string }>>([])

onMessage((msg) => {
  if (msg.type === 'filePickerResult') {
    const existing = new Set(contextFiles.value.map(f => f.path))
    for (const f of msg.files) {
      if (!existing.has(f.path)) {
        contextFiles.value.push(f)
      }
    }
  } else if (msg.type === 'gitData') {
    gitChanges.value = msg.changes
    gitCommits.value = msg.commits
    showGitPicker.value = true
  } else if (msg.type === 'skills:pickList') {
    skillsList.value = msg.skills
    showSkillsPicker.value = true
  }
})

watch(() => [props.editRef, props.editContext], ([textVal, ctxVal]) => {
  if (textVal !== undefined || (ctxVal && ctxVal.length > 0)) {
    text.value = textVal || ''
    if (ctxVal && ctxVal.length > 0) {
      contextFiles.value = [...ctxVal]
    }
    setTimeout(() => {
      if (textareaEl.value) {
        textareaEl.value.focus()
        textareaEl.value.setSelectionRange(text.value.length, text.value.length)
      }
    }, 50)
  }
})

function triggerImageUpload() {
  fileInputEl.value?.click()
}

function onInput() {
  autoResize()
  // Detect triggers
  const val = text.value
  if (val === '/') {
    showSlashCmd.value = true
    showCtxMenu.value = false
    loadSlashCommands()
  } else if (val === '@') {
    showCtxMenu.value = true
    showSlashCmd.value = false
  } else {
    // Close panels when trigger character is deleted
    if (showSlashCmd.value && !val.startsWith('/')) {
      showSlashCmd.value = false
    }
    if (showCtxMenu.value && !val.startsWith('@')) {
      showCtxMenu.value = false
    }
  }
}

function loadSlashCommands() {
  slashCommands.value = [
    { name: 'code-review', description: '审查代码质量、Bug、安全和性能问题', category: 'Skills', icon: 'search', color: 'rgba(34,197,94,0.15)', iconColor: '#22c55e', action: 'skill:code-review' },
    { name: 'unit-test', description: '为代码生成单元测试用例', category: 'Skills', icon: 'test', color: 'rgba(59,130,246,0.15)', iconColor: '#3b82f6', action: 'skill:unit-test' },
    { name: 'refactor', description: '重构代码提高可维护性', category: 'Skills', icon: 'code', color: 'rgba(168,85,247,0.15)', iconColor: '#a855f7', action: 'skill:refactor' },
    { name: 'debug', description: '系统化调试和问题定位', category: 'Skills', icon: 'bug', color: 'rgba(239,68,68,0.15)', iconColor: '#ef4444', action: 'skill:debug' },
    { name: 'api-design', description: '设计 RESTful API 接口', category: 'Skills', icon: 'zap', color: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b', action: 'skill:api-design' },
    { name: 'security-audit', description: '安全审计和漏洞检测', category: 'Skills', icon: 'shield', color: 'rgba(239,68,68,0.15)', iconColor: '#ef4444', action: 'skill:security-audit' },
    { name: 'database-design', description: '数据库 Schema 设计和优化', category: 'Skills', icon: 'database', color: 'rgba(20,184,166,0.15)', iconColor: '#14b8a6', action: 'skill:database-design' },
    { name: 'performance', description: '性能分析和优化', category: 'Skills', icon: 'zap', color: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b', action: 'skill:performance' },
    { name: 'git-workflow', description: 'Git 工作流最佳实践', category: 'Skills', icon: 'git', color: 'rgba(99,102,241,0.15)', iconColor: '#818cf8', action: 'skill:git-workflow' },
  ]
}

function onSlashSelect(cmd: SlashCommandItem) {
  showSlashCmd.value = false
  text.value = ''
  // For skill commands, add as context and send
  if (cmd.action.startsWith('skill:')) {
    const skillName = cmd.action.replace('skill:', '')
    const builtinPath = `builtin:${skillName}`
    const existing = contextFiles.value.find(f => f.path === builtinPath)
    if (!existing) {
      contextFiles.value.push({ path: builtinPath, name: cmd.name })
    }
  }
}

function requestContext(source: 'file' | 'folder' | 'doc' | 'skills' | 'terminal' | 'git') {
  showCtxMenu.value = false
  if (source === 'git') {
    send({ type: 'requestContext', source: 'git' })
  } else {
    send({ type: 'requestContext', source })
  }
}

function onGitConfirm(source: 'changes' | 'commits', items: string[]) {
  showGitPicker.value = false
  send({ type: 'gitSelect', source, items })
}

function onSkillsConfirm(paths: string[]) {
  const files = paths.map(p => ({
    path: p,
    name: skillsList.value.find(s => s.path === p)?.name || p.split('/').pop() || '',
  }))
  const existing = new Set(contextFiles.value.map(f => f.path))
  for (const f of files) {
    if (!existing.has(f.path)) {
      contextFiles.value.push(f)
    }
  }
}

function openSkillsManager() {
  showSkillsPicker.value = false
  send({ type: 'skills:openPanel' })
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files) return

  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > 10 * 1024 * 1024) {
      alert('图片大小不能超过 10MB')
      continue
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      images.value.push({
        name: file.name,
        dataUrl,
        mimeType: file.type,
      })
    }
    reader.readAsDataURL(file)
  }

  input.value = ''
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

function removeContext(index: number) {
  contextFiles.value.splice(index, 1)
}

function onSend() {
  const trimmed = text.value.trim()
  if (!trimmed && images.value.length === 0 && contextFiles.value.length === 0) return
  emit('send', trimmed, [...images.value], [...contextFiles.value])
  text.value = ''
  images.value = []
  contextFiles.value = []
  if (textareaEl.value) textareaEl.value.style.height = 'auto'
}

function cancelEdit() {
  text.value = ''
  images.value = []
  contextFiles.value = []
  emit('cancelEdit')
}

function autoResize() {
  if (!textareaEl.value) return
  textareaEl.value.style.height = 'auto'
  textareaEl.value.style.height = Math.min(textareaEl.value.scrollHeight, 200) + 'px'
}
</script>
