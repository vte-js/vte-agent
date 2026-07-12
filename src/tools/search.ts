/**
 * Search tools - grep, glob
 *
 * Uses HostAdapter when available, falls back to Node.js execSync.
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'
import { hasHost, getHost } from '../host/registry'

async function runCommand(command: string, options?: { timeout?: number }): Promise<{ stdout: string; exitCode: number }> {
  if (hasHost() && getHost().shell) {
    const result = await getHost().shell!.execute(command, { timeout: options?.timeout || 10000 })
    return { stdout: result.stdout, exitCode: result.exitCode }
  }
  const { execSync } = require('child_process')
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: options?.timeout || 10000,
    })
    return { stdout: stdout || '', exitCode: 0 }
  } catch (err: any) {
    return { stdout: '', exitCode: err.status || 1 }
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  const { stdout, exitCode } = await runCommand(`which ${cmd}`, { timeout: 3000 })
  return exitCode === 0 && stdout.trim().length > 0
}

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

    const hasRg = await commandExists('rg')

    try {
      let cmd: string
      if (hasRg) {
        cmd = `rg -n --no-heading --hidden`
        if (include) cmd += ` -g '${include}'`
        cmd += ` '${pattern}' ${searchPath}`
      } else {
        cmd = `grep -rn --include='${include || '*'}' '${pattern}' ${searchPath} 2>/dev/null | head -100`
      }

      const { stdout, exitCode } = await runCommand(cmd)
      if (exitCode === 1) return formatTextResult('No matches found')
      return formatTextResult(stdout.trim() || 'No matches found')
    } catch (err: any) {
      return formatErrorResult(err.message)
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
      const { stdout } = await runCommand(cmd, { timeout: 5000 })
      const files = stdout.trim().split('\n').filter(f => f.length > 0)
      return formatTextResult(files.length > 0 ? files.join('\n') : 'No files found')
    } catch (err: any) {
      return formatErrorResult(err.message)
    }
  },
}

export const searchTools: ToolDefinition[] = [grepTool, globTool]
