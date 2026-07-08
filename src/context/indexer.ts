import * as fs from 'fs';
import * as path from 'path';
import { FileNode, ProjectIndex, PackageInfo, GitInfo } from '../shared/types';

// Files/dirs to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  '.vscode', '__pycache__', '.next', '.nuxt', 'coverage'
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db'
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.tar', '.gz',
  '.exe', '.dll', '.so', '.dylib'
]);

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescriptreact',
  '.js': 'javascript', '.jsx': 'javascriptreact',
  '.py': 'python', '.rb': 'ruby', '.go': 'go',
  '.rs': 'rust', '.java': 'java', '.kt': 'kotlin',
  '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.vue': 'vue', '.svelte': 'svelte',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.txt': 'text',
  '.sh': 'shell', '.bash': 'shell',
  '.sql': 'sql', '.graphql': 'graphql',
};

export function buildFileTree(rootDir: string): FileNode[] {
  const nodes: FileNode[] = [];

  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(rootDir, entry.name);

      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath);
        if (children.length > 0) {
          nodes.push({
            path: path.relative(rootDir, fullPath),
            name: entry.name,
            type: 'directory',
            children,
          });
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTS.has(ext)) {
          continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          nodes.push({
            path: path.relative(rootDir, fullPath),
            name: entry.name,
            type: 'file',
            size: stat.size,
            language: LANG_MAP[ext],
          });
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Return empty on error
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function readPackageInfo(rootDir: string): PackageInfo | undefined {
  const pkgPath = path.join(rootDir, 'package.json');
  try {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    return {
      name: pkg.name,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies,
    };
  } catch {
    return undefined;
  }
}

export function readGitInfo(rootDir: string): GitInfo | undefined {
  try {
    const head = fs.readFileSync(path.join(rootDir, '.git', 'HEAD'), 'utf-8').trim();
    const branch = head.startsWith('ref: ') ? head.slice(16) : head.slice(0, 7);

    let remote: string | undefined;
    try {
      const config = fs.readFileSync(path.join(rootDir, '.git', 'config'), 'utf-8');
      const match = config.match(/url\s*=\s*(.+)/);
      if (match) remote = match[1].trim();
    } catch {}

    return { branch, remote };
  } catch {
    return undefined;
  }
}

export function buildProjectIndex(rootDir: string): ProjectIndex {
  return {
    structure: buildFileTree(rootDir),
    packageInfo: readPackageInfo(rootDir),
    gitInfo: readGitInfo(rootDir),
    workspaceRoot: rootDir,
    generatedAt: Date.now(),
  };
}
