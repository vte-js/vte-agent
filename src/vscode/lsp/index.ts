/**
 * LSP Integration - Public API
 *
 * Unified code intelligence service for the VTE Agent.
 * Supports builtin strategy (VSCode built-in API) with multi-language configuration.
 */

// ── Types ──
export type {
  LspProfile,
  LspTool,
  LspStrategy,
  RawLspConfig,
  ResolvedLspConfig,
  CodeLocation,
  DefinitionResult,
  ReferenceResult,
  HoverResult,
  DocumentSymbolInfo,
  DocumentSymbolResult,
  GetDefinitionOptions,
  GetReferencesOptions,
  GetHoverOptions,
  GetDocumentSymbolsOptions,
  LspServiceStats,
  CircuitBreakerState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  GuardrailResult,
  FileSizeLimits,
} from './types';

// ── Configuration ──
export { ConfigurationResolver, getConfigurationResolver, resetConfigurationResolver } from './config-resolver';
export { DEFAULT_LSP_PROFILES, getLanguageFromExtension, getAllSupportedExtensions } from './defaults';

// ── Core Service ──
export { CodeIntelligenceService, getCodeIntelligenceService, resetCodeIntelligenceService } from './code-intelligence';

// ── Cache ──
export { LspCache, getLspCache, resetLspCache } from './cache';

// ── Circuit Breaker ──
export { CircuitBreaker, LanguageCircuitBreakers, getLanguageCircuitBreakers, resetLanguageCircuitBreakers } from './circuit-breaker';

// ── Guardrails ──
export { Guardrails, getGuardrails, resetGuardrails } from './guardrails';

// ── Result Summarizer ──
export {
  summarizeDefinitionResult,
  summarizeReferenceResult,
  summarizeHoverResult,
  summarizeDocumentSymbolResult,
  getContextSnippet,
  formatLocationSummary,
  createCodeLocation,
} from './result-summarizer';

// ── Agent Tools ──
export {
  lspGotoDefinitionTool,
  lspFindReferencesTool,
  lspHoverTool,
  lspDocumentSymbolsTool,
  lspClearCacheTool,
  lspStatsTool,
  lspTools,
  setLspWorkspaceRoot,
} from './lsp-tools';

// ── Setup Wizard ──
export { SetupWizard, registerSetupWizardCommand } from './setup-wizard';

// ── LSP Control Panel ──
export { LspStatusProvider, registerLspStatusView, LanguageNode, StatsNode, ActionNode } from './lsp-status-provider';
