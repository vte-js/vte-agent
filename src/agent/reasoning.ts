/**
 * Reasoning effort mapping — turns the UI's 3-step reasoning level into
 * parameters that actually take effect on each backend.
 *
 * Inspired by how Cline / Codex handle reasoning:
 *   - OpenAI reasoning models take a first-class `reasoning_effort` (Chat) or
 *     `reasoning.effort` (Responses), and reject a custom `temperature`.
 *   - Qwen / MiMo / DeepSeek-compatible backends use the private
 *     `chat_template_kwargs.enable_thinking` switch, optionally with a budget.
 *   - Anthropic-compatible backends use `thinking: { type, budget_tokens }`.
 *   - Non-reasoning models are steered only via temperature + prompt.
 */

import { ApiProtocol, ReasoningLevel, ReasoningEffort, ThinkingStyle } from '../core/types';

/** Map the UI's 3-step level onto a backend effort value. */
export function mapLevelToEffort(level: ReasoningLevel): ReasoningEffort {
  switch (level) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return 'medium';
  }
}

/**
 * Approximate thinking-token budgets per level, for backends that accept an
 * explicit budget (Qwen `thinking_budget`, Anthropic `budget_tokens`).
 */
const THINKING_BUDGET: Record<ReasoningLevel, number> = {
  low: 2048,
  medium: 8192,
  high: 24576,
};

/**
 * Detect whether an OpenAI-family model is a reasoning model
 * (o-series, gpt-5.x and newer). These accept `reasoning_effort` /
 * `reasoning.effort` and ignore/reject a custom temperature.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  // o1 / o3 / o4 ... families
  if (/^o[1-9](-|$|[a-z])/.test(m)) return true;
  // gpt-5 and beyond
  if (/gpt-([5-9]|\d{2,})/.test(m)) return true;
  return false;
}

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
 * Resolve an 'auto' thinking style into a concrete one, using the model name
 * and the wire protocol.
 */
export function resolveThinkingStyle(
  style: ThinkingStyle,
  model: string,
  protocol: ApiProtocol
): Exclude<ThinkingStyle, 'auto'> {
  if (style !== 'auto') return style;
  const m = model.toLowerCase();
  // Responses API only exists for OpenAI-style reasoning backends.
  if (protocol === 'responses') return 'openai';
  if (isOpenAIReasoningModel(m)) return 'openai';
  if (/qwen|mimo|deepseek|glm|kimi|ernie|hunyuan/.test(m)) return 'qwen';
  if (/claude/.test(m)) return 'anthropic';
  return 'none';
}

/**
 * Fields to merge into a Chat Completions request for reasoning control.
 * `dropTemperature` signals the caller to omit `temperature` entirely
 * (OpenAI reasoning models reject non-default temperatures).
 */
export interface ChatReasoningParams {
  temperature?: number;
  dropTemperature?: boolean;
  reasoning_effort?: ReasoningEffort;
  chat_template_kwargs?: Record<string, unknown>;
  thinking?: { type: string; budget_tokens: number };
}

/**
 * Build the reasoning-related fields for a Chat Completions request.
 * Only returns the fields that should be merged into the request.
 */
export function buildChatReasoningParams(opts: {
  level: ReasoningLevel;
  style: ThinkingStyle;
  model: string;
  baseTemperature: number;
}): ChatReasoningParams {
  const style = resolveThinkingStyle(opts.style, opts.model, 'chat');
  const effort = mapLevelToEffort(opts.level);
  const thinkingEnabled = opts.level !== 'low'; // low = fast/cheap: thinking off
  // High reasoning → lower temperature for more focused output.
  const temperature =
    opts.level === 'high' ? Math.min(opts.baseTemperature, 0.3) : opts.baseTemperature;

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
export function buildResponsesReasoning(
  level: ReasoningLevel
): { effort: ReasoningEffort; summary: 'auto' } {
  return { effort: mapLevelToEffort(level), summary: 'auto' };
}

/**
 * Whether temperature should be dropped for a Responses request
 * (OpenAI reasoning models reject non-default temperatures).
 */
export function responsesDropsTemperature(model: string): boolean {
  return isOpenAIReasoningModel(model) || true; // Responses backends are reasoning-first
}
