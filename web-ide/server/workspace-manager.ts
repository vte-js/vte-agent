/**
 * Global workspace manager for Web IDE.
 *
 * Maintains a list of user-added workspaces, persisted to
 * ~/.vte-web-ide/workspaces.json (NOT inside any single workspace —
 * this is a host-level registry, independent of which workspace is active).
 *
 * Each workspace: { id, name, path, addedAt, lastUsedAt }
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

export interface WorkspaceEntry {
  id: string
  name: string
  path: string
  addedAt: number
  lastUsedAt: number
}

const CONFIG_DIR = path.join(os.homedir(), '.vte-web-ide')
const CONFIG_FILE = path.join(CONFIG_DIR, 'workspaces.json')

function generateId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export class WorkspaceManager {
  private cache: WorkspaceEntry[] | null = null

  /** Load the workspace list from disk. */
  async list(): Promise<WorkspaceEntry[]> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(CONFIG_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      this.cache = Array.isArray(parsed) ? parsed : []
    } catch {
      this.cache = []
    }
    return this.cache!
  }

  /** Save the workspace list to disk. */
  private async persist(entries: WorkspaceEntry[]): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
    await fs.writeFile(CONFIG_FILE, JSON.stringify(entries, null, 2), 'utf-8')
    this.cache = entries
  }

  /**
   * Add a workspace. Verifies the path exists and is a directory.
   * If the path is already registered, returns the existing entry.
   */
  async add(wsPath: string, name?: string): Promise<WorkspaceEntry> {
    const normalized = path.resolve(wsPath)
    const entries = await this.list()

    // Dedup by path
    const existing = entries.find((e) => path.resolve(e.path) === normalized)
    if (existing) {
      existing.lastUsedAt = Date.now()
      await this.persist(entries)
      return existing
    }

    // Verify path exists and is a directory
    try {
      const stat = await fs.stat(normalized)
      if (!stat.isDirectory()) {
        throw new Error(`Not a directory: ${normalized}`)
      }
    } catch (e: any) {
      throw new Error(`Path not accessible: ${normalized} — ${e.message}`)
    }

    const entry: WorkspaceEntry = {
      id: generateId(),
      name: name || path.basename(normalized) || normalized,
      path: normalized,
      addedAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    entries.push(entry)
    await this.persist(entries)
    return entry
  }

  /** Remove a workspace from the registry (does NOT delete files). */
  async remove(id: string): Promise<void> {
    const entries = await this.list()
    const filtered = entries.filter((e) => e.id !== id)
    await this.persist(filtered)
  }

  /** Update lastUsedAt for a workspace (called on switch). */
  async markUsed(id: string): Promise<void> {
    const entries = await this.list()
    const entry = entries.find((e) => e.id === id)
    if (entry) {
      entry.lastUsedAt = Date.now()
      await this.persist(entries)
    }
  }

  /** Find a workspace by id. */
  async get(id: string): Promise<WorkspaceEntry | null> {
    const entries = await this.list()
    return entries.find((e) => e.id === id) || null
  }

  /**
   * Browse a directory and return its subdirectories (for the "add workspace"
   * path picker). Filters out hidden dirs and node_modules. Returns at most
   * 100 entries.
   */
  async browse(dirPath?: string): Promise<{ path: string; name: string }[]> {
    const target = dirPath || os.homedir()
    try {
      const entries = await fs.readdir(target, { withFileTypes: true })
      return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 100)
    } catch {
      return []
    }
  }

  /** Get common starting points for the path browser. */
  getBrowseRoots(): { name: string; path: string }[] {
    const home = os.homedir()
    const roots = [
      { name: 'Home', path: home },
    ]
    // Common dev directories
    const candidates = [
      { name: 'Documents', path: path.join(home, 'Documents') },
      { name: 'Projects', path: path.join(home, 'Projects') },
      { name: 'Code', path: path.join(home, 'Code') },
      { name: 'Developer', path: path.join(home, 'Developer') },
      { name: 'workspace', path: path.join(home, 'workspace') },
      { name: 'Desktop', path: path.join(home, 'Desktop') },
    ]
    for (const c of candidates) {
      // Only include if the directory exists — checked lazily by the browser
      roots.push(c)
    }
    return roots
  }
}
