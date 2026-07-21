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
 * Reuses ./reasoning.ts (resolveThinkingStyle / buildChatReasoningParams /
 * buildResponsesReasoning / isOpenAIReasoningModel) — reasoning mapping is
 * NOT reimplemented here.
 */

import {
  LLMRequest,
  ResponsesRequest,
  LLMParams,
  ModelCapability,
  ProviderFamily,
  ReasoningLevel,
  ThinkingStyle,
} from '../core/types';
import {
  resolveThinkingStyle,
  buildChatReasoningParams,
  buildResponsesReasoning,
  isOpenAIReasoningModel,
  mapLevelToEffort,
} from './reasoning';
import { inferCapability } from './model-catalog';

/** Clamp a requested max-tokens to what the model actually allows. */
function clampMaxTokens(requested: number | undefined, capMax: number): number {
  if (!requested || requested <= 0) return capMax;
  return Math.min(requested, capMax);
}

/**
 * Resolve which provider family a model belongs to. This drives field naming
 * + constraint gating. `apiBase` helps disambiguate vendors that share the
 * OpenAI wire format (e.g. Gemini's OpenAI-compatible endpoint, Anthropic
 * on Bedrock). `auto` is the default and the only value the runtime needs —
 * explicit families are inferred, never user-set, matching Cline's design
 * where the provider is derived from the configured endpoint + model id.
 */
export function resolveProviderFamily(model: string, apiBase?: string): ProviderFamily {
  const m = model.toLowerCase();
  const base = (apiBase || '').toLowerCase();

  // Gemini: native or AI Studio / Vertex OpenAI-compatible path.
  if (/gemini/.test(m) || /generativelanguage\.googleapis|ai\.googleapis\.com|vertex/.test(base)) {
    return 'gemini';
  }
  // Anthropic: Claude native Messages API or Bedrock.
  if (/claude/.test(m) || /anthropic|bedrock/.test(base)) {
    return 'anthropic';
  }
  // Qwen-family thinking switch (OpenAI-compatible but needs enable_thinking).
  if (/(qwen|mimo|deepseek|glm|kimi|moonshot|ernie|hunyuan)/.test(m)) {
    return 'qwen';
  }
  // Everything else: OpenAI + every OpenAI-compatible gateway.
  return 'openai';
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
    // Reuse the proven reasoning mapping from ./reasoning.ts.
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

/** Re-export so callers can map the UI level without reaching into reasoning.ts. */
export { mapLevelToEffort };
