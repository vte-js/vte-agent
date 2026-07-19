/**
 * Question tool - ask the user a question with structured options.
 *
 * === SINGLE STEP (default) ===
 * { question: "...", options: [...], recommended?: "..." }
 *
 * === MULTI-STEP (session-based) ===
 * Pass a `steps` array — the engine orchestrates the entire flow server-side.
 * The LLM calls question ONCE; the engine presents each step sequentially,
 * collects all answers, and returns them as ONE consolidated result.
 *
 * { question: "overall title", steps: [
 *     { stepTitle: "Step 1", question: "...", options: [...] },
 *     { stepTitle: "Step 2", question: "...", options: [...] },
 *     { stepTitle: "Step 3", question: "...", options: [...] },
 *   ]}
 *
 * The LLM receives ONE tool result with ALL answers after the user completes
 * every step (or cancels). No need for the LLM to call question repeatedly.
 */

import { ToolDefinition, ContextManager } from '../core/types'

export interface QuestionStep {
  /** Short label shown in the progress bar (e.g. "选择类型") */
  stepTitle: string
  /** The question text for this step */
  question: string
  /** Options for this step */
  options?: Array<{ label: string; description?: string }>
  /** Allow multiple selections for this step */
  multiple?: boolean
  /** Recommended option label for this step */
  recommended?: string
}

export const questionTool: ToolDefinition = {
  name: 'question',
  description: `Ask the user a question with structured options. Use when you need user input, clarification, or a decision before proceeding.

**Single question:** Pass \`question\` and optionally \`options\`. Returns the user's choice.

**Multi-step wizard (PREFERRED for sequential decisions):** When you need to ask several questions in sequence (e.g., "pick category" → "choose specifics" → "confirm"), pass the \`steps\` array with ALL steps defined at once. The system will walk the user through each step one by one and return ALL answers together.

Multi-step example:
{ question: "Plan today's work", steps: [
  { stepTitle: "Task type", question: "What kind of work?", options: [{label:"Feature"},{label:"Bug fix"},{label:"Refactor"}] },
  { stepTitle: "Details", question: "Which specifically?", options: [...] },
  { stepTitle: "Confirm", question: "Ready to start?", options: [{label:"Yes, start"},{label:"Cancel"}] }
]}

The tool does NOT require permission — it directly shows a dialog/panel to the user.`,
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask (or overall title for multi-step)',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Display text (1-5 words)' },
            definition: { type: 'string', description: 'Optional explanation' },
          },
          required: ['label'],
        },
        description: 'Options for single-step mode',
      },
      multiple: {
        type: 'boolean',
        description: 'Allow multiple selections. Default false.',
      },
      recommended: {
        type: 'string',
        description: 'Recommended option label to highlight',
      },
      // ── Multi-step session ──
      steps: {
        type: 'array',
        description: 'Define ALL steps of a multi-step wizard here. Each step has: stepTitle (required), question (required), options, multiple, recommended. The system walks through these sequentially.',
        items: {
          type: 'object',
          properties: {
            stepTitle: {
              type: 'string',
              description: 'Short label for this step shown in progress bar (e.g. "Select type")',
            },
            question: {
              type: 'string',
              description: 'Question text for this step',
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['label'],
              },
            },
            multiple: { type: 'boolean' },
            recommended: { type: 'string' },
          },
          required: ['stepTitle', 'question'],
        },
      },
    },
    required: ['question'],
  },
  execute: async (_args: Record<string, unknown>, _context: ContextManager) => {
    // Intercepted by engine — never executes here
    return { type: 'text' as const, content: 'Question sent to user' }
  },
}
