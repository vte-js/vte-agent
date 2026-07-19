/**
 * WebIDEHostAdapter — the SECOND host implementation.
 *
 * This is the whole point of the architecture: a pure-Node host adapter
 * with ZERO `vscode` imports, proving the core agent engine is
 * truly host-agnostic. It mirrors `src/host/vscode.ts` but uses
 * Node's native APIs (fs, child_process, http) instead of VSCode APIs.
 *
 * Implements `src/host/types.ts#HostAdapter`.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type {
  HostAdapter,
  HostFileSystem,
  HostWorkspace,
  HostUI,
  HostMessaging,
  HostShell,
  HostGit,
  HistoryStore,
  Disposable,
} from '../../src/host/types'
import { FsHistoryStore } from '../../src/agent/history-store'
import { WebIDEMessaging } from './transport'

const execFileP = promisify(execFile)

// ── File System ──

export class WebIDEFS implements HostFileSystem {
  async readFile(p: string): Promise<string> {
    return fs.readFile(p, 'utf-8')
  }
  async writeFile(p: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, content, 'utf-8')
  }
  async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p)
      return true
    } catch {
      return false
    }
  }
  async stat(p: string): Promise<{ type: 'file' | 'directory'; size: number }> {
    const s = await fs.stat(p)
    return {
      type: s.isDirectory() ? 'directory' : 'file',
      size: s.size,
    }
  }
  async mkdir(p: string, recursive = true): Promise<void> {
    await fs.mkdir(p, { recursive })
  }
  async readdir(p: string): Promise<string[]> {
    return fs.readdir(p)
  }
  async delete(p: string): Promise<void> {
    await fs.rm(p, { recursive: true, force: true })
  }
}

// ── Workspace ──

export class WebIDEWorkspace implements HostWorkspace {
  constructor(private root: string) {}
  getRoot(): string | undefined {
    return this.root
  }
  getFolders(): Array<{ name: string; uri: string }> {
    return [{ name: path.basename(this.root) || this.root, uri: this.root }]
  }
}

// ── Shell ──

export class WebIDEShell implements HostShell {
  async execute(
    command: string,
    options?: { cwd?: string; timeout?: number; env?: Record<string, string> },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cwd = options?.cwd || process.cwd()
    const env = { ...process.env, ...(options?.env || {}) }
    try {
      const { stdout, stderr } = await execFileP('/bin/sh', ['-c', command], {
        cwd,
        env: env as NodeJS.ProcessEnv,
        maxBuffer: 32 * 1024 * 1024,
        timeout: options?.timeout,
      })
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        exitCode: 0,
      }
    } catch (e: any) {
      return {
        stdout: (e.stdout || '').toString(),
        stderr: (e.stderr || '').toString() || e.message || 'exec error',
        exitCode: typeof e.code === 'number' ? e.code : 1,
      }
    }
  }
}

// ── Git (optional) ──

export class WebIDEGit implements HostGit {
  constructor(private root: string) {}
  private async git(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileP('git', args, {
        cwd: this.root,
        maxBuffer: 32 * 1024 * 1024,
      })
      return stdout.toString().trim()
    } catch (e: any) {
      return (e.stdout || '').toString().trim()
    }
  }
  getBranch(): Promise<string> {
    return this.git(['rev-parse', '--abbrev-ref', 'HEAD'])
  }
  getStatus(): Promise<string> {
    return this.git(['status', '--porcelain'])
  }
  diff(args?: string): Promise<string> {
    return this.git(['diff', ...(args ? args.split(' ') : [])])
  }
  log(args?: string): Promise<string> {
    return this.git(['log', ...(args ? args.split(' ') : ['-n', '20'])])
  }
  revParse(args: string): Promise<string> {
    return this.git(['rev-parse', ...args.split(' ')])
  }
}

// ── UI ──

export class WebIDEUI implements HostUI {
  constructor(private messaging: WebIDEMessaging) {}

  private push(msg: any): void {
    this.messaging.postMessage(msg)
  }

  async showInfo(message: string): Promise<void> {
    console.log('[UI:info]', message)
    this.push({ type: 'toast', level: 'info', text: message })
  }
  async showWarning(message: string): Promise<void> {
    console.warn('[UI:warn]', message)
    this.push({ type: 'toast', level: 'warning', text: message })
  }
  async showError(message: string): Promise<void> {
    console.error('[UI:error]', message)
    this.push({ type: 'toast', level: 'error', text: message })
  }
  async confirm(_message: string): Promise<boolean> {
    // v1: auto-confirm (full request/response UI lands in a later milestone)
    console.log('[UI:confirm] auto-yes for:', _message)
    return true
  }
  async showQuickPick(
    items: Array<{ label: string; description?: string; value?: string }>,
    _options?: { multi?: boolean; placeholder?: string },
  ): Promise<string[] | undefined> {
    console.log('[UI:quickPick]', items.map((i) => i.label).join(' | '))
    return []
  }
  async showInputBox(
    prompt: string,
    _options?: { defaultValue?: string; placeholder?: string },
  ): Promise<string | undefined> {
    console.log('[UI:inputBox]', prompt)
    return undefined
  }
  async showOpenDialog(_options: any): Promise<string[] | undefined> {
    return undefined
  }
  toast(
    level: 'info' | 'success' | 'warning' | 'error',
    message: string,
    _options?: { duration?: number },
  ): void {
    this.push({ type: 'toast', level, text: message })
  }
  async withProgress<T>(
    title: string,
    task: (report: (message: string) => void) => Promise<T>,
  ): Promise<T> {
    return task((m) => console.log('[progress]', m))
  }
}

// ── Host Adapter (main) ──

export class WebIDEHostAdapter implements HostAdapter {
  readonly id = 'web-ide'
  readonly name = 'Web IDE'

  fs: HostFileSystem
  workspace: HostWorkspace
  ui: HostUI
  messaging: WebIDEMessaging
  shell: HostShell
  git: HostGit
  history: HistoryStore

  constructor(private root: string) {
    this.fs = new WebIDEFS()
    this.workspace = new WebIDEWorkspace(root)
    this.messaging = new WebIDEMessaging()
    this.ui = new WebIDEUI(this.messaging)
    this.shell = new WebIDEShell()
    this.git = new WebIDEGit(root)
    this.history = new FsHistoryStore()
  }

  async initialize(): Promise<void> {
    console.log(`[WebIDEHostAdapter] initialized, root=${this.root}`)
  }

  /**
   * Update the workspace root WITHOUT rebuilding messaging/shell/fs.
   * Called when the user switches workspaces — the WS connection stays
   * alive, only the workspace and git adapters get a new root.
   */
  updateRoot(newRoot: string): void {
    this.root = newRoot
    this.workspace = new WebIDEWorkspace(newRoot)
    this.git = new WebIDEGit(newRoot)
    console.log(`[WebIDEHostAdapter] root switched to ${newRoot}`)
  }
}
