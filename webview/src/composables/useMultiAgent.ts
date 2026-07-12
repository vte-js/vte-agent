/**
 * Multi-Agent state management for the webview
 */

import { ref, computed } from 'vue'
import { useHost } from './useHost'

export interface AgentStatus {
  id: string
  role: string
  roleName: string
  status: 'idle' | 'busy' | 'error'
  currentOrderId?: string
  completedOrders: number
  failedOrders: number
  conversationHistory: Array<{ role: string; text: string; timestamp: string }>
}

export interface WorkOrderStatus {
  id: string
  title: string
  description: string
  status: string
  priority: string
  requiredRole?: string
  assignedAgentId?: string
  result?: string
  error?: string
  createdAt: string
}

export interface AgentConversation {
  agentId: string
  messages: Array<{
    id: number
    role: 'user' | 'assistant' | 'system'
    text: string
    timestamp: string
  }>
}

export function useMultiAgent() {
  const { send, onMessage } = useHost()

  const agents = ref<AgentStatus[]>([])
  const workOrders = ref<WorkOrderStatus[]>([])
  const activeAgentId = ref<string | null>(null)
  const conversations = ref<Map<string, AgentConversation>>(new Map())
  const scheduleMode = ref<string>('pool')

  // Computed
  const stats = computed(() => ({
    totalAgents: agents.value.length,
    busyAgents: agents.value.filter(a => a.status === 'busy').length,
    totalOrders: workOrders.value.length,
    pendingOrders: workOrders.value.filter(o => o.status === 'pending').length,
    runningOrders: workOrders.value.filter(o => o.status === 'running' || o.status === 'assigned').length,
    doneOrders: workOrders.value.filter(o => o.status === 'done').length,
    failedOrders: workOrders.value.filter(o => o.status === 'failed').length,
  }))

  const activeConversation = computed(() => {
    if (!activeAgentId.value) return null
    return conversations.value.get(activeAgentId.value) || null
  })

  // Message handlers
  onMessage((msg: any) => {
    if (msg.type === 'multiAgent:agents') {
      agents.value = msg.agents
    } else if (msg.type === 'multiAgent:workOrders') {
      workOrders.value = msg.orders
    } else if (msg.type === 'multiAgent:agentUpdate') {
      const idx = agents.value.findIndex(a => a.id === msg.agentId)
      if (idx !== -1) {
        agents.value[idx] = { ...agents.value[idx], ...msg.update }
      }
    } else if (msg.type === 'multiAgent:orderUpdate') {
      const idx = workOrders.value.findIndex(o => o.id === msg.orderId)
      if (idx !== -1) {
        workOrders.value[idx] = { ...workOrders.value[idx], ...msg.update }
      }
    } else if (msg.type === 'multiAgent:agentMessage') {
      const conv = conversations.value.get(msg.agentId) || { agentId: msg.agentId, messages: [] }
      conv.messages.push(msg.message)
      conversations.value.set(msg.agentId, conv)
    }
  })

  // Actions
  function createAgent(roleId: string) {
    send({ type: 'multiAgent:createAgent', roleId })
  }

  function createAgentWithConfig(roleId: string, config: { model: string; apiKey: string; apiBase: string }) {
    send({ type: 'multiAgent:createAgent', roleId, model: config.model, apiKey: config.apiKey, apiBase: config.apiBase })
  }

  function createWorkOrder(params: {
    title: string
    description?: string
    priority?: string
    requiredRole?: string
    dependencies?: string[]
    timeoutMs?: number
  }) {
    send({ type: 'multiAgent:createOrder', ...params })
  }

  function startScheduler(mode?: string) {
    if (mode) scheduleMode.value = mode
    send({ type: 'multiAgent:startScheduler', mode: scheduleMode.value })
  }

  function stopScheduler() {
    send({ type: 'multiAgent:stopScheduler' })
  }

  function selectAgent(agentId: string) {
    activeAgentId.value = agentId
    send({ type: 'multiAgent:getConversation', agentId })
  }

  function stopAllAgents() {
    send({ type: 'multiAgent:stopAll' })
  }

  function sendAgentMessage(agentId: string, content: string) {
    send({ type: 'multiAgent:sendMessage', from: 'user', to: agentId, msgType: 'notification', content })
  }

  return {
    agents,
    workOrders,
    activeAgentId,
    activeConversation,
    scheduleMode,
    stats,
    createAgent,
    createAgentWithConfig,
    createWorkOrder,
    startScheduler,
    stopScheduler,
    selectAgent,
    stopAllAgents,
    sendAgentMessage,
  }
}
