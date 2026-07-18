/**
 * VSCode Host Adapter
 *
 * Implements HostAdapter using VSCode extension APIs.
 */

import * as vscode from 'vscode'
import {
  HostAdapter, HostFileSystem, HostWorkspace, HostUI,
  HostMessaging, HostShell, HostLSP, Disposable, HostSandbox,
} from './types'
import type { ToolDefinition } from '../core/types'
import { GitWorktreeSandbox } from './sandbox-git'

// ── VSCode File System ──

class VSCodeFileSystem implements HostFileSystem {
  async readFile(path: string): Promise<string> {
    const uri = vscode.Uri.file(path)
    const bytes = await vscode.workspace.fs.readFile(uri)
    return Buffer.from(bytes).toString('utf-8')
  }

  async writeFile(path: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(path)
    const dir = vscode.Uri.file(path.substring(0, path.lastIndexOf('/')))
    try { await vscode.workspace.fs.stat(dir) } catch { await vscode.workspace.fs.createDirectory(dir) }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
  }

  async exists(path: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path))
      return true
    } catch { return false }
  }

  async stat(path: string) {
    const s = await vscode.workspace.fs.stat(vscode.Uri.file(path))
    return { type: s.type === vscode.FileType.File ? 'file' as const : 'directory' as const, size: s.size }
  }

  async mkdir(path: string, _recursive?: boolean) {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path))
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path))
    return entries.map(([name]) => name)
  }

  async delete(path: string) {
    await vscode.workspace.fs.delete(vscode.Uri.file(path), { recursive: true })
  }

  watch(path: string, callback: (event: 'create' | 'change' | 'delete') => void): Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(path)
    watcher.onDidCreate(() => callback('create'))
    watcher.onDidChange(() => callback('change'))
    watcher.onDidDelete(() => callback('delete'))
    return { dispose: () => watcher.dispose() }
  }
}

// ── VSCode Workspace ──

class VSCodeWorkspace implements HostWorkspace {
  getRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  }

  getFolders() {
    return (vscode.workspace.workspaceFolders || []).map(f => ({
      name: f.name,
      uri: f.uri.fsPath,
    }))
  }

  onDidChangeWorkspaceFolders(callback: (event: any) => void): Disposable {
    return vscode.workspace.onDidChangeWorkspaceFolders(callback)
  }
}

// ── VSCode UI ──

class VSCodeUI implements HostUI {
  async showInfo(message: string) { vscode.window.showInformationMessage(message) }
  async showWarning(message: string) { vscode.window.showWarningMessage(message) }
  async showError(message: string) { vscode.window.showErrorMessage(message) }
  async confirm(message: string) {
    const result = await vscode.window.showWarningMessage(message, '是', '否')
    return result === '是'
  }

  async showQuickPick(
    items: Array<{ label: string; description?: string; value?: string }>,
    options?: { multi?: boolean; placeholder?: string }
  ) {
    const result = await vscode.window.showQuickPick(
      items.map((i) => ({ label: i.label, description: i.description, value: i.value || i.label })),
      { canPickMany: options?.multi, placeHolder: options?.placeholder }
    )
    if (!result) return undefined
    const picked = Array.isArray(result) ? result : [result]
    return picked.map((r: any) => r.value || r.label)
  }

  async showInputBox(prompt: string, options?: { defaultValue?: string; placeholder?: string }) {
    return vscode.window.showInputBox({ prompt, value: options?.defaultValue, placeHolder: options?.placeholder })
  }

  async showOpenDialog(options: {
    canSelectFiles?: boolean; canSelectFolders?: boolean; canSelectMany?: boolean;
    filters?: Record<string, string[]>; openLabel?: string
  }) {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: options.canSelectFiles,
      canSelectFolders: options.canSelectFolders,
      canSelectMany: options.canSelectMany,
      filters: options.filters,
      openLabel: options.openLabel,
    })
    return uris?.map(u => u.fsPath) || []
  }

  toast(level: 'info' | 'success' | 'warning' | 'error', message: string, options?: { duration?: number }) {
    const fn = level === 'error' ? vscode.window.showErrorMessage
      : level === 'warning' ? vscode.window.showWarningMessage
      : vscode.window.showInformationMessage
    fn(message)
  }

  async withProgress<T>(title: string, task: (report: (message: string) => void) => Promise<T>) {
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title },
      async (progress) => {
        return task((msg) => progress.report({ message: msg }))
      }
    ) as Promise<T>
  }
}

// ── VSCode Messaging ──

export class VSCodeMessaging implements HostMessaging {
  private handlers: Array<(msg: any) => void> = []
  private panel?: vscode.WebviewPanel
  private view?: vscode.WebviewView

  /** Bind to a webview panel */
  bindPanel(panel: vscode.WebviewPanel) {
    this.panel = panel
    panel.webview.onDidReceiveMessage((msg) => {
      this.handlers.forEach(h => h(msg))
    })
  }

  /** Bind to a webview view (sidebar) */
  bindView(view: vscode.WebviewView) {
    this.view = view
    view.webview.onDidReceiveMessage((msg) => {
      this.handlers.forEach(h => h(msg))
    })
  }

  postMessage(msg: any) {
    const plain = JSON.parse(JSON.stringify(msg))
    this.panel?.webview.postMessage(plain)
    this.view?.webview.postMessage(plain)
  }

  onMessage(handler: (msg: any) => void): Disposable {
    this.handlers.push(handler)
    return { dispose: () => { this.handlers = this.handlers.filter(h => h !== handler) } }
  }
}

// ── VSCode Shell ──

class VSCodeShell implements HostShell {
  async execute(command: string, options?: { cwd?: string; timeout?: number; env?: Record<string, string> }) {
    const { execSync } = require('child_process')
    try {
      const stdout = execSync(command, {
        cwd: options?.cwd,
        timeout: options?.timeout || 30000,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        env: options?.env,
      })
      return { stdout: stdout || '', stderr: '', exitCode: 0 }
    } catch (err: any) {
      return { stdout: '', stderr: err.stderr || err.message, exitCode: err.status || 1 }
    }
  }
}

// ── VSCode LSP ──

class VSCodeLSP implements HostLSP {
  async gotoDefinition(uri: string, line: number, character: number) {
    return vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider', vscode.Uri.file(uri), new vscode.Position(line, character)
    )
  }

  async findReferences(uri: string, line: number, character: number) {
    return vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider', vscode.Uri.file(uri), new vscode.Position(line, character)
    )
  }

  async hover(uri: string, line: number, character: number) {
    return vscode.commands.executeCommand<vscode.Hover>(
      'vscode.executeHoverProvider', vscode.Uri.file(uri), new vscode.Position(line, character)
    )
  }

  async getDocumentSymbols(uri: string) {
    return vscode.commands.executeCommand<any[]>(
      'vscode.executeDocumentSymbolProvider', vscode.Uri.file(uri)
    )
  }

  async executeCommand(command: string, ...args: any[]) {
    return vscode.commands.executeCommand(command, ...args)
  }
}

// ── VSCode Host Adapter ──

export class VSCodeHostAdapter implements HostAdapter {
  readonly id = 'vscode'
  readonly name = 'Visual Studio Code'

  fs: HostFileSystem = new VSCodeFileSystem()
  workspace: HostWorkspace = new VSCodeWorkspace()
  ui: HostUI = new VSCodeUI()
  messaging: HostMessaging
  shell: HostShell = new VSCodeShell()
  lsp: HostLSP = new VSCodeLSP()
  sandbox: HostSandbox = new GitWorktreeSandbox()
  lspTools: ToolDefinition[]

  constructor(messaging: VSCodeMessaging) {
    this.messaging = messaging
    // LSP tools are loaded lazily to avoid circular imports
    this.lspTools = []
  }

  /** Load LSP tools after VSCode extension is activated */
  async loadLspTools(): Promise<void> {
    try {
      const { getLspToolDefinitions } = await import('../vscode/lsp/lsp-tools')
      this.lspTools = getLspToolDefinitions()
    } catch (err) {
      console.error('[VTE] Failed to load LSP tools:', err)
    }
  }
}
