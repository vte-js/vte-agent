/**
 * Git-worktree based sandbox.
 *
 * Creates a throwaway branch + worktree so an agent can mutate files freely;
 * changes are merged back into the main branch on demand. When the workspace
 * is not a git repo we fall back to a plain directory copy (merge becomes a
 * "manual merge required" notice).
 *
 * This is the VSCode/CLI/Electron backend for the `HostSandbox` interface
 * defined in ./types. It is intentionally synchronous (execSync) so the agent
 * pool can wire it up without making `createAgent` async.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { HostSandbox, Sandbox } from './types'

class GitWorktreeInstance implements Sandbox {
  readonly root: string

  constructor(
    private readonly rootPath: string,
    private readonly baseRoot: string,
    private readonly branch: string,
  ) {
    this.root = rootPath
  }

  commit(message = 'vte sandbox commit'): void {
    try {
      execSync(`git add -A && git commit -q -m "${message.replace(/"/g, "'")}"`, {
        cwd: this.root,
        stdio: 'pipe',
      })
    } catch {
      // Nothing to commit is not an error worth surfacing.
    }
  }

  merge(): { merged: boolean; summary: string } {
    // The main workspace must be clean to accept a merge.
    const status = this.safeExec(`git status --porcelain`, this.baseRoot).trim()
    if (status) {
      return {
        merged: false,
        summary: `主工作区有未提交改动，无法自动合并沙箱分支 ${this.branch}，请手动合并`,
      }
    }
    const baseBranch = this.getBranch(this.baseRoot)
    if (!baseBranch) {
      return {
        merged: false,
        summary: `主工作区处于分离 HEAD，无法自动合并，请手动合并沙箱分支 ${this.branch}`,
      }
    }
    try {
      execSync(`git merge "${this.branch}" --no-edit`, {
        cwd: this.baseRoot,
        stdio: 'pipe',
      })
      return { merged: true, summary: `已合并沙箱分支 ${this.branch} 到 ${baseBranch}` }
    } catch {
      return {
        merged: false,
        summary: `合并冲突，请手动解决（沙箱分支 ${this.branch}）`,
      }
    }
  }

  destroy(): void {
    try {
      execSync(`git worktree remove "${this.root}" --force`, {
        cwd: this.baseRoot,
        stdio: 'pipe',
      })
    } catch {
      // ignore
    }
    try {
      execSync(`git branch -D "${this.branch}"`, { cwd: this.baseRoot, stdio: 'pipe' })
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(this.root)) fs.rmSync(this.root, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }

  private getBranch(cwd: string): string | undefined {
    const out = this.safeExec('git symbolic-ref --short HEAD', cwd).trim()
    return out || undefined
  }

  private safeExec(cmd: string, cwd: string): string {
    try {
      return execSync(cmd, { cwd, stdio: 'pipe' }).toString()
    } catch {
      return ''
    }
  }
}

class CopySandboxInstance implements Sandbox {
  readonly root: string
  constructor(readonly rootPath: string) {
    this.root = rootPath
  }
  merge(): { merged: boolean; summary: string } {
    return {
      merged: false,
      summary: '工作区不是 git 仓库，已创建目录副本；改动需手动合并回主工作区',
    }
  }
  destroy(): void {
    try {
      if (fs.existsSync(this.root)) fs.rmSync(this.root, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

export class GitWorktreeSandbox implements HostSandbox {
  create(scope: string, baseRoot?: string): Sandbox {
    if (!baseRoot) throw new Error('GitWorktreeSandbox: baseRoot is required')
    if (!this.isGitRepo(baseRoot)) {
      return this.createCopySandbox(scope, baseRoot)
    }
    const stamp = Date.now().toString(36)
    const branch = `vte-sandbox/${scope}-${stamp}`
    const root = path.join(os.tmpdir(), 'vte-sandbox', `${scope}-${stamp}`)
    if (fs.existsSync(root)) {
      try {
        fs.rmSync(root, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    const commitIsh = this.getBranch(baseRoot) || 'HEAD'
    execSync(`git worktree add -b "${branch}" "${root}" "${commitIsh}"`, {
      cwd: baseRoot,
      stdio: 'pipe',
    })
    return new GitWorktreeInstance(root, baseRoot, branch)
  }

  private isGitRepo(cwd: string): boolean {
    try {
      execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  private getBranch(cwd: string): string | undefined {
    try {
      const out = execSync('git symbolic-ref --short HEAD', { cwd, stdio: 'pipe' })
        .toString()
        .trim()
      return out || undefined
    } catch {
      return undefined
    }
  }

  private createCopySandbox(scope: string, baseRoot: string): Sandbox {
    const stamp = Date.now().toString(36)
    const root = path.join(os.tmpdir(), 'vte-sandbox', `${scope}-${stamp}`)
    if (fs.existsSync(root)) {
      try {
        fs.rmSync(root, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
    fs.cpSync(baseRoot, root, { recursive: true })
    return new CopySandboxInstance(root)
  }
}
