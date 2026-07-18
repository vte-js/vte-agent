<template>
  <div class="mt" v-html="renderMarkdown(text)"></div>
  <span v-if="streaming" class="mt-cursor"></span>
</template>

<script setup lang="ts">
import { renderMarkdown } from '../markdown'

defineProps<{
  text: string
  /** True while the message is still being streamed (shows the blinking cursor). */
  streaming?: boolean
}>()
</script>

<style scoped>
/* Base typography only — all markdown child styling (code/pre/headings/
   lists/tables/quotes) lives in theme.css `.mt *` so both agents share it. */
.mt {
  font-size: 12.5px; line-height: 1.6; color: var(--vte-text);
  word-break: break-word;
}

.mt-cursor {
  display: inline-block; width: 2px; height: 14px;
  background: var(--vte-primary, #6366f1); vertical-align: text-bottom;
  margin-left: 1px; animation: mt-blink 1s step-end infinite;
}
@keyframes mt-blink { 50% { opacity: 0; } }
</style>
