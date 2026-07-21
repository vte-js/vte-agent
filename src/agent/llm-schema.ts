/**
 * LLM parameter NORMALIZATION — the provider-agnostic mapping layer.
 *
 * Problem this solves: every vendor names + constrains sampling params
 * differently, and sending the wrong field (or a field a model rejects)
 * breaks the request. Before this, VTE hand-assembled request bodies in
 * two places (Chat + Responses) and only special-cased reasoning.
 *
 * This module is the single, tested place that turns ONE normalized shape
 * (`LLMParams`) into each backend's native request fragment, gated by the
 * model's `ModelCapability`. It is the analogue of how Cline splits the
 * problem: a shared `ApiHandlerOptions` the UI fills in, and one
 * `ApiHandler` per provider that maps those options onto the right wire
 * format. We collapse the N-providers into one dispatcher keyed by
 * `ProviderFamily`, which is enough for the OpenAI-compatible world VTE
 * actually speaks (Chat + Responses) while leaving room for native
 * Anthropic/Gemini clients later.
 *
 * Reasoning mapping (formerly the standalone reasoning.ts) is NOW absorbed
 * here: `mapLevelToEffort` / `buildChatReasoningParams` /
 * `buildResponsesReasoning` / `resolveThinkingStyle` / `resolveApiProtocol`
 * all live in this module. `isOpenAIReasoningModel` lives in model-catalog
 * (the model-knowledge layer) as the single source of truth, so there is
 * exactly one definition shared by the capability inference and the field
 * mapping with no circular import.
 */

import {
  LLMRequest,
  ResponsesRequest,
  LLMParams,
  ModelCapability,
  ProviderFamily,
  ReasoningLevel,
  ThinkingStyle,
  ApiProtocol,
} from '../core/types';
import { inferCapability, isOpenAIReasoningModel, resolveFamily, resolveThinkingStyleForModel } from './model-catalog';

// ─────────────────────────────────────────────────────────────────────────
// Reasoning mapping (absorbed from the former reasoning.ts)
// ─────────────────────────────────────────────────────────────────────────

/** Map the UI's 5-step level onto a backend effort value. */
export function mapLevelToEffort(level: ReasoningLevel): ReasoningLevel {
  switch (level) {
    case 'minimal':
      return 'minimal';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
      return 'xhigh';
    default:
      return 'medium';
  }
}

/**
 * Approximate thinking-token budgets per level, for backends that accept an
 * explicit budget (Qwen `thinking_budget`, Anthropic `budget_tokens`).
 */
const THINKING_BUDGET: Record<ReasoningLevel, number> = {
  minimal: 0,
  low: 1024,
  medium: 8192,
  high: 24576,
  xhigh: 65536,
};

/**
 * Smart-default the wire protocol when a profile doesn't set `api` explicitly.
 *
 * Mirrors how Codex resolves `wire_api`: an explicit value always wins (the
 * developer override), otherwise infer from the endpoint + model rather than
 * blindly guessing from the URL string alone.
 *
 * Rule:
 *   - explicit 'chat' | 'responses'            → honoured as-is
 *   - api.openai.com + OpenAI reasoning model  → 'responses'
 *     (o-series / gpt-5.x on the first-party endpoint speak Responses natively)
 *   - everything else (OpenAI-compatible gateways, Azure, MiMo, Qwen, Ollama,
 *     non-reasoning OpenAI models)             → 'chat'
 */
export function resolveApiProtocol(
  explicit: ApiProtocol | undefined,
  model: string,
  baseUrl: string
): ApiProtocol {
  if (explicit === 'chat' || explicit === 'responses') return explicit;
  const url = (baseUrl || '').toLowerCase();
  const isFirstPartyOpenAI = /(^|\/\/|\.)api\.openai\.com(\/|$)/.test(url);
  if (isFirstPartyOpenAI && isOpenAIReasoningModel(model)) return 'responses';
  return 'chat';
}

/**
 * Resolve an 'auto' thinking style into a concrete one.
 * Delegates entirely to model-catalog — no hardcoded model patterns here.
 */
function resolveThinkingStyle(
  style: ThinkingStyle,
  model: string,
  protocol: ApiProtocol
): Exclude<ThinkingStyle, 'auto'> {
  return resolveThinkingStyleForModel(style, model, protocol);
}

/**
 * Fields to merge into a Chat Completions request for reasoning control.
 * `dropTemperature` signals the caller to omit `temperature` entirely
 * (OpenAI reasoning models reject non-default temperatures).
 */
interface ChatReasoningParams {
  temperature?: number;
  dropTemperature?: boolean;
  reasoning_effort?: ReasoningLevel;
  chat_template_kwargs?: Record<string, unknown>;
  thinking?: { type: string; budget_tokens: number };
}

/**
 * Build the reasoning-related fields for a Chat Completions request.
 * Only returns the fields that should be merged into the request.
 */
function buildChatReasoningParams(opts: {
  level: ReasoningLevel;
  style: ThinkingStyle;
  model: string;
  baseTemperature: number;
}): ChatReasoningParams {
  const style = resolveThinkingStyle(opts.style, opts.model, 'chat');
  const effort = mapLevelToEffort(opts.level);
  const thinkingEnabled = opts.level !== 'low' && opts.level !== 'minimal';
  // High/xhigh reasoning → lower temperature for more focused output.
  const temperature =
    (opts.level === 'high' || opts.level === 'xhigh')
      ? Math.min(opts.baseTemperature, 0.3)
      : opts.baseTemperature;

  switch (style) {
    case 'openai':
      // Reasoning model: the effort is the real control; temperature must be dropped.
      return { reasoning_effort: effort, dropTemperature: true };

    case 'qwen':
      // Private chat-template switch. low → explicitly OFF (real token savings),
      // medium/high → ON with a graduated budget (the real intensity gradient).
      if (!thinkingEnabled) {
        return { chat_template_kwargs: { enable_thinking: false }, temperature };
      }
      return {
        chat_template_kwargs: {
          enable_thinking: true,
          thinking_budget: THINKING_BUDGET[opts.level],
        },
        temperature,
      };

    case 'anthropic':
      if (!thinkingEnabled) return { temperature };
      // Anthropic requires temperature=1 when extended thinking is on.
      return {
        thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET[opts.level] },
        dropTemperature: true,
      };

    case 'none':
    default:
      // Non-reasoning model: only steer via temperature.
      return { temperature };
  }
}

/**
 * Build the `reasoning` block for a Responses API request.
 */
function buildResponsesReasoning(
  level: ReasoningLevel
): { effort: ReasoningLevel; summary: 'auto' } {
  return { effort: mapLevelToEffort(level), summary: 'auto' };
}

// ─────────────────────────────────────────────────────────────────────────
// Parameter normalization
// ─────────────────────────────────────────────────────────────────────────

/** Clamp a requested max-tokens to what the model actually allows. */
function clampMaxTokens(requested: number | undefined, capMax: number): number {
  if (!requested || requested <= 0) return capMax;
  return Math.min(requested, capMax);
}

/**
 * Resolve which provider family a model belongs to. This drives field naming
 * + constraint gating. `apiBase` helps disambiguate vendors that share the
 * OpenAI wire format (e.g. Gemini's OpenAI-compatible endpoint, Anthropic
 * on Bedrock). Delegates to model-catalog — the single source of family
 * knowledge — so this module has ZERO hardcoded model patterns.
 */
export function resolveProviderFamily(model: string, apiBase?: string): ProviderFamily {
  return resolveFamily(model, apiBase);
}

/**
 * Normalize `LLMParams` into a Chat Completions request fragment.
 * Returns a partial `LLMRequest` ready to spread into the final body.
 * `capability` gates which fields may appear (a non-reasoning model never
 * receives a `thinking` block, a non-reasoning OpenAI model keeps its
 * temperature, etc.).
 */
export function normalizeChatParams(
  params: LLMParams,
  capability: ModelCapability,
  model: string,
  apiBase?: string,
  thinkingStyle: ThinkingStyle = 'auto'
): Partial<LLMRequest> {
  const family = resolveProviderFamily(model, apiBase);
  const style = resolveThinkingStyle(thinkingStyle, model, 'chat');
  const level: ReasoningLevel = params.reasoningEffort ?? 'medium';

  const out: Partial<LLMRequest> = {};

  // ── max_tokens (always honored, clamped to model max) ──
  out.max_tokens = clampMaxTokens(params.maxTokens, capability.maxTokens);

  // ── temperature / top_p ──
  // OpenAI reasoning models REJECT custom temperature & top_p.
  const dropsTemp = family === 'openai' && isOpenAIReasoningModel(model);
  const dropsTopP = family === 'openai' && isOpenAIReasoningModel(model);
  if (!dropsTemp && params.temperature !== undefined) out.temperature = params.temperature;
  if (!dropsTopP && params.topP !== undefined) out.top_p = params.topP;
  // top_k only meaningful for gemini / qwen-family.
  if (params.topK !== undefined && (family === 'gemini' || family === 'qwen')) {
    (out as any).top_k = params.topK;
  }

  // ── reasoning field (gated by capability) ──
  const wantsReasoning =
    capability.supportsReasoning || isOpenAIReasoningModel(model) || style === 'qwen';
  if (wantsReasoning) {
    const r = buildChatReasoningParams({
      level,
      style,
      model,
      baseTemperature: params.temperature ?? 0.7,
    });
    if (r.dropTemperature) delete out.temperature; // ensure dropped even if set above
    if (r.reasoning_effort) out.reasoning_effort = r.reasoning_effort;
    if (r.chat_template_kwargs) out.chat_template_kwargs = r.chat_template_kwargs;
    if (r.thinking) out.thinking = r.thinking;
  }

  // ── penalties / stop ──
  if (params.frequencyPenalty !== undefined) out.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty !== undefined) out.presence_penalty = params.presencePenalty;
  if (params.stop) out.stop = params.stop;

  return out;
}

/**
 * Normalize `LLMParams` into a Responses API request fragment.
 * Same gating model as the Chat path; fields are the Responses-named
 * equivalents (`max_output_tokens`, `reasoning.effort`, …).
 */
export function normalizeResponsesParams(
  params: LLMParams,
  capability: ModelCapability,
  model: string,
  apiBase?: string,
  thinkingStyle: ThinkingStyle = 'auto'
): Partial<ResponsesRequest> {
  const family = resolveProviderFamily(model, apiBase);
  const out: Partial<ResponsesRequest> = {};

  out.max_output_tokens = clampMaxTokens(params.maxTokens, capability.maxTokens);

  // Responses backends are reasoning-first: reasoning models reject temperature.
  const dropsTemp = isOpenAIReasoningModel(model);
  if (!dropsTemp && params.temperature !== undefined) out.temperature = params.temperature;
  if (params.topP !== undefined) out.top_p = params.topP;
  if (params.topK !== undefined && family === 'gemini') {
    (out as any).top_k = params.topK;
  }

  const wantsReasoning = capability.supportsReasoning || isOpenAIReasoningModel(model);
  if (wantsReasoning) {
    const level: ReasoningLevel = params.reasoningEffort ?? 'medium';
    out.reasoning = buildResponsesReasoning(level);
  }

  if (params.stop) out.stop = params.stop;
  return out;
}

/**
 * Convenience: build a `ModelCapability` for `model`, merging any explicit
 * capability the host supplied (via `ModelProfile.capability`) over the
 * name-inferred default. Used by the engine so it never has to think about
 * whether a capability was provided.
 */
export function resolveCapability(
  model: string,
  explicit?: ModelCapability
): ModelCapability {
  const inferred = inferCapability(model);
  if (!explicit) return inferred;
  // explicit wins, but keep inferred thinking budget if explicit omits it.
  return {
    ...inferred,
    ...explicit,
    thinking: explicit.thinking ?? inferred.thinking,
  };
}
