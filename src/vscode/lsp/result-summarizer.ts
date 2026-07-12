/**
 * LSP Integration - Result Summarizer
 *
 * Converts raw VSCode LSP results into LLM-friendly string format.
 * Includes file paths, line numbers, and context snippets.
 */

import * as vscode from 'vscode';
import {
  DefinitionResult,
  ReferenceResult,
  HoverResult,
  DocumentSymbolResult,
  DocumentSymbolInfo,
  CodeLocation,
} from './types';

/** Number of context lines before/after target */
const CONTEXT_LINES = 2;

/** Maximum snippet length */
const MAX_SNIPPET_LENGTH = 200;

/**
 * Summarize definition results for LLM consumption.
 * Returns a clear, structured format that LLM can easily understand.
 */
export function summarizeDefinitionResult(result: DefinitionResult): string {
  const symbolName = result.query.symbolName ?? 'symbol';

  if (result.locations.length === 0) {
    return `DEFINITION NOT FOUND: "${symbolName}"\n\nThe symbol "${symbolName}" does not have a definition in this project. This could mean:\n- It's a built-in type or function\n- It's imported from an external package\n- The language server needs more time to index`;
  }

  const lines: string[] = [];
  lines.push(`DEFINITION FOUND for "${symbolName}":`);

  for (let i = 0; i < result.locations.length; i++) {
    const loc = result.locations[i];
    const filePath = vscode.workspace.asRelativePath(loc.uri);
    const line = loc.range?.start?.line ?? 0;
    const snippet = loc.context ?? '';

    lines.push(`\n[${i + 1}] File: ${filePath}`);
    lines.push(`    Line: ${line + 1}`);
    if (snippet) {
      lines.push(`    Code:`);
      // Indent the code snippet
      const snippetLines = snippet.split('\n');
      for (const sLine of snippetLines) {
        lines.push(`      ${sLine}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Summarize reference results for LLM consumption.
 */
export function summarizeReferenceResult(result: ReferenceResult): string {
  if (result.locations.length === 0) {
    return `No references found for "${result.query.symbolName ?? 'symbol'}"`;
  }

  // Group references by file
  const byFile = new Map<string, CodeLocation[]>();
  for (const loc of result.locations) {
    const file = vscode.workspace.asRelativePath(loc.uri);
    const existing = byFile.get(file) ?? [];
    existing.push(loc);
    byFile.set(file, existing);
  }

  const lines: string[] = [];
  lines.push(
    `Found ${result.locations.length} reference(s) in ${byFile.size} file(s):`
  );

  for (const [file, locations] of byFile) {
    lines.push(`\n📄 ${file}`);
    for (const loc of locations) {
      const line = loc.range?.start?.line ?? 0;
      const snippet = loc.context ?? '';
      if (snippet) {
        lines.push(`   L${line + 1}: ${snippet}`);
      } else {
        lines.push(`   L${line + 1}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Summarize hover result for LLM consumption.
 * Returns type information and documentation in a clear format.
 */
export function summarizeHoverResult(result: HoverResult): string {
  const symbolName = result.query.symbolName ?? 'symbol';

  if (!result.content) {
    return `HOVER INFO NOT AVAILABLE: "${symbolName}"\n\nNo type information or documentation found for "${symbolName}".`;
  }

  const lines: string[] = [];
  lines.push(`HOVER INFO for "${symbolName}":`);
  lines.push(`\n${result.content}`);

  if (result.range) {
    const startLine = result.range.start.line + 1;
    const endLine = result.range.end.line + 1;
    if (startLine !== endLine) {
      lines.push(`\nSpans lines ${startLine}-${endLine}`);
    }
  }

  return lines.join('\n');
}

/**
 * Summarize document symbols for LLM consumption.
 */
export function summarizeDocumentSymbolResult(result: DocumentSymbolResult): string {
  if (result.symbols.length === 0) {
    return `No symbols found in ${result.query.documentName}`;
  }

  const lines: string[] = [];
  lines.push(`Document symbols for ${result.query.documentName}:`);

  const formatSymbol = (symbol: DocumentSymbolInfo, depth: number): void => {
    const indent = '  '.repeat(depth);
    const kind = symbolKindToString(symbol.kind);
    const line = symbol.range.start.line + 1;

    lines.push(`${indent}${kind} ${symbol.name} (L${line})`);

    if (symbol.detail) {
      lines.push(`${indent}  ${symbol.detail}`);
    }

    if (symbol.children) {
      for (const child of symbol.children) {
        formatSymbol(child, depth + 1);
      }
    }
  };

  for (const symbol of result.symbols) {
    formatSymbol(symbol, 0);
  }

  return lines.join('\n');
}

/**
 * Convert VSCode SymbolKind to human-readable string.
 */
function symbolKindToString(kind: vscode.SymbolKind): string {
  const map: Record<number, string> = {
    [vscode.SymbolKind.File]: '📁',
    [vscode.SymbolKind.Module]: '📦',
    [vscode.SymbolKind.Namespace]: '📦',
    [vscode.SymbolKind.Package]: '📦',
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

  return map[kind] ?? 'symbol';
}

/**
 * Get context snippet from a document around a range.
 */
export async function getContextSnippet(
  document: vscode.TextDocument,
  range: vscode.Range,
  contextLines: number = CONTEXT_LINES
): Promise<string> {
  const startLine = Math.max(0, range.start.line - contextLines);
  const endLine = Math.min(
    document.lineCount - 1,
    range.end.line + contextLines
  );

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = document.lineAt(i);
    let text = line.text;

    // Truncate long lines
    if (text.length > MAX_SNIPPET_LENGTH) {
      text = text.substring(0, MAX_SNIPPET_LENGTH) + '...';
    }

    // Mark the target line(s)
    if (i >= range.start.line && i <= range.end.line) {
      lines.push(`> ${text}`);
    } else {
      lines.push(`  ${text}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a Location array into a concise summary.
 */
export function formatLocationSummary(locations: vscode.Location[]): string {
  if (locations.length === 0) {
    return 'No locations found';
  }

  // Group by file
  const byFile = new Map<string, number[]>();
  for (const loc of locations) {
    const file = vscode.workspace.asRelativePath(loc.uri);
    const linesArr = byFile.get(file) ?? [];
    linesArr.push((loc.range?.start?.line ?? 0) + 1);
    byFile.set(file, linesArr);
  }

  const parts: string[] = [];
  for (const [file, lines] of byFile) {
    if (lines.length <= 3) {
      parts.push(`${file}:${lines.join(',')}`);
    } else {
      parts.push(`${file}:${lines[0]}-${lines[lines.length - 1]} (${lines.length} refs)`);
    }
  }

  return parts.join(', ');
}

/**
 * Create a CodeLocation from a VSCode Location with context.
 */
export async function createCodeLocation(
  location: vscode.Location,
  includeContext: boolean = true
): Promise<CodeLocation> {
  let context: string | undefined;

  if (includeContext) {
    try {
      const document = await vscode.workspace.openTextDocument(location.uri);
      context = await getContextSnippet(document, location.range, 1);
    } catch {
      // Ignore errors when reading context
    }
  }

  return {
    uri: location.uri,
    range: location.range,
    context,
  };
}
