/**
 * Server-side configuration persistence for Web IDE.
 *
 * Stores model profiles, active model index, sub-agent timeout, force-multi-agent
 * flag, and reasoning level in `.vte/config.json` within the workspace root.
 *
 * SECURITY: API keys are stored in plaintext on the server (in .vte/config.json)
 * but are NEVER sent to the browser in plaintext — they are masked as '***'
 * in configData messages. When the client sends back '***' as apiKey, the
 * existing key is preserved (not overwritten).
 */

import * as fs from 'fs/promises'
import * as path from 'path'

export interface ModelProfile {
  name: string
  apiKey: string
  apiBase: string
  model: string
  api?: 'chat' | 'responses'
}

export interface PersistedConfig {
  models: ModelProfile[]
  activeModelIndex: number
  subAgentTimeout: number
  forceMultiAgent: boolean
  reasoningLevel: string
}

const DEFAULT_CONFIG: PersistedConfig = {
  models: [],
  activeModelIndex: 0,
  subAgentTimeout: 300,
  forceMultiAgent: false,
  reasoningLevel: 'medium',
}

const CONFIG_DIR = '.vte'
const CONFIG_FILE = 'config.json'

export class ConfigPersistence {
  private configPath: string
  private configDir: string
  private cache: PersistedConfig | null = null

  constructor(private workspaceRoot: string, private configDirOverride?: string) {
    this.configDir = configDirOverride ?? path.join(workspaceRoot, CONFIG_DIR)
    this.configPath = path.join(this.configDir, CONFIG_FILE)
  }

  /** Load config from disk, falling back to defaults if not found. */
  async load(): Promise<PersistedConfig> {
    if (this.cache) return this.cache

    try {
      const raw = await fs.readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(raw)
      this.cache = { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      // File doesn't exist or is invalid — use defaults
      this.cache = { ...DEFAULT_CONFIG }
    }

    return this.cache
  }

  /** Save config to disk. */
  async save(config: PersistedConfig): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true })
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    this.cache = { ...config }
  }

  /**
   * Update model profiles. Preserves existing API keys when the client
   * sends '***' as the apiKey (meaning "don't change").
   */
  async updateModels(
    models: ModelProfile[],
    activeModelIndex: number,
    extra?: { subAgentTimeout?: number; forceMultiAgent?: boolean },
  ): Promise<PersistedConfig> {
    const current = await this.load()

    // Preserve API keys: if a model's apiKey is '***', keep the existing key
    const mergedModels = models.map((m, i) => {
      if (m.apiKey === '***') {
        const existing = current.models[i]
        return { ...m, apiKey: existing?.apiKey || '' }
      }
      return m
    })

    const updated: PersistedConfig = {
      models: mergedModels,
      activeModelIndex: Math.min(activeModelIndex, mergedModels.length - 1),
      subAgentTimeout: extra?.subAgentTimeout ?? current.subAgentTimeout,
      forceMultiAgent: extra?.forceMultiAgent ?? current.forceMultiAgent,
      reasoningLevel: current.reasoningLevel,
    }

    await this.save(updated)
    return updated
  }

  /** Update only the active model index (model switch). */
  async setActiveModel(index: number): Promise<PersistedConfig> {
    const current = await this.load()
    current.activeModelIndex = Math.min(index, current.models.length - 1)
    await this.save(current)
    return current
  }

  /** Update reasoning level. */
  async setReasoningLevel(level: string): Promise<PersistedConfig> {
    const current = await this.load()
    current.reasoningLevel = level
    await this.save(current)
    return current
  }

  /**
   * Returns config safe for browser consumption — API keys are masked.
   * The browser receives '***' if a key exists, '' if not.
   */
  async getBrowserConfig(): Promise<{
    models: ModelProfile[]
    activeModelIndex: number
    subAgentTimeout: number
    forceMultiAgent: boolean
    reasoningLevel: string
  }> {
    const config = await this.load()
    return {
      models: config.models.map((m) => ({
        ...m,
        apiKey: m.apiKey ? '***' : '',
      })),
      activeModelIndex: config.activeModelIndex,
      subAgentTimeout: config.subAgentTimeout,
      forceMultiAgent: config.forceMultiAgent,
      reasoningLevel: config.reasoningLevel,
    }
  }

  /** Get the real (unmasked) API key for the active model. */
  async getActiveApiKey(): Promise<string> {
    const config = await this.load()
    return config.models[config.activeModelIndex]?.apiKey || ''
  }

  /** Get the full active model profile (with real API key). */
  async getActiveModel(): Promise<ModelProfile | null> {
    const config = await this.load()
    return config.models[config.activeModelIndex] || null
  }
}
