/**
 * Message middleware — production-grade message pipeline
 *
 * Inspired by Cline / Claude Code patterns:
 * - Message ID generation & metadata
 * - Token budget tracking
 * - Message formatting & wrapping
 * - Response post-processing
 */

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
