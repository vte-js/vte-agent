import { ref } from 'vue'
import { useVsCode } from './useVsCode'
import type { TokenStatsData } from '../components/TokenStats'
import type { ImageAttachment } from '../protocol'

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
  toolCalls?: ToolCallEvent[]
  images?: ImageAttachment[]
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
  const tokenStats = ref<TokenStatsData>({
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    totalCost: 0,
    requestCount: 0,
    perModel: {},
  })
  const showTokenStats = ref(false)

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
      // End previous turn's thinking
      const prev = findLastAssistantMsg()
      if (prev && prev.thinkingPhase) {
        prev.thinkingPhase = false
      }
      turnContentStarted = false
      // Create streaming message immediately so all state is per-message
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
        if (sm) sm.thinkingPhase = false
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
      } else {
        messages.value.push({
          id: nextId++, role: 'assistant', text: msg.text,
          type: 'chat', timestamp: new Date().toLocaleTimeString(),
        } as ChatMessage)
      }
      busy.value = false
    } else if (msg.type === 'error') {
      messages.value.push({
        id: nextId++, role: 'error', text: msg.text,
        type: 'chat', timestamp: new Date().toLocaleTimeString(),
      } as ChatMessage)
      busy.value = false
    } else if (msg.type === 'tool_call') {
      const sm = findStreamingMsg()
      if (sm) {
        if (!sm.toolCalls) sm.toolCalls = []
        sm.toolCalls.push({
          id: msg.toolCallId,
          name: msg.name,
          arguments: msg.arguments,
          status: 'running',
        })
      }
    } else if (msg.type === 'tool_result') {
      const sm = findStreamingMsg()
      if (sm?.toolCalls) {
        const tc = sm.toolCalls.find(t => t.id === msg.toolCallId)
        if (tc) {
          tc.status = msg.elapsed < 0 ? 'error' : 'done'
          tc.result = msg.result
          tc.elapsed = Math.abs(msg.elapsed)
        }
      }
    } else if (msg.type === 'cleared') {
      messages.value = []
      tokenStats.value = { totalPrompt: 0, totalCompletion: 0, totalTokens: 0, totalCost: 0, requestCount: 0, perModel: {} }
    } else if (msg.type === 'tasks') {
      messages.value.push({
        id: nextId++,
        type: 'task_snapshot',
        tasks: msg.tasks,
      } as TaskSnapshotMessage)
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
        toolCalls: m.toolCalls,
      }))
      nextId = msg.messages.length > 0 ? Math.max(...msg.messages.map((m: any) => m.id)) + 1 : 0
    }
  })

  function sendChat(text: string, model: string, temperature: number, topP: number, maxTokens: number, images?: ImageAttachment[]) {
    messages.value.push({
      id: nextId++,
      role: 'user',
      text,
      type: 'chat',
      timestamp: new Date().toLocaleTimeString(),
      images,
    } as ChatMessage)
    busy.value = true
    turnContentStarted = false
    send({ type: 'chat', text, model, temperature, topP, maxTokens, images })
  }

  function deleteMessage(id: number) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) messages.value.splice(idx, 1)
  }

  function resendMessage(id: number, newText: string, model: string, temperature: number, topP: number, maxTokens: number) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx === -1) return
    messages.value.splice(idx)
    sendChat(newText, model, temperature, topP, maxTokens)
  }

  function clear() {
    messages.value = []
    send({ type: 'clear' })
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

  return { messages, busy, tokenStats, showTokenStats, sendChat, clear, stop, executePlan, deleteMessage, resendMessage, sendFeedback }
}
