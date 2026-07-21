/**
 * OpenAI Responses API client.
 *
 * Speaks the `/v1/responses` protocol (native reasoning models: o-series, gpt-5.x),
 * which differs from Chat Completions in three ways:
 *   1. Request uses `input` (typed items) instead of `messages`, and `instructions`
 *      instead of a system message.
 *   2. Tools are flat (`{type,name,description,parameters}`), not nested under `function`.
 *   3. Streaming is a sequence of *named* SSE events
 *      (`response.output_text.delta`, `response.reasoning_summary_text.delta`,
 *      `response.completed`, ...) rather than `choices[].delta`.
 *
 * This client adapts everything back into the shared `LLMResponse` shape so the
 * engine's turn loop stays protocol-agnostic.
 */

import {
  AgentMessage,
  ToolDefinition,
  LLMResponse,
  ResponsesRequest,
  ResponsesInputItem,
} from '../core/types';

type StreamEvent =
  | { type: 'stream_chunk'; text: string }
  | { type: 'thinking_chunk'; text: string };

interface CallResponsesOptions {
  apiBase: string;
  apiKey: string;
  model: string;
  messages: AgentMessage[];
  instructions: string;
  tools: ToolDefinition[];
  /**
   * Pre-normalized request fragment produced by `llm-schema`
   * (max_output_tokens, reasoning, temperature gating, …). Spread
   * directly into the final body — the client no longer hand-assembles
   * per-vendor fields.
   */
  normalized: Partial<ResponsesRequest>;
  abortSignal?: AbortSignal;
  onEvent?: (e: StreamEvent) => void;
}

/** Convert Chat-style message content into Responses `content` parts. */
function toResponsesContent(
  role: string,
  content: AgentMessage['content']
): ResponsesInputItem['content'] {
  if (typeof content === 'string') return content;
  // Multimodal array (Chat format): { type:'text'|'image_url', ... }
  const parts = content as unknown as Array<{
    type: string;
    text?: string;
    image_url?: { url: string };
  }>;
  const textType = role === 'assistant' ? 'output_text' : 'input_text';
  return parts.map((p) => {
    if (p.type === 'image_url' && p.image_url) {
      return { type: 'input_image', text: undefined, image_url: p.image_url.url } as any;
    }
    return { type: textType, text: p.text ?? '' };
  });
}

/** Map the engine's AgentMessage[] into the Responses API `input` array. */
export function messagesToResponsesInput(messages: AgentMessage[]): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      // Fold stray system notes into a user-visible developer item.
      input.push({ role: 'user', content: toResponsesContent('user', m.content) });
      continue;
    }
    if (m.role === 'tool') {
      // Skip orphaned tool results: the Responses API rejects any
      // `function_call_output` whose call_id has no matching `function_call`
      // in the same input (→ "No tool call found for function call output").
      if (!m.tool_call_id) continue;
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id,
        output: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
      continue;
    }
    if (m.role === 'assistant') {
      const hasText = typeof m.content === 'string' ? m.content.length > 0 : !!m.content;
      if (hasText) {
        input.push({ role: 'assistant', content: toResponsesContent('assistant', m.content) });
      }
      for (const tc of m.toolCalls || []) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments ?? {}),
        });
      }
      continue;
    }
    // user
    input.push({ role: 'user', content: toResponsesContent('user', m.content) });
  }
  return input;
}

/** Convert Chat-style tool definitions into flat Responses tool objects. */
export function toolsToResponsesTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: false,
  }));
}

/**
 * Call the Responses API and adapt the streamed result into an LLMResponse.
 */
export async function callResponsesAPI(opts: CallResponsesOptions): Promise<LLMResponse> {
  const request: ResponsesRequest = {
    model: opts.model,
    instructions: opts.instructions,
    input: messagesToResponsesInput(opts.messages),
    tools: opts.tools.length > 0 ? toolsToResponsesTools(opts.tools) : undefined,
    stream: true,
    ...opts.normalized,
  };

  const url = `${opts.apiBase.replace(/\/$/, '')}/responses`;
  console.log(
    `[VTE][Responses] POST ${url} model=${opts.model} effort=${request.reasoning?.effort} tools=${
      request.tools?.length ?? 0
    } input=${request.input.length}`
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(request),
    signal: opts.abortSignal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.log(`[VTE][Responses] API error ${response.status}: ${body.substring(0, 300)}`);
    throw new Error(`Responses API error: ${response.status}: ${body.substring(0, 200)}`);
  }

  return parseResponsesStream(response, opts.onEvent);
}

/**
 * Parse the named-event SSE stream from the Responses API.
 * Emits UI chunks live, and reconstructs a Chat-shaped LLMResponse at the end.
 */
async function parseResponsesStream(
  response: Response,
  onEvent?: (e: StreamEvent) => void
): Promise<LLMResponse> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let content = '';
  // Accumulate function calls by output index for robustness.
  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let usage: any = null;
  let hadError = '';

  const handle = (evt: any) => {
    const type: string = evt?.type || '';

    // Assistant text
    if (type === 'response.output_text.delta' && typeof evt.delta === 'string') {
      content += evt.delta;
      onEvent?.({ type: 'stream_chunk', text: evt.delta });
      return;
    }
    // Reasoning summary (the visible "thinking")
    if (
      (type === 'response.reasoning_summary_text.delta' ||
        type === 'response.reasoning_text.delta') &&
      typeof evt.delta === 'string'
    ) {
      onEvent?.({ type: 'thinking_chunk', text: evt.delta });
      return;
    }
    // A new output item (possibly a function call) was added.
    if (type === 'response.output_item.added' && evt.item) {
      const item = evt.item;
      if (item.type === 'function_call') {
        toolCallsByIndex.set(evt.output_index ?? toolCallsByIndex.size, {
          id: item.call_id || item.id || '',
          name: item.name || '',
          arguments: item.arguments || '',
        });
      }
      return;
    }
    // Streamed function-call argument chunks.
    if (type === 'response.function_call_arguments.delta' && typeof evt.delta === 'string') {
      const idx = evt.output_index ?? 0;
      const existing = toolCallsByIndex.get(idx);
      if (existing) existing.arguments += evt.delta;
      return;
    }
    // Final, authoritative snapshot — correct any drift and pull usage.
    if (type === 'response.completed' && evt.response) {
      const out = evt.response.output || [];
      let idx = 0;
      for (const item of out) {
        if (item.type === 'function_call') {
          toolCallsByIndex.set(idx, {
            id: item.call_id || item.id || '',
            name: item.name || '',
            arguments: item.arguments || '',
          });
          idx++;
        }
      }
      if (evt.response.usage) usage = evt.response.usage;
      return;
    }
    if (type === 'response.failed' || type === 'error') {
      hadError = evt.response?.error?.message || evt.message || 'Responses API stream error';
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      // Named-event streams interleave `event:` and `data:` lines; we only
      // need the JSON payloads, which already carry a `type` field.
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        handle(JSON.parse(data));
      } catch {
        // skip malformed chunks
      }
    }
  }

  if (hadError) throw new Error(hadError);

  const toolCalls = Array.from(toolCallsByIndex.values())
    .filter((tc) => tc.name)
    .map((tc) => ({ id: tc.id, function: { name: tc.name, arguments: tc.arguments || '{}' } }));

  const result: LLMResponse = {
    id: '',
    choices: [
      {
        message: {
          role: 'assistant',
          content: content || undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
      },
    ],
    usage: usage
      ? {
          // Responses API names tokens differently — normalize to Chat shape.
          prompt_tokens: usage.input_tokens ?? 0,
          completion_tokens: usage.output_tokens ?? 0,
          total_tokens:
            usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        }
      : undefined,
  };

  console.log(
    `[VTE][Responses] Stream complete | content=${content.length} chars | tool_calls=${toolCalls.length} | usage=${
      usage ? `${usage.input_tokens}+${usage.output_tokens}` : 'none'
    }`
  );

  return result;
}
