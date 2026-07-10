/**
 * Message middleware - backwards compatibility re-export
 */

export * from '../core/middleware'

// Re-export rules functions that were in this file
export { loadRules, formatRulesForPrompt, initRulesDir } from './rules'
export type { RuleFile } from './rules'
