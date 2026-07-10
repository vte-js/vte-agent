<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="visible" class="confirm-overlay" :style="{ zIndex }" @click.self="cancel">
        <div class="confirm-dialog">
          <div class="confirm-header">
            <svg v-if="type === 'danger'" class="confirm-icon danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <svg v-else-if="type === 'warning'" class="confirm-icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <svg v-else class="confirm-icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span class="confirm-title">{{ title }}</span>
          </div>
          <div class="confirm-body">{{ message }}</div>
          <div class="confirm-actions">
            <button class="confirm-btn cancel" @click="cancel">{{ cancelText }}</button>
            <button class="confirm-btn" :class="type" @click="confirm">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  visible: boolean
  title?: string
  message: string
  type?: 'info' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
  zIndex?: number
}>(), {
  title: '确认',
  type: 'warning',
  confirmText: '确认',
  cancelText: '取消',
  zIndex: 10001,
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function confirm() { emit('confirm') }
function cancel() { emit('cancel') }
</script>

<style scoped>
.confirm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.confirm-dialog {
  width: 380px; max-width: 90vw; padding: 20px;
  border-radius: 12px; background: #1e1e2e;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.confirm-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.confirm-icon { width: 20px; height: 20px; flex-shrink: 0; }
.confirm-icon.danger { color: #ef4444; }
.confirm-icon.warning { color: #f59e0b; }
.confirm-icon.info { color: #3b82f6; }
.confirm-title { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.confirm-body { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 16px; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.confirm-btn {
  padding: 7px 16px; border-radius: 6px; border: none;
  font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.12s;
}
.confirm-btn.cancel { background: rgba(255,255,255,0.06); color: #94a3b8; }
.confirm-btn.cancel:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
.confirm-btn.danger { background: #ef4444; color: #fff; }
.confirm-btn.danger:hover { background: #f87171; }
.confirm-btn.warning { background: #f59e0b; color: #fff; }
.confirm-btn.warning:hover { background: #fbbf24; }
.confirm-btn.info { background: #6366f1; color: #fff; }
.confirm-btn.info:hover { background: #818cf8; }

.confirm-enter-active { transition: opacity 0.2s ease; }
.confirm-leave-active { transition: opacity 0.15s ease; }
.confirm-enter-from, .confirm-leave-to { opacity: 0; }
.confirm-enter-active .confirm-dialog { animation: confirmIn 0.25s ease; }
@keyframes confirmIn { from { transform: translateY(8px) scale(0.97); opacity: 0; } }
</style>
