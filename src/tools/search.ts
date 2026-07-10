/**
 * Search tools - grep, glob
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'
import { execSync } from 'child_process'

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search file contents. Returns matching lines with file:line format.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern' },
      path: { type: 'string', description: 'Directory to search (optional)' },
      include: { type: 'string', description: 'File pattern (e.g. *.ts)' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) || '.'
    const include = args.include as string | undefined

    // Try ripgrep first, fallback to grep -r
    const hasRg = (() => { try { execSync('which rg', { stdio: 'ignore' }); return true } catch { return false } })()

    try {
      let cmd: string
      if (hasRg) {
        cmd = `rg -n --no-heading --hidden`
        if (include) cmd += ` -g '${include}'`
        cmd += ` '${pattern}' ${searchPath}`
      } else {
        cmd = `grep -rn --include='${include || '*'}' '${pattern}' ${searchPath} 2>/dev/null | head -100`
      }

      const output = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 10000,
      })
      return formatTextResult(output.trim() || 'No matches found')
    } catch (err: any) {
      if (err.status === 1) {
        return formatTextResult('No matches found')
      }
      return formatErrorResult(err.stderr || err.message)
    }
  },
}

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths sorted by modification time.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.vue")' },
      path: { type: 'string', description: 'Directory to search in (optional, defaults to workspace root)' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) || '.'

    try {
      const cmd = `find ${searchPath} -type f -name '${pattern.replace(/\*/g, '*').replace(/\?/g, '?')}' | head -100`
      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 512 * 1024,
      })
      const files = output.trim().split('\n').filter(f => f.length > 0)
      return formatTextResult(files.length > 0 ? files.join('\n') : 'No files found')
    } catch (err: any) {
      return formatErrorResult(err.message)
    }
  },
}

export const searchTools: ToolDefinition[] = [grepTool, globTool]
