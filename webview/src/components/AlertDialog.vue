<template>
  <Transition name="dialog">
    <div v-if="visible" class="alert-overlay" @click.self="$emit('close')">
      <div class="alert-dialog">
        <div class="alert-header">
          <div class="alert-icon" :class="type">
            <svg v-if="type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <svg v-else-if="type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </div>
          <span class="alert-title">{{ title }}</span>
        </div>
        <div class="alert-body">
          <div class="alert-message">{{ message }}</div>
        </div>
        <div class="alert-footer">
          <button class="alert-btn" @click="$emit('close')">确定</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  type?: 'error' | 'warning' | 'info'
  title: string
  message: string
}>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.alert-overlay {
  position: fixed; inset: 0; z-index: 2147483647;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}

.alert-dialog {
  width: 100%; max-width: 420px;
  background: var(--vte-bg-elevated, #252526);
  border: 1px solid var(--vte-border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.alert-header {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 20px 0;
}

.alert-icon {
  width: 40px; height: 40px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.alert-icon svg { width: 22px; height: 22px; }

.alert-icon.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}
.alert-icon.warning {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}
.alert-icon.info {
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
}

.alert-title {
  font-size: 15px; font-weight: 600; color: var(--vte-text);
}

.alert-body {
  padding: 16px 20px;
}

.alert-message {
  font-size: 13px; color: var(--vte-text-muted); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow-y: auto;
}

.alert-footer {
  padding: 12px 20px 16px;
  display: flex; justify-content: flex-end;
}

.alert-btn {
  padding: 8px 20px; border-radius: 8px; border: none;
  background: var(--vte-primary, #6366f1); color: #fff;
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: opacity 0.15s;
}
.alert-btn:hover { opacity: 0.9; }

/* Transition */
.dialog-enter-active { transition: opacity 0.2s ease; }
.dialog-leave-active { transition: opacity 0.15s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
.dialog-enter-active .alert-dialog { animation: dialogIn 0.25s ease; }
@keyframes dialogIn {
  from { transform: translateY(12px) scale(0.97); opacity: 0; }
}
</style>
