/**
 * VTE Agent Core - Public API
 * Framework-agnostic agent engine
 */

// Types
export * from './types'

// Engine
export { AgentEngine } from './engine'
export type { EngineOptions } from './engine'

// Registry
export { registerTool, registerTools, getTool, getAllTools, getToolNames, hasTool, clearRegistry } from './registry'

// Prompt
export { buildPromptFromTemplate, wrapResponse, buildEnvironmentContext, ROLES, TOOL_USE, RULES_PLACEHOLDER } from './prompt'
export type { PromptVariables } from './prompt'

// Middleware
export { generateMessageId, wrapMessage, createTokenBudget, trackTokens, getTokenUsage, postProcessResponse, truncateMessages } from './middleware'
export type { MessageMeta, EnrichedMessage, TokenBudget } from './middleware'

// Stream
export { parseSSEStream } from './stream'
export type { StreamParserOptions } from './stream'
