<template>
  <div class="inp">
    <div class="inp-box">
      <!-- Image preview area -->
      <div v-if="images.length > 0" class="image-preview">
        <div v-for="(img, idx) in images" :key="idx" class="image-item">
          <img :src="img.dataUrl" :alt="img.name" />
          <button class="image-remove" @click="removeImage(idx)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <!-- Edit reference bar (inside input box) -->
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
        :placeholder="editRef ? '编辑消息...' : '输入消息...'"
        @keydown.enter.exact.prevent="onSend"
        @input="autoResize"
      ></textarea>
      <div class="inp-bar">
        <VTooltip text="添加图片">
          <button class="bar-btn-img" @click="triggerImageUpload">
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
        <ModelSelector
          :models="models"
          :active-index="activeModelIndex"
          @select="$emit('selectModel', $event)"
          @save="(i, p) => $emit('saveModel', i, p)"
          @delete="$emit('deleteModel', $event)"
        />
        <CheckpointBar />
        <div style="flex:1"></div>
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
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TokenStatsData } from './TokenStats'
import type { ModelProfile } from '../composables/useConfig'
import TokenRing from './TokenRing.vue'
import VTooltip from './VTooltip.vue'
import ModelSelector from './ModelSelector.vue'
import CheckpointBar from './CheckpointBar.vue'

export interface ImageAttachment {
  name: string
  dataUrl: string
  mimeType: string
}

const props = defineProps<{
  tokenStats: TokenStatsData
  busy: boolean
  editRef: string
  models: ModelProfile[]
  activeModelIndex: number
}>()

const emit = defineEmits<{
  send: [text: string, images: ImageAttachment[]]
  stop: []
  toggleToken: []
  cancelEdit: []
  selectModel: [index: number]
  saveModel: [index: number, profile: ModelProfile]
  deleteModel: [index: number]
}>()

const text = ref('')
const textareaEl = ref<HTMLTextAreaElement>()
const fileInputEl = ref<HTMLInputElement>()
const images = ref<ImageAttachment[]>([])

const canSend = computed(() => {
  return text.value.trim() || images.value.length > 0
})

watch(() => props.editRef, (val) => {
  if (val) {
    text.value = val
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

  // Reset input
  input.value = ''
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

function onSend() {
  const trimmed = text.value.trim()
  if (!trimmed && images.value.length === 0) return
  emit('send', trimmed, [...images.value])
  text.value = ''
  images.value = []
  if (textareaEl.value) textareaEl.value.style.height = 'auto'
}

function cancelEdit() {
  text.value = ''
  images.value = []
  emit('cancelEdit')
}

function autoResize() {
  if (!textareaEl.value) return
  textareaEl.value.style.height = 'auto'
  textareaEl.value.style.height = Math.min(textareaEl.value.scrollHeight, 200) + 'px'
}
</script>
