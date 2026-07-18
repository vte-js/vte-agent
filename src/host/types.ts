/**
 * Host Adapter Interface
 *
 * Abstracts host-specific capabilities (file I/O, UI, messaging, etc.)
 * so the agent engine can run on different platforms (VSCode, Web, CLI, etc.)
 */

import type { ToolDefinition } from '../core/types'

// ── Disposable ──

export interface Disposable {
  dispose(): void
}

// ── File System ──

export interface HostFileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  exists(path: string): Promise<boolean>
  stat(path: string): Promise<{ type: 'file' | 'directory'; size: number }>
  mkdir(path: string, recursive?: boolean): Promise<void>
  readdir(path: string): Promise<string[]>
  delete(path: string): Promise<void>
  watch?(path: string, callback: (event: 'create' | 'change' | 'delete') => void): Disposable
}

// ── Workspace ──

export interface HostWorkspace {
  getRoot(): string | undefined
  getFolders(): Array<{ name: string; uri: string }>
  onDidChangeWorkspaceFolders?(callback: (event: any) => void): Disposable
}

// ── UI ──

export interface HostUI {
  showInfo(message: string): Promise<void>
  showWarning(message: string): Promise<void>
  showError(message: string): Promise<void>
  confirm(message: string): Promise<boolean>

  showQuickPick(
    items: Array<{ label: string; description?: string; value?: string }>,
    options?: { multi?: boolean; placeholder?: string }
  ): Promise<string[] | undefined>

  showInputBox(prompt: string, options?: { defaultValue?: string; placeholder?: string }): Promise<string | undefined>

  showOpenDialog(options: {
    canSelectFiles?: boolean
    canSelectFolders?: boolean
    canSelectMany?: boolean
    filters?: Record<string, string[]>
    openLabel?: string
  }): Promise<string[] | undefined>

  toast(level: 'info' | 'success' | 'warning' | 'error', message: string, options?: { duration?: number }): void

  withProgress<T>(
    title: string,
    task: (report: (message: string) => void) => Promise<T>
  ): Promise<T>
}

// ── Messaging ──

export interface HostMessaging {
  postMessage(msg: any): void
  onMessage(handler: (msg: any) => void): Disposable
  signalReady?(): void
}

// ── Shell ──

export interface HostShell {
  execute(
    command: string,
    options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

// ── LSP (Optional) ──

export interface HostLSP {
  gotoDefinition(uri: string, line: number, character: number): Promise<any[]>
  findReferences(uri: string, line: number, character: number): Promise<any[]>
  hover(uri: string, line: number, character: number): Promise<any>
  getDocumentSymbols(uri: string): Promise<any[]>
  executeCommand(command: string, ...args: any[]): Promise<any>
}

// ── Git (Optional) ──

export interface HostGit {
  getBranch(): Promise<string>
  getStatus(): Promise<string>
  diff(args?: string): Promise<string>
  log(args?: string): Promise<string>
  revParse(args: string): Promise<string>
}

// ── Sandbox (Optional) ──
//
// Isolated workspace copies. An agent with `isolation: 'snapshot'` gets a
// Sandbox rooted at a throwaway path so it can read/write freely without
// touching the main workspace until changes are explicitly merged back.
//
// This is the host abstraction for "sandbox isolation" — backends are
// host-specific (git worktree / container / directory clone). Hosts that
// cannot isolate a filesystem (e.g. a pure web playground) simply omit
// `sandbox`, and the agent pool gracefully falls back to the shared root.

export interface Sandbox {
  /** Root path of the isolated workspace copy. */
  readonly root: string
  /** Optionally commit current sandbox changes. */
  commit?(message?: string): void
  /**
   * Merge sandbox changes back into the main workspace.
   * Returns whether the merge succeeded plus a human-readable summary.
   */
  merge(): { merged: boolean; summary: string }
  /** Discard the sandbox and release its resources (worktree / copy). */
  destroy(): void
}

export interface HostSandbox {
  /** Create an isolated copy scoped to `scope` (typically an agent id). */
  create(scope: string, baseRoot?: string): Sandbox
}

// ── Host Adapter (Main Interface) ──

export interface HostAdapter {
  readonly id: string
  readonly name: string

  fs: HostFileSystem
  workspace: HostWorkspace
  ui: HostUI
  messaging: HostMessaging

  shell?: HostShell
  lsp?: HostLSP
  git?: HostGit

  /** Optional isolated-workspace factory (sandbox isolation). */
  sandbox?: HostSandbox

  /** LSP tool definitions (goto_definition, hover, references, etc.) */
  lspTools?: ToolDefinition[]

  /** Initialize the host adapter */
  initialize?(): Promise<void>

  /** Dispose resources */
  dispose?(): void
}
