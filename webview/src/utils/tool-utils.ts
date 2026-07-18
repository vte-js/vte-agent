/**
 * Shared tool-name localization & formatting utilities.
 *
 * Single source of truth for all components (MessageBubble, ToolCallBlock,
 * AgentConversation). Import from here — never duplicate.
 */

/** Tool name → Chinese display label. Merge of all existing maps. */
export const TOOL_LABELS: Record<string, string> = {
  // File ops
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  list: '列出目录',
  glob: '查找文件',

  // Content search
  grep: '搜索内容',
  search: '搜索内容',

  // Execution
  bash: '执行命令',
  diagnostics: '代码诊断',

  // Git
  git: 'Git 操作',

  // Web
  webfetch: '获取网页',
  websearch: '搜索网络',

  // Tasks
  task_list: '查看任务',
  task_create: '创建任务',
  task_update: '更新任务',
  task_delete: '删除任务',

  // Interaction
  question: '向用户提问',
}

/**
 * Localize a tool name to Chinese. Falls back to raw name if unknown.
 */
export function localizeToolName(name?: string): string {
  if (!name) return ''
  return TOOL_LABELS[name] || name
}

/**
 * Format a duration in milliseconds to human-readable short form.
 * Examples: 500 → "500ms", 3000 → "3s", 90000 → "1m30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}
