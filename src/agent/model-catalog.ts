/**
 * Model capability catalog — data-driven, generalized, future-proof.
 *
 * Design principles:
 *   1. SINGLE SOURCE: all model-family knowledge lives HERE. Other modules
 *      (llm-schema, context-compaction, engine) import from here — no duplicates.
 *   2. DATA, NOT CODE: family identification + capabilities are data rows in
 *      FAMILY_CATALOG. Adding a new family = adding a row, not writing logic.
 *   3. GENERALIZED FALLBACK: unknown models are auto-classified by semantic
 *      cues (reasoner / thinking / oN / r1 …) + family naming conventions +
 *      size tiers. New models work without a catalog update.
 *   4. EXPLICIT OVERRIDE: hosts can ALWAYS supply ModelProfile.capability /
 *      contextWindow — explicit values win over inference.
 *
 * This is the analogue of Cline's `ModelInfo` presets, but with a generalized
 * heuristic layer so the catalog does NOT need an update for every new model.
 */

import { ModelCapability, ProviderFamily, ThinkingStyle, ApiProtocol } from '../core/types';

// ── Conservative fallback (used when nothing matches) ──
export const DEFAULT_CAPABILITY: ModelCapability = {
  id: 'unknown',
  contextWindow: 128_000,
  maxTokens: 4_096,
  supportsImages: false,
  supportsPromptCache: false,
  supportsReasoning: false,
};

// ── Data types ──

/** A per-model override for capabilities that deviate from the family baseline. */
interface ModelOverride {
  match: RegExp;
  contextWindow?: number;
  maxTokens?: number;
  supportsImages?: boolean;
  supportsReasoning?: boolean;
}

/** A family entry in the catalog. */
interface FamilyEntry {
  family: ProviderFamily;
  thinkingStyle: Exclude<ThinkingStyle, 'auto'>;
  /** Model-name patterns that identify this family. Checked in order; first match wins. */
  matchNames: RegExp[];
  /** Optional apiBase patterns for disambiguation (e.g. Gemini via Vertex URL). */
  matchBase?: RegExp[];
  /** Baseline capabilities for all models in this family. */
  baseline: {
    contextWindow: number;
    maxTokens: number;
    supportsImages: boolean;
    supportsPromptCache: boolean;
  };
  /** Reasoning config for models in this family that support thinking. */
  reasoning?: {
    /** Patterns within the family indicating a reasoning-capable model. */
    patterns: RegExp[];
    maxBudget: number;
    defaultBudget: number;
  };
  /** Per-model overrides (checked before baseline). */
  overrides?: ModelOverride[];
}

// ── Data: the family catalog (single source of model-family knowledge) ──

const FAMILY_CATALOG: FamilyEntry[] = [
  // ── Gemini ──
  {
    family: 'gemini',
    thinkingStyle: 'qwen', // Gemini uses thinking similar to Qwen enable_thinking
    matchNames: [/gemini/i],
    matchBase: [/generativelanguage\.googleapis|aiplatform\.googleapis|ai\.googleapis|vertex/i],
    baseline: {
      contextWindow: 1_000_000,
      maxTokens: 65_536,
      supportsImages: true,
      supportsPromptCache: true,
    },
    reasoning: {
      patterns: [/gemini-[2-9]|gemini-1\.5/i],
      maxBudget: 32_768,
      defaultBudget: 8_192,
    },
    overrides: [
      { match: /gemini-1\.0|gemini-pro(?!-)/i, maxTokens: 8_192 },
    ],
  },

  // ── Anthropic (Claude) ──
  {
    family: 'anthropic',
    thinkingStyle: 'anthropic',
    matchNames: [/claude/i],
    matchBase: [/anthropic|bedrock/i],
    baseline: {
      contextWindow: 200_000,
      maxTokens: 8_192,
      supportsImages: true,
      supportsPromptCache: true,
    },
    reasoning: {
      // Claude 3.7+ and Claude 4+ support extended thinking.
      // Careful: [4-9] must follow a hyphen boundary, NOT a decimal point
      // (e.g. "3.5" must NOT match — the 5 is a minor version, not a major).
      patterns: [/claude.*3\.[7-9]|claude.*-[4-9](?:[-.]|$)/i],
      maxBudget: 64_000,
      defaultBudget: 8_192,
    },
    overrides: [
      { match: /claude.*(opus|sonnet|haiku)-?\s*[4-9]/i, maxTokens: 64_000 },
    ],
  },

  // ── Qwen-family (OpenAI-compatible + enable_thinking) ──
  // Covers Qwen, MiMo, DeepSeek, GLM, Kimi, Moonshot, ERNIE, Hunyuan, and
  // future OpenAI-compatible models that use chat_template_kwargs.enable_thinking.
  {
    family: 'qwen',
    thinkingStyle: 'qwen',
    matchNames: [/qwen|qwq|mimo|deepseek|glm|kimi|moonshot|ernie|hunyuan|baichuan/i],
    baseline: {
      contextWindow: 128_000,
      maxTokens: 8_192,
      supportsImages: false,
      supportsPromptCache: false,
    },
    reasoning: {
      patterns: [/qwen-?[3-9]|qwq|deepseek.*r[1-9]|mimo|glm-?[4-9]|kimi/i],
      maxBudget: 32_768,
      defaultBudget: 8_192,
    },
    overrides: [
      // Vision-capable variants
      { match: /qwen.*vl|qwen.*vision/i, supportsImages: true },
    ],
  },

  // ── OpenAI (default family) ──
  {
    family: 'openai',
    thinkingStyle: 'openai',
    matchNames: [/gpt|^o\d|davinci|babbage/i],
    baseline: {
      contextWindow: 128_000,
      maxTokens: 4_096,
      supportsImages: false, // NOT all OpenAI models support images — see overrides
      supportsPromptCache: true,
    },
    reasoning: {
      // o-series and gpt-5+ are reasoning models
      patterns: [/^o[1-9]|gpt-([5-9]|\d{2,})/i],
      maxBudget: 100_000,
      defaultBudget: 8_192,
    },
    overrides: [
      { match: /gpt-5|gpt-[6-9]|gpt-\d{2,}/i, contextWindow: 400_000, maxTokens: 128_000 },
      { match: /^o[1-9]/i, contextWindow: 200_000, maxTokens: 100_000 },
      { match: /gpt-4\.1|gpt-4o|gpt-4\.5/i, maxTokens: 32_768 },
      // Vision-capable OpenAI models (gpt-4o+, o-series, gpt-5+)
      { match: /gpt-4o|gpt-4\.1|gpt-4\.5|gpt-5|^o[1-9]/i, supportsImages: true },
    ],
  },
];

// ── Generalized reasoning cues (the future-proof safety net) ──
// Any model — known or unknown — whose name contains these semantic cues is
// treated as reasoning-capable. This catches new reasoning models automatically
// without a catalog update.
const GENERALIZED_REASONING_CUES = /reasoner|reasoning|thinking|deliberat|(?:^|[-_])r[1-9](?:[^a-z]|$)|cot[-_]/i;

// ── Generalized vision cues ──
// Catches vision-capable models by naming convention.
const GENERALIZED_VISION_CUES = /vl|vision|omni|multimodal/i;

// ── Size-tier scaling (down-scale only, applied within a family) ──
// Only DOWN-scale for mini/flash/lite variants — UP-scaling for "pro/max" is
// unreliable (e.g. Gemini Pro is still 1M, not 2M). Families with explicit
// per-model overrides are not affected (override values are exact).
// IMPORTANT: use separator boundaries to avoid matching substrings inside
// model names (e.g. "gemini" contains "mini" — must NOT match).
const SIZE_TIERS: Array<{ pattern: RegExp; windowMul: number; maxMul: number }> = [
  { pattern: /(?:^|[-_])(?:mini|flash|lite|nano|small|tiny|micro)(?:[-_]|$)/i, windowMul: 0.5, maxMul: 0.5 },
];

// ── Core: resolve family from model name + optional apiBase ──

/**
 * Identify which provider family a model belongs to.
 * Single source of truth — replaces the scattered regex that used to live
 * in llm-schema.ts and context-compaction.ts.
 */
export function resolveFamily(model: string, apiBase?: string): ProviderFamily {
  const m = (model || '').toLowerCase();
  const base = (apiBase || '').toLowerCase();
  for (const entry of FAMILY_CATALOG) {
    if (entry.matchNames.some(p => p.test(m))) return entry.family;
    if (entry.matchBase?.some(p => p.test(base))) return entry.family;
  }
  // Default: OpenAI-compatible gateway (the de-facto standard for third-party APIs).
  return 'openai';
}

// ── Core: resolve thinking style for a family ──

export function resolveFamilyThinkingStyle(family: ProviderFamily): Exclude<ThinkingStyle, 'auto'> {
  return FAMILY_CATALOG.find(e => e.family === family)?.thinkingStyle ?? 'none';
}

// ── Core: detect reasoning support (generalized, two layers) ──

/**
 * Detect whether a model supports reasoning/thinking mode.
 *
 * Layer 1: family-specific reasoner patterns (accurate for known families).
 * Layer 2: generalized semantic cues (catches FUTURE models automatically —
 *          any model with "reasoner", "thinking", "r1", etc. in its name).
 */
function detectReasoning(model: string, family: ProviderFamily): boolean {
  const m = model.toLowerCase();
  const entry = FAMILY_CATALOG.find(e => e.family === family);
  // Layer 1: family-specific patterns
  if (entry?.reasoning?.patterns.some(p => p.test(m))) return true;
  // Layer 2: generalized cues (future-proof safety net)
  if (GENERALIZED_REASONING_CUES.test(m)) return true;
  return false;
}

// ── Core: detect vision support ──

function detectVision(model: string, family: ProviderFamily): boolean {
  const m = model.toLowerCase();
  const entry = FAMILY_CATALOG.find(e => e.family === family);
  // Check ALL per-model overrides for an explicit supportsImages value
  for (const ov of entry?.overrides ?? []) {
    if (ov.match.test(m) && ov.supportsImages !== undefined) return ov.supportsImages;
  }
  // Generalized cues (catches future vision models by naming convention)
  if (GENERALIZED_VISION_CUES.test(m)) return true;
  // Family baseline
  return entry?.baseline.supportsImages ?? false;
}

// ── Core: OpenAI reasoning model detection ──
// Single source of truth, shared by llm-schema (field mapping) and
// model-catalog (capability inference) with no circular import.

export function isOpenAIReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  if (resolveFamily(m) !== 'openai') return false;
  return detectReasoning(m, 'openai');
}

// ── Core: infer context window ──

export function inferContextWindow(model: string): number {
  const m = model.toLowerCase();
  const family = resolveFamily(m);
  const entry = FAMILY_CATALOG.find(e => e.family === family);
  if (!entry) return DEFAULT_CAPABILITY.contextWindow;

  // Per-model override (exact value)
  for (const ov of entry.overrides ?? []) {
    if (ov.match.test(m) && ov.contextWindow !== undefined) return ov.contextWindow;
  }

  let window = entry.baseline.contextWindow;
  // Size-tier scaling
  for (const tier of SIZE_TIERS) {
    if (tier.pattern.test(m)) {
      window = Math.round(window * tier.windowMul);
      break;
    }
  }
  return window;
}

// ── Core: infer max output tokens ──

export function inferMaxTokens(model: string): number {
  const m = model.toLowerCase();
  const family = resolveFamily(m);
  const entry = FAMILY_CATALOG.find(e => e.family === family);
  if (!entry) return DEFAULT_CAPABILITY.maxTokens;

  // Per-model override (exact value)
  for (const ov of entry.overrides ?? []) {
    if (ov.match.test(m) && ov.maxTokens !== undefined) return ov.maxTokens;
  }

  let max = entry.baseline.maxTokens;
  // Reasoning models typically allow longer outputs
  if (detectReasoning(m, family) && entry.reasoning) {
    max = Math.max(max, entry.reasoning.maxBudget);
  }
  // Size-tier scaling
  for (const tier of SIZE_TIERS) {
    if (tier.pattern.test(m)) {
      max = Math.round(max * tier.maxMul);
      break;
    }
  }
  return max;
}

// ── Core: build full capability ──

export function inferCapability(model: string, overrides?: Partial<ModelCapability>): ModelCapability {
  const m = model.toLowerCase();
  const family = resolveFamily(m);
  const entry = FAMILY_CATALOG.find(e => e.family === family);
  const reasoning = detectReasoning(m, family);

  const base: ModelCapability = {
    id: model,
    contextWindow: inferContextWindow(model),
    maxTokens: inferMaxTokens(model),
    supportsImages: detectVision(m, family),
    supportsPromptCache: entry?.baseline.supportsPromptCache ?? false,
    supportsReasoning: reasoning,
    thinking: reasoning
      ? {
          maxBudget: entry?.reasoning?.maxBudget ?? 8_192,
          defaultBudget: entry?.reasoning?.defaultBudget ?? 4_096,
        }
      : undefined,
  };
  return { ...base, ...overrides };
}

// ── Core: resolve thinking style for a specific model ──
// Replaces the hardcoded regex that used to live in llm-schema.ts.
// Exported so llm-schema can delegate without duplicating model knowledge.

export function resolveThinkingStyleForModel(
  style: ThinkingStyle,
  model: string,
  protocol: ApiProtocol,
): Exclude<ThinkingStyle, 'auto'> {
  if (style !== 'auto') return style;
  // Responses API is OpenAI-specific — always uses OpenAI reasoning semantics.
  if (protocol === 'responses') return 'openai';
  const family = resolveFamily(model);
  // Non-reasoning models get 'none' — only steer via temperature + prompt.
  if (!detectReasoning(model, family)) return 'none';
  return resolveFamilyThinkingStyle(family);
}
