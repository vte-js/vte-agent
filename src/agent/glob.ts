/**
 * Glob tool - find files by pattern
 */

import { ToolDefinition } from '../shared/types';
import { formatTextResult, formatErrorResult } from '../context/protocol';
import { execSync } from 'child_process';

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
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || '.';

    try {
      const cmd = `find ${searchPath} -type f -name '${pattern.replace(/\*/g, '*').replace(/\?/g, '?')}' | head -100`;
      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 512 * 1024,
      });
      const files = output.trim().split('\n').filter(f => f.length > 0);
      return formatTextResult(files.length > 0 ? files.join('\n') : 'No files found');
    } catch (err: any) {
      return formatErrorResult(err.message);
    }
  },
};
