/**
 * Context compaction — layered, token-budget-driven, model-aware.
 *
 * This is the future-proof replacement for the old fixed-count `trimHistory()`.
 * It mirrors what the leading coding agents do, escalating in cost:
 *
 *   Layer 1 (cheap, no LLM): pair-safe tool-result pruning — keep the
 *     assistant `tool_call` AND the `tool` result message, but shrink the
 *     result BODY to a placeholder ("selective amnesia", à la Claude Code).
 *     Never breaks a (tool_call ↔ tool_result) pair.
 *   Layer 2 (LLM): when pruning alone can't fit the budget and
 *     `strategy === 'summarize'`, fold the evicted middle into a ROLLING
 *     checkpoint (preserving prior decisions, à la Codex handoff /
 *     OpenCode step-2) and replace the middle with one `system` message.
 *   Layer 3 (fallback): pair-safe hard truncation if still over the hard cap
 *     (drop complete call→result groups from the oldest end).
 *
 * Triggering is TOKEN-based against the model's effective window, so it
 * auto-scales as models ship larger contexts — no magic message count to
 * retune every time a new model lands.
 *
 * The pure logic lives here (testable, provider-agnostic). The engine wires
 * the actual LLM summarization call.
 */

import { AgentMessage } from '../core/types';

export interface CompactionOptions {
  /** Effective model input window in tokens (net of any system overhead). */
  contextWindow: number;
  /** Reserve for generation output. */
  completionBuffer: number;
  /** Soft trigger: act when estimated prompt tokens exceed this fraction of the effective window. Proactive, not wait-for-100%. */
  compactPct: number;
  /** Hard cap: force truncation if estimated prompt tokens exceed this fraction. */
  hardPct: number;
  /** Never prune/summarize the most recent ~this many tokens (the "active" zone). */
  protectedRecentTokens: number;
  /** Only prune a tool result if doing so frees at least this many estimated tokens (avoids churn — OpenCode's ">20k tokens" rule analogue). */
  minPruneTokens: number;
  /** Strategy when pruning alone is insufficient. */
  strategy: 'prune' | 'summarize';
  /** Max chars kept for a tool result body (oversized → truncated in place). */
  maxToolResultChars: number;
  /** Heuristic chars-per-token for the budget estimate. */
  estimateCharsPerToken?: number;
}

export const DEFAULT_COMPACTION: CompactionOptions = {
  contextWindow: 128_000,
  completionBuffer: 8_192,
  compactPct: 0.7,
  hardPct: 0.95,
  protectedRecentTokens: 40_000,
  minPruneTokens: 2_000,
  strategy: 'prune',
  maxToolResultChars: 2_000,
  estimateCharsPerToken: 4,
};

/** Marker prefix for the rolling checkpoint `system` message. */
export const CHECKPOINT_PREFIX = '[Context Checkpoint:';

/** Cheap, dependency-free token estimate (~4 chars/token). Good enough for budgeting. */
export function estimateTokens(text: string, charsPerToken = 4): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / charsPerToken));
}

/**
 * Infer a model's effective input window from its name. Future-proof: as
 * vendors ship larger windows, add a clause here (or pass an explicit
 * `contextWindow` through the engine — that always wins).
 */
export function inferContextWindow(model: string): number {
  const m = (model || '').toLowerCase();
  if (m.includes('1m') || m.includes('1_000_000')) return 1_000_000;
  if (m.includes('gpt-5')) return 400_000;
  if (m.includes('gpt-4.1') || m.includes('gpt-4o') || m.includes('gpt-4.5')) return 200_000;
  if (m.includes('gpt-4')) return 128_000;
  if (m.includes('claude') && (m.includes('sonnet-4') || m.includes('opus-4'))) return 200_000;
  if (m.includes('claude')) return 200_000;
  if (m.includes('gemini')) return 1_000_000;
  if (m.includes('qwen')) return 256_000;
  if (m.includes('deepseek') || m.includes('glm')) return 128_000;
  return 128_000;
}

export interface CompactionPlan {
  /** Post-compaction message list (Layer 1 + Layer 3 applied). */
  messages: AgentMessage[];
  /** Estimated prompt tokens after compaction. */
  estimatedTokens: number;
  /** Tokens freed by tool-result pruning (Layer 1). */
  prunedTokens: number;
  /** True if Layer 3 hard truncation removed messages. */
  truncated: boolean;
  /** True if the caller should produce a rolling summary (Layer 2). */
  needsSummary: boolean;
  /** Middle slice eligible to be replaced by a rolling checkpoint. */
  evictable: AgentMessage[];
  /** Inclusive start index of the protected tail within `messages`. */
  protectedStart: number;
  /** Non-checkpoint head kept verbatim (e.g. the initial context message). */
  head: AgentMessage[];
}

function isCheckpoint(m: AgentMessage): boolean {
  return m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(CHECKPOINT_PREFIX);
}

function msgTokens(m: AgentMessage, cpt: number): number {
  let t = estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''), cpt);
  if (m.toolCalls) for (const tc of m.toolCalls) t += estimateTokens(JSON.stringify(tc.arguments ?? ''), cpt);
  if (m.toolResults) for (const tr of m.toolResults) t += estimateTokens(typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content), cpt);
  return t;
}

function argsSummary(args: unknown): string {
  try { return JSON.stringify(args ?? {}).slice(0, 140); } catch { return '?'; }
}

/**
 * Pure, side-effect-free compaction of the message history. No LLM calls.
 *
 * @param messages        current history
 * @param opts           budget / strategy knobs
 * @param existingCheckpoint  prior rolling-checkpoint text (folded forward by the caller's LLM)
 */
export function compactMessages(
  messages: AgentMessage[],
  opts: CompactionOptions,
  existingCheckpoint?: string,
): CompactionPlan {
  const cpt = opts.estimateCharsPerToken ?? 4;
  const sumTokens = (arr: AgentMessage[]) => arr.reduce((s, m) => s + msgTokens(m, cpt), 0);

  const effective = Math.max(8_000, opts.contextWindow - opts.completionBuffer);
  const softTrigger = effective * opts.compactPct;
  const hardTrigger = effective * opts.hardPct;

  const result: CompactionPlan = {
    messages,
    estimatedTokens: sumTokens(messages),
    prunedTokens: 0,
    truncated: false,
    needsSummary: false,
    evictable: [],
    protectedStart: messages.length,
    head: [],
  };

  // Nothing to do.
  if (messages.length <= 1) return result;
  // Under the soft trigger and we're not asked to summarize → leave it be.
  if (result.estimatedTokens <= softTrigger && opts.strategy !== 'summarize') {
    return result;
  }

  // ── Head: keep the initial context message (never a tool/orphan). ──
  const head: AgentMessage[] = [];
  let headEnd = 0;
  if (messages[0].role !== 'tool') { head.push(messages[0]); headEnd = 1; }

  // ── Protected tail: most recent ~protectedRecentTokens. ──
  let acc = 0;
  let protectedStart = messages.length;
  for (let i = messages.length - 1; i >= headEnd; i--) {
    acc += msgTokens(messages[i], cpt);
    protectedStart = i;
    if (acc >= opts.protectedRecentTokens) break;
  }
  if (protectedStart <= headEnd) protectedStart = headEnd; // never eat everything

  const range = { from: headEnd, to: protectedStart - 1 };

  // ── Layer 1: pair-safe tool-result pruning (selective amnesia). ──
  const callMap = new Map<string, { name: string; args: string }>();
  for (let i = range.from; i <= range.to; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && m.toolCalls) {
      for (const tc of m.toolCalls) callMap.set(tc.id, { name: tc.name, args: argsSummary(tc.arguments) });
    }
  }
  let candidateFreed = 0;
  const pruned: AgentMessage[] = [];
  for (let i = range.from; i <= range.to; i++) {
    const m = messages[i];
    if (m.role === 'tool' && m.tool_call_id && callMap.has(m.tool_call_id)) {
      const size = msgTokens(m, cpt);
      const isOversized = typeof m.content === 'string' && m.content.length > opts.maxToolResultChars;
      if (isOversized) {
        const meta = callMap.get(m.tool_call_id)!;
        const placeholder = `[工具结果已精简 · 曾调用 ${meta.name}(${meta.args}) · 原结果约 ${size} tokens · 如需细节请重新调用该工具]`;
        candidateFreed += size - estimateTokens(placeholder, cpt);
        pruned.push({ ...m, content: placeholder });
        continue;
      }
    }
    pruned.push(m);
  }
  // Only apply pruning if it actually frees meaningful space (avoids churn).
  const middle = candidateFreed >= opts.minPruneTokens
    ? pruned
    : messages.slice(range.from, range.to + 1);
  if (candidateFreed >= opts.minPruneTokens) result.prunedTokens = candidateFreed;

  // Reassemble: head + (existing checkpoint) + middle + tail
  const tail = messages.slice(protectedStart);
  const cpOffset = existingCheckpoint ? 1 : 0;
  const withCp: AgentMessage[] = [
    ...head,
    ...(existingCheckpoint ? [{ role: 'system' as const, content: `${CHECKPOINT_PREFIX} ${existingCheckpoint}]` }] : []),
    ...middle,
    ...tail,
  ];
  result.messages = withCp;
  result.head = head;
  result.evictable = middle;
  result.protectedStart = head.length + cpOffset;
  result.estimatedTokens = sumTokens(withCp);

  // ── Layer 3: pair-safe hard truncation if still over the hard cap. ──
  if (result.estimatedTokens > hardTrigger) {
    const working = withCp.slice();
    let evStart = head.length + cpOffset;
    let evEnd = evStart + middle.length; // exclusive
    while (sumTokens(working) > hardTrigger && evEnd > evStart) {
      const m = working[evStart];
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Drop this assistant call AND its following tool results together.
        let j = evStart + 1;
        while (j < evEnd && working[j].role === 'tool') j++;
        working.splice(evStart, j - evStart);
        evEnd -= j - evStart;
      } else if (m.role === 'tool') {
        working.splice(evStart, 1); // orphaned tool result (its call was dropped) — safe to drop
        evEnd -= 1;
      } else if (m.role === 'user' || (m.role === 'system' && !isCheckpoint(m))) {
        working.splice(evStart, 1);
        evEnd -= 1;
      } else {
        evStart++; // keep; shift window
      }
      result.truncated = true;
    }
    result.messages = working;
    result.estimatedTokens = sumTokens(working);
    result.evictable = working.slice(evStart, evEnd);
    result.protectedStart = evStart;
  }

  // ── Layer 2 signal: ask caller to produce a rolling summary. ──
  if (opts.strategy === 'summarize' && result.estimatedTokens > softTrigger) {
    result.needsSummary = true;
  }

  return result;
}
