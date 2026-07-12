/**
 * Question tool - ask the user a question with structured options
 */

import { ToolDefinition, ContextManager } from '../core/types'

export const questionTool: ToolDefinition = {
  name: 'question',
  description: 'Ask the user a question and present structured options for them to choose from. Use when you need user input, clarification, or a decision before proceeding. This tool does NOT require permission — it directly shows a dialog to the user. Returns the user\'s selected option label, custom input text, or empty string if the user cancels. Do NOT retry after cancellation — proceed without the input.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user',
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Display text for this option (1-5 words)' },
            description: { type: 'string', description: 'Optional explanation of this choice' },
          },
          required: ['label'],
        },
        description: 'List of predefined options for the user to choose from',
      },
      multiple: {
        type: 'boolean',
        description: 'If true, user can select multiple options. Default false.',
      },
      recommended: {
        type: 'string',
        description: 'The label of the recommended option to highlight',
      },
    },
    required: ['question'],
  },
  execute: async (_args: Record<string, unknown>, _context: ContextManager) => {
    // This tool is intercepted by the engine — it never actually executes here.
    return { type: 'text' as const, content: 'Question sent to user' }
  },
}
