/**
 * Token usage tracker - tracks per-request and cumulative token consumption.
 */

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface TokenRecord {
  timestamp: string
  model: string
  usage: TokenUsage
}

// Approximate pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-3.5-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'qwen-max': { input: 0.4, output: 1.2 },
};

const records: TokenRecord[] = []

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 2.5, output: 10 }
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
}

export function recordUsage(model: string, promptTokens: number, completionTokens: number): TokenRecord {
  const record: TokenRecord = {
    timestamp: new Date().toISOString(),
    model,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCost: estimateCost(model, promptTokens, completionTokens),
    },
  }
  records.push(record)
  return record
}

export function getSessionStats(): {
  totalPrompt: number
  totalCompletion: number
  totalTokens: number
  totalCost: number
  requestCount: number
  perModel: Record<string, { tokens: number; cost: number; count: number }>
} {
  const stats = {
    totalPrompt: 0,
    totalCompletion: 0,
    totalTokens: 0,
    totalCost: 0,
    requestCount: records.length,
    perModel: {} as Record<string, { tokens: number; cost: number; count: number }>,
  }

  for (const r of records) {
    stats.totalPrompt += r.usage.promptTokens
    stats.totalCompletion += r.usage.completionTokens
    stats.totalTokens += r.usage.totalTokens
    stats.totalCost += r.usage.estimatedCost

    if (!stats.perModel[r.model]) {
      stats.perModel[r.model] = { tokens: 0, cost: 0, count: 0 }
    }
    stats.perModel[r.model].tokens += r.usage.totalTokens
    stats.perModel[r.model].cost += r.usage.estimatedCost
    stats.perModel[r.model].count++
  }

  return stats
}

export function getRecentRecords(count: number = 5): TokenRecord[] {
  return records.slice(-count)
}

export function resetRecords(): void {
  records.length = 0
}
