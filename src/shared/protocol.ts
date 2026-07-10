/**
 * Tool result protocol - pure data, no filler text
 * Format: <path>:<line_range>\n<content>
 */

import { ToolResult, LineRange, ProjectIndex, FileNode } from '../core/types'

export function formatFileResult(
  filePath: string,
  content: string,
  range?: LineRange,
  truncated: boolean = false
): ToolResult {
  const rangeStr = range ? `:${range.start}-${range.end}` : ''
  const truncStr = truncated ? ' (truncated)' : ''

  return {
    type: 'file',
    content: `${filePath}${rangeStr}${truncStr}\n${content}`,
    metadata: {
      path: filePath,
      lineRange: range,
      truncated,
    },
  }
}

export function formatTextResult(content: string): ToolResult {
  return {
    type: 'text',
    content,
  }
}

export function formatErrorResult(message: string, path?: string): ToolResult {
  return {
    type: 'error',
    content: `Error: ${message}`,
    metadata: { path },
  }
}

/**
 * Format project index for LLM consumption
 * Compact: tree structure with sizes, no content
 */
export function formatIndexForLLM(index: ProjectIndex): string {
  const lines: string[] = [
    `Project: ${index.packageInfo?.name || 'unknown'}`,
    `Root: ${index.workspaceRoot}`,
    index.gitInfo?.branch ? `Branch: ${index.gitInfo.branch}` : '',
    '',
    'Files:',
  ]

  function printNode(node: FileNode, indent: number) {
    const prefix = '  '.repeat(indent)
    const sizeStr = node.size ? ` (${formatSize(node.size)})` : ''

    if (node.type === 'directory') {
      lines.push(`${prefix}${node.name}/`)
      node.children?.forEach(c => printNode(c, indent + 1))
    } else {
      lines.push(`${prefix}${node.name}${sizeStr}`)
    }
  }

  index.structure.forEach(n => printNode(n, 0))

  return lines.filter(l => l !== undefined).join('\n')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
