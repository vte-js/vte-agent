/**
 * Diagnostics tool - get LSP errors/warnings for files
 *
 * Uses HostAdapter when available, falls back to Node.js execSync.
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'
import { hasHost, getHost } from '../host/registry'

async function runCommand(command: string): Promise<string> {
  if (hasHost() && getHost().shell) {
    const result = await getHost().shell!.execute(command, { timeout: 10000 })
    return result.stdout
  }
  const { execSync } = require('child_process')
  return execSync(command, { encoding: 'utf-8', timeout: 10000, maxBuffer: 512 * 1024 })
}

export const diagnosticsTool: ToolDefinition = {
  name: 'diagnostics',
  description: 'Get language server diagnostics (errors, warnings) for a file. Useful for checking code health before and after edits.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to check diagnostics for' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const filePath = args.path as string

    try {
      // Try TypeScript diagnostics first
      try {
        const output = await runCommand(`npx tsc --noEmit --pretty false 2>&1 | grep "${filePath}" | head -20`)
        if (output.trim()) {
          return formatTextResult(output.trim())
        }
      } catch {}

      // Try ESLint
      try {
        const output = await runCommand(`npx eslint "${filePath}" --format compact 2>&1 | head -20`)
        if (output.trim()) {
          return formatTextResult(output.trim())
        }
      } catch {}

      return formatTextResult('No diagnostics found for ' + filePath)
    } catch (err: any) {
      return formatErrorResult(err.message)
    }
  },
}
