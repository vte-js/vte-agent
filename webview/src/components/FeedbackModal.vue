<template>
  <Teleport to="body">
    <Transition name="fb-modal">
      <div v-if="visible" class="fb-overlay" @click.self="$emit('close')">
        <div class="fb-dialog">
          <div class="fb-header">
            <span class="fb-title">反馈问题</span>
            <button class="fb-close" @click="$emit('close')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="fb-body">
            <p class="fb-desc">哪里不好？选择或输入原因帮助改进：</p>
            <div class="fb-tags">
              <button
                v-for="tag in tags"
                :key="tag"
                class="fb-tag"
                :class="{ selected: selectedTag === tag }"
                @click="selectedTag = selectedTag === tag ? null : tag"
              >{{ tag }}</button>
            </div>
            <textarea
              ref="textarea"
              v-model="comment"
              class="fb-textarea"
              placeholder="补充说明（可选）..."
              rows="3"
            ></textarea>
          </div>
          <div class="fb-footer">
            <button class="fb-btn-cancel" @click="$emit('close')">取消</button>
            <button class="fb-btn-submit" :disabled="!selectedTag && !comment.trim()" @click="submit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              提交反馈
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
}>()

const emit = defineEmits<{
  close: []
  submit: [comment: string]
}>()

const tags = ['太啰嗦', '代码有误', '没理解意图', '格式不好', '缺少细节', '答非所问']
const selectedTag = ref<string | null>(null)
const comment = ref('')
const textarea = ref<HTMLTextAreaElement>()

watch(() => props.visible, (v) => {
  if (v) {
    selectedTag.value = null
    comment.value = ''
    nextTick(() => textarea.value?.focus())
  }
})

function submit() {
  const parts = [selectedTag.value, comment.value.trim()].filter(Boolean)
  emit('submit', parts.join('：'))
}
</script>

<style scoped>
.fb-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}

.fb-dialog {
  width: 400px; max-width: 90vw; border-radius: 14px;
  background: #1e1e2e; border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
  overflow: hidden;
}

.fb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 0;
}

.fb-title {
  font-size: 14px; font-weight: 600; color: #e2e8f0;
}

.fb-close {
  width: 28px; height: 28px; border: none; background: none;
  border-radius: 6px; color: #64748b; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.fb-close:hover { background: rgba(255,255,255,0.08); color: #e2e8f0; }
.fb-close svg { width: 14px; height: 14px; }

.fb-body { padding: 12px 20px; }

.fb-desc {
  font-size: 12px; color: #94a3b8; margin: 0 0 12px;
}

.fb-tags {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
}

.fb-tag {
  padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: #94a3b8; font-size: 12px;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.fb-tag:hover { border-color: rgba(239,68,68,0.3); color: #e2e8f0; }
.fb-tag.selected {
  border-color: #ef4444; background: rgba(239,68,68,0.12); color: #fca5a5;
}

.fb-textarea {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2);
  color: #e2e8f0; font-size: 13px; font-family: inherit;
  resize: vertical; outline: none; box-sizing: border-box;
  transition: border-color 0.15s;
}
.fb-textarea:focus { border-color: #ef4444; }
.fb-textarea::placeholder { color: #475569; }

.fb-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px 16px;
}

.fb-btn-cancel {
  padding: 7px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
  background: none; color: #94a3b8; font-size: 13px; cursor: pointer;
  transition: all 0.12s;
}
.fb-btn-cancel:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }

.fb-btn-submit {
  padding: 7px 16px; border-radius: 8px; border: none;
  background: #ef4444; color: #fff; font-size: 13px; font-weight: 500;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
  transition: all 0.12s;
}
.fb-btn-submit:hover { background: #dc2626; }
.fb-btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }
.fb-btn-submit svg { width: 13px; height: 13px; }

/* Transition */
.fb-modal-enter-active { transition: opacity 0.2s ease; }
.fb-modal-leave-active { transition: opacity 0.15s ease; }
.fb-modal-enter-from, .fb-modal-leave-to { opacity: 0; }
.fb-modal-enter-active .fb-dialog { animation: fbSlideIn 0.25s ease; }
.fb-modal-leave-active .fb-dialog { animation: fbSlideOut 0.15s ease; }
@keyframes fbSlideIn { from { transform: translateY(12px) scale(0.97); opacity: 0; } }
@keyframes fbSlideOut { to { transform: translateY(8px) scale(0.97); opacity: 0; } }
</style>
