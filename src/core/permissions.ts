// Permission categories and tool mapping

export type PermissionLevel = 'allow' | 'ask' | 'deny'

export interface PermissionConfig {
  fileRead: PermissionLevel
  fileWrite: PermissionLevel
  terminal: PermissionLevel
  git: PermissionLevel
  diagnostics: PermissionLevel
  web: PermissionLevel
  task: PermissionLevel
  checkpoint: PermissionLevel
}

export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  fileRead: 'allow',
  fileWrite: 'ask',
  terminal: 'ask',
  git: 'allow',
  diagnostics: 'allow',
  web: 'ask',
  task: 'allow',
  checkpoint: 'allow',
}

export const PERMISSION_CATEGORIES: Array<{ key: keyof PermissionConfig; label: string; description: string }> = [
  { key: 'fileRead', label: '文件读取', description: '读取文件内容和目录列表' },
  { key: 'fileWrite', label: '文件写入', description: '编辑和创建文件' },
  { key: 'terminal', label: '终端执行', description: '执行 Shell 命令' },
  { key: 'git', label: 'Git 操作', description: '版本控制操作' },
  { key: 'diagnostics', label: '代码诊断', description: '运行类型检查和 lint' },
  { key: 'web', label: '网络请求', description: '访问外部 URL' },
  { key: 'task', label: '任务管理', description: '创建和更新任务' },
  { key: 'checkpoint', label: '快照管理', description: '保存和恢复快照' },
]

// Tool name → permission category mapping
export const TOOL_CATEGORIES: Record<string, keyof PermissionConfig> = {
  // File read
  read: 'fileRead',
  list: 'fileRead',
  grep: 'fileRead',
  glob: 'fileRead',
  // File write
  edit: 'fileWrite',
  write: 'fileWrite',
  // Terminal
  bash: 'terminal',
  // Git
  git: 'git',
  // Diagnostics
  diagnostics: 'diagnostics',
  // Web
  webfetch: 'web',
  // Task
  task_create: 'task',
  task_update: 'task',
  task_list: 'task',
  task_delete: 'task',
  // Checkpoint
  checkpoint_save: 'checkpoint',
  checkpoint_list: 'checkpoint',
  checkpoint_restore: 'checkpoint',
  checkpoint_delete: 'checkpoint',
  checkpoint_diff: 'checkpoint',
  checkpoint_log: 'checkpoint',
}

// Tool descriptions for authorization dialog
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  read: '读取文件内容',
  edit: '编辑文件内容',
  write: '创建或覆盖文件',
  list: '列出目录内容',
  bash: '执行 Shell 命令',
  grep: '搜索文件内容',
  glob: '匹配文件路径',
  git: 'Git 操作',
  diagnostics: '运行代码诊断',
  webfetch: '获取网页内容',
  task_create: '创建任务',
  task_update: '更新任务',
  task_list: '列出任务',
  task_delete: '删除任务',
  checkpoint_save: '保存快照',
  checkpoint_list: '列出快照',
  checkpoint_restore: '恢复快照',
  checkpoint_delete: '删除快照',
  checkpoint_diff: '查看快照差异',
  checkpoint_log: '查看快照日志',
}

// Get permission level for a tool
export function getPermissionLevel(toolName: string, config: PermissionConfig): PermissionLevel {
  const category = TOOL_CATEGORIES[toolName]
  if (!category) return 'ask' // Unknown tools require permission
  return config[category]
}

// Format tool arguments for display
export function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'read': {
      const range = args.range as { start?: number; end?: number } | undefined
      return `文件: ${args.path || ''}${range ? ` (行 ${range.start}-${range.end})` : ''}`
    }
    case 'edit':
      return `文件: ${args.path || ''}\n替换: "${(args.oldString as string || '').substring(0, 50)}" → "${(args.newString as string || '').substring(0, 50)}"`
    case 'write':
      return `文件: ${args.path || ''}\n内容: ${((args.content as string || '').length)} 字符`
    case 'bash':
      return `命令: ${args.command || ''}`
    case 'grep':
      return `搜索: "${args.pattern || ''}" 在 ${args.path || '.'}`
    case 'glob':
      return `匹配: ${args.pattern || ''}`
    case 'list':
      return `目录: ${args.path || '.'}`
    case 'git':
      return `命令: git ${args.subcommand || ''} ${(args.args as string[] || []).join(' ')}`
    case 'webfetch':
      return `URL: ${args.url || ''}`
    default:
      return JSON.stringify(args).substring(0, 100)
  }
}
