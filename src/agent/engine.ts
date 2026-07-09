/**
 * Agent engine - manages the conversation loop and LLM calls
 * Key principle: incremental context, no token waste
 */

import * as path from 'path';
import { ContextManager, AgentMessage, ToolDefinition, LLMRequest, LLMResponse, ToolResult, Checkpoint } from '../shared/types';
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
import { ShadowGit } from './shadow-git';
import { registerTools, getAllTools } from './registry';
import { TaskMode, analyzeComplexity, checkLLMLaziness, getComplexityInstruction } from './complexity';
import { recordUsage, getSessionStats, getRecentRecords } from './token-tracker';

export type AgentMode = 'plan' | 'code';

// Register all tools
registerTools([...allTools, bashTool, grepTool, globTool, diagnosticsTool, gitTool, webfetchTool, taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool, checkpointSaveTool, checkpointListTool, checkpointRestoreTool, checkpointDeleteTool, checkpointDiffTool, checkpointLogTool]);

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
    if (this.mode === 'plan') {
      return getAllTools().filter(t => READ_ONLY_TOOL_NAMES.includes(t.name));
    }
    return getAllTools();
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

  async chat(userMessage: string, temperature?: number, topP?: number, maxTokens?: number): Promise<string> {
    // Create abort controller for this request
    this.abortController = new AbortController();

    // Ensure context index is built before any tool calls
    if (!this.context.getSnapshot().projectIndex) {
      await this.context.buildIndex();
    }

    // Task complexity analysis (only for real user messages, not re-requests)
    let complexityInstruction = '';
    let detectedComplexity: ReturnType<typeof analyzeComplexity> | null = null;
    if (this.taskMode !== 'off' && userMessage.trim().length > 0 && this.mode === 'code') {
      detectedComplexity = analyzeComplexity(userMessage);
      console.log(`[VTE] Complexity: score=${detectedComplexity.score} level=${detectedComplexity.level} needsTasks=${detectedComplexity.needsTasks}`);

      if (this.taskMode === 'plugin-auto') {
        complexityInstruction = getComplexityInstruction(detectedComplexity);
      }
    }

    this.messages.push({ role: 'user', content: userMessage });

    // Build system prompt using template engine
    const customInstructions = [
      complexityInstruction,
      this.feedback.length > 0 ? `User feedback available: ${this.feedback.length} entries` : '',
    ].filter(Boolean).join('\n')

    const systemContent = this.buildSystemPromptWithTemplate(customInstructions || undefined);

    // Trim history to save tokens (keep recent messages, summarize old ones)
    this.trimHistory();

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
      this.messages.push({
        role: 'tool',
        content: compressedResults.map(r => r.content).join('\n\n'),
      });

      // LLM-auto mode: enforce task tools if LLM skipped them on complex tasks
      if (this.taskMode === 'llm-auto' && detectedComplexity && detectedComplexity.needsTasks) {
        const toolNames = assistantMessage.tool_calls.map(tc => tc.function.name);
        const usedTaskTools = toolNames.some(t => t.startsWith('task_'));

        if (!usedTaskTools && detectedComplexity.level === 'complex') {
          console.log(`[VTE] ENFORCE: LLM skipped tasks on complex task (score=${detectedComplexity.score}). Forcing task creation.`);

          // Remove the LLM's lazy response and tool calls from history
          this.messages.pop(); // remove tool results
          this.messages.pop(); // remove assistant tool calls

          // Inject mandatory task instruction as system-level directive
          this.messages.push({
            role: 'user',
            content: `[ENFORCEMENT] You skipped task tracking on a complex task (score: ${detectedComplexity.score}/100). You MUST now call task_create for each subtask before proceeding with any other work. This is mandatory.`,
          });

          // Re-request with enforcement active
          return this.chat('', temperature, topP, maxTokens);
        }
      }

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
    const apiMessages = [
      { role: 'system', content: systemContent },
      ...this.messages.map(m => ({
        role: m.role as any,
        content: m.content,
      })),
    ];

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
      temperature: temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
      ...(topP !== undefined && { top_p: topP }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      // Thinking mode: OpenAI compatible format
      chat_template_kwargs: { enable_thinking: true },
    };

    console.log(`[VTE] Request: model=${request.model} messages=${request.messages.length} tools=${request.tools?.length} temp=${request.temperature} stream=true thinking=true`);

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
