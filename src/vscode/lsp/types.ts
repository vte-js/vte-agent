/**
 * LSP Integration - Type Definitions
 *
 * Core interfaces for the multi-language, configurable LSP integration.
 * Supports builtin strategy (VSCode built-in API) and direct strategy (manual LSP server).
 */

import * as vscode from 'vscode';

// ── Configuration Types ──

/** Tools available for LSP integration */
export type LspTool = 'definition' | 'references' | 'hover' | 'documentSymbol';

/** Execution strategy */
export type LspStrategy = 'builtin' | 'direct';

/** Single language LSP profile configuration */
export interface LspProfile {
  languageId: string;
  tools: LspTool[];
  strategy: LspStrategy;
  fileExtensions: string[];
  timeoutMs?: number;
  command?: string; // for direct mode
  args?: string[]; // for direct mode
}

/** Raw configuration from JSON file or VS Code settings */
export interface RawLspConfig {
  version: number;
  profiles: {
    [languageId: string]: Omit<LspProfile, 'languageId'>;
  };
  deleted?: string[];
}

/** Resolved configuration with all defaults applied */
export interface ResolvedLspConfig {
  profiles: Map<string, LspProfile>;
}

// ── Query Result Types ──

/** Code location with context */
export interface CodeLocation {
  uri: vscode.Uri;
  range: vscode.Range;
  context?: string;
}

/** Definition result */
export interface DefinitionResult {
  locations: CodeLocation[];
  query: {
    uri: vscode.Uri;
    position: vscode.Position;
    symbolName?: string;
  };
}

/** Reference result */
export interface ReferenceResult {
  locations: CodeLocation[];
  query: {
    uri: vscode.Uri;
    position: vscode.Position;
    symbolName?: string;
    includeDeclaration: boolean;
  };
}

/** Hover result */
export interface HoverResult {
  content: string;
  range?: vscode.Range;
  query: {
    uri: vscode.Uri;
    position: vscode.Position;
    symbolName?: string;
  };
}

/** Document symbol hierarchy */
export interface DocumentSymbolInfo {
  name: string;
  kind: vscode.SymbolKind;
  range: vscode.Range;
  selectionRange: vscode.Range;
  detail?: string;
  children?: DocumentSymbolInfo[];
}

/** Document symbols result */
export interface DocumentSymbolResult {
  symbols: DocumentSymbolInfo[];
  query: {
    uri: vscode.Uri;
    documentName: string;
  };
}

// ── Cache Types ──

/** Cache entry with TTL */
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttlMs: number;
}

/** Cache key components */
export interface CacheKey {
  uri: string;
  offset: number;
  tool: LspTool;
}

// ── Circuit Breaker Types ──

/** Circuit breaker states */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

/** Circuit breaker status */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime?: number;
  nextResetTime?: number;
}

// ── Guardrail Types ──

/** Guardrail check result */
export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

/** File size limits */
export interface FileSizeLimits {
  maxLines: number;
  warningThreshold: number;
}

// ── Service Types ──

/** Options for getDefinition */
export interface GetDefinitionOptions {
  uri: vscode.Uri;
  position: vscode.Position;
  includeDeclaration?: boolean;
}

/** Options for getReferences */
export interface GetReferencesOptions {
  uri: vscode.Uri;
  position: vscode.Position;
  includeDeclaration?: boolean;
}

/** Options for getHover */
export interface GetHoverOptions {
  uri: vscode.Uri;
  position: vscode.Position;
}

/** Options for getDocumentSymbols */
export interface GetDocumentSymbolsOptions {
  uri: vscode.Uri;
}

/** LSP service statistics */
export interface LspServiceStats {
  totalCalls: number;
  cacheHits: number;
  cacheMisses: number;
  circuitBreakerTrips: number;
  averageResponseTimeMs: number;
  callsByTool: Record<LspTool, number>;
  callsByLanguage: Record<string, number>;
}

// ── Health Metrics Types ──

/** LSP health metrics for a language */
export interface LspHealthMetrics {
  languageId: string;
  status: 'online' | 'offline' | 'circuit-breaker-open';
  strategy: 'builtin' | 'direct';
  successCount: number;
  failureCount: number;
  cacheHitRate: number; // 0.0 - 1.0
  lastError?: string;
}

/** Cache statistics */
export interface CacheStats {
  size: number;
  hitRate: number;
  oldestEntryAge: number;
  ttlMs: number;
  maxSize: number;
}
