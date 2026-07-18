<template>
  <div class="tb">
    <!-- Live "thinking" indicator while the model is still reasoning and no body yet -->
    <div v-if="showLive" class="tb-live">
      <span class="tb-dot"></span>
      <span>思考中</span>
    </div>

    <!-- Collapsible thinking block (shown once body text arrives or reasoning finished) -->
    <button v-if="showToggle" class="tb-toggle" type="button" @click="open = !open">
      <svg :class="{ 'is-open': open }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10">
        <polyline points="9 6 15 12 9 18" />
      </svg>
      <span>{{ finished ? '思考完成' : '思考过程' }}</span>
      <span v-if="duration != null" class="tb-dur">{{ formatDuration(duration) }}</span>
    </button>

    <!-- Body: live while streaming w/o body, or when manually expanded -->
    <div v-if="visibleBody && thinking" class="tb-body">{{ thinking }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatDuration } from '../utils/tool-utils'

const props = defineProps<{
  /** Reasoning / chain-of-thought content. */
  thinking: string
  /** True while the message is still being streamed (drives the live cursor). */
  streaming?: boolean
  /** Whether a body (assistant reply text) is present — controls collapse behavior. */
  hasBody?: boolean
  /** Thinking duration in ms, shown next to the toggle once finished. */
  duration?: number
}>()

const open = ref(false)
const showLive = computed(() => !!props.streaming && !props.hasBody)
const finished = computed(() => !props.streaming || props.duration != null)
const showToggle = computed(() => !!props.thinking && (!!props.hasBody || !props.streaming))
const visibleBody = computed(() => open.value || showLive.value)
</script>

<style scoped>
.tb { font-size: 11px; line-height: 1.5; }

/* Live indicator */
.tb-live {
  display: inline-flex; align-items: center; gap: 5px;
  color: var(--vte-text-muted, #888); margin-bottom: 2px;
}
.tb-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--vte-primary, #6366f1);
  animation: tb-pulse 1.3s ease-in-out infinite;
}
@keyframes tb-pulse { 0%,100% { opacity: .3 } 50% { opacity: 1 } }

/* Toggle button — light, no border/bg */
.tb-toggle {
  display: inline-flex; align-items: center; gap: 3px;
  border: none; background: none; cursor: pointer;
  padding: 1px 0; margin-bottom: 2px;
  font-size: 10px; color: var(--vte-text-muted, #888);
}
.tb-toggle svg { transition: transform .15s; }
.tb-toggle svg.is-open { transform: rotate(90deg); }
.tb-dur {
  margin-left: 6px; font-size: 9px;
  color: var(--vte-text-muted, #666); opacity: .55;
}

/* Body */
.tb-body {
  font-size: 11px; line-height: 1.55; color: var(--vte-text-muted, #888);
  white-space: pre-wrap; word-break: break-word;
  padding: 4px 6px; margin-bottom: 2px;
  border-radius: 4px; background: rgba(127,127,127,.04);
  max-height: 160px; overflow-y: auto;
}
</style>
