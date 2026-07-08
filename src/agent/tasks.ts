/**
 * Task tracking system for the agent.
 * LLM can create, list, update, complete, delete, and add subtasks.
 */

export interface Task {
  id: number
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  parentId: number | null
  subtasks: number[]
  createdAt: string
  updatedAt: string
}

let nextId = 1
const tasks: Task[] = []

export function createTask(title: string, description: string = '', parentId: number | null = null): Task {
  const now = new Date().toISOString()
  const task: Task = {
    id: nextId++,
    title,
    description,
    status: 'pending',
    parentId,
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  }
  tasks.push(task)

  // Link to parent
  if (parentId !== null) {
    const parent = tasks.find(t => t.id === parentId)
    if (parent) parent.subtasks.push(task.id)
  }

  return task
}

export function updateTask(id: number, updates: Partial<Pick<Task, 'title' | 'description' | 'status'>>): Task | null {
  const task = tasks.find(t => t.id === id)
  if (!task) return null
  if (updates.title !== undefined) task.title = updates.title
  if (updates.description !== undefined) task.description = updates.description
  if (updates.status !== undefined) {
    task.status = updates.status
    // Auto-complete parent when all subtasks are done
    if (task.parentId !== null) {
      autoCompleteParent(task.parentId)
    }
  }
  task.updatedAt = new Date().toISOString()
  return task
}

function autoCompleteParent(parentId: number) {
  const parent = tasks.find(t => t.id === parentId)
  if (!parent || parent.subtasks.length === 0) return

  const allDone = parent.subtasks.every(sid => {
    const sub = tasks.find(t => t.id === sid)
    return sub && sub.status === 'done'
  })

  if (allDone && parent.status !== 'done') {
    parent.status = 'done'
    parent.updatedAt = new Date().toISOString()
    console.log(`[VTE] Auto-completed parent task #${parent.id}: ${parent.title}`)
    // Recurse up
    if (parent.parentId !== null) {
      autoCompleteParent(parent.parentId)
    }
  }
}

export function getTask(id: number): Task | null {
  return tasks.find(t => t.id === id) || null
}

export function listTasks(status?: string): Task[] {
  const filtered = status ? tasks.filter(t => t.status === status) : [...tasks]
  // Return only top-level tasks (subtasks shown nested)
  return filtered.filter(t => t.parentId === null)
}

export function listAllTasks(status?: string): Task[] {
  return status ? tasks.filter(t => t.status === status) : [...tasks]
}

export function deleteTask(id: number): boolean {
  const task = tasks.find(t => t.id === id)
  if (!task) return false

  // Delete subtasks recursively
  for (const sid of task.subtasks) {
    deleteTask(sid)
  }

  // Unlink from parent
  if (task.parentId !== null) {
    const parent = tasks.find(t => t.id === task.parentId)
    if (parent) {
      parent.subtasks = parent.subtasks.filter(sid => sid !== id)
    }
  }

  const idx = tasks.findIndex(t => t.id === id)
  tasks.splice(idx, 1)
  return true
}

export function getTaskSummary(): string {
  if (tasks.length === 0) return 'No tasks.'
  const topLevel = tasks.filter(t => t.parentId === null)
  const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 }
  topLevel.forEach(t => counts[t.status]++)
  return `Total: ${topLevel.length} | Pending: ${counts.pending} | In Progress: ${counts.in_progress} | Done: ${counts.done} | Blocked: ${counts.blocked}`
}

export function formatTaskList(taskList: Task[], depth: number = 0): string {
  if (taskList.length === 0) return ''
  const indent = '  '.repeat(depth)
  return taskList.map(t => {
    const icon = t.status === 'done' ? '[x]' : t.status === 'in_progress' ? '[>]' : t.status === 'blocked' ? '[!]' : '[ ]'
    const line = `${indent}${icon} #${t.id} ${t.title}${t.description ? ' - ' + t.description : ''}`
    const subtaskLines = t.subtasks.length > 0
      ? '\n' + formatTaskList(t.subtasks.map(sid => tasks.find(st => st.id === sid)).filter(Boolean) as Task[], depth + 1)
      : ''
    return line + subtaskLines
  }).join('\n')
}

export function getAllTasks(): Task[] {
  return [...tasks]
}

export function resetTasks(): void {
  tasks.length = 0
  nextId = 1
}
