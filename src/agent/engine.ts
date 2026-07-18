/**
 * Agent engine - manages the conversation loop and LLM calls
 * Key principle: incremental context, no token waste
 */

import * as path from 'path';
import { ContextManager, AgentMessage, ToolDefinition, LLMRequest, LLMResponse, ToolResult, Checkpoint, ApiProtocol, ThinkingStyle, ReasoningLevel } from '../shared/types';
import { formatIndexForLLM } from '../context/protocol';
import {
  createTokenBudget,
  trackTokens,
  TokenBudget,
} from './middleware';
import {
  buildPromptFromTemplate,
  wrapResponse,
  buildEnvironmentContext,
} from './prompt-template';
import { allTools } from './tools';
import { bashTool } from './bash';
import { grepTool } from './grep';
import { globTool } from './glob';
import { diagnosticsTool } from './diagnostics';
import { gitTool } from './git';
import { webfetchTool } from './webfetch';
import { taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool } from './task-tools';
import { checkpointSaveTool, checkpointListTool, checkpointRestoreTool, checkpointDeleteTool, checkpointDiffTool, checkpointLogTool, setCheckpointContext } from './checkpoint-tools';
import { questionTool } from '../tools/question';
import { ShadowGit } from './shadow-git';
import { registerTools, getAllTools } from './registry';
import { TaskMode, analyzeComplexity, checkLLMLaziness, getComplexityInstruction } from './complexity';
import { recordUsage, getSessionStats, getRecentRecords } from './token-tracker';
import { PermissionConfig, DEFAULT_PERMISSION_CONFIG, getPermissionLevel, TOOL_CATEGORIES } from '../core/permissions';
import { buildChatReasoningParams } from './reasoning';
import { callResponsesAPI } from './responses-client';

export type AgentMode = 'plan' | 'code';

// Register all tools
registerTools([...allTools, bashTool, grepTool, globTool, diagnosticsTool, gitTool, webfetchTool, taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool, checkpointSaveTool, checkpointListTool, checkpointRestoreTool, checkpointDeleteTool, checkpointDiffTool, checkpointLogTool, questionTool]);

const READ_ONLY_TOOL_NAMES = ['read', 'search', 'list', 'grep', 'glob', 'diagnostics', 'git'];

export class AgentEngine {
  private context: ContextManager;
  private messages: AgentMessage[] = [];
  private model: string;
  private apiKey: string;
  private apiBase: string;
  private mode: AgentMode = 'code';
  private taskMode: TaskMode = 'off';
  private abortController: AbortController | null = null;
  private feedback: Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }> = [];
  private tokenBudget: TokenBudget;
  private workspaceRoot: string;
  private shadowGit: ShadowGit;
  // Context management: keep only recent messages, summarize old ones
  private readonly MAX_HISTORY_MESSAGES = 20;
  private readonly MAX_TOOL_RESULT_CHARS = 2000;
  onViewUpdate?: (update: Record<string, unknown>) => void;
  private permissionConfig: PermissionConfig = { ...DEFAULT_PERMISSION_CONFIG };
  private pendingPermissionResolve?: (decision: 'allow_once' | 'always_allow' | 'deny') => void;
  // Track tools denied in this session to avoid repeated permission requests
  private deniedTools: Set<string> = new Set();
  private pendingQuestionResolve?: (answer: string) => void;
  private _questionCancelled = false;
  private _questionSkipped = false;
  private _enforceRetryCount = 0;
  private _toolCallCount = 0;
  private static readonly MAX_TOOL_CALLS = 100;
  /** Optional explicit tool whitelist. `null` = no tools, `undefined` = default. */
  private _allowedTools?: string[] | null = undefined;

  constructor(
    context: ContextManager,
    model: string = 'gpt-4',
    apiKey: string = '',
    apiBase: string = 'https://api.openai.com/v1',
    workspaceRoot: string = ''
  ) {
    this.context = context;
    this.model = model;
    this.apiKey = apiKey;
    this.apiBase = apiBase;
    this.workspaceRoot = workspaceRoot;
    this.tokenBudget = createTokenBudget();
    this.shadowGit = new ShadowGit(workspaceRoot);
    this.shadowGit.init();
    // Set checkpoint context for checkpoint tools
    setCheckpointContext(this, workspaceRoot);
  }

  setFeedback(feedback: Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }>) {
    this.feedback = feedback;
  }

  // ── Permission Management ──

  setPermissionConfig(config: PermissionConfig) {
    this.permissionConfig = { ...config };
  }

  getPermissionConfig(): PermissionConfig {
    return { ...this.permissionConfig };
  }

  /**
   * Request permission from user for a tool execution.
   * Returns a Promise that resolves when the user responds.
   */
  requestPermission(toolName: string, toolArgs: Record<string, unknown>): Promise<'allow_once' | 'always_allow' | 'deny'> {
    return new Promise((resolve) => {
      this.pendingPermissionResolve = resolve;
      const category = TOOL_CATEGORIES[toolName] || 'unknown';
      this.onViewUpdate?.({
        type: 'permission_request',
        requestId: `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        toolName,
        toolArgs,
        category,
      });
    });
  }

  /**
   * Resolve a pending permission request.
   * Called when the user responds to the authorization dialog.
   */
  resolvePermission(decision: 'allow_once' | 'always_allow' | 'deny', toolName?: string) {
    if (this.pendingPermissionResolve) {
      this.pendingPermissionResolve(decision);
      this.pendingPermissionResolve = undefined;
      // If user chose "always allow", update the config
      if (decision === 'always_allow' && toolName) {
        const category = TOOL_CATEGORIES[toolName];
        if (category) {
          this.permissionConfig[category] = 'allow';
        }
      }
    }
  }

  // ── Question (User Input) ──

  requestQuestion(
    question: string,
    options: Array<{ label: string; description?: string }>,
    multiple: boolean,
    recommended?: string
  ): Promise<string> {
    return new Promise((resolve) => {
      this.pendingQuestionResolve = resolve;
      this.onViewUpdate?.({
        type: 'question_request',
        requestId: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        question,
        options,
        multiple,
        recommended,
      });
    });
  }

  resolveQuestion(answer: string) {
    if (this.pendingQuestionResolve) {
      this.pendingQuestionResolve(answer);
      this.pendingQuestionResolve = undefined;
    }
  }

  // ── Reasoning Level ──

  private reasoningLevel: ReasoningLevel = 'medium';
  // Which wire protocol / thinking dialect to use for this model.
  private apiProtocol: ApiProtocol = 'chat';
  private thinkingStyle: ThinkingStyle = 'auto';

  setReasoningLevel(level: ReasoningLevel) {
    this.reasoningLevel = level;
  }

  getReasoningLevel(): ReasoningLevel {
    return this.reasoningLevel;
  }

  setApiProtocol(protocol: ApiProtocol) {
    this.apiProtocol = protocol;
  }

  getApiProtocol(): ApiProtocol {
    return this.apiProtocol;
  }

  setThinkingStyle(style: ThinkingStyle) {
    this.thinkingStyle = style;
  }

  getThinkingStyle(): ThinkingStyle {
    return this.thinkingStyle;
  }

  // ── Context Management (token-efficient, inspired by OpenCode) ──

  /**
   * Trim message history to stay within token budget.
   * Keeps: first user message (context) + last N messages + all tool calls in current turn.
   */
  private trimHistory(): void {
    if (this.messages.length <= this.MAX_HISTORY_MESSAGES) return;

    // Keep first message (initial context) + recent messages
    const first = this.messages[0];
    const recent = this.messages.slice(-this.MAX_HISTORY_MESSAGES);

    // Add summary of trimmed messages
    const trimmedCount = this.messages.length - this.MAX_HISTORY_MESSAGES;
    const snapshot = this.context.getSnapshot();
    const filesRead = Array.from(snapshot.readFiles).slice(-5).join(', ') || 'none';
    const summary: AgentMessage = {
      role: 'system',
      content: `[Context: ${trimmedCount} earlier messages trimmed to save tokens. Key files read: ${filesRead}]`,
    };

    this.messages = [first, summary, ...recent];
    console.log(`[VTE] Trimmed history: ${trimmedCount} messages removed`);
  }

  /**
   * Compress tool results that are too large.
   */
  private compressToolResults(results: ToolResult[]): ToolResult[] {
    return results.map(r => {
      if (r.content.length > this.MAX_TOOL_RESULT_CHARS) {
        const truncated = r.content.slice(0, this.MAX_TOOL_RESULT_CHARS);
        const omitted = r.content.length - this.MAX_TOOL_RESULT_CHARS;
        return {
          ...r,
          content: `${truncated}\n\n[... ${omitted} chars omitted to save tokens]`,
        };
      }
      return r;
    });
  }

  private get tools(): ToolDefinition[] {
    if (this._allowedTools !== undefined) {
      if (this._allowedTools === null) return [];
      return getAllTools().filter(t => this._allowedTools!.includes(t.name));
    }
    if (this.mode === 'plan') {
      return getAllTools().filter(t => READ_ONLY_TOOL_NAMES.includes(t.name));
    }
    return getAllTools();
  }

  /**
   * Restrict the tools this engine may call. Pass `null` to disable all
   * tool calls (e.g. when the model should only return text), or an
   * explicit name whitelist. Pass `undefined` to restore default behavior.
   */
  setAllowedTools(names?: string[] | null): void {
    this._allowedTools = names;
  }

  /**
   * Build system prompt using template engine.
   * This replaces the old hardcoded prompts with a structured template.
   */
  private buildSystemPromptWithTemplate(customInstructions?: string): string {
    const snapshot = this.context.getSnapshot();
    const projectCtx = snapshot.projectIndex
      ? `\n<project-info>\nProject: ${snapshot.projectIndex.packageInfo?.name || 'unknown'}\nFiles read this session: ${snapshot.readFiles.size}\n</project-info>`
      : '';

    const envCtx = buildEnvironmentContext(this.workspaceRoot || process.cwd());

    return buildPromptFromTemplate(this.mode, {
      cwd: this.workspaceRoot,
      customInstructions,
      projectContext: `${envCtx}\n${projectCtx}`,
    });
  }

  async initialize(): Promise<string> {
    const index = await this.context.buildIndex();
    return formatIndexForLLM(index);
  }

  setMode(mode: AgentMode): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.messages = [];
    }
  }

  getMode(): AgentMode {
    return this.mode;
  }

  async chat(userMessage: string, temperature?: number, topP?: number, maxTokens?: number, images?: Array<{ name: string; dataUrl: string; mimeType: string }>, context?: Array<{ path: string; name: string; content: string }>): Promise<string> {
    // Create abort controller for this request
    this.abortController = new AbortController();
    this._questionCancelled = false;
    this._enforceRetryCount = 0;
    this._toolCallCount = 0;
    // _questionSkipped persists across turns — only reset by new chat session

    // Ensure context index is built before any tool calls
    if (!this.context.getSnapshot().projectIndex) {
      await this.context.buildIndex();
    }

    // Task complexity analysis (only for real user messages, not re-requests)
    let complexityInstruction = '';
    let detectedComplexity: ReturnType<typeof analyzeComplexity> | null = null;
    if (this.taskMode !== 'off' && userMessage.trim().length > 0 && this.mode === 'code') {
      detectedComplexity = analyzeComplexity(userMessage);

      if (this.taskMode === 'plugin-auto') {
        complexityInstruction = getComplexityInstruction(detectedComplexity);
      }
    }

    // Build user message content (text + context files + images)
    let userContent: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = userMessage;
    if ((context && context.length > 0) || (images && images.length > 0)) {
      const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: userMessage },
      ];
      // Add context file contents
      if (context && context.length > 0) {
        for (const ctx of context) {
          parts.push({
            type: 'text',
            text: `\n--- File: ${ctx.name} (${ctx.path}) ---\n${ctx.content}\n--- End: ${ctx.name} ---`,
          });
        }
      }
      // Add images
      if (images && images.length > 0) {
        for (const img of images) {
          parts.push({
            type: 'image_url' as const,
            image_url: { url: img.dataUrl },
          });
        }
      }
      userContent = parts;
    }

    this.messages.push({ role: 'user', content: userContent as string });

    // Build system prompt using template engine
    let reasoningInstruction = '';
    if (this.reasoningLevel === 'high') {
      reasoningInstruction = 'Take time to think deeply. Analyze the problem from multiple angles before providing your answer. Consider edge cases, potential issues, and alternative approaches.';
    } else if (this.reasoningLevel === 'medium') {
      reasoningInstruction = 'Think step by step before answering.';
    }
    const customInstructions = [
      complexityInstruction,
      reasoningInstruction,
      this.feedback.length > 0 ? `User feedback available: ${this.feedback.length} entries` : '',
    ].filter(Boolean).join('\n')

    const systemContent = this.buildSystemPromptWithTemplate(customInstructions || undefined);

    // Trim history to save tokens (keep recent messages, summarize old ones)
    this.trimHistory();

    // Signal new thinking phase to webview
    this.onViewUpdate?.({ type: 'thinking_start' });

    const startTime = Date.now();
    const response = await this.callLLM(systemContent, temperature, topP, maxTokens);
    const latencyMs = Date.now() - startTime;

    // Record token usage
    if (response.usage) {
      recordUsage(this.model, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0);
      trackTokens(this.tokenBudget, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0);
    }

    const assistantMessage = response.choices[0]?.message;

    if (!assistantMessage) {
      return 'No response from model';
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
      });

      const toolResults = await this.executeToolCalls(assistantMessage.tool_calls);
      // Compress large tool results to save tokens
      const compressedResults = this.compressToolResults(toolResults);

      // Push tool results with tool_call_id for each tool call
      if (assistantMessage.tool_calls) {
        console.log(`[VTE] Pushing ${assistantMessage.tool_calls.length} tool results`);
        for (let i = 0; i < assistantMessage.tool_calls.length; i++) {
          const tc = assistantMessage.tool_calls[i];
          const result = compressedResults[i];
          if (result) {
            console.log(`[VTE] Tool result: ${tc.function.name} (${result.content.length} chars)`);
            this.messages.push({
              role: 'tool',
              content: result.content,
              tool_call_id: tc.id,
            });
          }
        }
        console.log(`[VTE] Total messages after tool results: ${this.messages.length}`);
      }

      // Track tool calls and enforce limit
      this._toolCallCount += assistantMessage.tool_calls.length;
      if (this._toolCallCount >= AgentEngine.MAX_TOOL_CALLS) {
        console.log(`[VTE] MAX_TOOL_CALLS reached (${this._toolCallCount}), stopping loop`);
        return `达到最大工具调用次数 (${AgentEngine.MAX_TOOL_CALLS})，已停止执行。`;
      }

      // LLM-auto mode: no longer force task tracking — let LLM decide

      return this.chat('', temperature, topP, maxTokens);
    }

    this.messages.push({ role: 'assistant', content: assistantMessage.content || '' });

    // Wrap response with system-reminder metadata
    const rawContent = assistantMessage.content || '';
    const wrappedContent = wrapResponse(rawContent, {
      model: this.model,
      tokens: response.usage ? {
        prompt: response.usage.prompt_tokens || 0,
        completion: response.usage.completion_tokens || 0,
      } : undefined,
      latencyMs,
    });

    console.log(`[VTE] Response ready: tokens=${response.usage?.prompt_tokens || 0}+${response.usage?.completion_tokens || 0} latency=${latencyMs}ms`);

    return wrappedContent;
  }

  private async callLLM(systemContent: string, temperature?: number, topP?: number, maxTokens?: number): Promise<LLMResponse> {
    console.log(`[VTE][DEBUG] callLLM START: ${this.messages.length} messages in history (protocol=${this.apiProtocol})`);

    // ── Responses API branch (native reasoning models: o-series, gpt-5.x) ──
    if (this.apiProtocol === 'responses') {
      return callResponsesAPI({
        apiBase: this.apiBase,
        apiKey: this.apiKey,
        model: this.model,
        messages: this.messages,
        instructions: systemContent,
        tools: this.tools,
        temperature,
        topP,
        maxTokens,
        reasoningLevel: this.reasoningLevel,
        abortSignal: this.abortController?.signal,
        onEvent: (e) => this.onViewUpdate?.(e),
      });
    }

    // Build API messages with proper content format
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...this.messages.map(m => {
        // Handle multimodal content (text + images)
        const content = m.content;
        if (typeof content === 'string') {
          // Include tool_call_id for tool role messages
          if (m.role === 'tool' && m.tool_call_id) {
            return { role: m.role, content, tool_call_id: m.tool_call_id };
          }
          return { role: m.role, content };
        }
        // Already multimodal format (array of parts)
        const parts = content as unknown as any[];
        console.log(`[VTE][DEBUG] Multimodal message: role=${m.role} parts=${parts.length}`);
        if (m.role === 'tool' && m.tool_call_id) {
          return { role: m.role, content, tool_call_id: m.tool_call_id };
        }
        return { role: m.role, content };
      }),
    ];

    // Log if any messages have images (arrays with more than 1 part = has images)
    const multimodalCount = apiMessages.filter((m: any) => Array.isArray(m.content) && m.content.length > 1).length;
    console.log(`[VTE][DEBUG] API request: ${apiMessages.length} messages, ${multimodalCount} multimodal`);

    // Build reasoning params that actually take effect on this backend
    // (reasoning_effort for OpenAI reasoning models, enable_thinking+budget for
    // Qwen/MiMo, thinking budget for Anthropic, temperature-only otherwise).
    const reasoning = buildChatReasoningParams({
      level: this.reasoningLevel,
      style: this.thinkingStyle,
      model: this.model,
      baseTemperature: temperature ?? 0.7,
    });

    const request: LLMRequest = {
      model: this.model,
      messages: apiMessages as any[],
      tools: this.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      stream: true,
      stream_options: { include_usage: true },
      ...(topP !== undefined && { top_p: topP }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      // Only send temperature when the backend accepts it (reasoning models reject it).
      ...(reasoning.dropTemperature ? {} : { temperature: reasoning.temperature }),
      ...(reasoning.reasoning_effort ? { reasoning_effort: reasoning.reasoning_effort } : {}),
      ...(reasoning.chat_template_kwargs ? { chat_template_kwargs: reasoning.chat_template_kwargs } : {}),
      ...(reasoning.thinking ? { thinking: reasoning.thinking } : {}),
    };

    console.log(`[VTE] Request: model=${request.model} messages=${request.messages.length} tools=${request.tools?.length} temp=${reasoning.dropTemperature ? 'omit' : reasoning.temperature} effort=${reasoning.reasoning_effort ?? '-'} thinking=${JSON.stringify(reasoning.chat_template_kwargs ?? reasoning.thinking ?? 'none')} reasoning=${this.reasoningLevel}`);

    const response = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.log(`[VTE] API error ${response.status}: ${body.substring(0, 300)}`);
      throw new Error(`API error: ${response.status}: ${body.substring(0, 200)}`);
    }

    // Parse SSE stream
    return this.parseStream(response);
  }

  private async parseStream(response: Response): Promise<LLMResponse> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    let finishReason = '';
    let usage: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            content += choice.delta.content;
            this.onViewUpdate?.({ type: 'stream_chunk', text: choice.delta.content });
          }

          // Handle thinking content from API
          if (choice.delta?.reasoning_content) {
            this.onViewUpdate?.({ type: 'thinking_chunk', text: choice.delta.reasoning_content });
          }
          if (choice.delta?.thinking) {
            this.onViewUpdate?.({ type: 'thinking_chunk', text: choice.delta.thinking });
          }

          // Log raw delta keys to detect interleaving
          const keys = Object.keys(choice.delta || {}).filter(k => k !== 'role');
          if (keys.length > 0) {
            const parts: string[] = [];
            if (choice.delta?.reasoning_content) parts.push(`reasoning=${JSON.stringify(choice.delta.reasoning_content).substring(0, 80)}`);
            if (choice.delta?.thinking) parts.push(`thinking=${JSON.stringify(choice.delta.thinking).substring(0, 80)}`);
            if (choice.delta?.content) parts.push(`content=${JSON.stringify(choice.delta.content).substring(0, 80)}`);
            if (choice.delta?.tool_calls) parts.push('tools');
            console.log(`[VTE] delta: ${parts.join(' | ')}`);
          }

          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCalls[idx]) {
                toolCalls[idx] = { id: tc.id || '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (chunk.usage) {
            usage = chunk.usage;
          }
        } catch {}
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
    };

    console.log(`[VTE] Stream complete | finish_reason=${finishReason} | content=${content.length} chars | tool_calls=${toolCalls.length} | usage=${usage ? `${usage.prompt_tokens}+${usage.completion_tokens} tokens` : 'none'}`);
    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        console.log(`[VTE]   -> ${tc.function.name}(${tc.function.arguments.substring(0, 150)})`);
      }
    }

    return result;
  }

  private async executeToolCalls(toolCalls: LLMResponse['choices'][0]['message']['tool_calls']): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const tc of toolCalls || []) {
      const tool = this.tools.find(t => t.name === tc.function.name);
      const args = JSON.parse(tc.function.arguments);

      if (!tool) {
        console.log(`[VTE] Unknown tool: ${tc.function.name}`);
        this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args });
        this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: `Unknown tool: ${tc.function.name}`, elapsed: -1 });
        results.push({ type: 'error', content: `Unknown tool: ${tc.function.name}` });
        continue;
      }

      // ── Permission check (only in code mode) ──
      // question tool is user input — always allowed, no permission needed
      if (this.mode === 'code' && tc.function.name !== 'question') {
        // Check if this tool was previously denied in this session
        const toolKey = `${tc.function.name}:${JSON.stringify(args)}`;
        if (this.deniedTools.has(toolKey)) {
          console.log(`[VTE] Tool previously denied, skipping: ${tc.function.name}`);
          this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args });
          this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: '此操作已被拒绝，请尝试其他方式', elapsed: -1 });
          results.push({ type: 'error', content: `此操作已被用户拒绝，请不要重复请求相同的权限。如需执行此操作，请在权限设置中修改，或尝试其他方式完成任务。` });
          continue;
        }

        const permissionLevel = getPermissionLevel(tc.function.name, this.permissionConfig);
        if (permissionLevel === 'deny') {
          console.log(`[VTE] Permission denied: ${tc.function.name}`);
          this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args });
          this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: '权限被拒绝', elapsed: -1 });
          results.push({ type: 'error', content: `权限被拒绝: ${tc.function.name}` });
          continue;
        }
        if (permissionLevel === 'ask') {
          console.log(`[VTE] Requesting permission: ${tc.function.name}`);
          const decision = await this.requestPermission(tc.function.name, args);
          if (decision === 'deny') {
            console.log(`[VTE] Permission denied by user: ${tc.function.name}`);
            // Track this denied tool to avoid repeated requests
            this.deniedTools.add(toolKey);
            this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args });
            this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: '用户拒绝执行', elapsed: -1 });
            results.push({ type: 'error', content: `用户拒绝执行: ${tc.function.name}` });
            continue;
          }
          // If user chose "always allow", remove from denied tools (in case it was previously denied)
          if (decision === 'always_allow') {
            this.deniedTools.delete(toolKey);
          }
        }
      }

      // ── Question tool interception ──
      if (tc.function.name === 'question') {
        // Block retry after skip (persists across turns) or cancel (within same turn)
        if (this._questionSkipped || this._questionCancelled) {
          this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: 'question', arguments: args });
          this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: this._questionSkipped ? '用户已跳过所有提问' : '用户已取消，不再提问', elapsed: 0 });
          results.push({ type: 'error', content: '用户已取消提问。请不要重试 question 工具，继续执行其他任务。' });
          continue;
        }
        console.log(`[VTE] Question tool: asking user`);
        this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: 'question', arguments: args });
        const answer = await this.requestQuestion(
          args.question as string,
          (args.options as Array<{ label: string; description?: string }>) || [],
          (args.multiple as boolean) || false,
          args.recommended as string | undefined
        );
        if (!answer || answer === '__skip__') {
          this._questionCancelled = true;
        }
        if (answer === '__skip__') {
          this._questionSkipped = true;
        }
        const displayResult = answer === '__skip__'
          ? 'User chose to skip all questions'
          : answer
            ? `User selected: ${answer}`
            : 'User cancelled';
        this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: displayResult, elapsed: 0 });
        results.push({
          type: 'text',
          content: answer === '__skip__'
            ? '用户选择跳过所有问题。请不要再调用 question 工具，直接执行任务。'
            : answer || 'User chose not to answer. Proceed without this input.',
        });
        continue;
      }

      this.onViewUpdate?.({ type: 'tool_call', toolCallId: tc.id, name: tc.function.name, arguments: args });
      const startTime = Date.now();

      try {
        const result = await tool.execute(args, this.context);
        const elapsed = Date.now() - startTime;
        console.log(`[VTE] Tool: ${tc.function.name} (${elapsed}ms)`);

        // Auto-track file changes and get diff for edit/write tools
        let diffInfo = '';
        if (['edit', 'write'].includes(tc.function.name) && args.path) {
          const fullPath = path.isAbsolute(args.path) ? args.path : path.join(this.workspaceRoot, args.path);
          const commitHash = this.shadowGit.trackFile(fullPath, `Tool: ${tc.function.name} ${args.path}`);
          if (commitHash) {
            // Get the diff for this commit
            const diffs = this.shadowGit.diff(commitHash + '~1', commitHash);
            if (diffs.length > 0) {
              diffInfo = '\n\n--- Code Diff ---\n' + diffs.map(d => d.patch).join('\n');
            }
          }
        }

        const displayResult = result.content.substring(0, 500) + diffInfo;
        this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: displayResult, elapsed });
        results.push(result);
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        const errorMsg = `Tool error (${tc.function.name}): ${err.message || 'Unknown error'}`;
        console.log(`[VTE] Tool error: ${tc.function.name} - ${err.message}`);
        this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: errorMsg, elapsed: -elapsed });
        results.push({ type: 'error', content: errorMsg });
      }
    }

    return results;
  }

  getMessages(): AgentMessage[] {
    return this.messages;
  }

  clearHistory(): void {
    this.messages = [];
    this.deniedTools.clear();
    this._questionSkipped = false;
    this._questionCancelled = false;
  }

  setModel(model: string): void {
    this.model = model;
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      console.log('[VTE] Request aborted by user');
    }
  }

  setTaskMode(taskMode: TaskMode): void {
    this.taskMode = taskMode;
  }

  getTaskMode(): TaskMode {
    return this.taskMode;
  }

  // ── Checkpoint Methods ──

  /**
   * Create a checkpoint of current state (shadow-git only).
   */
  createCheckpoint(name?: string): { commitHash: string; tagName: string } | null {
    // Save metadata to shadow-git before creating checkpoint
    this.shadowGit.saveMetadata({
      messages: this.messages,
      mode: this.mode,
      taskMode: this.taskMode,
      tokenStats: {
        prompt: this.tokenBudget.used.prompt,
        completion: this.tokenBudget.used.completion,
      },
    });

    // Create shadow git checkpoint
    const tagName = this.shadowGit.createCheckpoint(name || `Checkpoint ${new Date().toLocaleTimeString()}`);
    if (!tagName) return null;

    const hash = this.shadowGit.getCommitHash();
    return { commitHash: hash, tagName };
  }

  /**
   * Restore state from a checkpoint (shadow-git).
   */
  restoreCheckpoint(tagName: string): boolean {
    // Restore files from shadow-git
    const restoredFiles = this.shadowGit.restoreCheckpoint(tagName);
    if (restoredFiles.length === 0) {
      console.warn(`[VTE] No files restored from checkpoint: ${tagName}`);
      return false;
    }

    // Mark files as modified in context
    for (const file of restoredFiles) {
      this.context.markModified(file);
    }

    // Load metadata from shadow-git
    const metadata = this.shadowGit.loadMetadata(tagName);
    if (metadata) {
      this.messages = metadata.messages || [];
      this.mode = (metadata.mode as AgentMode) || 'code';
      this.taskMode = (metadata.taskMode as TaskMode) || 'off';
      if (metadata.tokenStats) {
        this.tokenBudget.used = metadata.tokenStats;
      }
    }

    console.log(`[VTE] Checkpoint restored: ${tagName} (${restoredFiles.length} files)`);
    return true;
  }

  /**
   * Get the ShadowGit instance for diff operations
   */
  getShadowGit(): ShadowGit {
    return this.shadowGit;
  }
}
