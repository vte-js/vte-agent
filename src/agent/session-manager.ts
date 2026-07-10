/**
 * Session Manager - manages conversation sessions
 * Stores sessions in .vte/sessions/ directory
 */

import * as fs from 'fs'
import * as path from 'path'
import { SessionMeta, SessionData, ChatMessage, SessionIndex, SessionExport } from './session-types'

export class SessionManager {
  private sessionsDir: string
  private indexPath: string

  constructor(workspaceRoot: string) {
    this.sessionsDir = path.join(workspaceRoot, '.vte', 'sessions')
    this.indexPath = path.join(this.sessionsDir, 'index.json')
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true })
    }
    if (!fs.existsSync(this.indexPath)) {
      this.writeIndex({ sessions: [], version: 1 })
    }
  }

  private readIndex(): SessionIndex {
    try {
      const content = fs.readFileSync(this.indexPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return { sessions: [], version: 1 }
    }
  }

  private writeIndex(index: SessionIndex): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2))
  }

  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }

  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId)
  }

  // ── CRUD Operations ──

  async createSession(name?: string, model?: string): Promise<SessionMeta> {
    const id = this.generateId()
    const now = Date.now()

    const metadata: SessionMeta = {
      id,
      name: name || `会话 ${new Date(now).toLocaleString('zh-CN')}`,
      tags: [],
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      model: model || 'unknown',
      tokenUsage: { prompt: 0, completion: 0 },
    }

    // Save to index
    const index = this.readIndex()
    index.sessions.unshift(metadata)
    this.writeIndex(index)

    // Create session directory
    const sessionDir = this.getSessionDir(id)
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    // Save empty messages
    this.writeMessages(id, [])

    console.log(`[VTE] Session created: ${id}`)
    return metadata
  }

  async getSession(id: string): Promise<SessionData | null> {
    const index = this.readIndex()
    const meta = index.sessions.find(s => s.id === id)
    if (!meta) return null

    const messages = await this.getMessages(id)
    return { metadata: meta, messages }
  }

  async listSessions(): Promise<SessionMeta[]> {
    const index = this.readIndex()
    return index.sessions
  }

  async updateSession(id: string, updates: Partial<SessionMeta>): Promise<void> {
    const index = this.readIndex()
    const session = index.sessions.find(s => s.id === id)
    if (!session) return

    Object.assign(session, updates, { updatedAt: Date.now() })
    this.writeIndex(index)
  }

  async deleteSession(id: string): Promise<boolean> {
    const index = this.readIndex()
    const idx = index.sessions.findIndex(s => s.id === id)
    if (idx === -1) return false

    // Remove from index
    index.sessions.splice(idx, 1)
    this.writeIndex(index)

    // Remove session directory
    const sessionDir = this.getSessionDir(id)
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    }

    console.log(`[VTE] Session deleted: ${id}`)
    return true
  }

  // ── Message Operations ──

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const messages = await this.getMessages(sessionId)
    messages.push(message)
    this.writeMessages(sessionId, messages)

    // Update metadata
    await this.updateSession(sessionId, {
      messageCount: messages.length,
    })
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const messagesPath = path.join(this.getSessionDir(sessionId), 'messages.json')
    try {
      const content = fs.readFileSync(messagesPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return []
    }
  }

  private writeMessages(sessionId: string, messages: ChatMessage[]): void {
    const sessionDir = this.getSessionDir(sessionId)
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }
    const messagesPath = path.join(sessionDir, 'messages.json')
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2))
  }

  // ── Search ──

  async searchSessions(query: string): Promise<SessionMeta[]> {
    const index = this.readIndex()
    const lowerQuery = query.toLowerCase()

    return index.sessions.filter(s => {
      // Search in name
      if (s.name.toLowerCase().includes(lowerQuery)) return true
      // Search in summary
      if (s.summary?.toLowerCase().includes(lowerQuery)) return true
      // Search in tags
      if (s.tags.some(t => t.toLowerCase().includes(lowerQuery))) return true
      // Search in thumbnail (first message)
      if (s.thumbnail?.toLowerCase().includes(lowerQuery)) return true
      return false
    })
  }

  // ── Export/Import ──

  async exportSession(sessionId: string): Promise<string> {
    const data = await this.getSession(sessionId)
    if (!data) throw new Error('Session not found')

    const exportData: SessionExport = {
      version: 1,
      metadata: data.metadata,
      messages: data.messages,
    }

    return JSON.stringify(exportData, null, 2)
  }

  async importSession(jsonData: string): Promise<SessionMeta> {
    const exportData: SessionExport = JSON.parse(jsonData)

    if (exportData.version !== 1) {
      throw new Error('Unsupported export version')
    }

    // Create new session with imported data
    const id = this.generateId()
    const now = Date.now()

    const metadata: SessionMeta = {
      ...exportData.metadata,
      id,
      name: `${exportData.metadata.name} (导入)`,
      createdAt: now,
      updatedAt: now,
    }

    // Create session directory
    const sessionDir = this.getSessionDir(id)
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true })
    }

    // Save to index
    const index = this.readIndex()
    index.sessions.unshift(metadata)
    this.writeIndex(index)

    // Save messages
    this.writeMessages(id, exportData.messages || [])

    console.log(`[VTE] Session imported: ${id}`)
    return metadata
  }

  // ── Auto-save ──

  async autoSave(sessionId: string, state: {
    messages: ChatMessage[]
    model: string
    tokenUsage: { prompt: number; completion: number }
  }): Promise<void> {
    // Save messages
    this.writeMessages(sessionId, state.messages)

    // Get first user message for auto-naming
    const firstUserMessage = state.messages.find(m => m.role === 'user')?.text
    const thumbnail = firstUserMessage?.slice(0, 100)

    // Auto-generate name from first user message if name is default
    const index = this.readIndex()
    const session = index.sessions.find(s => s.id === sessionId)
    const isDefaultName = session?.name.startsWith('会话 ')

    const updates: Partial<SessionMeta> = {
      messageCount: state.messages.length,
      model: state.model,
      tokenUsage: state.tokenUsage,
      thumbnail,
    }

    // Auto-generate name if using default name and have first message
    if (isDefaultName && firstUserMessage) {
      updates.name = this.generateSessionName(firstUserMessage)
    }

    await this.updateSession(sessionId, updates)
  }

  private generateSessionName(text: string): string {
    // Extract a meaningful name from the first user message
    // Remove common prefixes and limit length
    let name = text
      .replace(/^(请|帮我|帮忙|能不能|可以|我想|我要|帮我|给我)/, '')
      .replace(/[。！？.!?]+$/, '')
      .trim()

    // Truncate to reasonable length
    if (name.length > 30) {
      name = name.slice(0, 30) + '...'
    }

    return name || '新会话'
  }

  // ── Utility ──

  getSessionCount(): number {
    return this.readIndex().sessions.length
  }

  getTotalTokenUsage(): { prompt: number; completion: number } {
    const index = this.readIndex()
    return index.sessions.reduce(
      (acc, s) => ({
        prompt: acc.prompt + s.tokenUsage.prompt,
        completion: acc.completion + s.tokenUsage.completion,
      }),
      { prompt: 0, completion: 0 }
    )
  }
}
