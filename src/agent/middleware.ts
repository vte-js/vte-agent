/**
 * Message middleware — production-grade message pipeline
 *
 * Inspired by Cline / Claude Code patterns:
 * - Message ID generation & metadata
 * - System prompt injection (context, rules, feedback)
 * - Token budget tracking
 * - Message formatting & wrapping
 * - Response post-processing
 *
 * Rules are loaded from .vte/rules/*.md files, not hardcoded.
 */

import { loadRules, formatRulesForPrompt } from './rules';

// ── Message ID ──

let msgCounter = 0

export function generateMessageId(): string {
  return `msg_${Date.now()}_${++msgCounter}`
}

// ── Message Metadata ──

export interface MessageMeta {
  id: string
  timestamp: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  model?: string
  tokens?: { prompt: number; completion: number }
  latencyMs?: number
  toolCalls?: number
  intercepted?: boolean
}

export interface EnrichedMessage {
  meta: MessageMeta
  content: string
}

/**
 * Wrap a message with metadata.
 */
export function wrapMessage(
  content: string,
  role: MessageMeta['role'],
  opts: Partial<Omit<MessageMeta, 'id' | 'timestamp' | 'role'>> = {}
): EnrichedMessage {
  return {
    meta: {
      id: generateMessageId(),
      timestamp: Date.now(),
      role,
      ...opts,
    },
    content,
  }
}

// ── System Prompt Builder ──

export interface SystemPromptContext {
  mode?: string
  projectName?: string
  filesRead?: number
  feedback?: Array<{ userMessage: string; rating: 'up' | 'down'; comment?: string }>
  customRules?: string[]
  complexityInstruction?: string
  workspaceRoot?: string
  rulesCache?: Map<string, string> // cached rules by workspace
}

/**
 * Build enriched system prompt with injected context.
 * This is the core middleware — formats everything the LLM needs to know.
 */
export function buildSystemPrompt(
  basePrompt: string,
  ctx: SystemPromptContext = {}
): string {
  const parts: string[] = [basePrompt]

  // Project context (structured)
  if (ctx.projectName || ctx.filesRead) {
    const project = ctx.projectName || 'unknown'
    const files = ctx.filesRead ?? 0
    parts.push(`\n<project-context>\nProject: ${project}\nFiles read this session: ${files}\n</project-context>`)
  }

  // Rules files (from .vte/rules/*.md)
  if (ctx.workspaceRoot) {
    const rules = loadRules(ctx.workspaceRoot)
    const rulesText = formatRulesForPrompt(rules)
    if (rulesText) {
      parts.push(rulesText)
    }
  }

  // Custom inline rules
  if (ctx.customRules && ctx.customRules.length > 0) {
    parts.push(`\n<inline-rules>\n${ctx.customRules.map(r => `- ${r}`).join('\n')}\n</inline-rules>`)
  }

  // Complexity instruction
  if (ctx.complexityInstruction) {
    parts.push(`\n<complexity-instruction>\n${ctx.complexityInstruction}\n</complexity-instruction>`)
  }

  // Feedback calibration
  const feedbackCtx = buildFeedbackContext(ctx.feedback)
  if (feedbackCtx) {
    parts.push(feedbackCtx)
  }

  return parts.join('\n')
}

function buildFeedbackContext(
  feedback?: Array<{ userMessage: string; rating: 'up' | 'down'; comment?: string }>
): string {
  if (!feedback || feedback.length === 0) return ''

  const recent = feedback.slice(-10)
  const liked = recent.filter(f => f.rating === 'up')
  const disliked = recent.filter(f => f.rating === 'down')

  if (liked.length === 0 && disliked.length === 0) return ''

  const lines: string[] = ['\n<feedback-calibration>']

  if (liked.length > 0) {
    lines.push('\nThe user found these responses helpful:')
    liked.forEach(f => {
      lines.push(`- Q: "${f.userMessage.slice(0, 100)}" → good`)
    })
  }

  if (disliked.length > 0) {
    lines.push('\nThe user found these responses unhelpful:')
    disliked.forEach(f => {
      const hint = f.comment ? ` (reason: "${f.comment}")` : ''
      lines.push(`- Q: "${f.userMessage.slice(0, 100)}" → bad${hint}`)
    })
  }

  lines.push('\nAdjust your response style based on this feedback.')
  lines.push('</feedback-calibration>')

  return lines.join('\n')
}

// ── Token Budget ──

export interface TokenBudget {
  maxPrompt: number
  maxCompletion: number
  used: { prompt: number; completion: number }
}

export function createTokenBudget(maxPrompt = 120000, maxCompletion = 8192): TokenBudget {
  return {
    maxPrompt,
    maxCompletion,
    used: { prompt: 0, completion: 0 },
  }
}

export function trackTokens(budget: TokenBudget, prompt: number, completion: number) {
  budget.used.prompt += prompt
  budget.used.completion += completion
}

export function getTokenUsage(budget: TokenBudget) {
  return {
    prompt: { used: budget.used.prompt, max: budget.maxPrompt, pct: Math.round((budget.used.prompt / budget.maxPrompt) * 100) },
    completion: { used: budget.used.completion, max: budget.maxCompletion, pct: Math.round((budget.used.completion / budget.maxCompletion) * 100) },
  }
}

// ── Response Post-processing ──

export function postProcessResponse(
  content: string,
  opts: {
    model?: string
    promptTokens?: number
    completionTokens?: number
    latencyMs?: number
    toolCalls?: number
  } = {}
): EnrichedMessage {
  return wrapMessage(content, 'assistant', {
    model: opts.model,
    tokens: opts.promptTokens != null && opts.completionTokens != null
      ? { prompt: opts.promptTokens, completion: opts.completionTokens }
      : undefined,
    latencyMs: opts.latencyMs,
    toolCalls: opts.toolCalls,
  })
}

// ── Message Truncation (for context window management) ──

/**
 * Truncate messages to fit within a token budget.
 * Keeps: system prompt + last N messages + current message.
 * This is the Cline/Claude Code pattern for context management.
 */
export function truncateMessages<T extends { role: string; content: string }>(
  messages: T[],
  maxTokens: number,
  estimateTokens: (text: string) => number
): T[] {
  let total = 0
  const result: T[] = []

  // Walk backwards, keeping most recent messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content)
    if (total + msgTokens > maxTokens) break
    total += msgTokens
    result.unshift(messages[i])
  }

  return result
}
