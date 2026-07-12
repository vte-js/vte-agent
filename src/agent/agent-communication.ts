/**
 * Agent Communication System
 *
 * Enables agents to share context, request help, and send notifications.
 */

export interface AgentMessage {
  id: string
  from: string
  to?: string
  type: 'task_result' | 'request_help' | 'share_context' | 'notification'
  content: string
  metadata?: Record<string, unknown>
  timestamp: string
}

type AgentMessageHandler = (msg: AgentMessage) => void

let messageCounter = 0

export class AgentCommunication {
  private handlers: Map<string, AgentMessageHandler[]> = new Map()
  private broadcastHandlers: AgentMessageHandler[] = []
  private messageHistory: AgentMessage[] = []

  /**
   * Send a message from one agent to another (or broadcast)
   */
  send(from: string, to: string | undefined, type: AgentMessage['type'], content: string, metadata?: Record<string, unknown>): AgentMessage {
    const msg: AgentMessage = {
      id: `msg-${++messageCounter}`,
      from,
      to,
      type,
      content,
      metadata,
      timestamp: new Date().toISOString(),
    }

    this.messageHistory.push(msg)

    if (to) {
      // Targeted message
      const handlers = this.handlers.get(to) || []
      handlers.forEach(h => h(msg))
    } else {
      // Broadcast
      this.broadcastHandlers.forEach(h => h(msg))
    }

    return msg
  }

  /**
   * Subscribe to messages for a specific agent
   */
  on(agentId: string, handler: AgentMessageHandler): () => void {
    if (!this.handlers.has(agentId)) {
      this.handlers.set(agentId, [])
    }
    this.handlers.get(agentId)!.push(handler)
    return () => {
      const list = this.handlers.get(agentId)
      if (list) {
        const idx = list.indexOf(handler)
        if (idx !== -1) list.splice(idx, 1)
      }
    }
  }

  /**
   * Subscribe to all broadcast messages
   */
  onBroadcast(handler: AgentMessageHandler): () => void {
    this.broadcastHandlers.push(handler)
    return () => {
      const idx = this.broadcastHandlers.indexOf(handler)
      if (idx !== -1) this.broadcastHandlers.splice(idx, 1)
    }
  }

  /**
   * Get message history for an agent
   */
  getHistory(agentId?: string): AgentMessage[] {
    if (!agentId) return [...this.messageHistory]
    return this.messageHistory.filter(m => m.from === agentId || m.to === agentId)
  }

  /**
   * Clear message history
   */
  clear() {
    this.messageHistory = []
    this.handlers.clear()
    this.broadcastHandlers = []
  }
}
