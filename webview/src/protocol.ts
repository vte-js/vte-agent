// Webview -> Extension Host
export interface ImageAttachment {
  name: string
  dataUrl: string
  mimeType: string
}

export interface ContextAttachment {
  path: string
  name: string
}

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'chat'; text: string; model: string; temperature: number; topP: number; maxTokens: number; images?: ImageAttachment[]; context?: ContextAttachment[] }
  | { type: 'requestContext'; source: 'file' | 'folder' | 'doc' | 'skills' | 'terminal' | 'git' }
  | { type: 'gitSelect'; source: 'changes' | 'commits'; items: string[] }
  | { type: 'skills:list' }
  | { type: 'skills:get'; skillPath: string }
  | { type: 'skills:save'; skillPath: string; content: string }
  | { type: 'skills:create'; name: string; dir: string; description?: string }
  | { type: 'skills:delete'; skillPath: string }
  | { type: 'skills:openPanel' }
  | { type: 'getPermissionConfig' }
  | { type: 'setPermissionConfig'; config: Record<string, string> }
  | { type: 'permissionResponse'; requestId: string; decision: 'allow_once' | 'always_allow' | 'deny' }
  | { type: 'clear' }
  | { type: 'getConfig' }
  | { type: 'saveModels'; models: Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses' }>; activeModelIndex: number; subAgentTimeout?: number; forceMultiAgent?: boolean }
  | { type: 'setMode'; mode: 'plan' | 'code' }
  | { type: 'setTaskMode'; taskMode: TaskMode }
  | { type: 'setReasoningLevel'; level: ReasoningLevel }
  // Session management
  | { type: 'session:create'; name?: string }
  | { type: 'session:list' }
  | { type: 'session:get'; sessionId: string }
  | { type: 'session:restore'; sessionId: string }
  | { type: 'session:delete'; sessionId: string }
  | { type: 'session:deleteAll' }
  | { type: 'session:rename'; sessionId: string; name: string }
  | { type: 'session:tag'; sessionId: string; tags: string[] }
  | { type: 'session:search'; query: string }
  | { type: 'session:export'; sessionId: string }
  | { type: 'session:import'; data: string }
  // LSP management
  | { type: 'getLspProfiles' }
  | { type: 'lsp:setup' }
  | { type: 'lsp:test' }
  | { type: 'lsp:refreshStatus' }
  | { type: 'lsp:clearCache' }
  // LSP config editor
  | { type: 'lspConfigEditor:open' }
  | { type: 'lspConfigEditor:save'; profile: LspProfile }
  | { type: 'lspConfigEditor:delete'; languageId: string }
  | { type: 'lspConfigEditor:add'; profile: LspProfile }

export type TaskMode = 'off' | 'llm-auto' | 'plugin-auto'
export type ReasoningLevel = 'low' | 'medium' | 'high'

export interface LspProfile {
  languageId: string
  tools: string[]
  strategy: string
  fileExtensions: string[]
  timeoutMs?: number
  command?: string
  args?: string[]
}

export const TASK_MODE_OPTIONS: Array<{ value: TaskMode; label: string; desc: string }> = [
  { value: 'off', label: '关闭', desc: '不使用任务清单' },
  { value: 'llm-auto', label: 'LLM 自判断', desc: 'LLM 自行决定是否需要任务清单，插件校验是否偷懒' },
  { value: 'plugin-auto', label: '插件自判断', desc: '插件分析任务复杂度，自动指导 LLM 是否使用任务清单' },
]

// Extension Host -> Webview
export type HostToWebviewMessage =
  | { type: 'thinking' }
  | { type: 'response'; text: string }
  | { type: 'error'; text: string }
  | { type: 'toast'; level: 'success' | 'error' | 'info' | 'warning'; text: string }
  | { type: 'filePickerResult'; files: ContextAttachment[] }
  | { type: 'gitData'; changes: string[]; commits: Array<{ hash: string; message: string }> }
  | { type: 'cleared' }
  | { type: 'configData'; models?: Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses' }>; subAgentTimeout?: number; forceMultiAgent?: boolean }
  | { type: 'configSaved' }
  | { type: 'showSettings' }
  | { type: 'modeChanged'; mode: 'plan' | 'code' }
  | { type: 'tool_call'; toolCallId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; elapsed: number }
  | { type: 'tokenStats'; totalPrompt: number; totalCompletion: number; totalTokens: number; totalCost: number; requestCount: number; perModel: Record<string, { tokens: number; cost: number; count: number }>; recent: Array<{ model: string; prompt: number; completion: number; total: number; cost: number }> }
  // Skills management
  | { type: 'skills:list'; skills: Array<{ name: string; path: string; dir: string; description: string }>; dirs: string[] }
  | { type: 'skills:pickList'; skills: Array<{ name: string; path: string; description: string }> }
  | { type: 'skills:pickConfirm'; paths: string[] }
  // Permission control
  | { type: 'permissionRequest'; requestId: string; toolName: string; toolArgs: Record<string, unknown>; category: string }
  | { type: 'permissionConfig'; config: Record<string, string> }
  | { type: 'skills:content'; path: string; content: string }
  | { type: 'skills:saved'; path: string }
  | { type: 'skills:created'; name: string; path: string }
  | { type: 'skills:deleted'; path: string }
  // Session management
  | { type: 'session:list'; sessions: SessionMeta[] }
  | { type: 'session:created'; session: SessionMeta }
  | { type: 'session:data'; session: SessionData }
  | { type: 'session:restored'; sessionId: string }
  | { type: 'session:deleted'; sessionId: string }
  | { type: 'session:renamed'; sessionId: string; name: string }
  | { type: 'session:tagged'; sessionId: string; tags: string[] }
  | { type: 'session:searchResult'; sessions: SessionMeta[] }
  | { type: 'session:exported'; sessionId: string; data: string }
  | { type: 'session:imported'; session: SessionMeta }
  | { type: 'session:error'; text: string }
  // LSP profiles
  | { type: 'lspProfiles'; profiles: Record<string, LspProfile> }
  | { type: 'lsp:testResult'; success: boolean; message: string }
  | { type: 'lsp:statsUpdate'; stats: { totalCalls: number; cacheHits: number; cacheMisses: number; callsByLanguage: Record<string, number> } }
  // LSP config editor
  | { type: 'lspConfigEditor:data'; profiles: Record<string, LspProfile> }
  | { type: 'lspConfigEditor:saved'; languageId: string }
  | { type: 'lspConfigEditor:deleted'; languageId: string }
  // Multi-agent auto-delegation status (main chat active-agent strip)
  | { type: 'multiAgent:delegationStart'; request: string }
  | { type: 'multiAgent:delegationEnd' }

export interface SessionMeta {
  id: string
  name: string
  summary?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  messageCount: number
  model: string
  tokenUsage: { prompt: number; completion: number }
  thumbnail?: string
}

export interface SessionData {
  metadata: SessionMeta
  messages: Array<{
    id: number
    role: 'user' | 'assistant' | 'error'
    text: string
    timestamp: string
  }>
}

export interface ModelOption {
  value: string
  label: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'qwen-max', label: 'Qwen Max' },
  { value: 'mimo-v2.5', label: 'MiMo v2.5 (Xiaomi)' },
  { value: 'mimo-v2.5-pro', label: 'MiMo v2.5 Pro (Xiaomi)' },
]
