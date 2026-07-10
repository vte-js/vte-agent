/**
 * VTE Agent Tools - All tool implementations
 * Import from here to get all tools, or import individual tools as needed
 */

import { ToolDefinition } from '../core/types'
import { fileTools } from './file'
import { searchTools } from './search'
import { bashTool } from './bash'
import { diagnosticsTool } from './diagnostics'
import { gitTool } from './git'
import { webfetchTool } from './webfetch'
import { taskTools } from './tasks'
import { checkpointTools, setCheckpointContext } from './checkpoint'

// Re-export individual tools
export { readTool, editTool, writeTool, listTool, fileTools } from './file'
export { grepTool, globTool, searchTools } from './search'
export { bashTool } from './bash'
export { diagnosticsTool } from './diagnostics'
export { gitTool } from './git'
export { webfetchTool } from './webfetch'
export { taskTools, taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool } from './tasks'
export { checkpointTools, checkpointSaveTool, checkpointListTool, checkpointRestoreTool, checkpointDeleteTool, checkpointDiffTool, checkpointLogTool, setCheckpointContext } from './checkpoint'

// Re-export task management functions
export { createTask, updateTask, deleteTask, getTask, listTasks, listAllTasks, getAllTasks, getTaskSummary, formatTaskList, resetTasks } from './tasks'
export type { Task } from './tasks'

/**
 * All available tools (without checkpoint tools)
 * Checkpoint tools need to be registered after engine is created
 */
export const coreTools: ToolDefinition[] = [
  ...fileTools,
  ...searchTools,
  bashTool,
  diagnosticsTool,
  gitTool,
  webfetchTool,
  ...taskTools,
]

/**
 * All tools including checkpoint tools
 * Note: Checkpoint tools require setCheckpointContext to be called first
 */
export const allTools: ToolDefinition[] = [
  ...coreTools,
  ...checkpointTools,
]
