/**
 * Core types for VTE Agent Engine
 * Framework-agnostic interfaces for the agent runtime
 */

// ── File Types ──

export interface FileNode {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  language?: string
  children?: FileNode[]
}

export interface ProjectIndex {
  structure: FileNode[]
  packageInfo?: PackageInfo
  gitInfo?: GitInfo
  workspaceRoot: string
  generatedAt: number
}

export interface PackageInfo {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface GitInfo {
  branch?: string
  remote?: string
  lastCommit?: string
}

// ── Context Types ──

export interface LineRange {
  start: number
  end: number
}

export interface FileContent {
  path: string
  content: string
  range?: LineRange
  totalLines: number
  truncated: boolean
}

export interface SummarizedContent {
  path: string
  summary: string
  totalLines: number
  includedRanges: LineRange[]
}

export interface ContextSnapshot {
  projectIndex: ProjectIndex
  readFiles: Set<string>
  modifiedFiles: Set<string>
  tokenEstimate: number
}

// ── Tool Types ──

export interface ToolResult {
  type: 'text' | 'file' | 'error'
  content: string
  metadata?: {
    path?: string
    lineRange?: LineRange
    truncated?: boolean
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, context: ContextManager) => Promise<ToolResult>
}

// ── Context Manager Interface ──

export interface ContextManager {
  buildIndex(): Promise<ProjectIndex>
  readFile(path: string, range?: LineRange): Promise<FileContent>
  summarizeFile(path: string, maxTokens?: number): Promise<SummarizedContent>
  getSnapshot(): ContextSnapshot
  reset(): void
  markModified(filePath: string): void
}

// ── Message Types ──

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  tool_call_id?: string  // Required for tool role messages (MiMo API)
}

// ── LLM Types ──

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string }>
  tool_call_id?: string
}

export interface LLMRequest {
  model: string
  messages: LLMMessage[]
  tools?: unknown[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  stream?: boolean
  stream_options?: { include_usage?: boolean }
  chat_template_kwargs?: Record<string, unknown>
  thinking?: { type: string; budget_tokens: number }
}

export interface LLMResponse {
  id: string
  choices: Array<{
    message: {
      role: string
      content?: string
      tool_calls?: Array<{
        id: string
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// ── Runtime Types ──

export type AgentMode = 'plan' | 'code'
export type TaskMode = 'off' | 'llm-auto' | 'plugin-auto'

export interface RuntimeConfig {
  model: string
  apiKey: string
  apiBase: string
  workspaceRoot: string
  tools?: string[]  // Optional tool whitelist
}

export type AgentEvent =
  | { type: 'thinking' }
  | { type: 'thinking_chunk'; text: string }
  | { type: 'stream_chunk'; text: string }
  | { type: 'response'; text: string }
  | { type: 'tool_call'; toolCallId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; elapsed: number }
  | { type: 'error'; text: string }

// ── Checkpoint Types ──

export interface Checkpoint {
  id: string
  name: string
  timestamp: number
  messages: AgentMessage[]
  chatHistory: Array<{
    id: number
    role: 'user' | 'assistant' | 'error'
    text: string
    timestamp: string
    thinkingText?: string
  }>
  modifiedFiles: Record<string, string>
  tasks: Array<{
    id: number
    title: string
    status: 'pending' | 'in_progress' | 'done' | 'blocked'
    subtasks?: number[]
  }>
  mode: AgentMode
  taskMode: TaskMode
  tokenStats: {
    prompt: number
    completion: number
  }
  gitCommit?: string
  gitTag?: string
}

export interface CheckpointMetadata {
  messages: AgentMessage[]
  mode: string
  taskMode: string
  tokenStats: { prompt: number; completion: number }
}
