import { ref } from 'vue'
import { useVsCode } from './useVsCode'

export interface SessionMeta {
  id: string
  name: string
  summary?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  messageCount: number
  model: string
  tokenUsage: { prompt: number; completion: number }
  thumbnail?: string
}

export interface SessionData {
  metadata: SessionMeta
  messages: Array<{
    id: number
    role: 'user' | 'assistant' | 'error'
    text: string
    timestamp: string
  }>
}

export function useSession() {
  const { send, onMessage } = useVsCode()

  const sessions = ref<SessionMeta[]>([])
  const currentSession = ref<SessionData | null>(null)
  const loading = ref(false)
  const error = ref('')
  const successMessage = ref('')

  onMessage((msg) => {
    if (msg.type === 'session:list') {
      sessions.value = msg.sessions
    } else if (msg.type === 'session:created') {
      sessions.value.unshift(msg.session)
      currentSession.value = { metadata: msg.session, messages: [] }
      successMessage.value = '会话已创建'
      setTimeout(() => successMessage.value = '', 2000)
    } else if (msg.type === 'session:data') {
      currentSession.value = msg.session
    } else if (msg.type === 'session:restored') {
      successMessage.value = '会话已恢复'
      setTimeout(() => successMessage.value = '', 2000)
    } else if (msg.type === 'session:deleted') {
      sessions.value = sessions.value.filter(s => s.id !== msg.sessionId)
      if (currentSession.value?.metadata.id === msg.sessionId) {
        currentSession.value = null
      }
      successMessage.value = '会话已删除'
      setTimeout(() => successMessage.value = '', 2000)
    } else if (msg.type === 'session:renamed') {
      const session = sessions.value.find(s => s.id === msg.sessionId)
      if (session) session.name = msg.name
    } else if (msg.type === 'session:tagged') {
      const session = sessions.value.find(s => s.id === msg.sessionId)
      if (session) session.tags = msg.tags
    } else if (msg.type === 'session:searchResult') {
      sessions.value = msg.sessions
    } else if (msg.type === 'session:exported') {
      // Download as file
      const blob = new Blob([msg.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${msg.sessionId}.json`
      a.click()
      URL.revokeObjectURL(url)
      successMessage.value = '会话已导出'
      setTimeout(() => successMessage.value = '', 2000)
    } else if (msg.type === 'session:imported') {
      sessions.value.unshift(msg.session)
      successMessage.value = '会话已导入'
      setTimeout(() => successMessage.value = '', 2000)
    } else if (msg.type === 'session:error') {
      error.value = msg.text
      setTimeout(() => error.value = '', 3000)
    }
  })

  function createSession(name?: string) {
    send({ type: 'session:create', name })
  }

  function listSessions() {
    send({ type: 'session:list' })
  }

  function getSession(sessionId: string) {
    send({ type: 'session:get', sessionId })
  }

  function restoreSession(sessionId: string) {
    send({ type: 'session:restore', sessionId })
  }

  function deleteSession(sessionId: string) {
    send({ type: 'session:delete', sessionId })
  }

  function renameSession(sessionId: string, name: string) {
    send({ type: 'session:rename', sessionId, name })
  }

  function tagSession(sessionId: string, tags: string[]) {
    send({ type: 'session:tag', sessionId, tags })
  }

  function searchSessions(query: string) {
    send({ type: 'session:search', query })
  }

  function exportSession(sessionId: string) {
    send({ type: 'session:export', sessionId })
  }

  function importSession(data: string) {
    send({ type: 'session:import', data })
  }

  return {
    sessions,
    currentSession,
    loading,
    error,
    successMessage,
    createSession,
    listSessions,
    getSession,
    restoreSession,
    deleteSession,
    renameSession,
    tagSession,
    searchSessions,
    exportSession,
    importSession,
  }
}
