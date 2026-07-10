/**
 * Session Management Types
 */

export interface SessionMeta {
  id: string
  name: string
  summary?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  messageCount: number
  model: string
  tokenUsage: {
    prompt: number
    completion: number
  }
  checkpointId?: string
  thumbnail?: string
}

export interface SessionData {
  metadata: SessionMeta
  messages: ChatMessage[]
  files?: Record<string, string>
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
  timestamp: string
  thinkingText?: string
  images?: Array<{ name: string; dataUrl: string; mimeType: string }>
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
    status: 'pending' | 'running' | 'done' | 'error'
    result?: string
    elapsed?: number
  }>
}

export interface SessionIndex {
  sessions: SessionMeta[]
  version: number
}

export interface SessionExport {
  version: 1
  metadata: SessionMeta
  messages: ChatMessage[]
}
