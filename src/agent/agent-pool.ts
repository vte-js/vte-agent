/**
 * Agent Pool Manager
 *
 * Manages multiple AgentEngine instances, each with its own role,
 * configuration, and conversation history.
 */

import { AgentEngine } from './engine'
import { AgentRole, BUILTIN_ROLES } from './agent-role'
import { WorkOrderPool, WorkOrder } from './work-order'
import { AgentCommunication, AgentMessage } from './agent-communication'
import { HostAdapter } from '../host/types'
import { VTEContextManager } from '../context/manager'

export interface AgentInstance {
  id: string
  role: AgentRole
  engine: AgentEngine
  status: 'idle' | 'busy' | 'error'
  currentOrderId?: string
  completedOrders: number
  failedOrders: number
  conversationHistory: Array<{ role: string; text: string; timestamp: string }>
}

export interface AgentStatus {
  id: string
  role: string
  roleName: string
  status: string
  currentOrderId?: string
  completedOrders: number
  failedOrders: number
  conversationHistory: Array<{ role: string; text: string; timestamp: string }>
}

let agentCounter = 0

export class AgentPool {
  private agents: Map<string, AgentInstance> = new Map()
  private host: HostAdapter
  private workOrderPool: WorkOrderPool
  private communication: AgentCommunication

  constructor(host: HostAdapter, workOrderPool: WorkOrderPool, communication: AgentCommunication) {
    this.host = host
    this.workOrderPool = workOrderPool
    this.communication = communication
  }

  /**
   * Create a new agent instance with the given role
   */
  createAgent(role: AgentRole, options?: {
    model?: string
    apiKey?: string
    apiBase?: string
    workspaceRoot?: string
  }): AgentInstance {
    const id = `agent-${++agentCounter}`

    // Create isolated context manager
    const workspaceRoot = options?.workspaceRoot || this.host.workspace.getRoot() || ''
    const context = new VTEContextManager(workspaceRoot)

    // Create engine with role-specific or global config
    const engine = new AgentEngine(
      context,
      role.model || options?.model || 'gpt-4',
      role.apiKey || options?.apiKey || '',
      role.apiBase || options?.apiBase || 'https://api.openai.com/v1',
      workspaceRoot
    )

    // Set up event forwarding
    engine.onViewUpdate = (update) => {
      this.onAgentUpdate?.(id, update)
    }

    const instance: AgentInstance = {
      id,
      role,
      engine,
      status: 'idle',
      completedOrders: 0,
      failedOrders: 0,
      conversationHistory: [],
    }

    this.agents.set(id, instance)
    return instance
  }

  /** Pool-level update handler (set by panel) */
  onAgentUpdate?: (agentId: string, update: Record<string, unknown>) => void

  /**
   * Get an idle agent, optionally filtered by role
   */
  getIdleAgent(roleId?: string): AgentInstance | undefined {
    for (const agent of this.agents.values()) {
      if (agent.status !== 'idle') continue
      if (roleId && agent.role.id !== roleId) continue
      // Check concurrency limit
      const runningCount = this.getRunningCount(agent.role.id)
      if (runningCount >= agent.role.maxConcurrent) continue
      return agent
    }
    return undefined
  }

  /**
   * Get count of running agents for a role
   */
  private getRunningCount(roleId: string): number {
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.role.id === roleId && agent.status === 'busy') count++
    }
    return count
  }

  /**
   * Assign a work order to an agent
   */
  assignOrder(orderId: string, agentId: string): boolean {
    const agent = this.agents.get(agentId)
    const order = this.workOrderPool.get(orderId)
    if (!agent || !order) return false
    if (agent.status !== 'idle') return false

    agent.status = 'busy'
    agent.currentOrderId = orderId
    this.workOrderPool.assign(orderId, agentId)
    return true
  }

  /**
   * Execute a work order with the assigned agent
   */
  async executeOrder(agentId: string, orderId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    const order = this.workOrderPool.get(orderId)
    if (!agent || !order) return

    this.workOrderPool.start(orderId)
    this.communication.send(agentId, undefined, 'notification', `开始执行: ${order.title}`)
    console.log(`[VTE] Agent ${agentId} starting order ${orderId}: ${order.title}`)

    // Auto-answer question requests during work order execution
    const originalOnViewUpdate = agent.engine.onViewUpdate
    let questionAutoAnswered = false
    let llmResponseText = ''

    agent.engine.onViewUpdate = (update) => {
      originalOnViewUpdate?.(update)

      // Capture LLM text response chunks
      if (update.type === 'stream_chunk') {
        llmResponseText += (update.text as string || '')
      }

      // Auto-answer question requests
      if (update.type === 'question_request' && !questionAutoAnswered) {
        questionAutoAnswered = true
        const options = update.options as Array<{ label: string; description?: string }> | undefined
        const autoAnswer = options && options.length > 0 ? options[0].label : order.description || '继续执行'
        console.log(`[VTE] Agent ${agentId} auto-answering question: ${autoAnswer}`)
        setTimeout(() => {
          agent.engine.resolveQuestion(autoAnswer)
        }, 500)
      }
    }

    try {
      const prompt = this.buildOrderPrompt(order)
      const timeout = order.timeoutMs || 5 * 60 * 1000

      // Add task to conversation history
      agent.conversationHistory.push({
        role: 'user',
        text: `任务: ${order.title}${order.description ? '\n' + order.description : ''}`,
        timestamp: new Date().toISOString(),
      })

      const result = await this.executeWithTimeout(agent.engine, prompt, timeout)

      // Add streamed LLM response (if any) to conversation history
      if (llmResponseText.trim()) {
        agent.conversationHistory.push({
          role: 'assistant',
          text: llmResponseText.trim(),
          timestamp: new Date().toISOString(),
        })
      }

      // Add final result to conversation history (may differ from streamed text if tools were used)
      if (result && result !== llmResponseText.trim()) {
        agent.conversationHistory.push({
          role: 'assistant',
          text: `任务结果: ${result.substring(0, 1000)}`,
          timestamp: new Date().toISOString(),
        })
      }

      this.workOrderPool.complete(orderId, result)
      agent.completedOrders++
      console.log(`[VTE] Agent ${agentId} completed order ${orderId}`)
      this.communication.send(agentId, undefined, 'task_result', result.substring(0, 500), { orderId })

      // Push updated status with conversation history
      this.onAgentUpdate?.(agentId, {})
    } catch (err: any) {
      const errorMsg = this.humanizeError(err)
      console.error(`[VTE] Agent ${agentId} failed on order ${orderId}:`, errorMsg)
      this.workOrderPool.fail(orderId, errorMsg)
      agent.failedOrders++
      agent.status = 'error'
      this.communication.send(agentId, undefined, 'notification', `执行失败: ${errorMsg}`)
      setTimeout(() => { agent.status = 'idle' }, 2000)
    } finally {
      // Restore original handler
      agent.engine.onViewUpdate = originalOnViewUpdate
      agent.status = 'idle'
      agent.currentOrderId = undefined
    }
  }

  /** Convert technical errors to user-friendly messages */
  private humanizeError(err: any): string {
    const msg = err.message || String(err)
    if (msg.includes('401') || msg.includes('Unauthorized')) return 'API Key 无效或未配置'
    if (msg.includes('429') || msg.includes('Rate limit')) return 'API 请求频率超限，请稍后重试'
    if (msg.includes('500') || msg.includes('Internal')) return '服务端内部错误'
    if (msg.includes('timeout') || msg.includes('Timeout')) return '执行超时'
    if (msg.includes('ECONNREFUSED')) return '无法连接到 API 服务'
    if (msg.includes('ENOTFOUND')) return '网络连接失败'
    return msg.substring(0, 200)
  }

  /**
   * Execute with timeout using AbortController
   */
  private async executeWithTimeout(engine: AgentEngine, prompt: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        engine.abort()
        reject(new Error(`Execution timed out after ${Math.round(timeoutMs / 1000)}s`))
      }, timeoutMs)

      engine.chat(prompt).then(result => {
        clearTimeout(timer)
        resolve(result)
      }).catch(err => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  /**
   * Build a prompt for an agent to execute a work order
   */
  private buildOrderPrompt(order: WorkOrder): string {
    const agent = order.assignedAgentId ? this.agents.get(order.assignedAgentId) : undefined
    let prompt = ''

    // Include role context
    if (agent?.role.systemPrompt) {
      prompt += `## 你的角色\n${agent.role.systemPrompt}\n\n`
    }

    prompt += `## 任务\n${order.title}\n\n`
    if (order.description) {
      prompt += `## 描述\n${order.description}\n\n`
    }
    if (order.dependencies.length > 0) {
      prompt += `## 前置依赖（已完成）\n`
      for (const depId of order.dependencies) {
        const dep = this.workOrderPool.get(depId)
        if (dep) {
          prompt += `- ${dep.title}: ${dep.result?.substring(0, 200) || '已完成'}\n`
        }
      }
      prompt += '\n'
    }
    prompt += `请直接执行任务，完成后使用 task_update 将任务标记为 done。`
    return prompt
  }

  /**
   * Get status of all agents
   */
  getAgentStatuses(): AgentStatus[] {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      role: a.role.id,
      roleName: a.role.name,
      status: a.status,
      currentOrderId: a.currentOrderId,
      completedOrders: a.completedOrders,
      failedOrders: a.failedOrders,
      conversationHistory: [...a.conversationHistory], // Copy array to trigger Vue reactivity
    }))
  }

  /**
   * Get agent by ID
   */
  getAgent(id: string): AgentInstance | undefined {
    return this.agents.get(id)
  }

  /**
   * Get all agents
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values())
  }

  /**
   * Stop all agents
   */
  stopAll() {
    for (const agent of this.agents.values()) {
      agent.engine.abort()
      agent.status = 'idle'
      agent.currentOrderId = undefined
    }
  }

  /**
   * Clear all agents
   */
  clear() {
    this.stopAll()
    this.agents.clear()
  }
}
