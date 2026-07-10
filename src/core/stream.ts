/**
 * SSE Stream Parser
 * Extracted from engine.ts for reusability
 */

import { LLMResponse, AgentEvent } from './types'

export interface StreamParserOptions {
  onEvent?: (event: AgentEvent) => void
}

/**
 * Parse an SSE stream from OpenAI-compatible API
 * Handles content, thinking, tool calls, and usage
 */
export async function parseSSEStream(
  response: Response,
  options: StreamParserOptions = {}
): Promise<LLMResponse> {
  const { onEvent } = options
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = []
  let finishReason = ''
  let usage: any = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') continue

      try {
        const chunk = JSON.parse(data)
        const choice = chunk.choices?.[0]
        if (!choice) continue

        // Content chunks
        if (choice.delta?.content) {
          content += choice.delta.content
          onEvent?.({ type: 'stream_chunk', text: choice.delta.content })
        }

        // Thinking content (OpenAI compatible)
        if (choice.delta?.reasoning_content) {
          onEvent?.({ type: 'thinking_chunk', text: choice.delta.reasoning_content })
        }
        // Thinking content (Anthropic compatible)
        if (choice.delta?.thinking) {
          onEvent?.({ type: 'thinking_chunk', text: choice.delta.thinking })
        }

        // Tool call chunks (streamed incrementally)
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', function: { name: '', arguments: '' } }
            }
            if (tc.id) toolCalls[idx].id = tc.id
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        // Usage (in final chunk)
        if (chunk.usage) {
          usage = chunk.usage
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Build final response object
  const result: LLMResponse = {
    id: '',
    choices: [{
      message: {
        role: 'assistant',
        content: content || undefined,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: finishReason,
    }],
    usage: usage || undefined,
  }

  return result
}
