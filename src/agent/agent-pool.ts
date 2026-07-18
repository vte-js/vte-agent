/**
 * Agent Pool Manager
 *
 * Manages multiple AgentEngine instances, each with its own role,
 * configuration, and conversation history.
 */

import { AgentEngine } from './engine'
import { AgentRole, BUILTIN_ROLES, getRoleById } from './agent-role'
import { WorkOrderPool, WorkOrder } from './work-order'
import { AgentCommunication, AgentMessage } from './agent-communication'
import { HostAdapter, Sandbox } from '../host/types'
import { VTEContextManager } from '../context/manager'
import { ApiProtocol, ThinkingStyle, ReasoningLevel } from '../core/types'
import { SharedContext } from './shared-context'

/**
 * A single message in an agent's conversation history.
 * Extended (beyond role/text/timestamp) to support the same rich, real-time
 * rendering the main agent has: streamed thinking, streamed body text, and
 * tool-call cards. All extra fields are optional for backward compatibility.
 */
export interface AgentHistoryMessage {
  role: string
  text: string
  timestamp: string
  /** 'text' = normal assistant/user/system bubble; 'tool' = a tool-call card. */
  kind?: 'text' | 'tool'
  /** Streamed chain-of-thought / reasoning content for an assistant message. */
  thinking?: string
  /** True while this message is still being streamed (drives the live cursor/animation). */
  streaming?: boolean
  /** Tool-call metadata when kind === 'tool'. */
  tool?: { name: string; status: 'running' | 'done' | 'error'; result?: string }
  /** How long thinking took in ms (populated when streaming ends, if thinking was present). */
  thinkingDuration?: number
}

export interface AgentInstance {
  id: string
  role: AgentRole
  engine: AgentEngine
  status: 'idle' | 'busy' | 'error'
  currentOrderId?: string
  completedOrders: number
  failedOrders: number
  /** Execution environment intent — drives Phase 2 sandbox isolation */
  isolation: 'shared' | 'snapshot'
  /** Resolved root the engine actually operates on (sandbox root if snapshot). */
  workspaceRoot: string
  /** Active sandbox instance when isolation === 'snapshot' (undefined otherwise). */
  sandbox?: Sandbox
  conversationHistory: AgentHistoryMessage[]
}

export interface AgentStatus {
  id: string
  role: string
  roleName: string
  status: string
  currentOrderId?: string
  completedOrders: number
  failedOrders: number
  isolation: 'shared' | 'snapshot'
  workspaceRoot: string
  sandboxRoot?: string
  conversationHistory: AgentHistoryMessage[]
}

let agentCounter = 0

export class AgentPool {
  private agents: Map<string, AgentInstance> = new Map()
  private host: HostAdapter
  private workOrderPool: WorkOrderPool
  private communication: AgentCommunication
  /** Phase 2: read-only shared context aggregated across all agents. */
  private sharedContext = new SharedContext()

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
    api?: ApiProtocol
    thinkingStyle?: ThinkingStyle
    reasoningLevel?: ReasoningLevel
    isolation?: 'shared' | 'snapshot'
    workspaceRoot?: string
  }): AgentInstance {
    const id = `agent-${++agentCounter}`
    const isolation = role.isolation || options?.isolation || 'shared'

    // Phase 2 — snapshot isolation: clone the workspace into a sandbox so the
    // agent writes there, not into the shared main workspace. Hosts without a
    // sandbox implementation gracefully fall back to the shared root.
    let workspaceRoot = options?.workspaceRoot || this.host.workspace.getRoot() || ''
    let sandbox: Sandbox | undefined
    if (isolation === 'snapshot' && this.host.sandbox) {
      try {
        sandbox = this.host.sandbox.create(id, workspaceRoot)
        workspaceRoot = sandbox.root
        console.log(`[VTE] Agent ${id} sandboxed at ${workspaceRoot}`)
      } catch (err) {
        console.error(`[VTE] Sandbox creation failed for ${id}, using shared root:`, err)
      }
    }

    // Create isolated context manager (rooted at the sandbox when snapshot)
    const context = new VTEContextManager(workspaceRoot)

    // Create engine with role-specific or global config
    const engine = new AgentEngine(
      context,
      role.model || options?.model || 'gpt-4',
      role.apiKey || options?.apiKey || '',
      role.apiBase || options?.apiBase || 'https://api.openai.com/v1',
      workspaceRoot
    )

    // Per-agent provider configuration — makes the agent UI's provider
    // settings actually take effect on this engine instance.
    engine.setApiProtocol(role.api || options?.api || 'chat')
    engine.setThinkingStyle(role.thinkingStyle || options?.thinkingStyle || 'auto')
    engine.setReasoningLevel(role.reasoningLevel || options?.reasoningLevel || 'medium')

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
      isolation,
      workspaceRoot,
      sandbox,
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

    // --- Real-time streaming state ---------------------------------------
    // Mirror the main agent's live experience: stream thinking + body text
    // into the conversation history and push throttled updates so the sub-agent
    // panel shows content *as it is generated*, not only after completion.
    let currentMsg: AgentHistoryMessage | null = null
    const toolMsgs = new Map<string, AgentHistoryMessage>()
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let flushDirty = false
    let thinkingStartTs: number | null = null
    const scheduleFlush = () => {
      flushDirty = true
      if (flushTimer) return
      flushTimer = setTimeout(() => {
        flushTimer = null
        if (flushDirty) {
          flushDirty = false
          this.onAgentUpdate?.(agentId, {})
        }
      }, 120)
    }
    const flushNow = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      flushDirty = false
      this.onAgentUpdate?.(agentId, {})
    }
    /** Get (or lazily create) the assistant message currently being streamed. */
    const ensureStreamMsg = (): AgentHistoryMessage => {
      if (!currentMsg) {
        currentMsg = {
          role: 'assistant',
          kind: 'text',
          text: '',
          thinking: '',
          streaming: true,
          timestamp: new Date().toISOString(),
        }
        agent.conversationHistory.push(currentMsg)
      }
      return currentMsg
    }
    /** Close off the active streamed message (before a tool call / at the end). */
    const finalizeStreamMsg = () => {
      if (currentMsg) {
        currentMsg.streaming = false
        if (thinkingStartTs && currentMsg.thinking) {
          currentMsg.thinkingDuration = Date.now() - thinkingStartTs
        }
        // Reset thinking timer for next turn
        thinkingStartTs = null
        currentMsg = null
      }
    }

    agent.engine.onViewUpdate = (update) => {
      // Permission requests are auto-approved below — don't surface a
      // blocking dialog in the UI for a background (autonomous) agent.
      if (update.type !== 'permission_request') {
        originalOnViewUpdate?.(update)
      }

      // Stream reasoning/thinking content live into the current assistant message
      if (update.type === 'thinking_chunk') {
        if (!thinkingStartTs) { thinkingStartTs = Date.now() }
        const m = ensureStreamMsg()
        m.thinking = (m.thinking || '') + (update.text as string || '')
        scheduleFlush()
      }

      // Stream LLM body text live into the current assistant message
      if (update.type === 'stream_chunk') {
        // The model has moved from reasoning to answering — freeze the
        // thinking duration here so it reflects pure reasoning time, not
        // the (often much longer) body streaming + tool execution that follows.
        if (thinkingStartTs && currentMsg) {
          currentMsg.thinkingDuration = Date.now() - thinkingStartTs
          thinkingStartTs = null
        }
        llmResponseText += (update.text as string || '')
        const m = ensureStreamMsg()
        m.text = (m.text || '') + (update.text as string || '')
        scheduleFlush()
      }

      // A tool call starts: finalize the streamed text, then add a tool card
      if (update.type === 'tool_call') {
        finalizeStreamMsg()
        const toolMsg: AgentHistoryMessage = {
          role: 'tool',
          kind: 'tool',
          text: '',
          timestamp: new Date().toISOString(),
          tool: { name: (update.name as string) || '工具', status: 'running' },
        }
        agent.conversationHistory.push(toolMsg)
        const id = update.toolCallId as string | undefined
        if (id) toolMsgs.set(id, toolMsg)
        flushNow()
      }

      // A tool call finished: update its card with the result/status
      if (update.type === 'tool_result') {
        const id = update.toolCallId as string | undefined
        const toolMsg = id ? toolMsgs.get(id) : undefined
        if (toolMsg && toolMsg.tool) {
          const elapsed = typeof update.elapsed === 'number' ? update.elapsed : 0
          toolMsg.tool.status = elapsed < 0 ? 'error' : 'done'
          const res = String(update.result ?? '')
          if (res) toolMsg.tool.result = res.length > 500 ? res.slice(0, 500) + '…' : res
        }
        flushNow()
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

      // Auto-approve permission requests.
      //
      // A work-order agent runs autonomously in the background — there is no
      // human in the loop to click "允许" in the UI, so a permission prompt
      // (e.g. for bash / edit / write) would hang the engine forever and the
      // order would stay in `running` state indefinitely. We auto-approve it
      // here so the agent can actually execute the tools its role demands.
      // 'always_allow' also flips the engine's permission config so repeated
      // tool calls of the same category don't re-prompt.
      if (update.type === 'permission_request') {
        const toolName = (update.toolName as string) || ''
        console.log(`[VTE] Agent ${agentId} auto-approving permission: ${toolName}`)
        this.communication.send(agentId, undefined, 'notification', `已自动授权工具: ${toolName}`)
        setTimeout(() => {
          agent.engine.resolvePermission('always_allow', toolName)
        }, 300)
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

      // The assistant's thinking / body text and tool calls were already
      // streamed into conversationHistory in real time above — just close off
      // the final streamed message and sanitize its text for display.
      finalizeStreamMsg()
      for (const m of agent.conversationHistory) {
        if (m.role === 'assistant' && m.kind === 'text' && m.text) {
          m.text = this.sanitizeLlmOutput(m.text)
        }
      }

      // Fallback: if nothing streamed (e.g. tool-only run) but we do have a
      // final result, surface it so the panel isn't left empty.
      const hasAssistantText = agent.conversationHistory.some(
        m => m.role === 'assistant' && m.kind === 'text' && m.text.trim(),
      )
      if (!hasAssistantText && result && result.trim()) {
        agent.conversationHistory.push({
          role: 'assistant',
          kind: 'text',
          text: this.sanitizeLlmOutput(result.substring(0, 1000)),
          timestamp: new Date().toISOString(),
        })
      }

      this.workOrderPool.complete(orderId, result)
      agent.completedOrders++
      console.log(`[VTE] Agent ${agentId} completed order ${orderId}`)
      this.communication.send(agentId, undefined, 'task_result', result.substring(0, 500), { orderId })

      // Phase 2 — feed this agent's completed work into the shared, read-only
      // context so sibling agents can see what was done.
      this.sharedContext.addEntry({
        agentId,
        role: agent.role.id,
        roleName: agent.role.name,
        title: order.title,
        result: result || '',
        timestamp: new Date().toISOString(),
      })

      // Phase 2 — snapshot agents write into a sandbox; attempt to merge the
      // changes back into the main workspace after each successful order.
      if (agent.isolation === 'snapshot' && agent.sandbox) {
        try {
          const r = agent.sandbox.merge()
          this.communication.send(
            agentId,
            undefined,
            'notification',
            r.merged ? `沙箱已合并回主工作区：${r.summary}` : `沙箱需手动合并：${r.summary}`,
          )
        } catch (err: any) {
          this.communication.send(agentId, undefined, 'notification', `沙箱合并失败：${err?.message || err}`)
        }
      }

      // Push updated status with conversation history (interim — final idle sent below)
      this.onAgentUpdate?.(agentId, {})
    } catch (err: any) {
      const errorMsg = this.humanizeError(err)
      console.error(`[VTE] Agent ${agentId} failed on order ${orderId}:`, errorMsg)
      // Close off any in-flight streamed message and record the failure.
      finalizeStreamMsg()
      agent.conversationHistory.push({
        role: 'system',
        kind: 'text',
        text: `⚠️ 执行失败: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      })
      this.workOrderPool.fail(orderId, errorMsg)
      agent.failedOrders++
      agent.status = 'error'
      this.communication.send(agentId, undefined, 'notification', `执行失败: ${errorMsg}`)
      setTimeout(() => { agent.status = 'idle' }, 2000)
    } finally {
      // Stop any pending throttled flush and mark streaming as done.
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      finalizeStreamMsg()

      // Safety net: fill in missing thinkingDuration for any assistant message
      // that has thinking content but no recorded duration (covers edge cases
      // where stream_chunk froze the timer before tool_call created a new msg,
      // or where the model interleaved thinking/body in unexpected ways).
      const orderStart = agent.conversationHistory.findIndex(
        m => m.role === 'user' && m.text?.startsWith('任务:')
      )
      const slice = orderStart >= 0
        ? agent.conversationHistory.slice(orderStart)
        : agent.conversationHistory
      for (const m of slice) {
        if (m.role === 'assistant' && m.kind === 'text' && m.thinking && m.thinkingDuration == null) {
          // Estimate: use timestamp diff from previous message, or default 2s
          const idx = agent.conversationHistory.indexOf(m)
          const prev = idx > 0 ? agent.conversationHistory[idx - 1] : null
          const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : 0
          const curTs = new Date(m.timestamp).getTime()
          m.thinkingDuration = (curTs - prevTs) || 2000
        }
      }

      // Restore original handler
      agent.engine.onViewUpdate = originalOnViewUpdate
      agent.status = 'idle'
      agent.currentOrderId = undefined
    }
    // Notify webview of final idle status (must be after try/catch/finally so
    // the finally-block assignment has taken effect).
    this.onAgentUpdate?.(agentId, { status: 'idle' as const, currentOrderId: undefined })
  }

  /**
   * Strip LLM-internal XML tags from output text.
   * Models often emit <thinking>, <system-reminder>, <next_step>,
   * <response>, <format> etc. as structured annotations — they are not
   * meant for end-user display and look broken in chat UIs.
   */
  private sanitizeLlmOutput(text: string): string {
    return text
      // Remove paired tags with their content (e.g. <system-reminder>...</system-reminder>)
      .replace(/<(system-reminder|thinking|next_step|response|format|reasoning|instruction)[^>]*>[\s\S]*?<\/\1>/gi, '')
      // Remove remaining self-closing or stray open tags
      .replace(/<\/?(system-reminder|thinking|next_step|response|format|reasoning|instruction)[^>]*>/gi, '')
      // Clean up excessive blank lines left behind
      .replace(/\n{3,}/g, '\n\n')
      .trim()
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

    // Phase 2 — read-only shared context from sibling agents.
    const shared = this.sharedContext.getContextForAgent(agent?.id)
    if (shared) {
      prompt += `${shared}\n\n`
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
      isolation: a.isolation,
      workspaceRoot: a.workspaceRoot,
      sandboxRoot: a.sandbox?.root,
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
   * Phase 3 — PM autonomous decomposition.
   *
   * Runs the PM agent (or a throwaway PM engine) over a high-level
   * `request`, asks it to return a structured task plan as JSON, then
   * materializes that plan into WorkOrders (resolving title→id dependencies).
   *
   * The PM engine is forced into a no-tool mode so it only emits the
   * plan text (no task_create / permission prompts) and we parse JSON.
   */
  async decomposeRequest(
    request: string,
    config: { model: string; apiKey: string; apiBase: string },
  ): Promise<WorkOrder[]> {
    const role = getRoleById('pm')!

    const workspaceRoot = this.host.workspace.getRoot() || ''
    const context = new VTEContextManager(workspaceRoot)
    const pm = new AgentEngine(
      context,
      role.model || config.model,
      role.apiKey || config.apiKey,
      role.apiBase || config.apiBase,
      workspaceRoot,
    )
    pm.setApiProtocol(role.api || 'chat')
    pm.setThinkingStyle(role.thinkingStyle || 'auto')
    pm.setReasoningLevel(role.reasoningLevel || 'medium')
    // Disable tool calls — the PM must only return a JSON plan here.
    pm.setAllowedTools([])

    const prompt =
      `你是项目经理 Agent。请分析下面的用户需求，将其拆解为可以由不同角色 Agent 并行或串行执行的子任务。\n\n` +
      `可用角色：\n- dev：编写 / 修改代码\n- test：编写并运行测试\n- review：代码审查（只读，不修改）\n- doc：编写文档\n\n` +
      `需求：\n${request}\n\n` +
      `请仅输出一个 JSON 数组（不要任何解释文字，不要 markdown 代码块），每个元素格式：\n` +
      `{\n  "title": "简短任务标题",\n  "description": "任务详细说明",\n  "role": "dev | test | review | doc",\n  "dependencies": ["前置任务的 title（无依赖则空数组"]\n}\n` +
      `如果需求很简单、只需一个角色，也照此格式输出一个只含一个元素的数组。\n` +
      `dependencies 里的 title 必须与前面某个任务的 title 完全一致，才能正确建立依赖。`

    let raw = ''
    try {
      raw = await pm.chat(prompt)
    } catch (err) {
      console.error('[VTE] PM decomposition failed:', err)
    }

    const plan = this.extractPlan(raw)
    const created: WorkOrder[] = []
    const idMap: Record<string, string> = {}

    if (plan.length === 0) {
      // Fallback: a single dev task covering the whole request.
      const order = this.workOrderPool.create({
        title: request.slice(0, 80) || '处理需求',
        description: request,
        requiredRole: 'dev',
        dependencies: [],
      })
      created.push(order)
      return created
    }

    for (const task of plan) {
      const deps = (task.dependencies || []).map((d) => idMap[d] || d)
      const order = this.workOrderPool.create({
        title: task.title,
        description: task.description,
        requiredRole: task.role,
        dependencies: deps,
      })
      idMap[task.title] = order.id
      created.push(order)
    }
    console.log(`[VTE] PM decomposed request into ${created.length} work orders`)
    return created
  }

  /** Robustly extract a task-plan array from a free-form PM response. */
  private extractPlan(raw: string): Array<{
    title: string
    description?: string
    role: string
    dependencies?: string[]
  }> {
    if (!raw) return []
    const tryParse = (s: string): any => {
      try { return JSON.parse(s) } catch { return null }
    }
    let parsed: any = tryParse(raw.trim())
    if (!Array.isArray(parsed)) {
      const obj = typeof parsed === 'object' && parsed ? parsed : null
      if (obj && Array.isArray((obj as any).tasks)) parsed = (obj as any).tasks
      else if (obj && Array.isArray((obj as any).orders)) parsed = (obj as any).orders
    }
    if (!Array.isArray(parsed)) {
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      if (start >= 0 && end > start) {
        parsed = tryParse(raw.slice(start, end + 1))
      }
    }
    if (!Array.isArray(parsed)) return []

    const validRoles = ['pm', 'dev', 'test', 'review', 'doc']
    return parsed
      .filter((t: any) => t && typeof t.title === 'string')
      .map((t: any) => ({
        title: String(t.title),
        description: typeof t.description === 'string' ? t.description : undefined,
        role: validRoles.includes(t.role) ? t.role : 'dev',
        dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
      }))
  }

  /**
   * Clear all agents
   */
  clear() {
    this.stopAll()
    for (const agent of this.agents.values()) {
      if (agent.sandbox) {
        try {
          agent.sandbox.destroy()
        } catch (err) {
          console.error(`[VTE] Failed to destroy sandbox for ${agent.id}:`, err)
        }
      }
    }
    this.agents.clear()
    this.sharedContext.clear()
  }
}
