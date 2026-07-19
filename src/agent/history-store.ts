/**
 * Conversation-history persistence contract (host-agnostic, implemented once).
 *
 * This is the shared primitive for "auto save / restore the CURRENT chat"
 * (single-conversation granularity). Hosts opt in by providing a
 * `HistoryStore` on their `HostAdapter.history` — mirroring how the
 * optional `sandbox?` field works. Hosts that don't (e.g. a host that
 * relies on its own multi-session manager) simply omit it.
 *
 * The default `FsHistoryStore` writes `<root>/.vte/chat-history.json`,
 * portable with the repo (same dir as `config.json`).
 */

import * as fs from 'fs/promises'
import * as path from 'path'

export interface StoredMessage {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
  timestamp: string
  thinkingText?: string
  images?: unknown[]
  context?: unknown[]
  toolCalls?: unknown[]
}

export interface ChatHistoryPayload {
  version: 1
  savedAt: number
  messages: StoredMessage[]
  tokenStats?: unknown
}

/**
 * Host-agnostic conversation-history store.
 * A host provides one if it wants the engine to auto-persist the
 * current conversation; otherwise the in-memory chat is lost on reload.
 */
export interface HistoryStore {
  /** Persist the current conversation for `root`. */
  save(root: string, payload: ChatHistoryPayload): Promise<void>
  /** Load the saved conversation for `root`, or null if none yet. */
  load(root: string): Promise<ChatHistoryPayload | null>
  /** Remove the saved conversation for `root`. */
  clear(root: string): Promise<void>
}

function fileFor(root: string): string {
  return path.join(root, '.vte', 'chat-history.json')
}

/**
 * Default filesystem-backed store. Safe to use from any Node host
 * (VSCode extension host, Web IDE server, CLI, Electron).
 */
export class FsHistoryStore implements HistoryStore {
  async save(root: string, payload: ChatHistoryPayload): Promise<void> {
    const file = fileFor(root)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(payload), 'utf-8')
  }

  async load(root: string): Promise<ChatHistoryPayload | null> {
    try {
      const raw = await fs.readFile(fileFor(root), 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.messages)) {
        return parsed as ChatHistoryPayload
      }
    } catch {
      /* no history yet — not an error */
    }
    return null
  }

  async clear(root: string): Promise<void> {
    try {
      await fs.unlink(fileFor(root))
    } catch {
      /* already gone */
    }
  }
}
