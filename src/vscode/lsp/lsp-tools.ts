/**
 * LSP Integration - Agent Tools
 *
 * Wraps CodeIntelligenceService as Agent-callable tools.
 * Tools have minimal schemas (filePath + symbolName or lineNumber).
 */

import * as vscode from 'vscode';
import { ToolDefinition, ToolResult, ContextManager } from '../../core/types';
import { CodeIntelligenceService, getCodeIntelligenceService } from './code-intelligence';
import {
  summarizeDefinitionResult,
  summarizeReferenceResult,
  summarizeHoverResult,
  summarizeDocumentSymbolResult,
} from './result-summarizer';

/** Workspace root (set during activation) */
let workspaceRoot = '';

// Track recent tool calls to prevent loops
const recentCalls = new Map<string, number>();
const MAX_RETRIES = 3;
const RETRY_WINDOW_MS = 10000; // 10 seconds

/**
 * Set the workspace root for LSP tools.
 */
export function setLspWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

/**
 * Get or create the code intelligence service.
 */
function getService(): CodeIntelligenceService {
  return getCodeIntelligenceService(workspaceRoot);
}

/**
 * Check if a tool call has been made too many times recently.
 * Returns true if the call should be blocked.
 */
function isDuplicateCall(toolName: string, args: Record<string, unknown>): boolean {
  const key = `${toolName}:${JSON.stringify(args)}`;
  const now = Date.now();
  const lastCall = recentCalls.get(key) || 0;

  if (now - lastCall < RETRY_WINDOW_MS) {
    const count = recentCalls.get(`${key}:count`) || 0;
    if (count >= MAX_RETRIES) {
      return true;
    }
    recentCalls.set(`${key}:count`, count + 1);
  } else {
    recentCalls.set(`${key}:count`, 1);
  }

  recentCalls.set(key, now);
  return false;
}

/**
 * Parse file path and resolve to URI.
 * Handles both absolute and relative paths correctly.
 */
function resolveUri(filePath: string): vscode.Uri {
  // Check if it's already an absolute path
  if (filePath.startsWith('/') || /^[A-Z]:\\/i.test(filePath)) {
    return vscode.Uri.file(filePath);
  }

  // Check if it's already a relative path from workspace root
  // by checking if workspaceRoot is already included
  if (filePath.startsWith(workspaceRoot)) {
    return vscode.Uri.file(filePath);
  }

  // Resolve relative to workspace
  return vscode.Uri.file(`${workspaceRoot}/${filePath}`);
}

/**
 * Find symbol position in document.
 * Supports both symbolName and lineNumber approaches.
 * Returns the exact position of the symbol for accurate LSP queries.
 */
async function findSymbolPosition(
  uri: vscode.Uri,
  symbolName?: string,
  lineNumber?: number
): Promise<vscode.Position | null> {
  const document = await vscode.workspace.openTextDocument(uri);

  if (lineNumber !== undefined) {
    // Use line number directly
    const line = Math.max(0, Math.min(lineNumber - 1, document.lineCount - 1));
    const lineText = document.lineAt(line).text;

    // If symbolName is provided, find its exact column on the specified line
    if (symbolName) {
      const col = lineText.indexOf(symbolName);
      if (col !== -1) {
        // Return position at the start of the symbol
        return new vscode.Position(line, col);
      }
    }
    // Default to column 0 on the specified line
    return new vscode.Position(line, 0);
  }

  if (symbolName) {
    // Search for symbol in document using word boundary regex
    const text = document.getText();
    const regex = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g');
    let match;
    let bestPosition: vscode.Position | null = null;

    // Find all matches
    while ((match = regex.exec(text)) !== null) {
      const offset = match.index;
      const position = document.positionAt(offset);
      const line = document.lineAt(position.line);
      const lineText = line.text;
      const col = position.character;

      // Check if this is a usage context (inside function call, assignment, etc.)
      // Usage patterns: after . (method call), inside (), after =, after return, etc.
      const beforeChar = col > 0 ? lineText[col - 1] : '';
      const afterChar = col + symbolName.length < lineText.length ? lineText[col + symbolName.length] : '';

      const isUsage =
        beforeChar === '.' ||                    // method call: obj.symbol
        beforeChar === '(' ||                    // function call: symbol()
        beforeChar === ',' ||                    // argument: func(symbol)
        beforeChar === '=' ||                    // assignment: x = symbol
        beforeChar === ' ' && afterChar === '(' || // function call with space: symbol ()
        beforeChar === '[' ||                    // array access
        lineText.includes('return ' + symbolName) || // return statement
        lineText.includes('if (' + symbolName) ||    // if condition
        lineText.includes('for (' + symbolName);     // for loop

      // Prefer usage positions over declarations
      if (isUsage && !bestPosition) {
        bestPosition = position;
        break;
      }

      // Store first match as fallback
      if (!bestPosition) {
        bestPosition = position;
      }
    }

    return bestPosition;
  }

  // Default to cursor position or beginning
  return new vscode.Position(0, 0);
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert VSCode SymbolKind to human-readable string.
 */
function symbolKindToString(kind: vscode.SymbolKind): string {
  const map: Record<number, string> = {
    [vscode.SymbolKind.File]: 'file',
    [vscode.SymbolKind.Module]: 'module',
    [vscode.SymbolKind.Namespace]: 'namespace',
    [vscode.SymbolKind.Package]: 'package',
    [vscode.SymbolKind.Class]: 'class',
    [vscode.SymbolKind.Method]: 'method',
    [vscode.SymbolKind.Property]: 'property',
    [vscode.SymbolKind.Field]: 'field',
    [vscode.SymbolKind.Constructor]: 'constructor',
    [vscode.SymbolKind.Enum]: 'enum',
    [vscode.SymbolKind.Interface]: 'interface',
    [vscode.SymbolKind.Function]: 'function',
    [vscode.SymbolKind.Variable]: 'variable',
    [vscode.SymbolKind.Constant]: 'constant',
    [vscode.SymbolKind.String]: 'string',
    [vscode.SymbolKind.Number]: 'number',
    [vscode.SymbolKind.Boolean]: 'boolean',
    [vscode.SymbolKind.Array]: 'array',
    [vscode.SymbolKind.Object]: 'object',
    [vscode.SymbolKind.Key]: 'key',
    [vscode.SymbolKind.Null]: 'null',
    [vscode.SymbolKind.EnumMember]: 'enum member',
    [vscode.SymbolKind.Struct]: 'struct',
    [vscode.SymbolKind.Event]: 'event',
    [vscode.SymbolKind.Operator]: 'operator',
    [vscode.SymbolKind.TypeParameter]: 'type parameter',
  };
  return map[kind] || 'symbol';
}

// ── Tool Definitions ──

/**
 * LSP Go to Definition tool.
 */
export const lspGotoDefinitionTool: ToolDefinition = {
  name: 'lsp_goto_definition',
  description: 'Go to definition of a symbol. Find where a function, class, or variable is defined. Requires either symbolName or lineNumber.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the source file',
      },
      symbolName: {
        type: 'string',
        description: 'Name of the symbol to find definition for (e.g., "handleClick", "User", "myVariable")',
      },
      lineNumber: {
        type: 'number',
        description: 'Line number where the symbol is used (alternative to symbolName)',
      },
    },
    required: ['filePath'],
  },
  execute: async (args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    const filePath = args.filePath as string;
    const symbolName = args.symbolName as string | undefined;
    const lineNumber = args.lineNumber as number | undefined;

    if (!filePath) {
      return {
        type: 'error',
        content: 'Error: filePath is required. Provide the file path containing the symbol.',
      };
    }

    if (!symbolName && !lineNumber) {
      return {
        type: 'error',
        content: 'Error: Either symbolName or lineNumber is required. Provide the symbol name (e.g., "handleClick") or the line number where it is used.',
      };
    }

    // Check for duplicate calls
    if (isDuplicateCall('lsp_goto_definition', args)) {
      return {
        type: 'text',
        content: `Same goto_definition query was already executed recently. Use the previous result or try a different symbol/line. Do not repeat the same query.`,
      };
    }

    try {
      const uri = resolveUri(filePath);
      const position = await findSymbolPosition(uri, symbolName, lineNumber);

      if (!position) {
        return {
          type: 'error',
          content: `Error: Could not find symbol "${symbolName}" in ${filePath}. Make sure the symbol exists in the file.`,
        };
      }

      const service = getService();
      const result = await service.getDefinition({
        uri,
        position,
      });

      if (result.locations.length === 0) {
        return {
          type: 'text',
          content: `No definition found for "${symbolName}" at line ${position.line + 1}. This could mean:\n- The symbol is a built-in or imported without explicit definition\n- The TypeScript language server needs more time to index\n- Try providing the line number where the symbol is used`,
        };
      }

      const summary = summarizeDefinitionResult(result);
      return {
        type: 'text',
        content: summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to get definition: ${message}`,
      };
    }
  },
};

/**
 * LSP Find References tool.
 */
export const lspFindReferencesTool: ToolDefinition = {
  name: 'lsp_find_references',
  description: 'Find all references to a symbol. Useful for understanding code usage and impact analysis.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the source file',
      },
      symbolName: {
        type: 'string',
        description: 'Name of the symbol to find references for',
      },
      lineNumber: {
        type: 'number',
        description: 'Line number (alternative to symbolName)',
      },
      includeDeclaration: {
        type: 'boolean',
        description: 'Include the declaration in results (default: true)',
      },
    },
    required: ['filePath'],
  },
  execute: async (args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    const filePath = args.filePath as string;
    const symbolName = args.symbolName as string | undefined;
    const lineNumber = args.lineNumber as number | undefined;
    const includeDeclaration = args.includeDeclaration as boolean ?? true;

    if (!filePath) {
      return {
        type: 'error',
        content: 'filePath is required',
      };
    }

    try {
      const uri = resolveUri(filePath);
      const position = await findSymbolPosition(uri, symbolName, lineNumber);

      if (!position) {
        return {
          type: 'text',
          content: `Could not find symbol "${symbolName}" in ${filePath}`,
        };
      }

      const service = getService();
      const result = await service.getReferences({
        uri,
        position,
        includeDeclaration,
      });

      const summary = summarizeReferenceResult(result);
      return {
        type: 'text',
        content: summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to find references: ${message}`,
      };
    }
  },
};

/**
 * LSP Hover tool.
 */
export const lspHoverTool: ToolDefinition = {
  name: 'lsp_hover',
  description: 'Get hover information for a symbol. Shows type information, documentation, and signatures. Requires either symbolName or lineNumber.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the source file',
      },
      symbolName: {
        type: 'string',
        description: 'Name of the symbol to get hover info for (e.g., "handleClick", "User", "myVariable")',
      },
      lineNumber: {
        type: 'number',
        description: 'Line number where the symbol is used (alternative to symbolName)',
      },
    },
    required: ['filePath'],
  },
  execute: async (args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    const filePath = args.filePath as string;
    const symbolName = args.symbolName as string | undefined;
    const lineNumber = args.lineNumber as number | undefined;

    if (!filePath) {
      return {
        type: 'error',
        content: 'Error: filePath is required. Provide the file path containing the symbol.',
      };
    }

    if (!symbolName && !lineNumber) {
      return {
        type: 'error',
        content: 'Error: Either symbolName or lineNumber is required. Provide the symbol name (e.g., "handleClick") or the line number where it is used.',
      };
    }

    // Check for duplicate calls
    if (isDuplicateCall('lsp_hover', args)) {
      return {
        type: 'text',
        content: `Same hover query was already executed recently. Use the previous result or try a different symbol/line. Do not repeat the same query.`,
      };
    }

    try {
      const uri = resolveUri(filePath);
      const position = await findSymbolPosition(uri, symbolName, lineNumber);

      if (!position) {
        return {
          type: 'error',
          content: `Error: Could not find symbol "${symbolName}" in ${filePath}. Make sure the symbol exists in the file.`,
        };
      }

      const service = getService();
      const result = await service.getHover({
        uri,
        position,
      });

      // If hover returned content, return it
      if (result.content) {
        const summary = summarizeHoverResult(result);
        return {
          type: 'text',
          content: summary,
        };
      }

      // Fallback: Try alternative methods to get symbol information
      console.log(`[VTE-LSP] Hover empty for "${symbolName}", trying fallback methods`);

      // Method 1: Get document symbols to find type info
      const docSymbols = await service.getDocumentSymbols({ uri });
      const symbolInfo = docSymbols.symbols.find(s =>
        s.name === symbolName || (symbolName && s.name.includes(symbolName))
      );

      // Method 2: Read the file to get the actual code
      const document = await vscode.workspace.openTextDocument(uri);
      const line = document.lineAt(position.line);
      const lineText = line.text.trim();

      // Build fallback result
      const fallbackParts: string[] = [];

      if (symbolInfo) {
        const kindStr = symbolKindToString(symbolInfo.kind);
        fallbackParts.push(`Symbol: ${symbolInfo.name} (${kindStr})`);
        fallbackParts.push(`Location: Line ${symbolInfo.range.start.line + 1}`);
        if (symbolInfo.detail) {
          fallbackParts.push(`Detail: ${symbolInfo.detail}`);
        }
      }

      if (lineText) {
        fallbackParts.push(`\nCode at line ${position.line + 1}:`);
        fallbackParts.push(`${lineText}`);
      }

      if (fallbackParts.length === 0) {
        return {
          type: 'text',
          content: `No information available for "${symbolName}" at line ${position.line + 1}. The TypeScript language server may need more time to index.`,
        };
      }

      return {
        type: 'text',
        content: `Hover information not available, but here's what I found:\n\n${fallbackParts.join('\n')}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to get hover info: ${message}`,
      };
    }
  },
};

/**
 * LSP Document Symbols tool.
 */
export const lspDocumentSymbolsTool: ToolDefinition = {
  name: 'lsp_document_symbols',
  description: 'Get all symbols in a document. Shows functions, classes, variables, etc. in a hierarchical structure.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the source file',
      },
    },
    required: ['filePath'],
  },
  execute: async (args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    const filePath = args.filePath as string;

    if (!filePath) {
      return {
        type: 'error',
        content: 'filePath is required',
      };
    }

    try {
      const uri = resolveUri(filePath);

      const service = getService();
      const result = await service.getDocumentSymbols({
        uri,
      });

      const summary = summarizeDocumentSymbolResult(result);
      return {
        type: 'text',
        content: summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to get document symbols: ${message}`,
      };
    }
  },
};

/**
 * LSP Clear Cache tool.
 */
export const lspClearCacheTool: ToolDefinition = {
  name: 'lsp_clear_cache',
  description: 'Clear the LSP results cache. Use when you suspect stale data.',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Optional: clear cache for a specific file only',
      },
    },
  },
  execute: async (args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    const filePath = args.filePath as string | undefined;

    try {
      const service = getService();

      if (filePath) {
        const uri = resolveUri(filePath);
        const cleared = service.clearCacheForFile(uri);
        return {
          type: 'text',
          content: `Cleared ${cleared} cache entries for ${filePath}`,
        };
      } else {
        service.clearCache();
        return {
          type: 'text',
          content: 'LSP cache cleared',
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to clear cache: ${message}`,
      };
    }
  },
};

/**
 * LSP Stats tool.
 */
export const lspStatsTool: ToolDefinition = {
  name: 'lsp_stats',
  description: 'Get LSP service statistics including cache hit rate and performance metrics.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args: Record<string, unknown>, _context: ContextManager): Promise<ToolResult> => {
    try {
      const service = getService();
      const stats = service.getStats();

      const lines = [
        'LSP Service Statistics:',
        `  Total calls: ${stats.totalCalls}`,
        `  Cache hits: ${stats.cacheHits}`,
        `  Cache misses: ${stats.cacheMisses}`,
        `  Cache hit rate: ${stats.totalCalls > 0 ? ((stats.cacheHits / stats.totalCalls) * 100).toFixed(1) : 0}%`,
        `  Average response time: ${stats.averageResponseTimeMs.toFixed(0)}ms`,
        `  Circuit breaker trips: ${stats.circuitBreakerTrips}`,
        '',
        'Calls by tool:',
      ];

      for (const [tool, count] of Object.entries(stats.callsByTool)) {
        lines.push(`  ${tool}: ${count}`);
      }

      lines.push('', 'Calls by language:');
      for (const [lang, count] of Object.entries(stats.callsByLanguage)) {
        lines.push(`  ${lang}: ${count}`);
      }

      return {
        type: 'text',
        content: lines.join('\n'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'error',
        content: `Failed to get stats: ${message}`,
      };
    }
  },
};

/**
 * All LSP tools.
 */
export const lspTools: ToolDefinition[] = [
  lspGotoDefinitionTool,
  lspFindReferencesTool,
  lspHoverTool,
  lspDocumentSymbolsTool,
  lspClearCacheTool,
  lspStatsTool,
];

/**
 * Get LSP tool definitions for HostAdapter.
 */
export function getLspToolDefinitions(): ToolDefinition[] {
  return lspTools;
}
