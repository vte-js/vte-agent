/**
 * Agent engine - manages the conversation loop and LLM calls
 * Framework-agnostic core implementation
 */

import { ContextManager, AgentMessage, ToolDefinition, LLMRequest, LLMResponse, ToolResult, AgentMode, TaskMode, RuntimeConfig, AgentEvent, CheckpointMetadata } from './types'
import { createTokenBudget, trackTokens, TokenBudget } from './middleware'
import { buildPromptFromTemplate, wrapResponse, buildEnvironmentContext } from './prompt'
import { getAllTools } from './registry'
import { parseSSEStream } from './stream'

const READ_ONLY_TOOL_NAMES = ['read', 'search', 'list', 'grep', 'glob', 'diagnostics', 'git']

export interface EngineOptions {
  config: RuntimeConfig
  context: ContextManager
  onEvent?: (event: AgentEvent) => void
  tools?: ToolDefinition[]
}

export class AgentEngine {
  private context: ContextManager
  private messages: AgentMessage[] = []
  private config: RuntimeConfig
  private mode: AgentMode = 'code'
  private taskMode: TaskMode = 'off'
  private abortController: AbortController | null = null
  private feedback: Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }> = []
  private tokenBudget: TokenBudget
  private onEvent?: (event: AgentEvent) => void
  private customTools?: ToolDefinition[]
  private reasoningLevel: 'low' | 'medium' | 'high' = 'medium'

  // Context management: keep only recent messages, summarize old ones
  private readonly MAX_HISTORY_MESSAGES = 20
  private readonly MAX_TOOL_RESULT_CHARS = 2000

  constructor(options: EngineOptions) {
    this.config = options.config
    this.context = options.context
    this.onEvent = options.onEvent
    this.customTools = options.tools
    this.tokenBudget = createTokenBudget()
  }

  setReasoningLevel(level: 'low' | 'medium' | 'high') {
    this.reasoningLevel = level
  }

  getReasoningLevel(): 'low' | 'medium' | 'high' {
    return this.reasoningLevel
  }

  setFeedback(feedback: Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }>) {
    this.feedback = feedback
  }

  // ── Context Management (token-efficient, inspired by OpenCode) ──

  /**
   * Trim message history to stay within token budget.
   * Keeps: first user message (context) + last N messages + all tool calls in current turn.
   */
  private trimHistory(): void {
    if (this.messages.length <= this.MAX_HISTORY_MESSAGES) return

    // Keep first message (initial context) + recent messages
    const first = this.messages[0]
    const recent = this.messages.slice(-this.MAX_HISTORY_MESSAGES)

    // Add summary of trimmed messages
    const trimmedCount = this.messages.length - this.MAX_HISTORY_MESSAGES
    const snapshot = this.context.getSnapshot()
    const filesRead = Array.from(snapshot.readFiles).slice(-5).join(', ') || 'none'
    const summary: AgentMessage = {
      role: 'system',
      content: `[Context: ${trimmedCount} earlier messages trimmed to save tokens. Key files read: ${filesRead}]`,
    }

    this.messages = [first, summary, ...recent]
    console.log(`[VTE] Trimmed history: ${trimmedCount} messages removed`)
  }

  /**
   * Compress tool results that are too large.
   */
  private compressToolResults(results: ToolResult[]): ToolResult[] {
    return results.map(r => {
      if (r.content.length > this.MAX_TOOL_RESULT_CHARS) {
        const truncated = r.content.slice(0, this.MAX_TOOL_RESULT_CHARS)
        const omitted = r.content.length - this.MAX_TOOL_RESULT_CHARS
        return {
          ...r,
          content: `${truncated}\n\n[... ${omitted} chars omitted to save tokens]`,
        }
      }
      return r
    })
  }

  private get tools(): ToolDefinition[] {
    // Use custom tools if provided, otherwise use registry
    const availableTools = this.customTools || getAllTools()

    if (this.mode === 'plan') {
      return availableTools.filter(t => READ_ONLY_TOOL_NAMES.includes(t.name))
    }
    return availableTools
  }

  /**
   * Build system prompt using template engine.
   * This replaces the old hardcoded prompts with a structured template.
   */
  private buildSystemPromptWithTemplate(customInstructions?: string): string {
    const snapshot = this.context.getSnapshot()
    const projectCtx = snapshot.projectIndex
      ? `\n<project-info>\nProject: ${snapshot.projectIndex.packageInfo?.name || 'unknown'}\nFiles read this session: ${snapshot.readFiles.size}\n</project-info>`
      : ''

    const envCtx = buildEnvironmentContext(this.config.workspaceRoot || process.cwd())

    return buildPromptFromTemplate(this.mode, {
      cwd: this.config.workspaceRoot,
      customInstructions,
      projectContext: `${envCtx}\n${projectCtx}`,
    })
  }

  async initialize(contextProtocol: { formatIndexForLLM: (index: any) => string }): Promise<string> {
    const index = await this.context.buildIndex()
    return contextProtocol.formatIndexForLLM(index)
  }

  setMode(mode: AgentMode): void {
    if (this.mode !== mode) {
      this.mode = mode
      this.messages = []
    }
  }

  getMode(): AgentMode {
    return this.mode
  }

  async chat(userMessage: string, temperature?: number, topP?: number, maxTokens?: number, images?: Array<{ name: string; dataUrl: string; mimeType: string }>, context?: Array<{ path: string; name: string; content: string }>): Promise<string> {
    // Create abort controller for this request
    this.abortController = new AbortController()

    // Ensure context index is built before any tool calls
    if (!this.context.getSnapshot().projectIndex) {
      await this.context.buildIndex()
    }

    // Task complexity analysis (only for real user messages, not re-requests)
    let complexityInstruction = ''
    let detectedComplexity: { score: number; level: string; needsTasks: boolean; reasons: string[] } | null = null
    if (this.taskMode !== 'off' && userMessage.trim().length > 0 && this.mode === 'code') {
      // Complexity analysis is done externally and passed via customInstructions
      // This keeps the core engine framework-agnostic
    }

    // Build user message content (text + context files + images)
    let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = userMessage
    if ((context && context.length > 0) || (images && images.length > 0)) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: userMessage },
      ]
      // Add context file contents
      if (context && context.length > 0) {
        for (const ctx of context) {
          parts.push({
            type: 'text',
            text: `\n--- File: ${ctx.name} (${ctx.path}) ---\n${ctx.content}\n--- End: ${ctx.name} ---`,
          })
        }
      }
      // Add images
      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({
            type: 'image_url' as const,
            image_url: { url: img.dataUrl },
          })
        }
      }
      userContent = parts
    }

    this.messages.push({ role: 'user', content: userContent as string })

    // Build system prompt using template engine
    const customInstructions = [
      complexityInstruction,
      this.feedback.length > 0 ? `User feedback available: ${this.feedback.length} entries` : '',
    ].filter(Boolean).join('\n')

    const systemContent = this.buildSystemPromptWithTemplate(customInstructions || undefined)

    // Trim history to save tokens (keep recent messages, summarize old ones)
    this.trimHistory()

    const startTime = Date.now()
    const response = await this.callLLM(systemContent, temperature, topP, maxTokens)
    const latencyMs = Date.now() - startTime

    // Record token usage
    if (response.usage) {
      trackTokens(this.tokenBudget, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0)
    }

    const assistantMessage = response.choices[0]?.message

    if (!assistantMessage) {
      return 'No response from model'
    }

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      this.messages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        toolCalls: assistantMessage.tool_calls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
      })

      const toolResults = await this.executeToolCalls(assistantMessage.tool_calls)
      // Compress large tool results to save tokens
      const compressedResults = this.compressToolResults(toolResults)
      this.messages.push({
        role: 'tool',
        content: compressedResults.map(r => r.content).join('\n\n'),
      })

      return this.chat('', temperature, topP, maxTokens)
    }

    this.messages.push({ role: 'assistant', content: assistantMessage.content || '' })

    // Wrap response with system-reminder metadata
    const rawContent = assistantMessage.content || ''
    const wrappedContent = wrapResponse(rawContent, {
      model: this.config.model,
      tokens: response.usage ? {
        prompt: response.usage.prompt_tokens || 0,
        completion: response.usage.completion_tokens || 0,
      } : undefined,
      latencyMs,
    })

    console.log(`[VTE] Response ready: tokens=${response.usage?.prompt_tokens || 0}+${response.usage?.completion_tokens || 0} latency=${latencyMs}ms`)

    return wrappedContent
  }

  private async callLLM(systemContent: string, temperature?: number, topP?: number, maxTokens?: number): Promise<LLMResponse> {
    // Build API messages with proper content format
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...this.messages.map(m => {
        // Handle multimodal content (text + images)
        const content = m.content
        if (typeof content === 'string') {
          return { role: m.role, content }
        }
        // Already multimodal format
        return { role: m.role, content }
      }),
    ]

    const request: LLMRequest = {
      model: this.config.model,
      messages: apiMessages as any[],
      tools: this.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      // High reasoning → lower temperature for more focused output.
      temperature: this.reasoningLevel === 'high' ? Math.min(temperature ?? 0.7, 0.3) : (temperature ?? 0.7),
      stream: true,
      stream_options: { include_usage: true },
      ...(topP !== undefined && { top_p: topP }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      // Thinking: gated by reasoning level (low = off for real token savings).
      chat_template_kwargs: { enable_thinking: this.reasoningLevel !== 'low' },
    }

    console.log(`[VTE] Request: model=${request.model} messages=${request.messages.length} tools=${request.tools?.length} temp=${request.temperature} stream=true thinking=${this.reasoningLevel !== 'low'} reasoning=${this.reasoningLevel}`)

    const response = await fetch(`${this.config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.log(`[VTE] API error ${response.status}: ${body.substring(0, 300)}`)
      throw new Error(`API error: ${response.status}: ${body.substring(0, 200)}`)
    }

    // Parse SSE stream with event emission
    return parseSSEStream(response, { onEvent: this.onEvent })
  }

  private async executeToolCalls(toolCalls: LLMResponse['choices'][0]['message']['tool_calls']): Promise<ToolResult[]> {
    const results: ToolResult[] = []

    for (const tc of toolCalls || []) {
      const tool = this.tools.find(t => t.name === tc.function.name)
      const args = JSON.parse(tc.function.arguments)

      if (!tool) {
        console.log(`[VTE] Unknown tool: ${tc.function.name}`)
        this.onEvent?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args })
        this.onEvent?.({ type: 'tool_result', toolCallId: tc.id, result: `Unknown tool: ${tc.function.name}`, elapsed: -1 })
        results.push({ type: 'error', content: `Unknown tool: ${tc.function.name}` })
        continue
      }

      this.onEvent?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args })
      const startTime = Date.now()

      try {
        const result = await tool.execute(args, this.context)
        const elapsed = Date.now() - startTime
        console.log(`[VTE] Tool: ${tc.function.name} (${elapsed}ms)`)

        // Auto-track file changes (if shadowGit is available)
        let diffInfo = ''
        if (['edit', 'write'].includes(tc.function.name) && args.path) {
          // ShadowGit tracking is handled by the integration layer
          // Core engine just emits events
        }

        const displayResult = result.content.substring(0, 500) + diffInfo
        this.onEvent?.({ type: 'tool_result', toolCallId: tc.id, result: displayResult, elapsed })
        results.push(result)
      } catch (err: any) {
        const elapsed = Date.now() - startTime
        const errorMsg = `Tool error (${tc.function.name}): ${err.message || 'Unknown error'}`
        console.log(`[VTE] Tool error: ${tc.function.name} - ${err.message}`)
        this.onEvent?.({ type: 'tool_result', toolCallId: tc.id, result: errorMsg, elapsed: -elapsed })
        results.push({ type: 'error', content: errorMsg })
      }
    }

    return results
  }

  getMessages(): AgentMessage[] {
    return this.messages
  }

  clearHistory(): void {
    this.messages = []
  }

  setModel(model: string): void {
    this.config.model = model
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
      console.log('[VTE] Request aborted by user')
    }
  }

  setTaskMode(taskMode: TaskMode): void {
    this.taskMode = taskMode
  }

  getTaskMode(): TaskMode {
    return this.taskMode
  }

  // ── Checkpoint Methods (optional, requires integration layer) ──

  /**
   * Get token budget for external tracking
   */
  getTokenBudget(): TokenBudget {
    return this.tokenBudget
  }

  /**
   * Get current config
   */
  getConfig(): RuntimeConfig {
    return { ...this.config }
  }
}
