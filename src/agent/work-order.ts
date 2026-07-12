/**
 * Work Order System
 *
 * Manages work orders (tasks with agent assignment, dependencies, and lifecycle).
 * Replaces the simple task system with a more powerful work order pool.
 */

export type WorkOrderStatus = 'pending' | 'assigned' | 'running' | 'done' | 'failed' | 'blocked' | 'timeout'
export type WorkOrderPriority = 'critical' | 'high' | 'normal' | 'low'

export interface WorkOrder {
  id: string
  title: string
  description: string
  status: WorkOrderStatus
  /** Priority level */
  priority: WorkOrderPriority
  /** Role required to execute this order */
  requiredRole?: string
  /** Assigned agent instance ID */
  assignedAgentId?: string
  /** Parent work order ID */
  parentId?: string
  /** IDs of work orders this one depends on */
  dependencies: string[]
  /** Execution result */
  result?: string
  /** Error message if failed */
  error?: string
  /** Retry count */
  retries: number
  /** Max retries before giving up */
  maxRetries: number
  /** Timeout in milliseconds (0 = no timeout) */
  timeoutMs: number
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

export interface WorkOrderEvent {
  type: 'created' | 'assigned' | 'started' | 'completed' | 'failed' | 'blocked' | 'retry'
  orderId: string
  timestamp: string
  data?: Record<string, unknown>
}

type WorkOrderEventHandler = (event: WorkOrderEvent) => void

/**
 * Work Order Pool — manages all work orders
 */
export class WorkOrderPool {
  private orders: Map<string, WorkOrder> = new Map()
  private nextId = 1
  private handlers: WorkOrderEventHandler[] = []

  /** Subscribe to work order events */
  onEvent(handler: WorkOrderEventHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler)
    }
  }

  private emit(event: WorkOrderEvent) {
    this.handlers.forEach(h => h(event))
  }

  /** Create a new work order */
  create(params: {
    title: string
    description?: string
    priority?: WorkOrderPriority
    requiredRole?: string
    parentId?: string
    dependencies?: string[]
    maxRetries?: number
    timeoutMs?: number
    metadata?: Record<string, unknown>
  }): WorkOrder {
    const now = new Date().toISOString()
    const order: WorkOrder = {
      id: `wo-${this.nextId++}`,
      title: params.title,
      description: params.description || '',
      status: 'pending',
      priority: params.priority || 'normal',
      requiredRole: params.requiredRole,
      parentId: params.parentId,
      dependencies: params.dependencies || [],
      retries: 0,
      maxRetries: params.maxRetries ?? 2,
      timeoutMs: params.timeoutMs ?? 0,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
    }
    this.orders.set(order.id, order)

    // Link to parent
    if (order.parentId) {
      const parent = this.orders.get(order.parentId)
      if (parent) {
        if (!parent.metadata) parent.metadata = {}
        const children = (parent.metadata.children as string[]) || []
        children.push(order.id)
        parent.metadata.children = children
      }
    }

    this.emit({ type: 'created', orderId: order.id, timestamp: now })
    return order
  }

  /** Get a work order by ID */
  get(id: string): WorkOrder | undefined {
    return this.orders.get(id)
  }

  /** Update a work order */
  update(id: string, updates: Partial<WorkOrder>): WorkOrder | undefined {
    const order = this.orders.get(id)
    if (!order) return undefined

    Object.assign(order, updates, { updatedAt: new Date().toISOString() })
    return order
  }

  /** Assign an order to an agent */
  assign(orderId: string, agentId: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    order.status = 'assigned'
    order.assignedAgentId = agentId
    order.updatedAt = new Date().toISOString()
    this.emit({ type: 'assigned', orderId, timestamp: order.updatedAt, data: { agentId } })
  }

  /** Mark order as running */
  start(orderId: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    order.status = 'running'
    order.startedAt = new Date().toISOString()
    order.updatedAt = order.startedAt
    this.emit({ type: 'started', orderId, timestamp: order.startedAt })
  }

  /** Mark order as done */
  complete(orderId: string, result: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    order.status = 'done'
    order.result = result
    order.completedAt = new Date().toISOString()
    order.updatedAt = order.completedAt
    this.emit({ type: 'completed', orderId, timestamp: order.completedAt, data: { result } })

    // Auto-unblock dependent orders
    this.unblockDependents(orderId)
  }

  /** Mark order as failed */
  fail(orderId: string, error: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    order.retries++
    if (order.retries < order.maxRetries) {
      // Retry: reset to pending
      order.status = 'pending'
      order.assignedAgentId = undefined
      order.error = error
      order.updatedAt = new Date().toISOString()
      this.emit({ type: 'retry', orderId, timestamp: order.updatedAt, data: { error, retry: order.retries } })
    } else {
      order.status = 'failed'
      order.error = error
      order.updatedAt = new Date().toISOString()
      this.emit({ type: 'failed', orderId, timestamp: order.updatedAt, data: { error } })
    }
  }

  /** Block an order */
  block(orderId: string, reason: string): void {
    const order = this.orders.get(orderId)
    if (!order) return

    order.status = 'blocked'
    order.error = reason
    order.updatedAt = new Date().toISOString()
    this.emit({ type: 'blocked', orderId, timestamp: order.updatedAt, data: { reason } })
  }

  /** Get all pending orders */
  getPending(): WorkOrder[] {
    return Array.from(this.orders.values()).filter(o => o.status === 'pending')
  }

  /** Get orders by role */
  getByRole(role: string): WorkOrder[] {
    return Array.from(this.orders.values()).filter(o => o.requiredRole === role)
  }

  /** Priority weight for sorting */
  private priorityWeight(p: WorkOrderPriority): number {
    const weights: Record<WorkOrderPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 }
    return weights[p]
  }

  /** Get orders with all dependencies satisfied, sorted by priority */
  getReady(): WorkOrder[] {
    return this.getPending()
      .filter(o => o.dependencies.every(depId => {
        const dep = this.orders.get(depId)
        return dep && dep.status === 'done'
      }))
      .sort((a, b) => this.priorityWeight(a.priority) - this.priorityWeight(b.priority))
  }

  /** Get all orders */
  getAll(): WorkOrder[] {
    return Array.from(this.orders.values())
  }

  /** Check for timed-out orders and retry them */
  checkTimeouts(): string[] {
    const now = Date.now()
    const timedOut: string[] = []

    for (const order of this.orders.values()) {
      if (order.status !== 'running' || !order.startedAt || order.timeoutMs <= 0) continue

      const elapsed = now - new Date(order.startedAt).getTime()
      if (elapsed > order.timeoutMs) {
        timedOut.push(order.id)
        this.fail(order.id, `Timeout after ${Math.round(elapsed / 1000)}s`)
      }
    }

    return timedOut
  }

  /** Get summary stats */
  getStats(): { total: number; pending: number; running: number; done: number; failed: number } {
    const all = Array.from(this.orders.values())
    return {
      total: all.length,
      pending: all.filter(o => o.status === 'pending').length,
      running: all.filter(o => o.status === 'running' || o.status === 'assigned').length,
      done: all.filter(o => o.status === 'done').length,
      failed: all.filter(o => o.status === 'failed').length,
    }
  }

  /** Unblock dependents when an order completes */
  private unblockDependents(completedId: string) {
    for (const order of this.orders.values()) {
      if (order.status === 'blocked' && order.dependencies.includes(completedId)) {
        const allDepsDone = order.dependencies.every(depId => {
          const dep = this.orders.get(depId)
          return dep && dep.status === 'done'
        })
        if (allDepsDone) {
          order.status = 'pending'
          order.error = undefined
          order.updatedAt = new Date().toISOString()
          this.emit({ type: 'created', orderId: order.id, timestamp: order.updatedAt })
        }
      }
    }
  }

  /** Clear all orders */
  clear() {
    this.orders.clear()
  }
}
