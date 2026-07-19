/**
 * WS protocol shared by the Web IDE client.
 *
 * Shapes intentionally mirror `webview/src/protocol.ts` (the VSCode
 * host's message union) so the same core event stream drives both UIs.
 * Kept minimal for M1; rich types (sessions, skills, LSP) land later.
 */

export type ViewUpdate =
  | { type: 'thinking_start' }
  | { type: 'thinking_chunk'; text: string }
  | { type: 'stream_chunk'; text: string }
  | { type: 'tool_call'; toolCallId: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: string; elapsed: number }
  | { type: 'permission_request'; requestId: string; toolName: string; toolArgs: Record<string, unknown>; category: string }
  | { type: 'question_request'; requestId: string; question: string; options: Array<{ label: string; description?: string }>; multiple: boolean; recommended?: string }

// Top-level server -> client
export type ServerMessage =
  | { type: 'update'; update: ViewUpdate }
  | { type: 'response'; text: string }
  | { type: 'error'; text: string }
  | { type: 'toast'; level: 'info' | 'success' | 'warning' | 'error'; text: string }
  | { type: 'configData'; workspace?: string; models: Array<{ name: string; apiKey: string; apiBase: string; model: string }>; subAgentTimeout?: number; forceMultiAgent?: boolean }
  | { type: 'cleared' }

// Client -> server
export type ClientMessage =
  | { type: 'ready' }
  | { type: 'chat'; text: string; model?: string; temperature?: number; topP?: number; maxTokens?: number }
  | { type: 'permissionResponse'; requestId: string; decision: 'allow_once' | 'always_allow' | 'deny' }
  | { type: 'getConfig' }
  | { type: 'clear' }

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
}

export interface StatusEvent {
  id: number
  kind: 'tool_call' | 'tool_result' | 'permission' | 'info'
  title: string
  detail?: string
  elapsed?: number
}
