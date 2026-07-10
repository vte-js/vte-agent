<template>
  <!-- Toast notifications -->
  <template v-for="n in toastNotifications" :key="n.id">
    <Transition name="toast">
      <div v-if="true" class="vte-toast" :class="n.type">
        <div class="vte-toast-icon">
          <svg v-if="n.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <svg v-else-if="n.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        </div>
        <span class="vte-toast-text">{{ n.message }}</span>
      </div>
    </Transition>
  </template>

  <!-- Dialog notifications -->
  <template v-for="n in dialogNotifications" :key="n.id">
    <AlertDialog
      :visible="true"
      :type="n.type === 'warning' ? 'warning' : n.type === 'error' ? 'error' : 'info'"
      :title="n.title || getDefaultTitle(n.type)"
      :message="n.message"
      @close="remove(n.id)"
    />
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useNotification } from '../composables/useNotification'
import AlertDialog from './AlertDialog.vue'

const { notifications, remove } = useNotification()

const toastNotifications = computed(() =>
  notifications.value.filter(n => n.mode === 'toast')
)

const dialogNotifications = computed(() =>
  notifications.value.filter(n => n.mode === 'dialog')
)

function getDefaultTitle(type: string): string {
  switch (type) {
    case 'error': return '错误'
    case 'warning': return '警告'
    case 'info': return '提示'
    default: return '提示'
  }
}
</script>
