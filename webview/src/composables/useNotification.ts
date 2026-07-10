import { ref } from 'vue'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: number
  type: NotificationType
  title?: string
  message: string
  duration?: number
  // Auto-determine display mode based on content
  mode: 'toast' | 'dialog' | 'inline'
}

const notifications = ref<Notification[]>([])
let nextId = 0

/**
 * Determine the best display mode based on message content
 */
function determineMode(type: NotificationType, message: string): 'toast' | 'dialog' | 'inline' {
  // Long errors or warnings need dialog (user must see full content)
  if ((type === 'error' || type === 'warning') && message.length > 60) {
    return 'dialog'
  }
  // Short success/info messages use toast
  if (message.length <= 30) {
    return 'toast'
  }
  // Medium length messages use inline
  return 'inline'
}

export function useNotification() {
  function notify(type: NotificationType, message: string, options?: { title?: string; duration?: number }) {
    const mode = determineMode(type, message)
    const duration = options?.duration ?? (mode === 'toast' ? 3000 : 0)

    const notification: Notification = {
      id: nextId++,
      type,
      title: options?.title,
      message,
      duration,
      mode,
    }

    notifications.value.push(notification)

    // Auto-remove toast after duration
    if (duration > 0) {
      setTimeout(() => {
        remove(notification.id)
      }, duration)
    }

    return notification.id
  }

  function success(message: string, options?: { title?: string; duration?: number }) {
    return notify('success', message, options)
  }

  function error(message: string, options?: { title?: string; duration?: number }) {
    return notify('error', message, options)
  }

  function warning(message: string, options?: { title?: string; duration?: number }) {
    return notify('warning', message, options)
  }

  function info(message: string, options?: { title?: string; duration?: number }) {
    return notify('info', message, options)
  }

  function remove(id: number) {
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx !== -1) {
      notifications.value.splice(idx, 1)
    }
  }

  function clear() {
    notifications.value = []
  }

  return {
    notifications,
    notify,
    success,
    error,
    warning,
    info,
    remove,
    clear,
  }
}
