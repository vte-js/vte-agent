<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { ChatMessage } from '../protocol'
import VTooltip from '@webview/components/VTooltip.vue'

const props = defineProps<{
  messages: ChatMessage[]
  streaming: boolean
  streamText: string
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'send', text: string): void
  (e: 'clear'): void
}>()

const input = ref('')
const listRef = ref<HTMLElement | null>(null)

function send() {
  const t = input.value.trim()
  if (!t || props.busy) return
  emit('send', t)
  input.value = ''
}

function clear() {
  emit('clear')
}

watch(
  () => [props.messages.length, props.streamText],
  async () => {
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  },
)
</script>

<template>
  <div class="chat-col">
    <div class="ide-pane-header chat-head">
      <span class="ide-pane-header-icon">
        <!-- message-square icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </span>
      主 Agent 对话
      <button class="btn-ghost" @click="clear">清空</button>
    </div>

    <div class="ide-pane-body ide-chat-list" ref="listRef">

      <!-- Messages -->
      <template v-for="m in messages" :key="m.id">
        <!-- User message -->
        <div v-if="m.role === 'user'" class="chat-bubble-user">
          <div class="chat-bubble-role">你</div>
          {{ m.text }}
        </div>

        <!-- Assistant message -->
        <div v-else-if="m.role === 'assistant'" class="chat-bubble-asst">
          <div class="chat-bubble-role">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Agent
          </div>
          <div class="chat-bubble-text">{{ m.text }}</div>
        </div>

        <!-- Error message -->
        <div v-else-if="m.role === 'error'" class="chat-bubble-error">
          <div class="chat-bubble-role">错误</div>
          {{ m.text }}
        </div>
      </template>

      <!-- Streaming response -->
      <div v-if="streaming && streamText" class="chat-bubble-asst">
        <div class="chat-bubble-role">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          Agent
        </div>
        <div class="chat-bubble-text">{{ streamText }}<span class="chat-caret"></span></div>
      </div>

      <!-- Empty state -->
      <div v-if="!messages.length && !streaming" class="chat-empty">
        <div class="chat-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div class="chat-empty-title">开始对话</div>
        <div class="chat-empty-hint">发送一条消息，开始与主 Agent 对话。<br>支持多 Agent 委派、工具调用与上下文共享。</div>
      </div>

    </div>

    <!-- Input area -->
    <div class="chat-input-area">
      <div class="chat-inp-outer">
        <div class="chat-inp-inner">
          <textarea
            v-model="input"
            placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
            :disabled="busy"
            @keydown.enter.exact.prevent="send"
          ></textarea>
        </div>
        <div class="chat-inp-toolbar">
          <span class="chat-inp-spacer"></span>
          <VTooltip text="发送">
            <button class="chat-btn-send" :disabled="busy || !input.trim()" @click="send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </VTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-col {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
/* Fix streaming template reference */
</style>
