<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="reasoning-overlay" @click.self="$emit('close')">
        <div class="reasoning-dialog">
          <div class="reasoning-dialog-header">
            <span class="reasoning-dialog-title">推理强度</span>
            <span v-if="capabilityHint" class="reasoning-hint">{{ capabilityHint }}</span>
            <button class="reasoning-dialog-close" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="reasoning-options">
            <button
              v-for="opt in opts"
              :key="opt.level"
              class="reasoning-opt"
              :class="[{ selected: modelValue === opt.level }, opt.level ]"
              @click="select(opt.level)"
            >
              <div class="reasoning-opt-icon" :class="opt.level">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" v-html="opt.iconSvg" />
              </div>
              <div class="reasoning-opt-info">
                <span class="reasoning-opt-name">{{ opt.label }}</span>
                <span class="reasoning-opt-desc">{{ opt.desc }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReasoningLevel } from '../protocol'

const props = withDefaults(defineProps<{
  visible: boolean
  modelValue: ReasoningLevel
  /** Active model's API protocol ('chat' | 'responses') — drives display style. */
  apiProtocol?: 'chat' | 'responses'
}>(), {
  apiProtocol: 'chat',
})

const emit = defineEmits<{
  'update:modelValue': [value: ReasoningLevel]
  close: []
}>()

function select(level: ReasoningLevel) {
  emit('update:modelValue', level)
  emit('close')
}

// ── Per-option descriptor ──
interface OptItem {
  level: ReasoningLevel
  label: string
  desc: string
  iconSvg: string
}

/** Hint badge shown in dialog header — driven by API protocol. */
const capabilityHint = computed(() => {
  return props.apiProtocol === 'responses' ? 'OpenAI reasoning_effort' : 'System Prompt 引导'
})

const ICONS: Record<ReasoningLevel, string> = {
  minimal: '<path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/>',
  low:     '<path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/>',
  medium:  '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  high:    '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  xhigh:   '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
}

/** Build option list based on protocol. Responses shows 5 fine-grained steps;
 *  Chat shows 5 steps with generic wording. */
const opts = computed((): OptItem[] => {
  if (props.apiProtocol === 'responses') {
    return [
      { level: 'minimal', label: '极简 — minimal',   desc: 'reasoning_effort=minimal，最小推理，最快响应', iconSvg: ICONS.minimal },
      { level: 'low',     label: '低 — low',           desc: 'reasoning_effort=low，轻量推理，适合简单任务', iconSvg: ICONS.low },
      { level: 'medium',  label: '中 — medium（默认）', desc: 'reasoning_effort=medium，标准推理，平衡速度与质量', iconSvg: ICONS.medium },
      { level: 'high',    label: '高 — high',          desc: 'reasoning_effort=high，深度推理，复杂任务首选', iconSvg: ICONS.high },
      { level: 'xhigh',   label: '极高 — xhigh',        desc: 'reasoning_effort=xhigh，最大推理深度，最高质量', iconSvg: ICONS.xhigh },
    ]
  }
  // Chat completions: generic 5-level.
  return [
    { level: 'minimal', label: '极简 — 最小推理',  desc: '几乎不推理，直接输出，最快响应', iconSvg: ICONS.minimal },
    { level: 'low',     label: '低 — 快速响应',    desc: '轻量引导，直接输出结果', iconSvg: ICONS.low },
    { level: 'medium',  label: '中 — 标准思考',    desc: '标准推理强度，平衡速度与质量', iconSvg: ICONS.medium },
    { level: 'high',    label: '高 — 深度思考',    desc: '强推理指令，更高质量，响应较慢', iconSvg: ICONS.high },
    { level: 'xhigh',   label: '极高 — 极限推理',  desc: '最大推理深度，最高质量输出', iconSvg: ICONS.xhigh },
  ]
})
</script>

<style scoped>
.reasoning-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.reasoning-dialog {
  width: 380px; max-width: 90vw;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}
.reasoning-dialog-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 0; gap: 8px;
}
.reasoning-dialog-title { font-size: 15px; font-weight: 600; color: #e2e8f0; flex-shrink: 0; }
.reasoning-hint {
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  background: rgba(99,102,241,0.12); color: #818cf8;
  white-space: nowrap;
}
.reasoning-dialog-close {
  width: 28px; height: 28px; border: none; background: none; border-radius: 6px;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.reasoning-dialog-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.reasoning-dialog-close svg { width: 14px; height: 14px; }

.reasoning-options {
  display: flex; flex-direction: column; gap: 4px;
  padding: 12px 16px 16px;
}
.reasoning-opt {
  display: flex; align-items: center; gap: 12px;
  width: 100%; padding: 12px; border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,0.06); background: none;
  cursor: pointer; transition: all 0.15s; text-align: left;
}
.reasoning-opt:hover { border-color: rgba(99,102,241,0.3); }
.reasoning-opt.selected { border-color: #6366f1; background: rgba(99,102,241,0.06); }
.reasoning-opt-icon {
  width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.reasoning-opt-icon.minimal { background: rgba(16,185,129,0.12); color: #10b981; }
.reasoning-opt-icon.low { background: rgba(34,197,94,0.12); color: #22c55e; }
.reasoning-opt-icon.medium { background: rgba(245,158,11,0.12); color: #f59e0b; }
.reasoning-opt-icon.high { background: rgba(168,85,247,0.12); color: #a855f7; }
.reasoning-opt-icon.xhigh { background: rgba(239,68,68,0.12); color: #ef4444; }
.reasoning-opt-info { display: flex; flex-direction: column; gap: 2px; }
.reasoning-opt-name { font-size: 13px; font-weight: 500; color: #e2e8f0; }
.reasoning-opt-desc { font-size: 11px; color: #64748b; }

.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .reasoning-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
