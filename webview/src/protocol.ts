// Webview -> Extension Host
export type WebviewToHostMessage =
  | { type: 'chat'; text: string; model: string; temperature: number; topP: number; maxTokens: number }
  | { type: 'clear' }
  | { type: 'saveConfig'; apiKey: string; apiBase: string; model: string }
  | { type: 'getConfig' }
  | { type: 'setMode'; mode: 'plan' | 'code' }
  | { type: 'setTaskMode'; taskMode: TaskMode }

export type TaskMode = 'off' | 'llm-auto' | 'plugin-auto'

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
  | { type: 'cleared' }
  | { type: 'configData'; apiKey: string; apiBase: string; model: string }
  | { type: 'configSaved' }
  | { type: 'showSettings' }
  | { type: 'modeChanged'; mode: 'plan' | 'code' }
  | { type: 'tool_call'; toolCallId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; elapsed: number }
  | { type: 'tokenStats'; totalPrompt: number; totalCompletion: number; totalTokens: number; totalCost: number; requestCount: number; perModel: Record<string, { tokens: number; cost: number; count: number }>; recent: Array<{ model: string; prompt: number; completion: number; total: number; cost: number }> }

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
]
