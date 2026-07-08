/**
 * Grep tool - fast content search with fallback
 */

import { ToolDefinition, ToolResult } from '../shared/types';
import { formatTextResult, formatErrorResult } from '../context/protocol';
import { execSync } from 'child_process';

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
    const pattern = args.pattern as string;
    const searchPath = (args.path as string) || '.';
    const include = args.include as string | undefined;

    // Try ripgrep first, fallback to grep -r
    const hasRg = (() => { try { execSync('which rg', { stdio: 'ignore' }); return true; } catch { return false; } })();

    try {
      let cmd: string;
      if (hasRg) {
        cmd = `rg -n --no-heading --hidden`;
        if (include) cmd += ` -g '${include}'`;
        cmd += ` '${pattern}' ${searchPath}`;
      } else {
        cmd = `grep -rn --include='${include || '*'}' '${pattern}' ${searchPath} 2>/dev/null | head -100`;
      }

      const output = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 10000,
      });
      return formatTextResult(output.trim() || 'No matches found');
    } catch (err: any) {
      if (err.status === 1) {
        return formatTextResult('No matches found');
      }
      return formatErrorResult(err.stderr || err.message);
    }
  },
};
