/**
 * Agent Role Definitions
 *
 * Defines roles that agents can take on, with specific tools,
 * system prompts, and execution configurations.
 */

export interface AgentRole {
  id: string
  name: string
  description: string
  /** System prompt suffix appended to base prompt */
  systemPrompt?: string
  /** Independent model config (optional, overrides global) */
  model?: string
  apiKey?: string
  apiBase?: string
  /** Wire protocol override (chat / responses). Empty = engine default */
  api?: 'chat' | 'responses'
  /** How this agent expresses reasoning effort */
  thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto'
  /** Reasoning strength for this agent */
  reasoningLevel?: 'low' | 'medium' | 'high'
  /** Tool name whitelist — empty = all tools */
  tools?: string[]
  /** Max concurrent tasks for this role */
  maxConcurrent: number
  /** Execution environment */
  isolation: 'shared' | 'snapshot'
  /** Role color for UI */
  color: string
  /** Role icon (emoji or icon name) */
  icon: string
}

/** Built-in role definitions */
export const BUILTIN_ROLES: AgentRole[] = [
  {
    id: 'pm',
    name: '项目经理',
    description: '负责任务分解、进度跟踪、协调其他 Agent 工作。',
    systemPrompt: '你是项目经理 Agent。你的职责是分析需求、分解任务、分配给合适的 Agent、跟踪进度。使用 task_create 创建任务，task_update 更新状态。不要直接编写代码。',
    tools: ['task_create', 'task_update', 'task_list', 'question', 'read', 'grep', 'glob'],
    maxConcurrent: 1,
    isolation: 'shared',
    color: '#6366f1',
    icon: '📋',
  },
  {
    id: 'dev',
    name: '开发 Agent',
    description: '负责代码编写、文件操作、功能实现。',
    systemPrompt: '你是开发 Agent。你的职责是编写高质量代码、实现功能、修复 Bug。直接执行工具完成任务，不要创建多余的工单。',
    tools: ['read', 'edit', 'write', 'bash', 'grep', 'glob', 'task_update', 'question'],
    maxConcurrent: 3,
    isolation: 'shared',
    color: '#22c55e',
    icon: '💻',
  },
  {
    id: 'test',
    name: '测试 Agent',
    description: '负责编写和运行测试用例，验证代码正确性。',
    systemPrompt: '你是测试 Agent。你的职责是编写单元测试、集成测试，运行测试套件，验证代码功能正确性。使用 bash 执行测试命令，使用 write 创建测试文件。',
    tools: ['read', 'write', 'bash', 'grep', 'glob', 'task_update', 'question'],
    maxConcurrent: 2,
    isolation: 'shared',
    color: '#f59e0b',
    icon: '🧪',
  },
  {
    id: 'review',
    name: '审查 Agent',
    description: '负责代码审查，检查质量、安全性和性能。',
    systemPrompt: '你是代码审查 Agent。你的职责是审查代码质量、安全性、性能问题。使用 read 和 grep 分析代码，使用 task_update 报告发现的问题。不要修改代码。',
    tools: ['read', 'grep', 'glob', 'diagnostics', 'git', 'task_update'],
    maxConcurrent: 1,
    isolation: 'snapshot',
    color: '#8b5cf6',
    icon: '🔍',
  },
  {
    id: 'doc',
    name: '文档 Agent',
    description: '负责编写和维护项目文档。',
    systemPrompt: '你是文档 Agent。你的职责是编写 README、API 文档、注释等。使用 write 创建文档文件，使用 read 了解项目结构。',
    tools: ['read', 'write', 'grep', 'glob', 'task_update', 'question'],
    maxConcurrent: 1,
    isolation: 'shared',
    color: '#ec4899',
    icon: '📝',
  },
]

/** Get role by ID */
export function getRoleById(id: string): AgentRole | undefined {
  return BUILTIN_ROLES.find(r => r.id === id)
}

/** Get all available role IDs */
export function getRoleIds(): string[] {
  return BUILTIN_ROLES.map(r => r.id)
}
