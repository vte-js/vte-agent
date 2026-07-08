/**
 * Agent engine - manages the conversation loop and LLM calls
 * Key principle: incremental context, no token waste
 */

import { ContextManager, AgentMessage, ToolDefinition, LLMRequest, LLMResponse, ToolResult } from '../shared/types';
import { formatIndexForLLM } from '../context/protocol';
import { allTools } from './tools';
import { bashTool } from './bash';
import { grepTool } from './grep';
import { globTool } from './glob';
import { diagnosticsTool } from './diagnostics';
import { gitTool } from './git';
import { webfetchTool } from './webfetch';
import { taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool } from './task-tools';
import { registerTools, getAllTools } from './registry';
import { TaskMode, analyzeComplexity, checkLLMLaziness, getComplexityInstruction } from './complexity';
import { recordUsage, getSessionStats, getRecentRecords } from './token-tracker';

export type AgentMode = 'plan' | 'code';

// Register all tools
registerTools([...allTools, bashTool, grepTool, globTool, diagnosticsTool, gitTool, webfetchTool, taskCreateTool, taskUpdateTool, taskListTool, taskDeleteTool]);

const PLAN_PROMPT = `You are a senior software architect in PLAN mode. Your job is to analyze code and produce clear, actionable implementation plans.

CAPABILITIES: You can read and search files. You CANNOT modify, write, or execute anything.

RULES:
- Analyze the codebase thoroughly before planning.
- Break down tasks into clear, ordered steps.
- For each step: specify the file, what to change, and why.
- Consider edge cases, dependencies, and testing.
- Output a structured plan with numbered steps.
- Be concise and specific. No vague suggestions.`;

const CODE_PROMPT = `You are an expert AI coding assistant in CODE mode. You can read, search, edit, and write files, and execute shell commands.

TOOLS AVAILABLE:
- read: Read file content (with optional line range)
- search: Search file contents with regex
- edit: Replace exact string in file
- write: Create or overwrite file
- list: List directory contents
- grep: Fast content search (ripgrep)
- bash: Execute shell commands
- glob: Find files by pattern (e.g. "**/*.ts")
- diagnostics: Check LSP errors/warnings for a file
- git: Git operations (status, diff, log, blame, branch, show)
- webfetch: Fetch URL content for documentation
- task_create: Create a task to track progress
- task_update: Update task status (pending/in_progress/done/blocked)
- task_list: View all tasks and progress
- task_delete: Remove a task

RULES:
- Use tools to access file content. Never assume file contents.
- Always read a file before editing it.
- For large files, read specific line ranges, not the whole file.
- Make minimal, targeted changes. Don't refactor unrelated code.
- After editing, verify the change was applied correctly.
- Use diagnostics after editing to check for errors.
- Break complex work into tasks using task_create, then update status as you work.
- Be concise. No explanatory text unless asked.`;

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
  onViewUpdate?: (update: Record<string, unknown>) => void;

  constructor(
    context: ContextManager,
    model: string = 'gpt-4',
    apiKey: string = '',
    apiBase: string = 'https://api.openai.com/v1'
  ) {
    this.context = context;
    this.model = model;
    this.apiKey = apiKey;
    this.apiBase = apiBase;
  }

  private get tools(): ToolDefinition[] {
    if (this.mode === 'plan') {
      return getAllTools().filter(t => READ_ONLY_TOOL_NAMES.includes(t.name));
    }
    return getAllTools();
  }

  private get systemPrompt(): string {
    return this.mode === 'plan' ? PLAN_PROMPT : CODE_PROMPT;
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

    const snapshot = this.context.getSnapshot();
    const projectCtx = snapshot.projectIndex
      ? `\nProject: ${snapshot.projectIndex.packageInfo?.name || 'unknown'}\nFiles read this session: ${snapshot.readFiles.size}`
      : '';
    const modeLabel = this.mode === 'plan' ? '[PLAN MODE - read only]' : '[CODE MODE - full access]';
    const systemContent = `${this.systemPrompt}\n${projectCtx}\n${modeLabel}${complexityInstruction}`;

    const response = await this.callLLM(systemContent, temperature, topP, maxTokens);

    // Record token usage
    if (response.usage) {
      recordUsage(this.model, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0);
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
      this.messages.push({
        role: 'tool',
        content: toolResults.map(r => r.content).join('\n\n'),
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
    return assistantMessage.content || '';
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
      const result = await tool.execute(args, this.context);
      const elapsed = Date.now() - startTime;
      console.log(`[VTE] Tool: ${tc.function.name} (${elapsed}ms)`);
      this.onViewUpdate?.({ type: 'tool_result', toolCallId: tc.id, result: result.content.substring(0, 500), elapsed });
      results.push(result);
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
}
