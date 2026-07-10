/**
 * Shadow Git - manages a hidden git repository for checkpoint diffing
 * Tracks file changes as git commits, enabling diff between checkpoints
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface GitCommit {
  hash: string
  message: string
  timestamp: string
  filesChanged: number
  insertions: number
  deletions: number
}

export interface GitDiff {
  file: string
  patch: string
}

export interface CheckpointMetadata {
  messages: any[]
  mode: string
  taskMode: string
  tokenStats: { prompt: number; completion: number }
}

export class ShadowGit {
  private repoPath: string
  private workspaceRoot: string
  private initialized = false

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
    // Use workspace hash for directory name (like Cline)
    const workspaceHash = this.hashWorkspace(workspaceRoot)
    this.repoPath = path.join(workspaceRoot, '.vte', 'checkpoints', workspaceHash)
  }

  private hashWorkspace(workspace: string): string {
    return createHash('sha256').update(workspace).digest('hex').slice(0, 12)
  }

  /**
   * Initialize the shadow git repository
   */
  init(): void {
    if (this.initialized) return

    try {
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true })
      }

      // Check if already initialized
      const gitDir = path.join(this.repoPath, '.git')
      if (!fs.existsSync(gitDir)) {
        this.exec('git init')

        // Set local config - don't inherit from global
        this.exec('git config --local user.email "vte-agent@local"')
        this.exec('git config --local user.name "VTE Agent"')

        // Disable hooks to prevent user's git hooks from running
        this.exec('git config --local core.hooksPath /dev/null')

        // Disable merge tracking and other unnecessary features
        this.exec('git config --local merge.ours.driver true')
        this.exec('git config --local rerere.enabled false')
        this.exec('git config --local core.autocrlf false')
        this.exec('git config --local core.safecrlf false')

        // Create .gitignore
        const gitignore = `.DS_Store
*.swp
*.swo
*~
.env
.env.*
node_modules/
__pycache__/
*.pyc
`
        fs.writeFileSync(path.join(this.repoPath, '.gitignore'), gitignore)

        // Initial commit so we have a base
        this.exec('git commit --allow-empty -m "Initial commit"')
        console.log('[VTE] Shadow git initialized')
      }

      this.initialized = true
    } catch (err: any) {
      console.error(`[VTE] Failed to init shadow git: ${err.message}`)
    }
  }

  /**
   * Execute a git command in the shadow repo
   */
  private exec(command: string): string {
    try {
      return execSync(command, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
    } catch (err: any) {
      throw new Error(`Git error: ${err.stderr || err.message}`)
    }
  }

  /**
   * Track a file change (add + commit)
   */
  trackFile(filePath: string, message?: string): string | null {
    this.init()
    try {
      // Calculate relative path from workspace root
      const relativePath = path.relative(this.workspaceRoot, filePath)
      const shadowPath = path.join(this.repoPath, relativePath)

      // Copy file to shadow repo if it exists
      if (fs.existsSync(filePath)) {
        const dir = path.dirname(shadowPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.copyFileSync(filePath, shadowPath)
      }

      this.exec(`git add "${relativePath}"`)
      const commitMsg = message || `Update ${path.basename(filePath)}`
      this.exec(`git commit -m "${commitMsg}" --allow-empty`)
      const hash = this.exec('git rev-parse HEAD')
      console.log(`[VTE] Shadow git committed: ${hash.substring(0, 7)} - ${commitMsg}`)
      return hash
    } catch (err: any) {
      // No changes to commit is OK
      if (err.message.includes('nothing to commit')) {
        return null
      }
      console.warn(`[VTE] Shadow git trackFile error: ${err.message}`)
      return null
    }
  }

  /**
   * Create a checkpoint commit with tag
   */
  createCheckpoint(name: string): string | null {
    this.init()
    try {
      // Stage all changes
      this.exec('git add -A')

      // Check if there are changes to commit
      try {
        this.exec('git diff --cached --quiet')
        // If no changes, git diff --cached --quiet exits with 0 (no changes)
        console.log(`[VTE] Shadow git: no changes to commit for checkpoint`)
        return null
      } catch {
        // git diff --cached --quiet exits with 1 if there are changes
      }

      // Create commit (without --allow-empty)
      const commitResult = this.exec(`git commit -m "Checkpoint: ${name}"`)
      const hash = this.exec('git rev-parse HEAD')

      // Create tag on this commit
      const tagName = `checkpoint-${Date.now()}`
      this.exec(`git tag -a "${tagName}" -m "${name}" ${hash}`)

      console.log(`[VTE] Shadow git checkpoint: ${tagName} (${hash.substring(0, 7)})`)
      return tagName
    } catch (err: any) {
      // No changes to commit is OK
      if (err.message.includes('nothing to commit')) {
        console.log(`[VTE] Shadow git: no changes to commit for checkpoint`)
        return null
      }
      console.error(`[VTE] Failed to create checkpoint tag: ${err.message}`)
      return null
    }
  }

  /**
   * Get diff between two commits (or working tree)
   */
  diff(commit1?: string, commit2?: string): GitDiff[] {
    this.init()
    try {
      let cmd: string
      if (commit1 && commit2) {
        cmd = `git diff ${commit1} ${commit2} --no-color`
      } else if (commit1) {
        cmd = `git diff ${commit1} HEAD --no-color`
      } else {
        cmd = `git diff HEAD --no-color`
      }

      const output = this.exec(cmd)
      return this.parseDiff(output)
    } catch {
      return []
    }
  }

  /**
   * Get diff stats summary
   */
  diffStat(commit1?: string, commit2?: string): string {
    this.init()
    try {
      let cmd: string
      if (commit1 && commit2) {
        cmd = `git diff --stat ${commit1} ${commit2}`
      } else {
        cmd = `git diff --stat HEAD`
      }
      return this.exec(cmd) || 'No changes'
    } catch {
      return 'No changes'
    }
  }

  /**
   * Get commit log
   */
  log(n: number = 10): GitCommit[] {
    this.init()
    try {
      const format = '%H|%s|%ai|%f'
      const output = this.exec(`git log -n ${n} --format="${format}"`)

      if (!output) return []

      return output.split('\n').filter(Boolean).map(line => {
        const [hash, message, timestamp] = line.split('|')
        // Get short stats
        let filesChanged = 0, insertions = 0, deletions = 0
        try {
          const stat = this.exec(`git diff --shortstat ${hash}~1 ${hash} 2>/dev/null || echo ""`)
          const filesMatch = stat.match(/(\d+) files? changed/)
          const insMatch = stat.match(/(\d+) insertions?/)
          const delMatch = stat.match(/(\d+) deletions?/)
          if (filesMatch) filesChanged = parseInt(filesMatch[1])
          if (insMatch) insertions = parseInt(insMatch[1])
          if (delMatch) deletions = parseInt(delMatch[1])
        } catch {}

        return { hash, message, timestamp, filesChanged, insertions, deletions }
      })
    } catch {
      return []
    }
  }

  /**
   * Restore a specific file from a commit
   */
  restoreFile(filePath: string, commit: string): boolean {
    this.init()
    try {
      const relativePath = path.relative(this.workspaceRoot, filePath)
      this.exec(`git checkout ${commit} -- "${relativePath}"`)

      // Copy back to workspace
      const shadowPath = path.join(this.repoPath, relativePath)
      if (fs.existsSync(shadowPath)) {
        fs.copyFileSync(shadowPath, filePath)
        return true
      }
      return false
    } catch (err: any) {
      console.error(`[VTE] Failed to restore file: ${err.message}`)
      return false
    }
  }

  /**
   * Restore all files from a checkpoint (commit hash or tag name)
   */
  restoreCheckpoint(commitHashOrTag: string): string[] {
    this.init()
    const restored: string[] = []

    console.log(`[VTE] Restoring from: ${commitHashOrTag}`)

    try {
      // Get list of changed files at this commit/tag
      let files: string[] = []

      // First try: get files changed in this commit
      try {
        const output = this.exec(`git diff --name-only ${commitHashOrTag}~1 ${commitHashOrTag} 2>/dev/null`)
        console.log(`[VTE] Diff output: ${output}`)
        files = output.split('\n').filter(Boolean)
      } catch (err) {
        console.log(`[VTE] Diff with parent failed: ${err}`)
      }

      // If no files changed (empty commit), try getting all files from the commit tree
      if (files.length === 0) {
        console.log(`[VTE] No files in diff, trying ls-tree`)
        try {
          const output = this.exec(`git ls-tree --name-only -r ${commitHashOrTag}`)
          console.log(`[VTE] ls-tree output: ${output}`)
          files = output.split('\n').filter(Boolean)
        } catch (err) {
          console.log(`[VTE] ls-tree failed: ${err}`)
        }
      }

      // If still no files, try restoring from the parent commit
      if (files.length === 0) {
        console.log(`[VTE] Still no files, trying parent commit`)
        try {
          const parentHash = this.exec(`git rev-parse ${commitHashOrTag}~1`).trim()
          console.log(`[VTE] Parent commit: ${parentHash}`)
          const output = this.exec(`git diff --name-only ${parentHash}~1 ${parentHash} 2>/dev/null`)
          console.log(`[VTE] Parent diff output: ${output}`)
          files = output.split('\n').filter(Boolean)
          // Use parent commit for file content
          if (files.length > 0) {
            commitHashOrTag = parentHash
          }
        } catch (err) {
          console.log(`[VTE] Parent commit failed: ${err}`)
        }
      }

      console.log(`[VTE] Files to restore: ${files.length} - ${files.join(', ')}`)

      // Restore each file
      for (const file of files) {
        const fullPath = path.join(this.workspaceRoot, file)
        try {
          // Get file content from the checkpoint
          const content = this.exec(`git show ${commitHashOrTag}:${file}`)
          fs.writeFileSync(fullPath, content, 'utf-8')
          restored.push(file)
          console.log(`[VTE] Restored: ${file}`)
        } catch (err) {
          console.warn(`[VTE] Failed to restore file: ${file} - ${err}`)
        }
      }
    } catch (err: any) {
      console.error(`[VTE] Failed to restore checkpoint: ${err.message}`)
    }

    return restored
  }

  /**
   * Parse unified diff output
   */
  private parseDiff(diffOutput: string): GitDiff[] {
    const diffs: GitDiff[] = []
    const fileDiffs = diffOutput.split('diff --git ')

    for (const block of fileDiffs) {
      if (!block.trim()) continue
      const lines = block.split('\n')
      const headerMatch = lines[0]?.match(/a\/(.+?) b\//)
      if (headerMatch) {
        diffs.push({
          file: headerMatch[1],
          patch: 'diff --git ' + block,
        })
      }
    }

    return diffs
  }

  /**
   * Get repo path
   */
  getRepoPath(): string {
    return this.repoPath
  }

  /**
   * Get current commit hash
   */
  getCommitHash(): string {
    this.init()
    try {
      return this.exec('git rev-parse HEAD')
    } catch {
      return ''
    }
  }

  /**
   * Save metadata to shadow-git (messages, mode, etc.)
   */
  saveMetadata(metadata: CheckpointMetadata): void {
    this.init()
    try {
      const metadataPath = path.join(this.repoPath, '.vte-metadata.json')
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
      console.log(`[VTE] Metadata saved to: ${metadataPath}`)
      this.exec('git add -A')
      this.exec('git commit -m "Update metadata" --allow-empty')
    } catch (err: any) {
      console.warn(`[VTE] Failed to save metadata: ${err.message}`)
    }
  }

  /**
   * Load metadata from a specific commit
   */
  loadMetadata(commitHash?: string): CheckpointMetadata | null {
    this.init()
    try {
      const ref = commitHash || 'HEAD'
      console.log(`[VTE] Loading metadata from commit: ${ref}`)
      const content = this.exec(`git show ${ref}:.vte-metadata.json 2>/dev/null`)
      if (content && content.trim()) {
        console.log(`[VTE] Metadata loaded successfully`)
        return JSON.parse(content)
      }
      console.log(`[VTE] No metadata found in commit: ${ref}`)
    } catch (err: any) {
      console.warn(`[VTE] Failed to load metadata: ${err.message}`)
    }
    return null
  }
}
