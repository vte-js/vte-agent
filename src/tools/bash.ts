/**
 * Bash tool - execute shell commands with timeout
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'
import { execSync } from 'child_process'

export const bashTool: ToolDefinition = {
  name: 'bash',
  description: 'Execute shell command. Returns stdout/stderr.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      workdir: { type: 'string', description: 'Working directory (optional)' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const command = args.command as string
    const workdir = args.workdir as string | undefined
    const timeout = (args.timeout as number) || 30000

    try {
      const output = execSync(command, {
        cwd: workdir,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
      })
      return formatTextResult(output || '(no output)')
    } catch (err: any) {
      const stderr = err.stderr || err.message
      return formatErrorResult(stderr)
    }
  },
}
