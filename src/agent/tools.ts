/**
 * Tool implementations - each returns pure data, no filler
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolDefinition, ToolResult, ContextManager } from '../shared/types';
import { formatFileResult, formatTextResult, formatErrorResult } from '../context/protocol';

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
    const filePath = args.path as string;
    const startLine = args.start_line as number | undefined;
    const endLine = args.end_line as number | undefined;

    try {
      const range = startLine ? { start: startLine, end: endLine || startLine + 50 } : undefined;
      const result = await context.readFile(filePath, range);
      return formatFileResult(filePath, result.content, result.range, result.truncated);
    } catch (err: any) {
      return formatErrorResult(err.message, filePath);
    }
  },
};

export const searchTool: ToolDefinition = {
  name: 'search',
  description: 'Search file contents using regex. Returns matching lines with file:line format.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern' },
      path: { type: 'string', description: 'Directory to search in (optional, defaults to root)' },
      include: { type: 'string', description: 'File glob pattern (e.g. *.ts)' },
    },
    required: ['pattern'],
  },
  execute: async (args, context) => {
    const pattern = new RegExp(args.pattern as string, 'gi');
    const searchPath = (args.path as string) || '.';
    const include = args.include as string | undefined;

    const results: string[] = [];
    const snapshot = context.getSnapshot();

    function searchDir(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              searchDir(fullPath);
            }
          } else if (entry.isFile()) {
            if (include && !matchGlob(entry.name, include)) continue;
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              lines.forEach((line, i) => {
                if (pattern.test(line)) {
                  const relPath = path.relative(snapshot.projectIndex.workspaceRoot, fullPath);
                  results.push(`${relPath}:${i + 1}: ${line.trim()}`);
                }
              });
            } catch {}
          }
        }
      } catch {}
    }

    const rootDir = path.join(snapshot.projectIndex.workspaceRoot, searchPath);
    searchDir(rootDir);

    return formatTextResult(results.length > 0 ? results.join('\n') : 'No matches found');
  },
};

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
    const filePath = args.path as string;
    const oldStr = args.old_string as string;
    const newStr = args.new_string as string;

    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(context.getSnapshot().projectIndex.workspaceRoot, filePath);

      const content = fs.readFileSync(fullPath, 'utf-8');
      if (!content.includes(oldStr)) {
        return formatErrorResult('old_string not found in file', filePath);
      }
      if (content.split(oldStr).length > 2) {
        return formatErrorResult('Multiple matches - provide more context', filePath);
      }

      const updated = content.replace(oldStr, newStr);
      fs.writeFileSync(fullPath, updated, 'utf-8');

      return formatTextResult(`OK: ${filePath}`);
    } catch (err: any) {
      return formatErrorResult(err.message, filePath);
    }
  },
};

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
    const filePath = args.path as string;
    const content = args.content as string;

    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(context.getSnapshot().projectIndex.workspaceRoot, filePath);

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');

      return formatTextResult(`OK: ${filePath}`);
    } catch (err: any) {
      return formatErrorResult(err.message, filePath);
    }
  },
};

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
    const dirPath = (args.path as string) || '.';

    try {
      const fullPath = path.isAbsolute(dirPath)
        ? dirPath
        : path.join(context.getSnapshot().projectIndex.workspaceRoot, dirPath);

      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const lines = entries.map(e => {
        if (e.isDirectory()) return `${e.name}/`;
        try {
          const stat = fs.statSync(path.join(fullPath, e.name));
          return `${e.name}  (${formatSize(stat.size)})`;
        } catch {
          return e.name;
        }
      });

      return formatTextResult(lines.join('\n'));
    } catch (err: any) {
      return formatErrorResult(err.message, dirPath);
    }
  },
};

function matchGlob(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return regex.test(filename);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const allTools: ToolDefinition[] = [
  readTool,
  searchTool,
  editTool,
  writeTool,
  listTool,
];
