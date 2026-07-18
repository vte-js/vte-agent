/**
 * Work Order Scheduler
 *
 * Automatically assigns and executes work orders based on the scheduling mode:
 * - pool: Agents pick orders from a shared pool
 * - pipeline: Orders execute in sequential stages
 * - parallel: All ready orders execute simultaneously
 * - hybrid: Dependency graph-based scheduling
 */

import { AgentPool } from './agent-pool'
import { WorkOrderPool, WorkOrder } from './work-order'

export type ScheduleMode = 'pool' | 'pipeline' | 'parallel' | 'hybrid'

export interface ScheduleConfig {
  mode: ScheduleMode
  maxConcurrent: number
  autoAssign: boolean
  /** Pipeline mode: ordered list of role IDs for stages */
  pipelineStages?: string[]
}

export interface ScheduleEvent {
  type: 'order_assigned' | 'order_started' | 'order_completed' | 'order_failed' | 'schedule_tick'
  orderId?: string
  agentId?: string
  timestamp: string
}

type ScheduleEventHandler = (event: ScheduleEvent) => void

export class Scheduler {
  private pool: AgentPool
  private workOrderPool: WorkOrderPool
  private config: ScheduleConfig
  private running = false
  private tickInterval?: ReturnType<typeof setInterval>
  private handlers: ScheduleEventHandler[] = []

  constructor(pool: AgentPool, workOrderPool: WorkOrderPool, config: ScheduleConfig) {
    this.pool = pool
    this.workOrderPool = workOrderPool
    this.config = config

    // Listen to work order events
    this.workOrderPool.onEvent((event) => {
      if (event.type === 'completed' || event.type === 'failed') {
        this.onOrderFinished(event.orderId)
      }
    })
  }

  /** Subscribe to schedule events */
  onEvent(handler: ScheduleEventHandler): () => void {
    this.handlers.push(handler)
    return () => { this.handlers = this.handlers.filter(h => h !== handler) }
  }

  private emit(event: ScheduleEvent) {
    this.handlers.forEach(h => h(event))
  }

  /**
   * Start the scheduler — begins auto-assigning orders
   */
  start() {
    if (this.running) return
    this.running = true
    // Initial schedule
    this.schedule()
    // Periodic tick every 2 seconds
    this.tickInterval = setInterval(() => this.schedule(), 2000)
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.running = false
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = undefined
    }
  }

  /**
   * Main scheduling logic — runs on each tick
   */
  private schedule() {
    if (!this.running) return

    // Check for timed-out orders first
    this.workOrderPool.checkTimeouts()

    switch (this.config.mode) {
      case 'pool':
        this.schedulePool()
        break
      case 'pipeline':
        this.schedulePipeline()
        break
      case 'parallel':
        this.scheduleParallel()
        break
      case 'hybrid':
        this.scheduleHybrid()
        break
    }

    this.emit({ type: 'schedule_tick', timestamp: new Date().toISOString() })
  }

  /**
   * Pool mode: idle agents pick from the shared pending pool
   */
  private schedulePool() {
    const readyOrders = this.workOrderPool.getReady()
    for (const order of readyOrders) {
      const agent = this.pool.getIdleAgent(order.requiredRole)
      if (!agent) break // No available agents

      this.pool.assignOrder(order.id, agent.id)
      this.emit({ type: 'order_assigned', orderId: order.id, agentId: agent.id, timestamp: new Date().toISOString() })

      // Execute asynchronously
      this.pool.executeOrder(agent.id, order.id).catch(() => {})
    }
  }

  /**
   * Pipeline mode: process one stage at a time
   */
  private schedulePipeline() {
    const stages = this.config.pipelineStages || ['dev', 'test', 'review']

    for (const stageRole of stages) {
      const stageOrders = this.workOrderPool.getReady().filter(o => o.requiredRole === stageRole)
      for (const order of stageOrders) {
        const agent = this.pool.getIdleAgent(stageRole)
        if (!agent) break

        this.pool.assignOrder(order.id, agent.id)
        this.emit({ type: 'order_assigned', orderId: order.id, agentId: agent.id, timestamp: new Date().toISOString() })
        this.pool.executeOrder(agent.id, order.id).catch(() => {})
      }
    }
  }

  /**
   * Parallel mode: execute all ready orders simultaneously
   */
  private scheduleParallel() {
    const readyOrders = this.workOrderPool.getReady()
    const promises: Promise<void>[] = []

    for (const order of readyOrders) {
      const agent = this.pool.getIdleAgent(order.requiredRole)
      if (!agent) continue

      this.pool.assignOrder(order.id, agent.id)
      this.emit({ type: 'order_assigned', orderId: order.id, agentId: agent.id, timestamp: new Date().toISOString() })
      promises.push(this.pool.executeOrder(agent.id, order.id))
    }

    // Don't await — let them run in parallel
    Promise.allSettled(promises).catch(() => {})
  }

  /**
   * Hybrid mode: dependency graph scheduling with parallelism
   */
  private scheduleHybrid() {
    // Same as parallel for now — dependency resolution is handled by getReady()
    this.scheduleParallel()
  }

  /**
   * Called when an order finishes (completed or failed)
   */
  private onOrderFinished(orderId: string) {
    const order = this.workOrderPool.get(orderId)
    if (!order) return

    if (order.status === 'done') {
      this.emit({ type: 'order_completed', orderId, timestamp: new Date().toISOString() })
    } else if (order.status === 'failed') {
      this.emit({ type: 'order_failed', orderId, timestamp: new Date().toISOString() })
    }

    // Trigger re-schedule to pick up newly unblocked orders
    setTimeout(() => this.schedule(), 100)
  }

  /**
   * Create orders from a user request (PM agent analyzes and creates work orders)
   */
  createOrdersFromRequest(request: string, roleAssignments: Array<{ title: string; description?: string; role: string; dependencies?: string[] }>): WorkOrder[] {
    const created: WorkOrder[] = []
    const idMap: Record<string, string> = {}

    for (const assignment of roleAssignments) {
      // Resolve dependency IDs
      const deps = (assignment.dependencies || []).map(dep => idMap[dep] || dep)

      const order = this.workOrderPool.create({
        title: assignment.title,
        description: assignment.description,
        requiredRole: assignment.role,
        dependencies: deps,
      })
      idMap[assignment.title] = order.id
      created.push(order)
    }

    return created
  }

  /**
   * Phase 3 — PM autonomous decomposition.
   * Delegates to the agent pool, which runs the PM agent over `request`
   * and materializes the returned plan into WorkOrders.
   */
  async decomposeRequest(
    request: string,
    config: { model: string; apiKey: string; apiBase: string },
  ): Promise<WorkOrder[]> {
    return this.pool.decomposeRequest(request, config)
  }
}
