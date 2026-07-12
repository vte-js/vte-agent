/**
 * Git tool - common git operations
 *
 * Uses HostAdapter when available, falls back to Node.js execSync.
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'
import { hasHost, getHost } from '../host/registry'

export const gitTool: ToolDefinition = {
  name: 'git',
  description: 'Execute git commands. Supports: status, diff, log, blame, branch, show. Returns command output.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Git subcommand (status, diff, log, blame, branch, show, diff-staged)',
      },
      path: { type: 'string', description: 'File path for file-specific commands (diff, blame, show)' },
      args: { type: 'string', description: 'Additional arguments (e.g. --stat, -n 5)' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const cmd = args.command as string
    const filePath = args.path as string
    const extraArgs = (args.args as string) || ''

    const validCommands = ['status', 'diff', 'log', 'blame', 'branch', 'show', 'diff-staged']
    if (!validCommands.includes(cmd)) {
      return formatErrorResult(`Unknown git command: ${cmd}. Supported: ${validCommands.join(', ')}`)
    }

    try {
      let gitCmd = `git ${cmd}`
      if (cmd === 'diff-staged') {
        gitCmd = 'git diff --staged'
      }
      if (filePath) {
        gitCmd += ` -- "${filePath}"`
      }
      if (extraArgs) {
        gitCmd += ` ${extraArgs}`
      }

      if (hasHost() && getHost().shell) {
        const result = await getHost().shell!.execute(gitCmd, { timeout: 10000 })
        if (result.exitCode === 0) {
          return formatTextResult(result.stdout || '(no output)')
        }
        return formatErrorResult(result.stderr || `Exit code: ${result.exitCode}`)
      }

      // Fallback: Node.js direct execution
      const { execSync } = require('child_process')
      const output = execSync(gitCmd, {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      return formatTextResult(output || '(no output)')
    } catch (err: any) {
      return formatErrorResult(err.stderr || err.message)
    }
  },
}
