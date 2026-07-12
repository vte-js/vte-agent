/**
 * LSP Integration - Configuration Resolver
 *
 * Resolves LSP configuration from multiple sources with priority:
 * 1. Project workspace: .github/agent-lsp.json (highest priority)
 * 2. VS Code settings: vteAgent.lsp.profiles
 * 3. Plugin built-in defaults (lowest priority)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  LspProfile,
  RawLspConfig,
  ResolvedLspConfig,
} from './types';
import { DEFAULT_LSP_PROFILES, getLanguageFromExtension } from './defaults';

/** Configuration file path relative to workspace root */
const CONFIG_FILE_PATH = '.github/agent-lsp.json';

/** VS Code setting key */
const VSCODE_SETTING_KEY = 'vteAgent.lsp.profiles';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 5000;

export class ConfigurationResolver {
  private resolvedConfig: ResolvedLspConfig | null = null;
  private configWatcher: vscode.FileSystemWatcher | null = null;
  private onConfigChangeEmitter = new vscode.EventEmitter<ResolvedLspConfig>();

  /** Event fired when configuration changes */
  public readonly onConfigChange = this.onConfigChangeEmitter.event;

  constructor(private workspaceRoot: string) {}

  /**
   * Initialize the configuration resolver.
   * Sets up file watcher for project config changes.
   */
  async initialize(): Promise<void> {
    // Watch for project config changes
    const configPath = path.join(this.workspaceRoot, CONFIG_FILE_PATH);
    this.configWatcher = vscode.workspace.createFileSystemWatcher(configPath);

    this.configWatcher.onDidChange(() => this.reloadConfig());
    this.configWatcher.onDidCreate(() => this.reloadConfig());
    this.configWatcher.onDidDelete(() => this.reloadConfig());

    // Initial load
    await this.reloadConfig();
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.configWatcher?.dispose();
    this.onConfigChangeEmitter.dispose();
  }

  /**
   * Reload configuration from all sources.
   */
  async reloadConfig(): Promise<ResolvedLspConfig> {
    const profiles = new Map<string, LspProfile>();

    // 1. Apply built-in defaults (lowest priority)
    for (const [langId, profile] of Object.entries(DEFAULT_LSP_PROFILES)) {
      profiles.set(langId, { ...profile });
    }

    // 2. Apply VS Code settings (medium priority)
    const vscodeConfig = this.loadVSCodeSettings();
    for (const [langId, profile] of vscodeConfig) {
      profiles.set(langId, profile);
    }

    // 3. Apply project config (highest priority)
    const { profiles: projectConfig, deleted } = await this.loadProjectConfig();
    for (const [langId, profile] of projectConfig) {
      profiles.set(langId, profile);
    }

    // 4. Remove deleted profiles
    for (const langId of deleted) {
      profiles.delete(langId);
    }

    this.resolvedConfig = { profiles };
    this.onConfigChangeEmitter.fire(this.resolvedConfig);

    return this.resolvedConfig;
  }

  /**
   * Get the resolved configuration.
   * Loads it if not already loaded.
   */
  async getConfig(): Promise<ResolvedLspConfig> {
    if (!this.resolvedConfig) {
      await this.reloadConfig();
    }
    return this.resolvedConfig!;
  }

  /**
   * Get LSP profile for a specific file.
   * @param filePath Absolute or relative file path
   * @returns LspProfile if found, undefined otherwise
   */
  async getProfileForFile(filePath: string): Promise<LspProfile | undefined> {
    const config = await this.getConfig();

    // Try to detect language from file extension
    const ext = path.extname(filePath).toLowerCase();
    const langId = getLanguageFromExtension(ext);

    if (langId) {
      return config.profiles.get(langId);
    }

    // Try VS Code's language detection
    const vscodeLangId = await this.detectLanguageFromVSCode(filePath);
    if (vscodeLangId) {
      return config.profiles.get(vscodeLangId);
    }

    return undefined;
  }

  /**
   * Get LSP profile for a VS Code language ID.
   */
  async getProfileForLanguage(languageId: string): Promise<LspProfile | undefined> {
    const config = await this.getConfig();
    return config.profiles.get(languageId);
  }

  /**
   * Get all configured language profiles.
   */
  async getAllProfiles(): Promise<Map<string, LspProfile>> {
    const config = await this.getConfig();
    return new Map(config.profiles);
  }

  /**
   * Check if a tool is enabled for a given language.
   */
  async isToolEnabled(languageId: string, tool: string): Promise<boolean> {
    const profile = await this.getProfileForLanguage(languageId);
    if (!profile) {
      return false;
    }
    return profile.tools.includes(tool as any);
  }

  /**
   * Get timeout for a language profile.
   */
  async getTimeout(languageId: string): Promise<number> {
    const profile = await this.getProfileForLanguage(languageId);
    return profile?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── Private Methods ──

  /**
   * Load configuration from VS Code settings.
   */
  private loadVSCodeSettings(): Map<string, LspProfile> {
    const profiles = new Map<string, LspProfile>();

    try {
      const config = vscode.workspace.getConfiguration('vteAgent');
      const rawProfiles = config.get<Record<string, Partial<LspProfile>>>('lsp.profiles', {});

      for (const [langId, rawProfile] of Object.entries(rawProfiles)) {
        const profile = this.normalizeProfile(langId, rawProfile);
        if (profile) {
          profiles.set(langId, profile);
        }
      }
    } catch (error) {
      console.error('[VTE-LSP] Failed to load VS Code settings:', error);
    }

    return profiles;
  }

  /**
   * Load configuration from project workspace.
   */
  private async loadProjectConfig(): Promise<{ profiles: Map<string, LspProfile>; deleted: string[] }> {
    const profiles = new Map<string, LspProfile>();
    const deleted: string[] = [];

    try {
      const configPath = path.join(this.workspaceRoot, CONFIG_FILE_PATH);
      const uri = vscode.Uri.file(configPath);

      // Check if file exists
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        // File doesn't exist, return empty config
        return { profiles, deleted };
      }

      // Read and parse file
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString('utf-8');
      const rawConfig: RawLspConfig = JSON.parse(text);

      // Validate version
      if (rawConfig.version !== 1) {
        console.warn(`[VTE-LSP] Unsupported config version: ${rawConfig.version}`);
        return { profiles, deleted };
      }

      // Process profiles
      for (const [langId, rawProfile] of Object.entries(rawConfig.profiles)) {
        const profile = this.normalizeProfile(langId, rawProfile);
        if (profile) {
          profiles.set(langId, profile);
        }
      }

      // Process deleted list
      if (Array.isArray(rawConfig.deleted)) {
        deleted.push(...rawConfig.deleted);
      }
    } catch (error) {
      console.error('[VTE-LSP] Failed to load project config:', error);
    }

    return { profiles, deleted };
  }

  /**
   * Normalize a raw profile to a complete LspProfile.
   */
  private normalizeProfile(
    languageId: string,
    raw: Partial<LspProfile>
  ): LspProfile | null {
    // Get defaults for this language
    const defaults = DEFAULT_LSP_PROFILES[languageId];

    return {
      languageId,
      tools: raw.tools ?? defaults?.tools ?? ['definition', 'references', 'documentSymbol'],
      strategy: raw.strategy ?? defaults?.strategy ?? 'builtin',
      fileExtensions: raw.fileExtensions ?? defaults?.fileExtensions ?? [],
      timeoutMs: raw.timeoutMs ?? defaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * Detect language ID using VS Code's built-in detection.
   */
  private async detectLanguageFromVSCode(filePath: string): Promise<string | undefined> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      return doc.languageId;
    } catch {
      return undefined;
    }
  }
}

/** Singleton instance */
let resolverInstance: ConfigurationResolver | null = null;

/**
 * Get or create the configuration resolver.
 */
export function getConfigurationResolver(workspaceRoot: string): ConfigurationResolver {
  if (!resolverInstance) {
    resolverInstance = new ConfigurationResolver(workspaceRoot);
  }
  return resolverInstance;
}

/**
 * Reset the singleton instance (for testing).
 */
export function resetConfigurationResolver(): void {
  resolverInstance?.dispose();
  resolverInstance = null;
}
