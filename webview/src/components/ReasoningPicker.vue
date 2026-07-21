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
            <button class="reasoning-opt" :class="[ { selected: modelValue === 'low' }, 'low' ]" @click="select('low')">
              <div class="reasoning-opt-icon low">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/></svg>
              </div>
              <div class="reasoning-opt-info">
                <span class="reasoning-opt-name">{{ optLow.label }}</span>
                <span class="reasoning-opt-desc">{{ optLow.desc }}</span>
              </div>
            </button>
            <button class="reasoning-opt" :class="[ { selected: modelValue === 'medium' }, 'medium' ]" @click="select('medium')">
              <div class="reasoning-opt-icon medium">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              </div>
              <div class="reasoning-opt-info">
                <span class="reasoning-opt-name">{{ optMedium.label }}</span>
                <span class="reasoning-opt-desc">{{ optMedium.desc }}</span>
              </div>
            </button>
            <button class="reasoning-opt" :class="[ { selected: modelValue === 'high' }, 'high' ]" @click="select('high')">
              <div class="reasoning-opt-icon high">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <div class="reasoning-opt-info">
                <span class="reasoning-opt-name">{{ optHigh.label }}</span>
                <span class="reasoning-opt-desc">{{ optHigh.desc }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { ReasoningLevel, ProviderFamily } from '../protocol'

const props = withDefaults(defineProps<{
  visible: boolean
  modelValue: ReasoningLevel
  /** Whether the active model supports native reasoning (from backend inferCapability). */
  supportsReasoning?: boolean
  /** Inferred provider family — drives label wording. */
  providerFamily?: ProviderFamily
}>(), {
  supportsReasoning: true,
  providerFamily: 'unknown',
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
interface OptDesc { label: string; desc: string }

/** Hint badge shown in dialog header when we know the backend dialect. */
const capabilityHint = computed(() => {
  if (!props.supportsReasoning) return '仅 System Prompt 引导'
  switch (props.providerFamily) {
    case 'openai':   return 'OpenAI reasoning_effort'
    case 'anthropic': return 'Anthropic thinking budget'
    case 'qwen':     return 'Qwen enable_thinking'
    case 'gemini':   return 'Gemini thinking'
    default:         return ''
  }
})

/** Build descriptors based on current model capability + family. */
function makeOpts(): { low: OptDesc; medium: OptDesc; high: OptDesc } {
  const fam = props.providerFamily
  const sr = props.supportsReasoning

  if (!sr) {
    // No native reasoning → explain prompt-level guidance.
    return {
      low:    { label: '低 — 快速响应', desc: '轻量引导，直接输出结果' },
      medium: { label: '中 — 标准思考', desc: 'System Prompt 引导逐步推理，平衡速度与质量' },
      high:   { label: '高 — 深度思考', desc: '强化推理指令，更高质量但响应较慢' },
    }
  }

  switch (fam) {
    case 'openai':
      return {
        low:    { label: '低 — Minimal',   desc: 'reasoning_effort=minimal，最快输出' },
        medium: { label: '中 — Medium（默认）', desc: 'reasoning_effort=medium，平衡速度与深度' },
        high:   { label: '高 — High',       desc: 'reasoning_effort=high，最深推理链路' },
      }
    case 'anthropic':
      return {
        low:    { label: '低 — 轻量思考', desc: '较小 thinking budget，快速回答简单问题' },
        medium: { label: '中 — 标准思考', desc: '标准 thinking budget，平衡速度与质量' },
        high:   { label: '高 — 深度思考', desc: '最大 thinking budget，复杂推理任务首选' },
      }
    case 'qwen':
      return {
        low:    { label: '低 — 关闭思考', desc: '不启用 enable_thinking，直接输出' },
        medium: { label: '中 — 标准思考', desc: '启用思考模式，中等 budget' },
        high:   { label: '高 — 深度思考', desc: '增大 thinking budget，更强推理能力' },
      }
    case 'gemini':
      return {
        low:    { label: '低 — 快速响应', desc: '关闭或最小化 thinking，最快输出' },
        medium: { label: '中 — 标准思考', desc: '启用 thinking，平衡速度与质量' },
        high:   { label: '高 — 深度思考', desc: '最大 thinking budget，深度推理' },
      }
    default:
      return {
        low:    { label: '低 — 快速响应',   desc: '关闭或弱化思考模式，直接输出结果' },
        medium: { label: '中 — 标准思考',   desc: '启用思考模式，平衡速度与输出质量' },
        high:   { label: '高 — 深度思考',   desc: '启用深度思考，更高质量的推理和输出' },
      }
  }
}

const opts = computed(makeOpts)
const optLow = computed(() => opts.value.low)
const optMedium = computed(() => opts.value.medium)
const optHigh = computed(() => opts.value.high)
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
.reasoning-opt-icon.low { background: rgba(34,197,94,0.12); color: #22c55e; }
.reasoning-opt-icon.medium { background: rgba(245,158,11,0.12); color: #f59e0b; }
.reasoning-opt-icon.high { background: rgba(168,85,247,0.12); color: #a855f7; }
.reasoning-opt-info { display: flex; flex-direction: column; gap: 2px; }
.reasoning-opt-name { font-size: 13px; font-weight: 500; color: #e2e8f0; }
.reasoning-opt-desc { font-size: 11px; color: #64748b; }

.modal-enter-active { transition: opacity 0.2s ease; }
.modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .reasoning-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
