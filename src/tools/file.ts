/**
 * File tools - read, edit, write, list
 *
 * Uses HostAdapter when available, falls back to Node.js fs/path.
 */

import { ToolDefinition, ContextManager } from '../core/types'
import { formatFileResult, formatTextResult, formatErrorResult } from '../shared/protocol'
import { hasHost, getHost } from '../host/registry'

// ── Helpers ──

function resolvePath(filePath: string, context: ContextManager): string {
  if (hasHost()) {
    const root = getHost().workspace.getRoot()
    if (root && !filePath.startsWith('/')) {
      return `${root}/${filePath}`
    }
  }
  return filePath
}

async function readFileContent(filePath: string): Promise<string> {
  if (hasHost()) {
    return getHost().fs.readFile(filePath)
  }
  const { readFileSync } = require('fs')
  return readFileSync(filePath, 'utf-8')
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  if (hasHost()) {
    await getHost().fs.writeFile(filePath, content)
    return
  }
  const fs = require('fs')
  const path = require('path')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
}

async function dirExists(dirPath: string): Promise<boolean> {
  if (hasHost()) {
    return getHost().fs.exists(dirPath)
  }
  const fs = require('fs')
  try { fs.statSync(dirPath); return true } catch { return false }
}

async function readDir(dirPath: string): Promise<Array<{ name: string; isDirectory: boolean; size?: number }>> {
  if (hasHost()) {
    const host = getHost()
    const names = await host.fs.readdir(dirPath)
    const entries: Array<{ name: string; isDirectory: boolean; size?: number }> = []
    for (const name of names) {
      try {
        const s = await host.fs.stat(`${dirPath}/${name}`)
        entries.push({ name, isDirectory: s.type === 'directory', size: s.size })
      } catch {
        entries.push({ name, isDirectory: false })
      }
    }
    return entries
  }
  const fs = require('fs')
  const path = require('path')
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true })
  return dirents.map((e: any) => {
    if (e.isDirectory()) return { name: e.name, isDirectory: true }
    try {
      const stat = fs.statSync(path.join(dirPath, e.name))
      return { name: e.name, isDirectory: false, size: stat.size }
    } catch {
      return { name: e.name, isDirectory: false }
    }
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ── Tools ──

export const readTool: ToolDefinition = {
  name: 'read',
  description: 'Read file content. Returns path:line_range\\ncontent.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace' },
      start_line: { type: 'number', description: 'Start line (1-indexed, optional)' },
      end_line: { type: 'number', description: 'End line (optional)' },
    },
    required: ['path'],
  },
  execute: async (args, context) => {
    const filePath = args.path as string
    const startLine = args.start_line as number | undefined
    const endLine = args.end_line as number | undefined

    try {
      const range = startLine ? { start: startLine, end: endLine || startLine + 50 } : undefined
      const result = await context.readFile(filePath, range)
      return formatFileResult(filePath, result.content, result.range, result.truncated)
    } catch (err: any) {
      return formatErrorResult(err.message, filePath)
    }
  },
}

export const editTool: ToolDefinition = {
  name: 'edit',
  description: 'Replace exact string in file. Requires old_string and new_string.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      old_string: { type: 'string', description: 'Exact string to replace' },
      new_string: { type: 'string', description: 'Replacement string' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  execute: async (args, context) => {
    const filePath = args.path as string
    const oldStr = args.old_string as string
    const newStr = args.new_string as string

    try {
      const fullPath = resolvePath(filePath, context)
      const content = await readFileContent(fullPath)
      if (!content.includes(oldStr)) {
        return formatErrorResult('old_string not found in file', filePath)
      }
      if (content.split(oldStr).length > 2) {
        return formatErrorResult('Multiple matches - provide more context', filePath)
      }
      const updated = content.replace(oldStr, newStr)
      await writeFileContent(fullPath, updated)
      return formatTextResult(`OK: ${filePath}`)
    } catch (err: any) {
      return formatErrorResult(err.message, filePath)
    }
  },
}

export const writeTool: ToolDefinition = {
  name: 'write',
  description: 'Write content to file. Overwrites existing content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      content: { type: 'string', description: 'File content' },
    },
    required: ['path', 'content'],
  },
  execute: async (args, context) => {
    const filePath = args.path as string
    const content = args.content as string

    try {
      const fullPath = resolvePath(filePath, context)
      await writeFileContent(fullPath, content)
      return formatTextResult(`OK: ${filePath}`)
    } catch (err: any) {
      return formatErrorResult(err.message, filePath)
    }
  },
}

export const listTool: ToolDefinition = {
  name: 'list',
  description: 'List directory contents with sizes.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (optional)' },
    },
  },
  execute: async (args, context) => {
    const dirPath = (args.path as string) || '.'

    try {
      const fullPath = resolvePath(dirPath, context)
      const entries = await readDir(fullPath)
      const lines = entries.map(e =>
        e.isDirectory ? `${e.name}/` : (e.size != null ? `${e.name}  (${formatSize(e.size)})` : e.name)
      )
      return formatTextResult(lines.join('\n'))
    } catch (err: any) {
      return formatErrorResult(err.message, dirPath)
    }
  },
}

export const fileTools: ToolDefinition[] = [readTool, editTool, writeTool, listTool]
