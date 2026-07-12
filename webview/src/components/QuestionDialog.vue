<template>
  <Teleport to="body">
    <Transition name="question">
      <div v-if="visible" class="question-overlay" @click.self="cancel">
        <div class="question-dialog">
          <div class="question-header">
            <div class="question-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <span class="question-title">需要你的选择</span>
          </div>

          <div class="question-body">
            <div class="question-text">{{ question }}</div>

            <!-- Options -->
            <div v-if="options.length > 0" class="question-options">
              <button
                v-for="opt in options"
                :key="opt.label"
                class="question-option"
                :class="{ selected: selectedLabels.has(opt.label), recommended: recommended === opt.label }"
                @click="toggleOption(opt.label)"
              >
                <span v-if="recommended === opt.label" class="option-badge">推荐</span>
                <span class="option-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="option-desc">{{ opt.description }}</span>
              </button>
            </div>

            <!-- Custom input -->
            <div class="question-custom">
              <div class="custom-label">或输入自定义回答：</div>
              <div class="custom-row">
                <input
                  ref="customInput"
                  v-model="customText"
                  class="question-input"
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

          <div class="question-actions">
            <button class="question-btn skip" @click="skip">跳过，不再询问</button>
            <button class="question-btn cancel" @click="cancel">取消</button>
            <button
              v-if="multiple"
              class="question-btn confirm"
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
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  visible: boolean
  question: string
  options: Array<{ label: string; description?: string }>
  multiple: boolean
  recommended?: string
}>()

const emit = defineEmits<{
  submit: [answer: string]
}>()

const selectedLabels = ref(new Set<string>())
const customText = ref('')
const customInput = ref<HTMLInputElement>()

watch(() => props.visible, (v) => {
  if (v) {
    selectedLabels.value = new Set()
    customText.value = ''
    nextTick(() => customInput.value?.focus())
  }
})

function toggleOption(label: string) {
  if (props.multiple) {
    const s = new Set(selectedLabels.value)
    if (s.has(label)) {
      s.delete(label)
    } else {
      s.add(label)
    }
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
  if (customText.value.trim()) {
    emit('submit', customText.value.trim())
  }
}

function cancel() {
  emit('submit', '')
}

function skip() {
  emit('submit', '__skip__')
}
</script>

<style scoped>
.question-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.question-dialog {
  width: 440px; max-width: 100%;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}
.question-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.question-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(99,102,241,0.12); color: #818cf8;
  flex-shrink: 0;
}
.question-title { font-size: 15px; font-weight: 600; color: #e2e8f0; }

.question-body { padding: 16px 20px; }
.question-text {
  font-size: 14px; color: #e2e8f0; line-height: 1.6;
  margin-bottom: 16px; white-space: pre-wrap;
}

.question-options {
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 14px;
}
.question-option {
  display: flex; flex-direction: column; gap: 2px;
  padding: 12px 14px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  cursor: pointer; transition: all 0.15s;
  text-align: left; position: relative;
}
.question-option:hover {
  background: rgba(99,102,241,0.08);
  border-color: rgba(99,102,241,0.3);
}
.question-option.selected {
  background: rgba(99,102,241,0.15);
  border-color: rgba(99,102,241,0.5);
}
.question-option.recommended {
  border-color: rgba(99,102,241,0.4);
}
.option-badge {
  position: absolute; top: 8px; right: 10px;
  font-size: 10px; font-weight: 500;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(99,102,241,0.2); color: #818cf8;
}
.option-label { font-size: 13px; font-weight: 500; color: #e2e8f0; }
.option-desc { font-size: 11px; color: #64748b; margin-top: 2px; }

.question-custom { margin-top: 4px; }
.custom-label {
  font-size: 12px; color: #64748b; margin-bottom: 6px;
}
.custom-row {
  display: flex; gap: 6px; align-items: center;
}
.question-input {
  flex: 1; padding: 9px 12px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; background: rgba(0,0,0,0.2);
  color: #e2e8f0; font-size: 13px;
  font-family: var(--vscode-font-family, inherit);
  outline: none; transition: border-color 0.15s;
  box-sizing: border-box;
}
.question-input:focus { border-color: rgba(99,102,241,0.5); }
.question-input::placeholder { color: #475569; }
.custom-send {
  width: 34px; height: 34px; border-radius: 8px; border: none;
  background: rgba(99,102,241,0.12); color: #818cf8;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.custom-send:hover:not(:disabled) { background: rgba(99,102,241,0.25); }
.custom-send:disabled { opacity: 0.3; cursor: not-allowed; }

.question-actions {
  display: flex; gap: 8px; padding: 12px 20px 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
  justify-content: flex-end;
}
.question-btn {
  padding: 10px 20px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: all 0.15s;
}
.question-btn.confirm {
  background: #6366f1; color: #fff;
}
.question-btn.confirm:hover { background: #818cf8; }
.question-btn.confirm:disabled {
  background: rgba(99,102,241,0.2); color: #818cf8; cursor: not-allowed;
}
.question-btn.cancel {
  background: rgba(255,255,255,0.06); color: #94a3b8;
}
.question-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.question-btn.skip {
  background: transparent; color: #64748b; font-size: 12px;
  padding: 10px 14px;
}
.question-btn.skip:hover { color: #94a3b8; }

.question-enter-active { transition: opacity 0.2s ease; }
.question-leave-active { transition: opacity 0.15s ease; }
.question-enter-from, .question-leave-to { opacity: 0; }
.question-enter-active .question-dialog { animation: questionIn 0.25s ease; }
@keyframes questionIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
</style>
