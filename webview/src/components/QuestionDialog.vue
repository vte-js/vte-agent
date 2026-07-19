<template>
  <!-- ── Modal mode: fullscreen overlay (VSCode narrow sidebar) ── -->
  <Teleport to="body" v-if="mode === 'modal'">
    <Transition name="question">
      <div v-if="visible" class="q-overlay" @click.self="cancel">
        <div class="q-dialog">
          <!-- Step indicator (modal) -->
          <div v-if="isMultiStep" class="q-steps">
            <template v-for="(s, i) in steps" :key="i">
              <div class="qs-step-item" :class="{ active: i+1 === stepCurrent, done: i+1 < stepCurrent }">
                <span class="qs-dot" :class="{ active: i+1 === stepCurrent, done: i+1 < stepCurrent }">
                  {{ i + 1 }}
                </span>
                <span class="qs-title">{{ s }}</span>
                <span v-if="getStepAnswer(i+1)" class="qs-answer">{{ truncateAnswer(getStepAnswer(i+1)!) }}</span>
              </div>
            </template>
          </div>

          <div class="q-header">
            <div class="q-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <span class="q-title">{{ isMultiStep ? `步骤 ${stepCurrent}/${stepTotal}` : '需要你的选择' }}</span>
          </div>

          <div class="q-body">
            <div class="q-text">{{ question }}</div>

            <div v-if="options.length > 0" class="q-options">
              <button
                v-for="opt in options"
                :key="opt.label"
                class="q-opt"
                :class="{ selected: selectedLabels.has(opt.label), recommended: recommended === opt.label }"
                @click="toggleOption(opt.label)"
              >
                <span v-if="recommended === opt.label" class="opt-badge">推荐</span>
                <span class="opt-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
              </button>
            </div>

            <div class="q-custom">
              <div class="custom-label">或输入自定义回答：</div>
              <div class="custom-row">
                <input
                  ref="customInput"
                  v-model="customText"
                  class="q-input"
                  placeholder="输入自定义回答..."
                  @keydown.enter="submitCustom"
                />
                <button class="custom-send" @click="submitCustom" :disabled="!customText.trim()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div class="q-actions">
            <button v-if="isMultiStep && stepCurrent > 1" class="q-btn back" @click="$emit('back')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
              上一步
            </button>
            <div class="q-actions-spacer"></div>
            <button class="q-btn skip" @click="skip">跳过，不再询问</button>
            <button class="q-btn cancel" @click="cancel">取消</button>
            <button
              v-if="multiple"
              class="q-btn confirm"
              :disabled="selectedLabels.size === 0 && !customText.trim()"
              @click="submitSelection"
            >
              确认选择{{ selectedLabels.size > 0 ? ` (${selectedLabels.size})` : '' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Bottom Sheet mode: fixed at screen bottom (web-ide / full-screen hosts) ── -->
  <!-- NOTE: In session-based multi-step, this stays visible across steps.
       The parent controls visibility via `visible` prop; when step advances,
       props update and content swaps in-place without closing. -->
  <Teleport to="body" v-else-if="(mode === 'inline' || mode === 'bottom') && visible">
    <Transition name="q-bottom">
      <div class="q-bs-overlay" @click.self="cancel">
        <div class="q-bottom-sheet" :class="{ 'qb-transitioning': isTransitioning }">
          <!-- Step indicator — progress bar style with answers -->
          <div v-if="isMultiStep" class="qbs-steps">
            <div class="qbs-progress">
              <div
                v-for="(s, i) in steps"
                :key="i"
                class="qbs-step"
                :class="{ active: i+1 === stepCurrent, done: i+1 < stepCurrent }"
              >
                <span class="qbs-num">{{ i + 1 }}</span>
                <span class="qbs-label">{{ s }}</span>
                <span v-if="getStepAnswer(i+1)" class="qbs-answer" :title="getStepAnswer(i+1)">
                  {{ truncateAnswer(getStepAnswer(i+1)!) }}
                </span>
              </div>
            </div>
          </div>

          <div class="qb-handle"><span></span></div>

          <!-- Transition overlay: shown briefly between steps -->
          <div v-if="isTransitioning" class="qb-transition">
            <div class="qbt-spinner"></div>
            <span>下一步…</span>
          </div>

          <template v-else>
            <div class="qb-header">
              <svg class="qb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span class="qb-title">提问</span>
              <span v-if="isMultiStep" class="qb-step-badge">{{ stepCurrent }}/{{ stepTotal }}</span>
              <span class="qb-q">{{ question }}</span>
            </div>

            <!-- Vertical list options -->
            <div v-if="options.length > 0" class="qb-list">
              <button
                v-for="opt in options"
                :key="opt.label + '_' + stepCurrent"
                class="qb-opt-row"
                :class="{ active: selectedLabels.has(opt.label), rec: recommended === opt.label }"
                @click="toggleOption(opt.label)"
              >
                <span class="qbor-check">
                  <svg v-if="!multiple || selectedLabels.has(opt.label)" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline v-if="!multiple || selectedLabels.has(opt.label)" points="2 8 6 12 14 4"/>
                  </svg>
                </span>
                <div class="qbor-body">
                  <span class="qbor-label">{{ opt.label }}</span>
                  <span v-if="opt.description" class="qbor-desc">{{ opt.description }}</span>
                </div>
                <span v-if="recommended === opt.label" class="qbor-rec">推荐</span>
              </button>
            </div>

            <div class="qb-footer">
              <div class="qb-custom">
                <input
                  ref="customInputInline"
                  v-model="customText"
                  class="qb-input"
                  placeholder="或输入自定义回答…"
                  @keydown.enter="submitCustom"
                />
                <button class="qb-send" @click="submitCustom" :disabled="!customText.trim()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
              <div class="qb-actions">
                <button v-if="isMultiStep && stepCurrent > 1" class="qba-back" @click="$emit('back')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
                  上一步
                </button>
                <div class="qb-actions-spacer"></div>
                <button class="qba-skip" @click="skip">跳过</button>
                <button v-if="multiple" class="qba-confirm" :disabled="selectedLabels.size === 0 && !customText.trim()" @click="submitSelection">
                  确认{{ selectedLabels.size > 0 ? ` (${selectedLabels.size})` : '' }}
                </button>
                <button class="qba-cancel" @click="cancel">取消</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'

const props = withDefaults(defineProps<{
  visible: boolean
  question: string
  options: Array<{ label: string; description?: string }>
  multiple: boolean
  recommended?: string
  /** Display mode */
  mode?: 'modal' | 'inline' | 'bottom'
  /** Multi-step: current step number (1-based) */
  stepCurrent?: number
  /** Multi-step: total number of steps */
  stepTotal?: number
  /** Multi-step: labels/titles for each step */
  steps?: string[]
  /** Multi-step: answers from previous steps [{step, answer}] */
  stepAnswers?: Array<{ step: number; answer: string }>
}>(), {
  mode: 'modal',
  stepCurrent: 1,
  stepTotal: 1,
  steps: () => [],
  stepAnswers: () => [],
})

const emit = defineEmits<{
  submit: [answer: string]
  back: []
}>()

/** Is this part of a multi-step flow? */
const isMultiStep = computed(() => (props.stepTotal ?? 1) > 1)

/** Get answer text for a specific step number (1-based) */
function getStepAnswer(stepNum: number): string | undefined {
  return props.stepAnswers?.find(a => a.step === stepNum)?.answer
}

/** Truncate answer for display */
function truncateAnswer(ans: string, maxLen = 20): string {
  return ans.length > maxLen ? ans.substring(0, maxLen) + '…' : ans
}

const selectedLabels = ref(new Set<string>())
const customText = ref('')
const customInput = ref<HTMLInputElement>()
const customInputInline = ref<HTMLInputElement>()
/** Brief transition state between multi-step advances */
const isTransitioning = ref(false)

// Reset selection when question content changes (new step arrived)
watch([() => props.question, () => props.options, () => props.stepCurrent], () => {
  if (props.visible) {
    selectedLabels.value = new Set()
    customText.value = ''
    nextTick(() => {
      if (props.mode !== 'modal') {
        customInputInline.value?.focus()
      } else {
        customInput.value?.focus()
      }
    })
  }
})

// When dialog opens, reset state
watch(() => props.visible, (v) => {
  if (v) {
    selectedLabels.value = new Set()
    customText.value = ''
    isTransitioning.value = false
    nextTick(() => {
      if (props.mode === 'modal') {
        customInput.value?.focus()
      } else {
        customInputInline.value?.focus()
      }
    })
  }
})

function toggleOption(label: string) {
  if (props.multiple) {
    const s = new Set(selectedLabels.value)
    if (s.has(label)) { s.delete(label) } else { s.add(label) }
    selectedLabels.value = s
  } else {
    emit('submit', label)
  }
}

function submitSelection() {
  if (customText.value.trim()) {
    emit('submit', customText.value.trim())
  } else if (selectedLabels.value.size > 0) {
    emit('submit', Array.from(selectedLabels.value).join(', '))
  }
}

function submitCustom() {
  if (customText.value.trim()) emit('submit', customText.value.trim())
}

function cancel() { emit('submit', '') }

function skip() { emit('submit', '__skip__') }
</script>

<style scoped>
/* ═══════════════════════ Modal mode ═══════════════════════ */
.q-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.q-dialog {
  width: 440px; max-width: 100%;
  background: var(--vte-bg, #1e1e2e); border: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}
.q-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--vte-border, rgba(255,255,255,0.06));
}
.q-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(99,102,241,0.12); color: #818cf8; flex-shrink: 0;
}
.q-title { font-size: 15px; font-weight: 600; color: var(--vte-text, #e2e8f0); }

/* Step dots (modal) — with answers */
.q-steps {
  display: flex; justify-content: center; gap: 6px;
  padding: 12px 20px 0; flex-wrap: wrap;
}
.qs-step-item {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid transparent;
  transition: all 0.2s;
}
.qs-step-item.active {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.2);
}
.qs-step-item.done {
  opacity: 0.8;
}
.qs-dot {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
  background: rgba(255,255,255,0.06); color: var(--vte-text-muted, #64748b);
  border: 1.5px solid var(--vte-border, rgba(255,255,255,0.1));
  transition: all 0.2s; flex-shrink: 0;
}
.qs-dot.active {
  background: rgba(99,102,241,0.2); color: #818cf8;
  border-color: rgba(99,102,241,0.5);
}
.qs-dot.done {
  background: #6366f1; color: #fff; border-color: #6366f1;
}
.qs-title {
  font-size: 11px; font-weight: 600;
  color: var(--vte-text-muted, #64748b);
  white-space: nowrap;
}
.qs-step-item.active .qs-title { color: var(--vte-text, #c4c9d4); }
.qs-step-item.done .qs-title { color: var(--vte-text-muted, #94a3b8); }
.qs-answer {
  font-size: 10px; font-weight: 500;
  padding: 1px 7px; border-radius: 4px;
  background: rgba(34,197,94,0.12); color: #4ade80;
  white-space: nowrap; max-width: 90px;
  overflow: hidden; text-overflow: ellipsis;
}

.q-body { padding: 16px 20px; }
.q-text {
  font-size: 14px; color: var(--vte-text, #e2e8f0); line-height: 1.6;
  margin-bottom: 16px; white-space: pre-wrap;
}

/* Options — vertical list */
.q-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.q-opt {
  display: flex; flex-direction: column; gap: 2px;
  padding: 12px 14px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--vte-border, rgba(255,255,255,0.06));
  cursor: pointer; transition: all 0.15s;
  text-align: left; position: relative;
}
.q-opt:hover { background: rgba(99,102,241,0.08); border-color: rgba(99,102,241,0.3); }
.q-opt.selected { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.5); }
.q-opt.recommended { border-color: rgba(99,102,241,0.4); }
.opt-badge {
  position: absolute; top: 8px; right: 10px;
  font-size: 10px; font-weight: 500;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(99,102,241,0.2); color: #818cf8;
}
.opt-label { font-size: 13px; font-weight: 500; color: var(--vte-text, #e2e8f0); }
.opt-desc { font-size: 11px; color: var(--vte-text-muted, #64748b); margin-top: 2px; }

.q-custom { margin-top: 4px; }
.custom-label { font-size: 12px; color: var(--vte-text-muted, #64748b); margin-bottom: 6px; }
.custom-row { display: flex; gap: 6px; align-items: center; }
.q-input {
  flex: 1; padding: 9px 12px;
  border: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  border-radius: 8px; background: rgba(0,0,0,0.2);
  color: var(--vte-text, #e2e8f0); font-size: 13px;
  font-family: var(--vscode-font-family, inherit);
  outline: none; transition: border-color 0.15s; box-sizing: border-box;
}
.q-input:focus { border-color: rgba(99,102,241,0.5); }
.q-input::placeholder { color: var(--vte-text-muted, #475569); }
.custom-send {
  width: 34px; height: 34px; border-radius: 8px; border: none;
  background: rgba(99,102,241,0.12); color: #818cf8;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.custom-send:hover:not(:disabled) { background: rgba(99,102,241,0.25); }
.custom-send:disabled { opacity: 0.3; cursor: not-allowed; }

.q-actions {
  display: flex; gap: 8px; padding: 12px 20px 16px;
  border-top: 1px solid var(--vte-border, rgba(255,255,255,0.06));
  justify-content: flex-end;
  align-items: center;
}
.q-actions-spacer { flex: 1; }
.q-btn {
  padding: 10px 20px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; gap: 6px;
}
.q-btn.confirm { background: #6366f1; color: #fff; }
.q-btn.confirm:hover { background: #818cf8; }
.q-btn.confirm:disabled { background: rgba(99,102,241,0.2); color: #818cf8; cursor: not-allowed; }
.q-btn.cancel { background: rgba(255,255,255,0.06); color: var(--vtext-muted, #94a3b8); }
.q-btn.cancel:hover { background: rgba(255,255,255,0.1); color: var(--vte-text, #e2e8f0); }
.q-btn.skip { background: transparent; color: var(--vte-text-muted, #64748b); font-size: 12px; padding: 10px 14px; }
.q-btn.skip:hover { color: var(--vte-text-muted, #94a3b8); }
.q-btn.back {
  background: rgba(255,255,255,0.05); color: var(--vte-text-muted, #94a3b8);
  padding: 10px 16px; font-size: 12px;
}
.q-btn.back:hover { background: rgba(255,255,255,0.1); color: var(--vte-text, #e2e8f0); }

.question-enter-active { transition: opacity 0.2s ease; }
.question-leave-active { transition: opacity 0.15s ease; }
.question-enter-from, .question-leave-to { opacity: 0; }
.question-enter-active .q-dialog { animation: qIn 0.25s ease; }
@keyframes qIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }


/* ═══════════════════════ Bottom Sheet mode ═══════════════════════ */

.q-bs-overlay {
  position: fixed; inset: 0; z-index: 10000;
  display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,0.35);
}

/* Step bar */
.qbs-steps {
  padding: 0 16px 0; flex-shrink: 0;
}
.qbs-progress {
  display: flex; align-items: center; gap: 0;
  overflow-x: auto;
}
.qbs-step {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px 6px 0;
  white-space: nowrap;
  opacity: 0.45; transition: opacity 0.2s;
}
.qbs-step:not(:last-child)::after {
  content: '';
  display: block; width: 20px; height: 1.5px;
  background: currentColor; opacity: 0.25; margin-right: 8px;
  flex-shrink: 0;
}
.qbs-step:last-of-type { padding-right: 12px; }
.qbs-step.active { opacity: 1; }
.qbs-step.done { opacity: 0.7; }
.qbs-num {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 800;
  background: rgba(255,255,255,0.1); color: var(--vte-text-muted, #6b7280);
  border: 1.5px solid var(--vte-border, rgba(255,255,255,0.12));
  flex-shrink: 0;
}
.qbs-step.active .qbs-num {
  background: rgba(99,102,241,0.18); color: #818cf8;
  border-color: rgba(99,102,241,0.5);
}
.qbs-step.done .qbs-num {
  background: #6366f1; color: #fff; border-color: #6366f1;
}
.qbs-label {
  font-size: 11px; font-weight: 600; color: var(--vte-text, #c4c9d4);
}
.qbs-step.active .qbs-label { color: var(--vte-text, #e2e8f0); }
.qbs-answer {
  font-size: 10px; font-weight: 500;
  padding: 0 6px; border-radius: 4px;
  background: rgba(34,197,94,0.12); color: #4ade80;
  white-space: nowrap; max-width: 80px;
  overflow: hidden; text-overflow: ellipsis;
}

/* Main panel */
.q-bottom-sheet {
  width: 100%; max-width: 720px;
  max-height: 65vh;
  display: flex;
  flex-direction: column;
  background: var(--vte-bg-elevated, var(--vte-bg, #181825));
  border: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -12px 48px rgba(0,0,0,0.45);
  overflow-y: auto;
  animation: qbSlideUp 0.32s cubic-bezier(.22,1,.36,1);
  flex-shrink: 0;
}
@keyframes qbSlideUp {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

/* Drag handle */
.qb-handle {
  display: flex; justify-content: center; padding: 10px 0 4px; flex-shrink: 0;
}
.qb-handle span {
  width: 36px; height: 3.5px; border-radius: 2px;
  background: var(--vte-border, rgba(255,255,255,0.15));
}

/* Header */
.qb-header {
  display: flex; align-items: center; gap: 8px;
  padding: 2px 16px 10px; flex-shrink: 0;
  flex-wrap: wrap;
}
.qb-icon {
  flex-shrink: 0; color: #818cf8;
  background: rgba(99,102,241,0.1); border-radius: 6px;
  padding: 4px;
}
.qb-title {
  font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: #818cf8;
  background: rgba(99,102,241,0.08); padding: 2px 8px; border-radius: 4px;
  white-space: nowrap;
}
.qb-step-badge {
  font-size: 11px; font-weight: 700;
  padding: 1px 8px; border-radius: 10px;
  background: rgba(99,102,241,0.15); color: #a5b4fc;
  white-space: nowrap;
}
.qb-q {
  font-size: 14px; color: var(--vte-text, #e2e8f0);
  line-height: 1.5; flex: 1; min-width: 0;
  white-space: pre-wrap; word-break: break-word;
}

/* Options — vertical list */
.qb-list {
  display: flex; flex-direction: column; gap: 4px;
  padding: 0 12px 6px;
}
.qb-opt-row {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 10px;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--vte-border, rgba(255,255,255,0.05));
  cursor: pointer; transition: all 0.15s; text-align: left;
  position: relative;
}
.qb-opt-row:hover { background: rgba(99,102,241,0.07); border-color: rgba(99,102,241,0.22); }
.qb-opt-row.active {
  background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.4);
}
.qb-opt-row.rec {
  border-left: 3px solid #818cf8;
  padding-left: 11px;
}

/* Checkbox circle */
.qbor-check {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1.5px solid var(--vte-border, rgba(255,255,255,0.15));
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  color: transparent; transition: all 0.15s;
}
.qb-opt-row.active .qbor-check {
  border-color: #818cf8;
  background: rgba(99,102,241,0.15);
  color: #818cf8;
}
.qbor-body {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
}
.qbor-label { font-size: 13.5px; font-weight: 600; color: var(--vte-text, #e2e8f0); }
.qbor-desc { font-size: 11.5px; color: var(--vte-text-muted, #64748b); line-height: 1.35; }
.qbor-rec {
  font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 4px;
  background: rgba(99,102,241,0.18); color: #a5b4fc;
  flex-shrink: 0; white-space: nowrap;
}

/* Footer */
.qb-footer {
  padding: 8px 16px 14px;
  border-top: 1px solid var(--vte-border, rgba(255,255,255,0.05));
  flex-shrink: 0;
}
.qb-custom {
  display: flex; gap: 6px; align-items: center; margin-bottom: 8px;
}
.qb-input {
  flex: 1; padding: 9px 12px;
  border: 1px solid var(--vte-border, rgba(255,255,255,0.08));
  border-radius: 8px; background: rgba(0,0,0,0.2);
  color: var(--vte-text, #e2e8f0); font-size: 13px;
  outline: none; transition: border-color 0.15s; box-sizing: border-box;
  font-family: var(--vscode-font-family, inherit);
}
.qb-input:focus { border-color: rgba(99,102,241,0.45); }
.qb-input::placeholder { color: var(--vte-text-muted, #475569); }
.qb-send {
  width: 34px; height: 34px; border-radius: 8px; border: none;
  background: rgba(99,102,241,0.12); color: #818cf8;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.qb-send:hover:not(:disabled) { background: rgba(99,102,241,0.25); }
.qb-send:disabled { opacity: 0.3; cursor: not-allowed; }

.qb-actions {
  display: flex; gap: 6px; justify-content: flex-end;
  align-items: center;
}
.qb-actions-spacer { flex: 1; }
.qba-back {
  padding: 6px 14px; border-radius: 6px; border: none;
  background: rgba(255,255,255,0.05); color: var(--vte-text-muted, #94a3b8);
  font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;
  transition: all 0.15s;
}
.qba-back:hover { background: rgba(255,255,255,0.1); color: var(--vte-text, #e2e8f0); }
.qba-skip {
  padding: 5px 14px; border-radius: 6px; border: none; background: transparent;
  font-size: 12px; color: var(--vte-text-muted, #64748b); cursor: pointer;
}
.qba-skip:hover { color: var(--vte-text-muted, #94a3b8); }
.qba-confirm {
  padding: 6px 16px; border-radius: 6px; border: none; background: #6366f1; color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.qba-confirm:hover { background: #818cf8; }
.qba-confirm:disabled { opacity: 0.35; cursor: not-allowed; }
.qba-cancel {
  padding: 6px 14px; border-radius: 6px; border: none; background: rgba(255,255,255,0.05);
  color: var(--vte-text-muted, #94a3b8); font-size: 12px; cursor: pointer;
}
.qba-cancel:hover { background: rgba(255,255,255,0.09); color: var(--vte-text, #e2e8f0); }

/* ── Step transition overlay ── */
.qb-transition {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 40px 20px; color: var(--vte-text-muted, #64748b);
  font-size: 13px;
}
.qbt-spinner {
  width: 28px; height: 28px;
  border: 2.5px solid rgba(99,102,241,0.15);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: qbtSpin 0.6s linear infinite;
}
@keyframes qbtSpin { to { transform: rotate(360deg); } }

/* When transitioning, dim the panel slightly */
.q-bottom-sheet.qb-transitioning {
  opacity: 0.85;
}

/* Transitions */
.q-bottom-enter-active { transition: all 0.32s cubic-bezier(.22,1,.36,1); }
.q-bottom-leave-active { transition: all 0.2s ease-in; }
.q-bottom-enter-from { transform: translateY(100%); opacity: 0; }
.q-bottom-leave-to { transform: translateY(100%); opacity: 0; }
</style>
