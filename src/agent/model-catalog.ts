/**
 * Model capability catalog + name-based inference.
 *
 * Analogue of Cline's `ModelInfo` presets (src/shared/api.ts). The engine
 * does NOT require a host to supply capabilities — when a `ModelProfile`
 * omits `capability`, we infer a sane default from the model name so that
 * new models keep working (and keep getting the right request-shape gating)
 * without waiting for a catalog update. This is the "future-proof" half of
 * the normalization story: vendors ship larger windows / new families, and a
 * name-rule catches most of them automatically.
 */

import { ModelCapability } from '../core/types';

/** Fallback used when nothing matches. Conservative but safe. */
export const DEFAULT_CAPABILITY: ModelCapability = {
  id: 'unknown',
  contextWindow: 128_000,
  maxTokens: 4096,
  supportsImages: false,
  supportsPromptCache: false,
  supportsReasoning: false,
};

/**
 * Infer the context window (tokens) from a model name.
 * Returns a best-effort number; hosts can always override via
 * `ModelProfile.contextWindow` / `capability.contextWindow`.
 */
export function inferContextWindow(model: string): number {
  const m = model.toLowerCase();
  // Explicit, large windows first (future-proof: catch 1M+ models).
  if (/gemini-(?:1\.5-)?pro-(?:002|003)|gemini-2\.5-pro|gemini-3/.test(m)) return 1_000_000;
  if (/gemini/.test(m)) return 1_000_000; // Gemini family is 1M-class
  if (/(gpt-5[.-]|gpt-[6-9]|gpt-\d{2,})/.test(m)) return 400_000;
  if (/gpt-4\.1|gpt-4o|gpt-4\.5/.test(m)) return 128_000; // (gpt-4o-mini too)
  if (/o[1-9]/.test(m)) return 200_000; // o-series reasoning
  if (/claude-(?:opus|sonnet|haiku)-?4/.test(m)) return 200_000;
  if (/claude-3\.(5|7)/.test(m)) return 200_000;
  if (/claude/.test(m)) return 200_000;
  if (/(qwen3?-[0-9]|qwq|deepseek-(r1|v3)|glm-4|kimi|moonshot)/.test(m)) return 128_000;
  if (/llama-?4|llama-3\.1|llama-3\.2/.test(m)) return 128_000;
  if (/mistral|mixtral|codestral|ministral/.test(m)) return 128_000;
  return DEFAULT_CAPABILITY.contextWindow;
}

/** Infer the max output tokens the model allows. */
export function inferMaxTokens(model: string): number {
  const m = model.toLowerCase();
  if (/o[1-9]/.test(m)) return 100_000; // o-series allow very long outputs
  if (/(gpt-5[.-]|gpt-[6-9]|gpt-\d{2,})/.test(m)) return 128_000;
  if (/claude-(?:opus|sonnet|haiku)-?4/.test(m)) return 64_000;
  if (/claude-3\.(5|7)/.test(m)) return 8_192;
  if (/gemini-2\.5-pro|gemini-1\.5-pro/.test(m)) return 65_536;
  if (/gemini/.test(m)) return 8_192;
  if (/(qwen3?-[0-9]+-?(?:instruct|base)?|qwq|deepseek-(r1|v3))/i.test(m)) return 8_192;
  if (/gpt-4\.1|gpt-4o|gpt-4\.5/.test(m)) return 32_768;
  return 4_096;
}

/** Infer thinking/reasoning support + default budgets from the model name. */
function inferReasoning(model: string): NonNullable<ModelCapability['thinking']> | undefined {
  const m = model.toLowerCase();
  if (isOpenAIReasoningModel(m)) {
    return { maxBudget: 100_000, defaultBudget: 8_192 };
  }
  if (/claude-3\.7|claude-(?:opus|sonnet|haiku)-?4/.test(m)) {
    return { maxBudget: 64_000, defaultBudget: 8_192 };
  }
  if (/(qwen3?-[0-9]|qwq|deepseek-(r1|v3)|glm-4|kimi|moonshot)/.test(m)) {
    return { maxBudget: 32_768, defaultBudget: 8_192 };
  }
  return undefined;
}

/**
 * Build a full `ModelCapability` for a model name. Combines name inference
 * with any explicit overrides the host supplied.
 */
export function inferCapability(model: string, overrides?: Partial<ModelCapability>): ModelCapability {
  const reasoning = inferReasoning(model);
  const base: ModelCapability = {
    id: model,
    contextWindow: inferContextWindow(model),
    maxTokens: inferMaxTokens(model),
    supportsImages:
      /(gpt-4[o1]|gpt-5|claude|gemini|qwen-vl|qwen2\.5-vl|llama-4)/.test(model.toLowerCase()),
    supportsPromptCache: /(claude|gpt-4[o1]|gpt-5|gemini)/.test(model.toLowerCase()),
    supportsReasoning: !!reasoning,
    thinking: reasoning,
  };
  return { ...base, ...overrides };
}

/**
 * Detect whether an OpenAI-family model is a reasoning model
 * (o-series, gpt-5.x and newer). These accept `reasoning_effort` /
 * `reasoning.effort` and ignore/reject a custom temperature.
 *
 * Single source of truth, living at the model-knowledge layer so that
 * both `llm-schema` (field mapping) and `model-catalog` (capability
 * inference) share one definition with no circular import.
 */
export function isOpenAIReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  // o1 / o3 / o4 ... families
  if (/^o[1-9](-|$|[a-z])/.test(m)) return true;
  // gpt-5 and beyond
  if (/gpt-([5-9]|\d{2,})/.test(m)) return true;
  return false;
}
