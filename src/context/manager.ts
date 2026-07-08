import * as fs from 'fs';
import * as path from 'path';
import { ContextManager, ProjectIndex, FileContent, SummarizedContent, ContextSnapshot, LineRange } from '../shared/types';
import { buildProjectIndex } from './indexer';

const DEFAULT_SUMMARY_LINES = 30;
const DEFAULT_MAX_TOKENS = 4000;

export class VTEContextManager implements ContextManager {
  private projectIndex: ProjectIndex | null = null;
  private readFiles = new Set<string>();
  private modifiedFiles = new Set<string>();
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async buildIndex(): Promise<ProjectIndex> {
    this.projectIndex = buildProjectIndex(this.rootDir);
    return this.projectIndex;
  }

  async readFile(filePath: string, range?: LineRange): Promise<FileContent> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    this.readFiles.add(filePath);

    if (range) {
      const start = Math.max(0, range.start - 1);
      const end = Math.min(totalLines, range.end);
      const sliced = lines.slice(start, end);

      return {
        path: filePath,
        content: sliced.join('\n'),
        range: { start: range.start, end: Math.min(range.end, totalLines) },
        totalLines,
        truncated: false,
      };
    }

    return {
      path: filePath,
      content,
      totalLines,
      truncated: false,
    };
  }

  async summarizeFile(filePath: string, maxTokens: number = DEFAULT_MAX_TOKENS): Promise<SummarizedContent> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;

    this.readFiles.add(filePath);

    // Estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(content.length / 4);

    if (estimatedTokens <= maxTokens) {
      return {
        path: filePath,
        summary: content,
        totalLines,
        includedRanges: [{ start: 1, end: totalLines }],
      };
    }

    // Take first N and last N lines
    const half = Math.floor(maxTokens * 2 / 4 / 2);
    const head = lines.slice(0, half);
    const tail = lines.slice(-half);

    const summary = [
      `// [Head: lines 1-${half}]`,
      ...head,
      `// [Truncated: ${totalLines - 2 * half} lines omitted]`,
      ...tail,
      `// [Tail: lines ${totalLines - half + 1}-${totalLines}]`,
    ].join('\n');

    return {
      path: filePath,
      summary,
      totalLines,
      includedRanges: [
        { start: 1, end: half },
        { start: totalLines - half + 1, end: totalLines },
      ],
    };
  }

  getSnapshot(): ContextSnapshot {
    const indexSize = this.projectIndex
      ? JSON.stringify(this.projectIndex).length
      : 0;

    return {
      projectIndex: this.projectIndex!,
      readFiles: new Set(this.readFiles),
      modifiedFiles: new Set(this.modifiedFiles),
      tokenEstimate: Math.ceil(indexSize / 4),
    };
  }

  reset(): void {
    this.readFiles.clear();
    this.modifiedFiles.clear();
    this.projectIndex = null;
  }

  markModified(filePath: string): void {
    this.modifiedFiles.add(filePath);
  }

  getIndex(): ProjectIndex | null {
    return this.projectIndex;
  }

  getReadFiles(): string[] {
    return Array.from(this.readFiles);
  }

  getModifiedFiles(): string[] {
    return Array.from(this.modifiedFiles);
  }
}
