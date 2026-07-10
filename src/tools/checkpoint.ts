/**
 * Checkpoint tools - allow LLM to save/restore conversation state
 * Uses shadow-git for all checkpoint operations
 *
 * These tools require an engine reference to work.
 * They should be registered after the engine is created.
 */

import { ToolDefinition } from '../core/types'
import { formatTextResult, formatErrorResult } from '../shared/protocol'

// Shared reference to engine
let engineRef: any = null

export function setCheckpointContext(engine: any, _root: string) {
  engineRef = engine
}

export const checkpointSaveTool: ToolDefinition = {
  name: 'checkpoint_save',
  description: 'Save current state as a checkpoint before making risky changes.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Checkpoint name (e.g. "before refactoring auth")' },
    },
    required: ['name'],
  },
  execute: async (args) => {
    if (!engineRef) return formatErrorResult('Checkpoint system not initialized')
    const name = args.name as string

    try {
      const result = engineRef.createCheckpoint(name)
      if (!result) {
        return formatErrorResult('No changes to checkpoint')
      }
      return formatTextResult(`Checkpoint saved: "${name}" (${result.commitHash.substring(0, 7)})`)
    } catch (err: any) {
      return formatErrorResult(`Failed to save checkpoint: ${err.message}`)
    }
  },
}

export const checkpointListTool: ToolDefinition = {
  name: 'checkpoint_list',
  description: 'List all available checkpoints from git history.',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    if (!engineRef) return formatErrorResult('Checkpoint system not initialized')
    const shadowGit = engineRef.getShadowGit()

    try {
      const commits = shadowGit.log(20)
      if (commits.length === 0) {
        return formatTextResult('No checkpoints found.')
      }

      let output = 'Available checkpoints:\n\n'
      for (const c of commits) {
        if (c.message.startsWith('Checkpoint:')) {
          const stats = c.filesChanged > 0 ? ` (${c.filesChanged} files)` : ''
          output += `- ${c.hash.substring(0, 7)}: ${c.message.replace('Checkpoint: ', '')}${stats}\n`
        }
      }

      return formatTextResult(output || 'No checkpoints found.')
    } catch (err: any) {
      return formatErrorResult(`Failed to list checkpoints: ${err.message}`)
    }
  },
}

export const checkpointRestoreTool: ToolDefinition = {
  name: 'checkpoint_restore',
  description: 'Restore to a specific checkpoint by commit hash.',
  parameters: {
    type: 'object',
    properties: {
      commitHash: { type: 'string', description: 'The commit hash to restore (from checkpoint_list)' },
    },
    required: ['commitHash'],
  },
  execute: async (args) => {
    if (!engineRef) return formatErrorResult('Checkpoint system not initialized')
    const commitHash = args.commitHash as string

    try {
      const success = engineRef.restoreCheckpoint(commitHash)
      if (success) {
        return formatTextResult(`Restored to checkpoint: ${commitHash.substring(0, 7)}`)
      }
      return formatErrorResult('Failed to restore checkpoint')
    } catch (err: any) {
      return formatErrorResult(`Failed to restore checkpoint: ${err.message}`)
    }
  },
}

export const checkpointDeleteTool: ToolDefinition = {
  name: 'checkpoint_delete',
  description: 'Delete a checkpoint (not recommended, checkpoints are immutable).',
  parameters: {
    type: 'object',
    properties: {
      commitHash: { type: 'string', description: 'The commit hash to delete' },
    },
    required: ['commitHash'],
  },
  execute: async (args) => {
    // Git commits cannot be easily deleted, but we can mark them
    return formatTextResult('Git commits are immutable. Checkpoints cannot be deleted, but old ones will be garbage collected over time.')
  },
}

export const checkpointDiffTool: ToolDefinition = {
  name: 'checkpoint_diff',
  description: 'Show code diff between changes. If no args, shows recent changes.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Source commit hash (from checkpoint_list)' },
      to: { type: 'string', description: 'Target commit hash (from checkpoint_list)' },
    },
  },
  execute: async (args) => {
    if (!engineRef) return formatErrorResult('Checkpoint system not initialized')
    const shadowGit = engineRef.getShadowGit()

    try {
      let from = args.from as string | undefined
      let to = args.to as string | undefined

      // If no args, show diff between last two commits
      if (!from && !to) {
        const log = shadowGit.log(2)
        if (log.length < 2) {
          return formatTextResult('Not enough commits to compare. Need at least 2 commits.')
        }
        from = log[1].hash
        to = log[0].hash
      }

      const diffs = shadowGit.diff(from, to)

      if (diffs.length === 0) {
        return formatTextResult('No changes between specified commits.')
      }

      let output = `Changes (${diffs.length} files):\n\n`
      for (const diff of diffs) {
        output += `--- ${diff.file}\n${diff.patch}\n\n`
      }

      return formatTextResult(output.substring(0, 3000))
    } catch (err: any) {
      return formatErrorResult(`Failed to get diff: ${err.message}`)
    }
  },
}

export const checkpointLogTool: ToolDefinition = {
  name: 'checkpoint_log',
  description: 'Show recent code change history with commit hashes.',
  parameters: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of entries to show (default 10)' },
    },
  },
  execute: async (args) => {
    if (!engineRef) return formatErrorResult('Checkpoint system not initialized')
    const shadowGit = engineRef.getShadowGit()
    const count = (args.count as number) || 10

    try {
      const commits = shadowGit.log(count)

      if (commits.length === 0) {
        return formatTextResult('No checkpoint history found.')
      }

      let output = 'Recent code changes:\n\n'
      for (const c of commits) {
        const stats = c.filesChanged > 0 ? ` (${c.filesChanged} files, +${c.insertions} -${c.deletions})` : ''
        output += `${c.hash.substring(0, 7)} ${c.message}${stats}\n`
      }

      output += '\nUse checkpoint_diff with commit hashes to see detailed changes.'
      return formatTextResult(output)
    } catch (err: any) {
      return formatErrorResult(`Failed to get log: ${err.message}`)
    }
  },
}

export const checkpointTools: ToolDefinition[] = [
  checkpointSaveTool,
  checkpointListTool,
  checkpointRestoreTool,
  checkpointDeleteTool,
  checkpointDiffTool,
  checkpointLogTool,
]
