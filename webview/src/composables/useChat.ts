import { ref, watch } from 'vue'
import { useVsCode } from './useVsCode'
import type { TokenStatsData } from '../components/TokenStats'
import type { ImageAttachment, ContextAttachment } from '../protocol'

export interface Task {
  id: number
  title: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  subtasks?: number[]
}

export interface ToolCallEvent {
  id: string
  name: string
  arguments: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
  result?: string
  elapsed?: number
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
  timestamp: string
  streaming?: boolean
  thinkingPhase?: boolean
  thinkingText?: string
  thinkingDuration?: number
  toolCalls?: ToolCallEvent[]
  images?: ImageAttachment[]
  context?: ContextAttachment[]
  tasks?: Task[]
}

export interface TaskSnapshotMessage {
  id: number
  type: 'task_snapshot'
  tasks: Task[]
}

export type FlowMessage = ChatMessage | TaskSnapshotMessage

let nextId = 0

export function useChat(mode: () => string) {
  const { send, onMessage } = useVsCode()
  const messages = ref<FlowMessage[]>([])
  const busy = ref(false)
  let turnContentStarted = false
  let thinkingStartTime = 0
  // Incremented on tool_call/tool_result so MessageList can auto-scroll
  const toolUpdateTick = ref(0)
  const nextStepSuggestion = ref('')
  const tokenStats = ref<TokenStatsData>({
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    totalCost: 0,
    requestCount: 0,
    perModel: {},
  })
  const showTokenStats = ref(false)
  // Last-saved history metadata (driven by server `chat:saved`).
  const historySavedAt = ref<number | null>(null)
  const historyCount = ref(0)

  onMessage((msg) => {
    function findStreamingMsg(): ChatMessage | undefined {
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const m = messages.value[i]
        if (m.type === 'chat' && (m as ChatMessage).role === 'assistant' && (m as ChatMessage).streaming) {
          return m as ChatMessage
        }
      }
      return undefined
    }

    function findLastAssistantMsg(): ChatMessage | undefined {
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const m = messages.value[i]
        if (m.type === 'chat' && (m as ChatMessage).role === 'assistant') {
          return m as ChatMessage
        }
      }
      return undefined
    }

    if (msg.type === 'thinking') {
      // Finalize previous streaming message (each turn gets its own)
      const prev = findStreamingMsg()
      if (prev) {
        prev.streaming = false
        prev.thinkingPhase = false
      }
      turnContentStarted = false
      thinkingStartTime = Date.now()
      // Create new streaming message for this turn
      messages.value.push({
        id: nextId++, role: 'assistant', text: '',
        type: 'chat', timestamp: new Date().toLocaleTimeString(),
        streaming: true, thinkingPhase: true,
      } as ChatMessage)
    } else if (msg.type === 'thinking_chunk') {
      if (turnContentStarted) return
      const sm = findStreamingMsg()
      if (sm) {
        sm.thinkingText = (sm.thinkingText || '') + msg.text
      }
    } else if (msg.type === 'stream_chunk') {
      if (!turnContentStarted) {
        turnContentStarted = true
        const sm = findStreamingMsg()
        if (sm) {
          sm.thinkingPhase = false
          // Thinking just ended — record duration
          const elapsed = Date.now() - thinkingStartTime
          if (elapsed > 0 && thinkingStartTime > 0) {
            sm.thinkingDuration = elapsed
          }
        }
      }
      const sm = findStreamingMsg()
      if (sm) {
        sm.text += msg.text
      }
    } else if (msg.type === 'response') {
      const sm = findStreamingMsg()
      if (sm) {
        sm.text = msg.text
        sm.streaming = false
        sm.thinkingPhase = false
        // Safety net: fill missing thinkingDuration
        if (!sm.thinkingDuration && thinkingStartTime > 0) {
          sm.thinkingDuration = Date.now() - thinkingStartTime
        }
      } else {
        messages.value.push({
          id: nextId++, role: 'assistant', text: msg.text,
          type: 'chat', timestamp: new Date().toLocaleTimeString(),
        } as ChatMessage)
      }
      busy.value = false
    } else if (msg.type === 'nextStep') {
      nextStepSuggestion.value = msg.suggestion || ''
    } else if (msg.type === 'error') {
      messages.value.push({
        id: nextId++, role: 'error', text: msg.text,
        type: 'chat', timestamp: new Date().toLocaleTimeString(),
      } as ChatMessage)
      busy.value = false
    } else if (msg.type === 'tool_call') {
      // Create a separate message for each tool call so it appears inline in the flow
      messages.value.push({
        id: nextId++, role: 'assistant', text: '',
        type: 'chat', timestamp: new Date().toLocaleTimeString(),
        toolCalls: [{
          id: msg.toolCallId,
          name: msg.name,
          arguments: msg.arguments,
          status: 'running',
        }],
      } as ChatMessage)
      toolUpdateTick.value++
    } else if (msg.type === 'tool_result') {
      // Find the tool call message by toolCallId and update its status
      for (let i = messages.value.length - 1; i >= 0; i--) {
        const m = messages.value[i] as ChatMessage
        if (m.type === 'chat' && m.role === 'assistant' && m.toolCalls) {
          const tc = m.toolCalls.find(t => t.id === msg.toolCallId)
          if (tc) {
            tc.status = msg.elapsed < 0 ? 'error' : 'done'
            tc.result = msg.result
            tc.elapsed = Math.abs(msg.elapsed)
            break
          }
        }
      }
      toolUpdateTick.value++
    } else if (msg.type === 'cleared') {
      messages.value = []
      tokenStats.value = { totalPrompt: 0, totalCompletion: 0, totalTokens: 0, totalCost: 0, requestCount: 0, perModel: {} }
      historySavedAt.value = null
      historyCount.value = 0
    } else if (msg.type === 'chat:saved') {
      historySavedAt.value = msg.savedAt ?? null
      historyCount.value = msg.count ?? 0
    } else if (msg.type === 'tasks') {
      // Find the streaming message (has text content) to attach tasks to
      const sm = findStreamingMsg()
      if (sm) {
        sm.tasks = msg.tasks
      } else {
        // Fallback: find last assistant message with text
        const last = [...messages.value].reverse().find(m => (m as ChatMessage).role === 'assistant' && (m as ChatMessage).text) as ChatMessage | undefined
        if (last) last.tasks = msg.tasks
      }
    } else if (msg.type === 'tokenStats') {
      tokenStats.value = {
        totalPrompt: msg.totalPrompt,
        totalCompletion: msg.totalCompletion,
        totalTokens: msg.totalTokens,
        totalCost: msg.totalCost,
        requestCount: msg.requestCount,
        perModel: msg.perModel,
      }
      showTokenStats.value = true
    } else if (msg.type === 'chatHistory') {
      messages.value = msg.messages.map((m: any) => ({
        id: m.id,
        type: 'chat' as const,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        thinkingText: m.thinkingText,
        images: m.images,
        context: m.context,
        toolCalls: m.toolCalls,
      }))
      nextId = msg.messages.length > 0 ? Math.max(...msg.messages.map((m: any) => m.id)) + 1 : 0
    }
  })

  // Auto-persist the conversation (debounced). The server keys it by the
  // active workspace, so switching workspaces no longer loses history.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(messages, () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const msgs = messages.value
        .filter((m): m is ChatMessage => (m as ChatMessage).role != null)
        .map((m) => {
          const c = m as ChatMessage
          return {
            id: c.id,
            role: c.role,
            text: c.text,
            timestamp: c.timestamp,
            thinkingText: c.thinkingText,
            images: c.images,
            context: c.context,
            toolCalls: c.toolCalls,
          }
        })
      send({ type: 'chat:save', messages: msgs, tokenStats: tokenStats.value })
    }, 1000)
  }, { deep: true })

  function sendChat(text: string, model: string, temperature: number, topP: number, maxTokens: number, images?: ImageAttachment[], context?: ContextAttachment[], regenerateFromUserIndex?: number) {
    nextStepSuggestion.value = '' // Clear suggestion when user sends new message
    messages.value.push({
      id: nextId++,
      role: 'user',
      text,
      type: 'chat',
      timestamp: new Date().toLocaleTimeString(),
      images,
      context,
    } as ChatMessage)
    busy.value = true
    turnContentStarted = false
    send({ type: 'chat', text, model, temperature, topP, maxTokens, images, context, regenerateFromUserIndex })
  }

  function deleteMessage(id: number) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) messages.value.splice(idx, 1)
  }

  /**
   * Edit & re-send a past message. We branch the conversation from that
   * message's position: drop it and everything after it, then push the
   * updated text as the new turn at the same spot. `regenerateFromUserIndex`
   * tells the server which user message to truncate history after.
   */
  function resendMessage(id: number, newText: string, model: string, temperature: number, topP: number, maxTokens: number, context?: ContextAttachment[]) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx === -1) return
    // Count how many user messages exist up to and including the edited one.
    let userIndex = -1
    for (let i = 0; i <= idx; i++) {
      const m = messages.value[i]
      if (m.type === 'chat' && (m as ChatMessage).role === 'user') userIndex++
    }
    // Drop the edited message and everything after it locally.
    messages.value.splice(idx)
    // Re-send from that position.
    sendChat(newText, model, temperature, topP, maxTokens, undefined, context, userIndex)
  }

  function clear() {
    messages.value = []
    send({ type: 'clear' })
  }

  /** Ask the server to re-load the saved conversation for this workspace. */
  function loadHistory() {
    send({ type: 'chat:load' } as any)
  }

  function stop() {
    send({ type: 'abort' } as any)
    busy.value = false
  }

  function executePlan(planText: string, model: string, temperature: number, topP: number, maxTokens: number) {
    send({ type: 'setMode', mode: 'code' })
    const execMsg = 'Execute the following plan step by step. Read each file before modifying it. Make minimal, targeted changes.\n\n' + planText
    sendChat(execMsg, model, temperature, topP, maxTokens)
  }

  function sendFeedback(messageId: number, rating: 'up' | 'down', comment?: string) {
    const msg = messages.value.find(m => m.id === messageId && m.type === 'chat') as ChatMessage | undefined
    if (!msg) return
    // Find the user message that preceded this assistant message
    let userText = ''
    for (let i = messages.value.indexOf(msg) - 1; i >= 0; i--) {
      const m = messages.value[i]
      if (m.type === 'chat' && (m as ChatMessage).role === 'user') {
        userText = (m as ChatMessage).text
        break
      }
    }
    send({ type: 'feedback', messageId, rating, comment, userMessage: userText, assistantMessage: msg.text.slice(0, 500) })
  }

  return { messages, busy, tokenStats, showTokenStats, toolUpdateTick, nextStepSuggestion, historySavedAt, historyCount, sendChat, clear, stop, loadHistory, executePlan, deleteMessage, resendMessage, sendFeedback }
}
