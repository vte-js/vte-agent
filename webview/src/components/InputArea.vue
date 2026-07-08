<template>
  <div class="inp">
    <div class="inp-box">
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
        <div style="flex:1"></div>
        <TokenRing :cost="tokenStats.totalCost" @toggle="$emit('toggleToken')" />
        <VTooltip v-if="!busy" text="发送消息">
          <button class="bar-btn-send" :disabled="!text.trim()" @click="onSend">
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
import { ref, watch } from 'vue'
import type { TokenStatsData } from './TokenStats'
import TokenRing from './TokenRing.vue'
import VTooltip from './VTooltip.vue'

const props = defineProps<{
  tokenStats: TokenStatsData
  busy: boolean
  editRef: string
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  toggleToken: []
  cancelEdit: []
}>()

const text = ref('')
const textareaEl = ref<HTMLTextAreaElement>()

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

function onSend() {
  const trimmed = text.value.trim()
  if (!trimmed) return
  emit('send', trimmed)
  text.value = ''
  if (textareaEl.value) textareaEl.value.style.height = 'auto'
}

function cancelEdit() {
  text.value = ''
  emit('cancelEdit')
}

function autoResize() {
  if (!textareaEl.value) return
  textareaEl.value.style.height = 'auto'
  textareaEl.value.style.height = Math.min(textareaEl.value.scrollHeight, 200) + 'px'
}
</script>
