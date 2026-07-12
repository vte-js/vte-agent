/**
 * LSP Integration - Code Intelligence Service
 *
 * Unified service for code intelligence operations.
 * Abstracts away the underlying implementation (LSP, Tree-sitter, ripgrep).
 * Uses VS Code built-in API to execute language server commands.
 */

import * as vscode from 'vscode';
import {
  DefinitionResult,
  ReferenceResult,
  HoverResult,
  DocumentSymbolResult,
  DocumentSymbolInfo,
  GetDefinitionOptions,
  GetReferencesOptions,
  GetHoverOptions,
  GetDocumentSymbolsOptions,
  LspServiceStats,
  CodeLocation,
} from './types';
import { ConfigurationResolver, getConfigurationResolver } from './config-resolver';
import { LspCache, getLspCache } from './cache';
import { Guardrails, getGuardrails } from './guardrails';
import { LanguageCircuitBreakers, getLanguageCircuitBreakers } from './circuit-breaker';
import {
  createCodeLocation,
  getContextSnippet,
} from './result-summarizer';

export class CodeIntelligenceService {
  private configResolver: ConfigurationResolver;
  private cache: LspCache;
  private guardrails: Guardrails;
  private circuitBreakers: LanguageCircuitBreakers;

  // Event emitter for stats updates
  private _onStatsChange = new vscode.EventEmitter<LspServiceStats>();
  public readonly onStatsChange = this._onStatsChange.event;

  // Statistics
  private stats: LspServiceStats = {
    totalCalls: 0,
    cacheHits: 0,
    cacheMisses: 0,
    circuitBreakerTrips: 0,
    averageResponseTimeMs: 0,
    callsByTool: {
      definition: 0,
      references: 0,
      hover: 0,
      documentSymbol: 0,
    },
    callsByLanguage: {},
  };

  constructor(workspaceRoot: string) {
    this.configResolver = getConfigurationResolver(workspaceRoot);
    this.cache = getLspCache();
    this.guardrails = getGuardrails();
    this.circuitBreakers = getLanguageCircuitBreakers();
  }

  /**
   * Initialize the service.
   */
  async initialize(): Promise<void> {
    await this.configResolver.initialize();
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.configResolver.dispose();
    this._onStatsChange.dispose();
  }

  // ── Core Methods ──

  /**
   * Get definition(s) for a symbol at the given position.
   */
  async getDefinition(options: GetDefinitionOptions): Promise<DefinitionResult> {
    const startTime = Date.now();
    this.stats.totalCalls++;
    this.stats.callsByTool.definition++;

    try {
      // Check cache
      const cacheKey = LspCache.generateKey(
        options.uri.toString(),
        options.position.line,
        options.position.character,
        'definition'
      );
      const cached = this.cache.get<DefinitionResult>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;

      // Open document and run guardrails
      const document = await vscode.workspace.openTextDocument(options.uri);
      const languageId = document.languageId;

      const guardrailResult = await this.guardrails.checkFileSafety(document, languageId);
      if (!guardrailResult.allowed) {
        console.warn(`[VTE-LSP] Guardrail blocked definition lookup: ${guardrailResult.reason}`);
        return {
          locations: [],
          query: options,
        };
      }

      // Check if tool is enabled
      const isEnabled = await this.configResolver.isToolEnabled(languageId, 'definition');
      if (!isEnabled) {
        console.log(`[VTE-LSP] Definition not enabled for language: ${languageId}`);
        return {
          locations: [],
          query: options,
        };
      }

      // Execute VSCode command
      const timeout = await this.configResolver.getTimeout(languageId);
      const locations = await this.executeWithTimeout(
        () => vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          options.uri,
          options.position
        ),
        timeout
      );

      // Convert to our format
      const codeLocations: CodeLocation[] = [];
      for (const loc of locations ?? []) {
        const codeLoc = await createCodeLocation(loc, true);
        codeLocations.push(codeLoc);
      }

      const result: DefinitionResult = {
        locations: codeLocations,
        query: options,
      };

      // Cache result
      this.cache.set(cacheKey, result);

      // Record success
      this.guardrails.recordSuccess(languageId);
      this.updateStats(Date.now() - startTime, languageId);

      return result;
    } catch (error) {
      this.handleServiceError(error, 'definition', options.uri);
      return {
        locations: [],
        query: options,
      };
    }
  }

  /**
   * Get reference(s) for a symbol at the given position.
   */
  async getReferences(options: GetReferencesOptions): Promise<ReferenceResult> {
    const startTime = Date.now();
    this.stats.totalCalls++;
    this.stats.callsByTool.references++;

    try {
      // Check cache
      const cacheKey = LspCache.generateKey(
        options.uri.toString(),
        options.position.line,
        options.position.character,
        'references'
      );
      const cached = this.cache.get<ReferenceResult>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;

      // Open document and run guardrails
      const document = await vscode.workspace.openTextDocument(options.uri);
      const languageId = document.languageId;

      const guardrailResult = await this.guardrails.checkFileSafety(document, languageId);
      if (!guardrailResult.allowed) {
        console.warn(`[VTE-LSP] Guardrail blocked references lookup: ${guardrailResult.reason}`);
        return {
          locations: [],
          query: {
            ...options,
            includeDeclaration: options.includeDeclaration ?? true,
          },
        };
      }

      // Check if tool is enabled
      const isEnabled = await this.configResolver.isToolEnabled(languageId, 'references');
      if (!isEnabled) {
        console.log(`[VTE-LSP] References not enabled for language: ${languageId}`);
        return {
          locations: [],
          query: {
            ...options,
            includeDeclaration: options.includeDeclaration ?? true,
          },
        };
      }

      // Execute VSCode command
      const timeout = await this.configResolver.getTimeout(languageId);
      const locations = await this.executeWithTimeout(
        () => vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          options.uri,
          options.position
        ),
        timeout
      );

      // Convert to our format
      const codeLocations: CodeLocation[] = [];
      for (const loc of locations ?? []) {
        const codeLoc = await createCodeLocation(loc, true);
        codeLocations.push(codeLoc);
      }

      const result: ReferenceResult = {
        locations: codeLocations,
        query: {
          ...options,
          includeDeclaration: options.includeDeclaration ?? true,
        },
      };

      // Cache result
      this.cache.set(cacheKey, result);

      // Record success
      this.guardrails.recordSuccess(languageId);
      this.updateStats(Date.now() - startTime, languageId);

      return result;
    } catch (error) {
      this.handleServiceError(error, 'references', options.uri);
      return {
        locations: [],
        query: {
          ...options,
          includeDeclaration: options.includeDeclaration ?? true,
        },
      };
    }
  }

  /**
   * Get hover information for a symbol at the given position.
   */
  async getHover(options: GetHoverOptions): Promise<HoverResult> {
    const startTime = Date.now();
    this.stats.totalCalls++;
    this.stats.callsByTool.hover++;

    try {
      // Check cache
      const cacheKey = LspCache.generateKey(
        options.uri.toString(),
        options.position.line,
        options.position.character,
        'hover'
      );
      const cached = this.cache.get<HoverResult>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;

      // Open document and run guardrails
      const document = await vscode.workspace.openTextDocument(options.uri);
      const languageId = document.languageId;

      const guardrailResult = await this.guardrails.checkFileSafety(document, languageId);
      if (!guardrailResult.allowed) {
        console.warn(`[VTE-LSP] Guardrail blocked hover lookup: ${guardrailResult.reason}`);
        return {
          content: '',
          query: options,
        };
      }

      // Check if tool is enabled
      const isEnabled = await this.configResolver.isToolEnabled(languageId, 'hover');
      if (!isEnabled) {
        console.log(`[VTE-LSP] Hover not enabled for language: ${languageId}`);
        return {
          content: '',
          query: options,
        };
      }

      // Execute VSCode command
      const timeout = await this.configResolver.getTimeout(languageId);
      console.log(`[VTE-LSP] Hover query: ${options.uri.fsPath}:${options.position.line + 1}:${options.position.character}`);

      const hover = await this.executeWithTimeout(
        () => vscode.commands.executeCommand<vscode.Hover>(
          'vscode.executeHoverProvider',
          options.uri,
          options.position
        ),
        timeout
      );

      // Log hover result for debugging
      console.log(`[VTE-LSP] Hover result:`, hover ? 'found' : 'null');
      if (hover?.contents) {
        console.log(`[VTE-LSP] Hover contents count: ${Array.isArray(hover.contents) ? hover.contents.length : 1}`);
      }

      // Extract content - handle all VSCode Hover content formats
      let content = '';
      if (hover?.contents) {
        const contents = hover.contents;
        if (Array.isArray(contents)) {
          content = contents
            .map((c) => {
              if (typeof c === 'string') return c;
              // MarkdownString
              if (c && typeof c === 'object' && 'value' in c) {
                return c.value;
              }
              // MarkedString with language
              if (c && typeof c === 'object' && 'language' in c && 'value' in c) {
                return `\`\`\`${(c as any).language}\n${(c as any).value}\n\`\`\``;
              }
              return String(c);
            })
            .filter(c => c.trim()) // Filter empty content
            .join('\n\n');
        } else if (typeof contents === 'string') {
          content = contents;
        }
      }

      // If content is empty but hover exists, provide a fallback message
      if (!content && hover) {
        content = '(Hover information available but empty - symbol may not have documentation)';
      }

      const result: HoverResult = {
        content,
        range: hover?.range,
        query: options,
      };

      // Cache result
      this.cache.set(cacheKey, result);

      // Record success
      this.guardrails.recordSuccess(languageId);
      this.updateStats(Date.now() - startTime, languageId);

      return result;
    } catch (error) {
      this.handleServiceError(error, 'hover', options.uri);
      return {
        content: '',
        query: options,
      };
    }
  }

  /**
   * Get document symbols for a file.
   */
  async getDocumentSymbols(options: GetDocumentSymbolsOptions): Promise<DocumentSymbolResult> {
    const startTime = Date.now();
    this.stats.totalCalls++;
    this.stats.callsByTool.documentSymbol++;

    try {
      // Check cache
      const cacheKey = LspCache.generateKey(
        options.uri.toString(),
        0,
        0,
        'documentSymbol'
      );
      const cached = this.cache.get<DocumentSymbolResult>(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
      this.stats.cacheMisses++;

      // Open document and run guardrails
      const document = await vscode.workspace.openTextDocument(options.uri);
      const languageId = document.languageId;

      const guardrailResult = await this.guardrails.checkFileSafety(document, languageId);
      if (!guardrailResult.allowed) {
        console.warn(`[VTE-LSP] Guardrail blocked document symbols: ${guardrailResult.reason}`);
        return {
          symbols: [],
          query: {
            uri: options.uri,
            documentName: document.fileName,
          },
        };
      }

      // Check if tool is enabled
      const isEnabled = await this.configResolver.isToolEnabled(languageId, 'documentSymbol');
      if (!isEnabled) {
        console.log(`[VTE-LSP] Document symbols not enabled for language: ${languageId}`);
        return {
          symbols: [],
          query: {
            uri: options.uri,
            documentName: document.fileName,
          },
        };
      }

      // Execute VSCode command
      const timeout = await this.configResolver.getTimeout(languageId);
      const symbols = await this.executeWithTimeout(
        () => vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          'vscode.executeDocumentSymbolProvider',
          options.uri
        ),
        timeout
      );

      // Convert to our format
      const codeSymbols: DocumentSymbolInfo[] = [];
      for (const sym of symbols ?? []) {
        const codeSym = this.convertDocumentSymbol(sym);
        codeSymbols.push(codeSym);
      }

      const result: DocumentSymbolResult = {
        symbols: codeSymbols,
        query: {
          uri: options.uri,
          documentName: document.fileName,
        },
      };

      // Cache result
      this.cache.set(cacheKey, result);

      // Record success
      this.guardrails.recordSuccess(languageId);
      this.updateStats(Date.now() - startTime, languageId);

      return result;
    } catch (error) {
      this.handleServiceError(error, 'documentSymbol', options.uri);
      return {
        symbols: [],
        query: {
          uri: options.uri,
          documentName: '',
        },
      };
    }
  }

  // ── Utility Methods ──

  /**
   * Get service statistics.
   */
  getStats(): LspServiceStats {
    return { ...this.stats };
  }

  /**
   * Clear the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clear cache for a specific file.
   */
  clearCacheForFile(uri: vscode.Uri): number {
    return this.cache.deleteByUri(uri.toString());
  }

  /**
   * Reset circuit breaker for a language.
   */
  resetCircuitBreaker(languageId: string): void {
    this.circuitBreakers.resetLanguage(languageId);
  }

  // ── Private Methods ──

  /**
   * Execute a command with timeout.
   */
  private async executeWithTimeout<T>(
    fn: () => Thenable<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Convert VSCode DocumentSymbol to our format.
   */
  private convertDocumentSymbol(symbol: vscode.DocumentSymbol): DocumentSymbolInfo {
    return {
      name: symbol.name,
      kind: symbol.kind,
      range: symbol.range,
      selectionRange: symbol.selectionRange,
      detail: symbol.detail,
      children: symbol.children?.map((child) => this.convertDocumentSymbol(child)),
    };
  }

  /**
   * Handle service errors.
   */
  private handleServiceError(
    error: unknown,
    tool: string,
    uri: vscode.Uri
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[VTE-LSP] Error in ${tool}: ${message}`);

    // Record failure for circuit breaker
    const languageId = this.getLanguageIdFromUri(uri);
    if (languageId) {
      this.guardrails.recordFailure(languageId);
    }
  }

  /**
   * Get language ID from URI.
   */
  private getLanguageIdFromUri(uri: vscode.Uri): string | undefined {
    const ext = uri.path.split('.').pop()?.toLowerCase();
    if (!ext) return undefined;

    const extMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
    };

    return extMap[ext];
  }

  /**
   * Update performance statistics.
   */
  private updateStats(responseTimeMs: number, languageId: string): void {
    // Update average response time
    const total = this.stats.totalCalls;
    this.stats.averageResponseTimeMs =
      (this.stats.averageResponseTimeMs * (total - 1) + responseTimeMs) / total;

    // Update language stats
    this.stats.callsByLanguage[languageId] =
      (this.stats.callsByLanguage[languageId] ?? 0) + 1;

    // Emit stats change event
    this._onStatsChange.fire(this.stats);
  }
}

/** Singleton instance */
let serviceInstance: CodeIntelligenceService | null = null;

/**
 * Get or create the code intelligence service.
 */
export function getCodeIntelligenceService(workspaceRoot: string): CodeIntelligenceService {
  if (!serviceInstance) {
    serviceInstance = new CodeIntelligenceService(workspaceRoot);
  }
  return serviceInstance;
}

/**
 * Reset the service instance (for testing).
 */
export function resetCodeIntelligenceService(): void {
  serviceInstance?.dispose();
  serviceInstance = null;
}
