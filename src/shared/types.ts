/**
 * Core types for VTE Agent
 * Inspired by opencode's context management approach
 */

// File types
export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  children?: FileNode[];
}

export interface ProjectIndex {
  structure: FileNode[];
  packageInfo?: PackageInfo;
  gitInfo?: GitInfo;
  workspaceRoot: string;
  generatedAt: number;
}

export interface PackageInfo {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface GitInfo {
  branch?: string;
  remote?: string;
  lastCommit?: string;
}

// Context management
export interface LineRange {
  start: number;
  end: number;
}

export interface FileContent {
  path: string;
  content: string;
  range?: LineRange;
  totalLines: number;
  truncated: boolean;
}

export interface SummarizedContent {
  path: string;
  summary: string;
  totalLines: number;
  includedRanges: LineRange[];
}

export interface ContextSnapshot {
  projectIndex: ProjectIndex;
  readFiles: Set<string>;
  modifiedFiles: Set<string>;
  tokenEstimate: number;
}

// Agent
export interface ToolResult {
  type: 'text' | 'file' | 'error';
  content: string;
  metadata?: {
    path?: string;
    lineRange?: LineRange;
    truncated?: boolean;
  };
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ContextManager) => Promise<ToolResult>;
}

// Context manager interface
export interface ContextManager {
  buildIndex(): Promise<ProjectIndex>;
  readFile(path: string, range?: LineRange): Promise<FileContent>;
  summarizeFile(path: string, maxTokens?: number): Promise<SummarizedContent>;
  getSnapshot(): ContextSnapshot;
  reset(): void;
}

// API types
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string }>;
  tool_call_id?: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  tools?: unknown[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  // OpenAI compatible thinking
  chat_template_kwargs?: Record<string, unknown>;
  // Anthropic compatible thinking
  thinking?: { type: string; budget_tokens: number };
}

export interface LLMResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
