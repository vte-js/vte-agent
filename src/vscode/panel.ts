import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentEngine, AgentMode } from '../agent/engine';
import { ModelCapability } from '../core/types';
import { inferCapability } from '../agent/model-catalog';
import { DEFAULT_PERMISSION_CONFIG, type PermissionConfig } from '../core/permissions';
import { resolveApiProtocol } from '../agent/llm-schema';
import { getAllTasks } from '../agent/tasks';
import { loadBuiltinSkills, getBuiltinSkillContent } from '../skills/builtin';
import { getSessionStats, getRecentRecords } from '../agent/token-tracker';
import { VTEContextManager } from '../context/manager';
import { runGrayBoxTests, formatTestResults } from '../agent/test-runner';
import { ShadowGit } from '../agent/shadow-git';
import { SessionManager } from '../agent/session-manager';
import { ChatMessage } from '../agent/session-types';
import { getCodeIntelligenceService, getConfigurationResolver } from './lsp';
import { setHost, VSCodeHostAdapter, VSCodeMessaging } from '../host';
import { registerTools } from '../core/registry';
import { AgentPool, AgentInstance } from '../agent/agent-pool';
import { AgentContextSystem } from '../agent/context-system';
import { WorkOrderPool, WorkOrder } from '../agent/work-order';
import { Scheduler, ScheduleConfig } from '../agent/scheduler';
import { AgentCommunication } from '../agent/agent-communication';
import { BUILTIN_ROLES, AgentRole } from '../agent/agent-role';

let outputChannel: vscode.OutputChannel;

function log(msg: string) {
  const time = new Date().toLocaleTimeString();
  outputChannel?.appendLine(`[${time}] ${msg}`);
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'vte-agent.chat';
  private view?: vscode.WebviewView;
  private panel?: vscode.WebviewPanel;
  private engine?: AgentEngine;
  private shadowGit?: ShadowGit;
  private sessionManager?: SessionManager;
  private currentSessionId?: string;
  private mode: AgentMode = 'code';
  /** Persisted host-agnostic behavior / sampling settings. Stored in
   *  globalState (NOT the native settings schema) so they survive a
   *  webview reload. Previously these were either never persisted or
   *  only held in memory, so every setting under 行为/高级 reverted
   *  to defaults on refresh. */
  private taskMode: string = 'off';
  private temperature: number = 0.7;
  private topP: number = 1;
  private maxTokens: number = 4096;
  private reasoningLevel: 'low' | 'medium' | 'high' = 'medium';
  /** Cached permission policy (mirrors engine's in-memory config so a
   *  refreshed webview re-seeds from globalState instead of defaults). */
  private permissionConfig: PermissionConfig = { ...DEFAULT_PERMISSION_CONFIG };
  /** Sub-agent work-order timeout in seconds (host-agnostic config, surfaced in our own ConfigPanel, not VSCode native settings). */
  private subAgentTimeout = 300;
  private forceMultiAgent = false;

  /**
   * Single source of truth for the active LLM credentials.
   *
   * Derived purely from the model-profile list (`vteCode.models` +
   * `vteCode.activeModelIndex`). The legacy flat keys
   * (`vteCode.apiKey/apiBase/model`) were removed from the config schema to
   * fully decouple from VSCode's native settings — every consumer now goes
   * through this helper instead of reading those keys.
   */
  private getActiveCredentials(): { model: string; apiKey: string; apiBase: string } {
    const config = vscode.workspace.getConfiguration('vteCode');
    const models = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string }>>('models', []);
    const idx = config.get<number>('activeModelIndex', 0);
    const active = models[idx] || models[0];
    return {
      model: active?.model || 'gpt-4',
      apiKey: active?.apiKey || '',
      apiBase: active?.apiBase || 'https://api.openai.com/v1',
    };
  }
  // Multi-agent state
  private agentPool?: AgentPool;
  private workOrderPool?: WorkOrderPool;
  private scheduler?: Scheduler;
  private agentCommunication?: AgentCommunication;
  /** One-shot unsubscriber for the auto-delegation completion watcher. */
  private delegationWatchUnsub?: () => void;
  // Track chat history for cross-webview sync
  private chatHistory: Array<{
    id: number;
    role: 'user' | 'assistant' | 'error';
    text: string;
    timestamp: string;
    thinkingText?: string;
    images?: Array<{ name: string; dataUrl: string; mimeType: string }>;
    context?: Array<{ path: string; name: string }>;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      status: 'pending' | 'running' | 'done' | 'error';
      result?: string;
      elapsed?: number;
    }>;
  }> = [];
  private nextMsgId = 0;
  private pendingThinking = '';
  private pendingToolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status: 'pending' | 'running' | 'done' | 'error';
    result?: string;
    elapsed?: number;
  }> = [];


  constructor(
    private readonly extensionUri: vscode.Uri,
    /** Extension-scoped memento for host-agnostic config (NOT in package.json
     *  schema → never shown in the VSCode Settings UI). Used for
     *  `forceMultiAgent` / `subAgentTimeout` because writing to
     *  `vscode.workspace.getConfiguration().update()` for unknown keys is
     *  silently dropped by VSCode, and we'd rather keep these private than
     *  expose them in the native settings UI. */
    private readonly globalState: vscode.Memento,
  ) {
    outputChannel = vscode.window.createOutputChannel('VTE Agent');
    // Restore host-agnostic config from globalState (falls back to defaults
    // on first run). These values are NOT read from settings.json anymore.
    this.subAgentTimeout = this.globalState.get<number>('vte.subAgentTimeout', 300)
    this.forceMultiAgent = this.globalState.get<boolean>('vte.forceMultiAgent', false)
    // Restore the rest of the behavior / sampling settings so a refreshed
    // webview re-seeds its local refs from these instead of defaults.
    this.mode = (this.globalState.get<AgentMode>('vte.mode', 'code')) || 'code'
    this.taskMode = this.globalState.get<string>('vte.taskMode', 'off')
    this.temperature = this.globalState.get<number>('vte.temperature', 0.7)
    this.topP = this.globalState.get<number>('vte.topP', 1)
    this.maxTokens = this.globalState.get<number>('vte.maxTokens', 4096)
    this.reasoningLevel = (this.globalState.get<'low' | 'medium' | 'high'>('vte.reasoningLevel', 'medium')) || 'medium'
    this.permissionConfig = { ...DEFAULT_PERMISSION_CONFIG, ...(this.globalState.get<Record<string, string>>('vte.permissionConfig', {})) }
  }


  /** Post message to all active webviews */
  public postMessage(msg: any) {
    console.log(`[VTE] postMessage: ${msg.type}`, msg);
    let sent = false;
    if (this.panel) {
      console.log('[VTE] Sending to panel webview');
      this.panel.webview.postMessage(msg);
      sent = true;
    }
    if (this.view) {
      console.log('[VTE] Sending to view webview');
      this.view.webview.postMessage(msg);
      sent = true;
    }
    if (!sent) {
      console.log('[VTE] WARNING: No webview available to send message');
    }
  }

  /** Send full chat history + current state to a newly created webview */
  private syncStateToWebview(webview: vscode.Webview) {
    if (this.chatHistory.length > 0) {
      webview.postMessage({ type: 'chatHistory', messages: this.chatHistory });
    }
    webview.postMessage({ type: 'modeChanged', mode: this.mode });
  }

  // ── Sidebar view entry point ──

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;
    this._setupWebview(webviewView.webview);
    this.syncStateToWebview(webviewView.webview);
    log('Webview view resolved');
  }

  // ── Panel entry point (status bar) ──

  openPanel(onReady?: () => void) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      if (onReady) {
        // Delay callback to ensure webview is ready
        setTimeout(onReady, 150);
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'vte-agent-chat',
      'VTE Agent',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [this.extensionUri],
        retainContextWhenHidden: true,
      }
    );

    this._setupWebview(this.panel.webview);
    this.panel.webview.html = this.getWebviewHtml();
    this.syncStateToWebview(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      log('Panel disposed');
    });

    // Execute callback after webview is ready
    if (onReady) {
      // Use setTimeout to ensure webview has processed initial HTML
      setTimeout(onReady, 100);
    }

    log('Webview panel created');
  }

  // ── Shared webview setup ──

  private _setupWebview(webview: vscode.Webview) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webview.html = this.getWebviewHtml();
    log(`Webview HTML set (options: enableScripts=${webview.options.enableScripts})`);

    webview.onDidReceiveMessage(async (message) => {
      log(`Received: ${message.type}`);
      try {
      switch (message.type) {
        case 'ready':
          console.log('[VTE] Webview signaled ready, sending initial data');
          this.sendConfig();
          await this.handleGetLspProfiles();
          this.handleGetPermissionConfig();
          break;
        case 'chat':
          this.trackUserMessage(message.text, message.images, message.context);
          await this.handleChat(message.text, message.model, message.temperature, message.topP, message.maxTokens, message.images, message.context);
          break;
        case 'clear':
          this.engine?.clearHistory();
          this.chatHistory = [];
          this.postMessage({ type: 'cleared' });
          log('History cleared');
          break;
        case 'saveModels':
          await this.saveModels(message.models, message.activeModelIndex, message.subAgentTimeout, message.forceMultiAgent, message.mode, message.taskMode, message.temperature, message.topP, message.maxTokens);
          break;
        case 'switchModel':
          await this.switchModel(message.index);
          break;
        case 'getConfig':
          this.sendConfig();
          break;
        case 'setMode':
          this.mode = message.mode;
          await this.globalState.update('vte.mode', message.mode);
          this.engine?.setMode(message.mode);
          log(`Mode changed to: ${message.mode}`);
          break;
        case 'setTaskMode':
          this.taskMode = message.taskMode;
          await this.globalState.update('vte.taskMode', message.taskMode);
          this.engine?.setTaskMode(message.taskMode);
          log(`Task mode changed to: ${message.taskMode}`);
          break;
        case 'setReasoningLevel':
          this.reasoningLevel = message.level;
          await this.globalState.update('vte.reasoningLevel', message.level);
          this.engine?.setReasoningLevel(message.level);
          log(`Reasoning level changed to: ${message.level}`);
          break;
        case 'abort':
          this.engine?.abort();
          break;
        case 'runTests':
          await this.handleRunTests();
          break;
        case 'feedback':
          this.handleFeedback(message.messageId, message.rating, message.userMessage, message.assistantMessage, message.comment);
          break;
        case 'gitSelect':
          await this.handleGitSelect(message.source, message.items);
          break;
        case 'requestContext':
          await this.handleContextRequest(message.source);
          break;
        case 'getPermissionConfig':
          this.handleGetPermissionConfig();
          break;
        case 'setPermissionConfig':
          this.handleSetPermissionConfig(message.config);
          break;
        case 'permissionResponse':
          this.handlePermissionResponse(message.requestId, message.decision);
          break;
        case 'questionResponse':
          this.handleQuestionResponse(message.requestId, message.answer);
          break;
        // Session management
        case 'session:create':
          await this.createSession(message.name);
          break;
        case 'session:list':
          await this.listSessions();
          break;
        case 'session:get':
          await this.getSession(message.sessionId);
          break;
        case 'session:restore':
          await this.restoreSession(message.sessionId);
          break;
        case 'session:delete':
          await this.deleteSession(message.sessionId);
          break;
        case 'session:deleteAll':
          await this.deleteAllSessions();
          break;
        case 'session:rename':
          await this.renameSession(message.sessionId, message.name);
          break;
        case 'session:tag':
          await this.tagSession(message.sessionId, message.tags);
          break;
        case 'session:search':
          await this.searchSessions(message.query);
          break;
        case 'session:export':
          await this.exportSession(message.sessionId);
          break;
        case 'session:import':
          await this.importSession(message.data);
          break;
        // LSP management
        case 'getLspProfiles':
          await this.handleGetLspProfiles();
          break;
        case 'getLspConfigEditorData':
          await this.handleGetLspConfigEditorData();
          break;
        case 'lsp:setup':
          this.handleLspSetup();
          break;
        case 'lsp:test':
          this.handleLspTest();
          break;
        case 'lsp:refreshStatus':
          this.handleLspRefreshStatus();
          break;
        case 'lsp:clearCache':
          this.handleLspClearCache();
          break;
        case 'lspConfigEditor:save':
          await this.handleLspConfigSave(message.profile);
          break;
        case 'lspConfigEditor:delete':
          await this.handleLspConfigDelete(message.languageId);
          break;
        case 'lspConfigEditor:add':
          console.log('[VTE] SWITCH MATCHED lspConfigEditor:add, profile:', message.profile);
          await this.handleLspConfigAdd(message.profile);
          break;
        case 'skills:list':
          this.handleSkillsList();
          break;
        case 'skills:get':
          this.handleSkillsGet(message.skillPath);
          break;
        case 'skills:save':
          this.handleSkillsSave(message.skillPath, message.content);
          break;
        case 'skills:create':
          this.handleSkillsCreate(message.name, message.dir, message.description);
          break;
        case 'skills:delete':
          this.handleSkillsDelete(message.skillPath);
          break;
        case 'skills:openPanel':
          this.postMessage({ type: 'skills:openPanel' });
          break;
        // Multi-agent management
        case 'multiAgent:createAgent':
          this.handleCreateAgent(message.roleId, message.model, message.apiKey, message.apiBase);
          break;
        case 'multiAgent:createOrder':
          this.handleCreateOrder(message.title, message.description, message.requiredRole, message.dependencies);
          break;
        case 'multiAgent:startScheduler':
          this.handleStartScheduler(message.mode);
          break;
        case 'multiAgent:stopScheduler':
          this.handleStopScheduler();
          break;
        case 'multiAgent:getConversation':
          this.handleGetConversation(message.agentId);
          break;
        case 'multiAgent:stopAll':
          this.handleStopAllAgents();
          break;
        case 'multiAgent:sendMessage':
          this.handleAgentMessage(message.from, message.to, message.type, message.content);
          break;
        case 'multiAgent:decomposeRequest':
          this.handleDecomposeRequest(message.request);
          break;
      }
      } catch (err: any) {
        console.error(`[VTE] ERROR handling ${message.type}:`, err);
        log(`[DEBUG] ERROR in onDidReceiveMessage handler for ${message.type}: ${err.message}`);
        log(`[DEBUG] Stack: ${err.stack}`);
        // If it was a chat message, make sure the webview gets an error response
        if (message.type === 'chat') {
          this.postMessage({ type: 'error', text: `Internal error: ${err.message}` });
        }
      }
    });
  }

  private trackUserMessage(text: string, images?: Array<{ name: string; dataUrl: string; mimeType: string }>, context?: Array<{ path: string; name: string }>) {
    this.chatHistory.push({
      id: this.nextMsgId++,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
      images,
      context,
    });
  }

  private async handleGitSelect(type: string, items: string[]) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const files: Array<{ path: string; name: string }> = [];

    if (type === 'changes') {
      for (const f of items) {
        files.push({ path: path.join(workspaceRoot, f), name: f });
      }
    } else if (type === 'commits') {
      const { execSync } = require('child_process');
      for (const hash of items) {
        try {
          const details = execSync(`git show --stat --format="%H%n%s%n%b" ${hash}`, { cwd: workspaceRoot, encoding: 'utf-8' });
          const fileChanges = execSync(`git diff-tree --no-commit-id --name-only -r ${hash}`, { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
          const commitMsg = details.split('\n')[1] || hash;
          const content = `Commit: ${hash}\nMessage: ${commitMsg}\n\nChanged files:\n${fileChanges}\n\nDiff:\n${details}`;
          files.push({ path: `__git_commit__:${hash}`, name: `commit: ${commitMsg}` });
          if (!this._pendingGitContents) this._pendingGitContents = {};
          this._pendingGitContents[hash] = content;
        } catch { /* skip */ }
      }
    }

    if (files.length > 0) {
      this.postMessage({ type: 'filePickerResult', files });
    }
  }

  private async captureTerminalOutput(terminal: vscode.Terminal): Promise<string> {
    // Try VSCode Shell Integration API (1.93+)
    const shellIntegration = (terminal as any).shellIntegration;
    if (shellIntegration && typeof shellIntegration.executeCommand === 'function') {
      try {
        const execution = shellIntegration.executeCommand('echo $VTE_LAST_COMMAND_OUTPUT');
        const reader = execution.read();
        let output = '';
        for await (const chunk of reader) {
          output += chunk;
        }
        if (output.trim()) return output.trim();
      } catch { /* fall through */ }
    }

    // Fallback: Use script command to capture output
    return new Promise<string>((resolve) => {
      const marker = `__VTE_${Date.now()}__`;
      terminal.sendText(`echo ${marker} && history -100 2>/dev/null | tail -50 && echo ${marker}`);

      // Poll clipboard as fallback
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 15) {
          clearInterval(interval);
          resolve('');
          return;
        }
        try {
          const clip = await vscode.env.clipboard.readText();
          if (clip && clip.includes(marker)) {
            clearInterval(interval);
            const parts = clip.split(marker);
            resolve(parts[1]?.trim() || '');
          }
        } catch { /* continue */ }
      }, 200);
    });
  }

  private async handleContextRequest(source: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let files: Array<{ path: string; name: string }> = [];

    switch (source) {
      case 'file': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
          openLabel: '添加文件',
        });
        if (uris) files = uris.map(uri => ({ path: uri.fsPath, name: uri.path.split('/').pop() || '' }));
        break;
      }
      case 'folder': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true, canSelectFiles: false, canSelectFolders: true,
          openLabel: '添加文件夹',
        });
        if (uris) files = uris.map(uri => ({ path: uri.fsPath, name: uri.path.split('/').pop() || '' }));
        break;
      }
      case 'doc': {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: true, canSelectFiles: true, canSelectFolders: false,
          filters: { 'Documents': ['md', 'txt', 'rst', 'adoc', 'doc', 'docx', 'pdf'] },
          openLabel: '添加文档',
        });
        if (uris) files = uris.map(uri => ({ path: uri.fsPath, name: uri.path.split('/').pop() || '' }));
        break;
      }
      case 'skills': {
        // Send skills list (built-in + project) to webview for selection
        const skillsForPick: Array<{ name: string; path: string; description: string }> = [];

        // Add built-in skills
        const builtinSkills = loadBuiltinSkills();
        for (const bs of builtinSkills) {
          skillsForPick.push({
            name: `[内置] ${bs.name}`,
            path: bs.path,
            description: bs.description,
          });
        }

        // Add project skills
        if (workspaceRoot) {
          const skillScanDirs = ['.claude/skills', '.agents/skills', '.opencode/skills'];
          for (const dir of skillScanDirs) {
            const fullPath = path.join(workspaceRoot, dir);
            if (!fs.existsSync(fullPath)) continue;
            try {
              const entries = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const skillFile = path.join(fullPath, entry.name, 'SKILL.md');
                  if (fs.existsSync(skillFile)) {
                    const content = fs.readFileSync(skillFile, 'utf-8');
                    const meta = this.parseSkillMeta(content);
                    skillsForPick.push({
                      name: meta.name || entry.name,
                      path: skillFile,
                      description: meta.description || '',
                    });
                  }
                }
              }
            } catch { /* skip */ }
          }
        }

        if (skillsForPick.length === 0) {
          this.postMessage({ type: 'toast', level: 'info', text: '未找到 Skills 文件' });
          return;
        }
        this.postMessage({ type: 'skills:pickList', skills: skillsForPick });
        return;
      }
      case 'terminal': {
        const terminal = vscode.window.activeTerminal;
        if (!terminal) {
          this.postMessage({ type: 'error', text: '没有活动的终端' });
          return;
        }
        // Try to read terminal buffer via shell integration
        const output = await this.captureTerminalOutput(terminal);
        if (output) {
          files = [{ path: '__terminal_output__', name: '终端输出' }];
          this._pendingTerminalContent = output;
        } else {
          this.postMessage({ type: 'error', text: '无法读取终端输出，请确保终端有活动内容' });
          return;
        }
        break;
      }
      case 'git': {
        if (!workspaceRoot) break;
        try {
          const { execSync } = require('child_process');
          // Check if it's a git repo first
          try {
            execSync('git rev-parse --is-inside-work-tree', { cwd: workspaceRoot, encoding: 'utf-8', stdio: 'ignore' });
          } catch {
            this.postMessage({ type: 'error', text: '当前工作区不是 Git 仓库' });
            return;
          }
          // Get changed files
          const diff = execSync('git diff --name-only HEAD', { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
          const staged = execSync('git diff --name-only --cached', { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
          const untracked = execSync('git ls-files --others --exclude-standard', { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
          const changes = [...new Set([
            ...diff.split('\n').filter(Boolean),
            ...staged.split('\n').filter(Boolean),
            ...untracked.split('\n').filter(Boolean),
          ])];
          // Get recent commits
          const log = execSync('git log --oneline -20', { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
          const commits = log.split('\n').filter(Boolean).map((line: string) => {
            const [hash, ...rest] = line.split(' ');
            return { hash, message: rest.join(' ') };
          });
          // Send data to webview
          this.postMessage({ type: 'gitData', changes, commits });
        } catch (err: any) {
          this.postMessage({ type: 'error', text: `Git 错误: ${err.message}` });
        }
        break;
      }
    }

    if (files.length > 0) {
      this.postMessage({ type: 'filePickerResult', files });
    }
  }

  private _pendingTerminalContent?: string;
  private _pendingGitContents?: Record<string, string>;

  // ── Skills Management ──

  private getSkillDirs(): string[] {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return [];
    return ['.claude/skills', '.agents/skills', '.opencode/skills'].map(d => path.join(workspaceRoot, d));
  }

  private handleSkillsList() {
    const skills: Array<{ name: string; path: string; dir: string; description: string; builtin?: boolean }> = [];
    const allDirs: string[] = [];

    // Add built-in skills
    const builtinSkills = loadBuiltinSkills();
    for (const bs of builtinSkills) {
      skills.push({
        name: bs.name,
        path: bs.path,
        dir: '内置',
        description: bs.description,
        builtin: true,
      });
    }

    // Add project skills
    for (const dir of this.getSkillDirs()) {
      allDirs.push(dir);
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFile = path.join(dir, entry.name, 'SKILL.md');
            if (fs.existsSync(skillFile)) {
              const content = fs.readFileSync(skillFile, 'utf-8');
              const meta = this.parseSkillMeta(content);
              skills.push({
                name: meta.name || entry.name,
                path: skillFile,
                dir: path.basename(path.dirname(dir)) + '/' + entry.name,
                description: meta.description || '',
              });
            }
          }
        }
      } catch { /* skip */ }
    }
    this.postMessage({ type: 'skills:list', skills: skills.reverse(), dirs: allDirs });
  }

  private parseSkillMeta(content: string): { name: string; description: string } {
    let name = '';
    let description = '';

    // Try YAML frontmatter: ---\nname: ...\ndescription: ...\n---
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fm = fmMatch[1];
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    // Fallback: # Title + first paragraph
    if (!name) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) name = titleMatch[1].trim();
    }
    if (!description) {
      // Find first non-empty paragraph after title
      const lines = content.split('\n');
      let foundTitle = false;
      for (const line of lines) {
        if (line.startsWith('#')) { foundTitle = true; continue; }
        if (foundTitle && line.trim() && !line.startsWith('#') && !line.startsWith('---')) {
          description = line.trim().substring(0, 120);
          break;
        }
      }
    }

    return { name, description };
  }

  private handleSkillsGet(skillPath: string) {
    try {
      // Check if it's a built-in skill
      const builtinContent = getBuiltinSkillContent(skillPath);
      if (builtinContent) {
        this.postMessage({ type: 'skills:content', path: skillPath, content: builtinContent });
        return;
      }
      const content = fs.readFileSync(skillPath, 'utf-8');
      this.postMessage({ type: 'skills:content', path: skillPath, content });
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `读取失败: ${err.message}` });
    }
  }

  private handleSkillsSave(skillPath: string, content: string) {
    try {
      fs.writeFileSync(skillPath, content, 'utf-8');
      this.postMessage({ type: 'skills:saved', path: skillPath });
      this.postMessage({ type: 'toast', level: 'success', text: '保存成功' });
      log(`Skill saved: ${skillPath}`);
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `保存失败: ${err.message}` });
    }
  }

  private handleSkillsCreate(name: string, dir: string, description?: string) {
    try {
      const skillDir = path.join(dir, name);
      fs.mkdirSync(skillDir, { recursive: true });
      const skillFile = path.join(skillDir, 'SKILL.md');
      const desc = description || 'Describe what this skill does.';
      const content = `---
name: ${name}
description: ${desc}
---

# ${name}

## Description

${desc}

## Trigger

Describe when this skill should be activated.

## Usage

Describe how to use this skill.

## Examples

\`\`\`
Example usage here
\`\`\`
`;
      fs.writeFileSync(skillFile, content, 'utf-8');
      this.postMessage({ type: 'skills:created', name, path: skillFile });
      this.postMessage({ type: 'toast', level: 'success', text: `Skill "${name}" 创建成功` });
      log(`Skill created: ${skillFile}`);
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `创建失败: ${err.message}` });
    }
  }

  private handleSkillsDelete(skillPath: string) {
    try {
      const skillDir = path.dirname(skillPath);
      fs.rmSync(skillDir, { recursive: true, force: true });
      this.postMessage({ type: 'skills:deleted', path: skillPath });
      this.postMessage({ type: 'toast', level: 'success', text: '删除成功' });
      log(`Skill deleted: ${skillPath}`);
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `删除失败: ${err.message}` });
    }
  }

  private readDirRecursive(dirPath: string, maxFiles = 50): Array<{ path: string; name: string }> {
    const results: Array<{ path: string; name: string }> = [];
    const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.vscode'];
    const skipExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz'];

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxFiles) break;
        if (skipDirs.includes(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.readDirRecursive(fullPath, maxFiles - results.length));
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (skipExts.includes(ext)) continue;
          // Skip binary files by size
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 100 * 1024) continue; // Skip files > 100KB
            results.push({ path: fullPath, name: entry.name });
          } catch { /* skip */ }
        }
      }
    } catch { /* skip unreadable dirs */ }

    return results;
  }

  private trackAssistantMessage(text: string, role: 'assistant' | 'error' = 'assistant') {
    this.chatHistory.push({
      id: this.nextMsgId++,
      role,
      text,
      timestamp: new Date().toLocaleTimeString(),
      thinkingText: this.pendingThinking || undefined,
      toolCalls: this.pendingToolCalls.length > 0 ? [...this.pendingToolCalls] : undefined,
    });
    this.pendingThinking = '';
    this.pendingToolCalls = [];
  }

  private feedbackFile = '';

  private getFeedbackFilePath(): string {
    if (!this.feedbackFile) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
      this.feedbackFile = path.join(workspaceRoot, '.vte', 'feedback.json');
    }
    return this.feedbackFile;
  }

  private loadFeedback(): Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }> {
    try {
      const filePath = this.getFeedbackFilePath();
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (e) {
      log(`Failed to load feedback: ${e}`);
    }
    return [];
  }

  private saveFeedback(feedback: Array<{ userMessage: string; assistantMessage: string; rating: 'up' | 'down'; comment?: string; timestamp: string }>) {
    try {
      const filePath = this.getFeedbackFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(feedback, null, 2));
      log(`Feedback saved (${feedback.length} entries)`);
    } catch (e) {
      log(`Failed to save feedback: ${e}`);
    }
  }

  private handleFeedback(messageId: number, rating: 'up' | 'down', userMessage: string, assistantMessage: string, comment?: string) {
    const feedback = this.loadFeedback();
    feedback.push({
      userMessage,
      assistantMessage,
      rating,
      comment,
      timestamp: new Date().toISOString(),
    });
    // Keep only last 50 feedback entries
    if (feedback.length > 50) {
      feedback.splice(0, feedback.length - 50);
    }
    this.saveFeedback(feedback);
    // Pass feedback to engine for next LLM call
    this.engine?.setFeedback(feedback);
    log(`Feedback recorded: ${rating} for message #${messageId}`);
  }

  /**
   * Strip <system-reminder> tags from response.
   * These are for LLM context only, not for user display.
   */
  private stripSystemReminder(text: string): string {
    // Remove <system-reminder>...</system-reminder> blocks
    return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  }

  // ── Session Management Methods ──

  private getSessionManager(): SessionManager | undefined {
    if (this.sessionManager) return this.sessionManager;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return undefined;

    this.sessionManager = new SessionManager(workspaceRoot);
    return this.sessionManager;
  }

  private async createSession(name?: string) {
    const sm = this.getSessionManager();
    if (!sm) {
      this.postMessage({ type: 'session:error', text: '没有打开的工作区' });
      return;
    }

    try {
      // Get current model from the active profile
      const model = this.getActiveCredentials().model;

      const session = await sm.createSession(name, model);
      this.currentSessionId = session.id;
      this.postMessage({ type: 'session:created', session });
      log(`Session created: ${session.id} (model: ${model})`);
    } catch (err: any) {
      log(`Failed to create session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `创建失败: ${err.message}` });
    }
  }

  private async listSessions() {
    const sm = this.getSessionManager();
    if (!sm) {
      this.postMessage({ type: 'session:list', sessions: [] });
      return;
    }

    try {
      const sessions = await sm.listSessions();
      this.postMessage({ type: 'session:list', sessions });
    } catch (err: any) {
      log(`Failed to list sessions: ${err.message}`);
      this.postMessage({ type: 'session:list', sessions: [] });
    }
  }

  private async getSession(sessionId: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      const session = await sm.getSession(sessionId);
      if (session) {
        this.postMessage({ type: 'session:data', session });
      } else {
        this.postMessage({ type: 'session:error', text: '会话不存在' });
      }
    } catch (err: any) {
      log(`Failed to get session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `获取失败: ${err.message}` });
    }
  }

  private async restoreSession(sessionId: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      const session = await sm.getSession(sessionId);
      if (!session) {
        this.postMessage({ type: 'session:error', text: '会话不存在' });
        return;
      }

      // Restore chat history
      this.chatHistory = session.messages.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        thinkingText: m.thinkingText,
        images: m.images,
        context: m.context,
        toolCalls: m.toolCalls,
      }));
      this.nextMsgId = this.chatHistory.length > 0
        ? Math.max(...this.chatHistory.map(m => m.id)) + 1
        : 0;

      // Restore engine state if available
      if (this.engine && session.metadata.checkpointId) {
        this.engine.restoreCheckpoint(session.metadata.checkpointId);
      }

      this.currentSessionId = sessionId;
      this.postMessage({ type: 'session:restored', sessionId });
      this.postMessage({ type: 'chatHistory', messages: this.chatHistory });
      log(`Session restored: ${sessionId}`);
    } catch (err: any) {
      log(`Failed to restore session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `恢复失败: ${err.message}` });
    }
  }

  private async deleteSession(sessionId: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      await sm.deleteSession(sessionId);
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = undefined;
      }
      this.postMessage({ type: 'session:deleted', sessionId });
      log(`Session deleted: ${sessionId}`);
    } catch (err: any) {
      log(`Failed to delete session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `删除失败: ${err.message}` });
    }
  }

  private async deleteAllSessions() {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      const sessions = await sm.listSessions();
      for (const session of sessions) {
        await sm.deleteSession(session.id);
      }
      this.currentSessionId = undefined;
      this.postMessage({ type: 'session:deleted', sessionId: 'all' });
      this.postMessage({ type: 'toast', level: 'success', text: `已清空 ${sessions.length} 个会话` });
      log(`All sessions deleted: ${sessions.length}`);
    } catch (err: any) {
      log(`Failed to delete all sessions: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `清空失败: ${err.message}` });
    }
  }

  private async renameSession(sessionId: string, name: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      await sm.updateSession(sessionId, { name });
      this.postMessage({ type: 'session:renamed', sessionId, name });
    } catch (err: any) {
      log(`Failed to rename session: ${err.message}`);
    }
  }

  private async tagSession(sessionId: string, tags: string[]) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      await sm.updateSession(sessionId, { tags });
      this.postMessage({ type: 'session:tagged', sessionId, tags });
    } catch (err: any) {
      log(`Failed to tag session: ${err.message}`);
    }
  }

  private async searchSessions(query: string) {
    const sm = this.getSessionManager();
    if (!sm) {
      this.postMessage({ type: 'session:searchResult', sessions: [] });
      return;
    }

    try {
      const sessions = await sm.searchSessions(query);
      this.postMessage({ type: 'session:searchResult', sessions });
    } catch (err: any) {
      log(`Failed to search sessions: ${err.message}`);
      this.postMessage({ type: 'session:searchResult', sessions: [] });
    }
  }

  private async exportSession(sessionId: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      const data = await sm.exportSession(sessionId);
      this.postMessage({ type: 'session:exported', sessionId, data });
      log(`Session exported: ${sessionId}`);
    } catch (err: any) {
      log(`Failed to export session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `导出失败: ${err.message}` });
    }
  }

  private async importSession(data: string) {
    const sm = this.getSessionManager();
    if (!sm) return;

    try {
      const session = await sm.importSession(data);
      this.postMessage({ type: 'session:imported', session });
      log(`Session imported: ${session.id}`);
    } catch (err: any) {
      log(`Failed to import session: ${err.message}`);
      this.postMessage({ type: 'session:error', text: `导入失败: ${err.message}` });
    }
  }

  private async autoSaveSession() {
    const sm = this.getSessionManager();
    if (!sm || !this.currentSessionId) return;

    try {
      // Convert chatHistory to ChatMessage format
      const messages: ChatMessage[] = this.chatHistory.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'error',
        text: m.text,
        timestamp: m.timestamp,
        thinkingText: m.thinkingText,
        images: m.images,
        context: m.context,
        toolCalls: m.toolCalls,
      }));

      // Get token usage
      const stats = getSessionStats();

      // Get model from the active profile
      const model = this.getActiveCredentials().model;

      await sm.autoSave(this.currentSessionId, {
        messages,
        model,
        tokenUsage: {
          prompt: stats.totalPrompt,
          completion: stats.totalCompletion,
        },
      });
    } catch (err: any) {
      log(`Auto-save failed: ${err.message}`);
    }
  }

  private getWebviewHtml(): string {
    const webviewPath = path.join(this.extensionUri.fsPath, 'out', 'webview');
    const htmlPath = path.join(webviewPath, 'index.html');

    if (!fs.existsSync(htmlPath)) {
      log(`ERROR: Webview HTML not found at: ${htmlPath}`);
      return `<html><body style="background:#1e1e1e;color:#ccc;padding:20px;font-family:sans-serif;">
        <h2>VTE Agent</h2><p>Webview build output not found. Run: npm run build:webview</p>
        <p>Expected path: ${htmlPath}</p></body></html>`;
    }

    let html = fs.readFileSync(htmlPath, 'utf-8');
    log(`Webview HTML loaded from: ${htmlPath} (${html.length} chars)`);
    return html;
  }

  private async handleChat(text: string, model?: string, temperature?: number, topP?: number, maxTokens?: number, images?: Array<{ name: string; dataUrl: string; mimeType: string }>, context?: Array<{ path: string; name: string }>) {
    log(`[DEBUG] handleChat START: text="${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" model=${model} temp=${temperature} topP=${topP} maxTokens=${maxTokens} images=${images?.length || 0}`);

    // Auto-create session if none exists
    if (!this.currentSessionId) {
      log(`[DEBUG] No currentSessionId, attempting auto-create session`);
      const sm = this.getSessionManager();
      if (sm) {
        const sessionModel = model || this.getActiveCredentials().model;
        log(`[DEBUG] Session manager found, creating session with model=${sessionModel}`);
        try {
          const session = await sm.createSession(undefined, sessionModel);
          this.currentSessionId = session.id;
          log(`[DEBUG] Auto-created session: ${session.id}`);
        } catch (sessionErr: any) {
          log(`[DEBUG] ERROR creating session: ${sessionErr.message}`);
          log(`[DEBUG] Stack: ${sessionErr.stack}`);
          this.postMessage({ type: 'error', text: `Failed to create session: ${sessionErr.message}` });
          return;
        }
      } else {
        log(`[DEBUG] WARNING: No session manager available, proceeding without session`);
      }
    } else {
      log(`[DEBUG] Using existing session: ${this.currentSessionId}`);
    }

    // ── Auto-delegation: route complex requests to the multi-agent system ──
    // A lightweight router LLM decides whether the request needs several
    // specialized agents (dev/test/review/doc). If so, we decompose, run
    // the sub-agents in parallel, then synthesize their results back into
    // THIS main chat — instead of answering directly.
    //
    // Set vteCode.forceMultiAgent=true in settings to force-delegate every
    // message (useful for testing / debugging the multi-agent flow).
    //
    // forceMultiAgent is the master switch for multi-agent delegation:
    //   false (default) → every message goes through normal single-agent chat.
    //                     The legacy LLM-router (shouldDelegate) is no longer
    //                     consulted — its auto-routing was too aggressive and
    //                     surprising to users (router LLM would say YES for
    //                     most prompts).
    //   true            → every message is force-delegated, bypassing any
    //                     routing decision.
    if (this.forceMultiAgent) {
      log(`[VTE] Force-delegating request to multi-agent system (forceMultiAgent=on)`);
      await this.delegateToMultiAgent(text, model);
      return;
    }

    if (!this.engine) {
      log(`[DEBUG] No engine, creating new one`);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this.postMessage({ type: 'error', text: 'No workspace open' });
        log('[DEBUG] ERROR: No workspace open');
        return;
      }
      const config = vscode.workspace.getConfiguration('vteCode');
      const { apiKey, apiBase, model: cfgModel } = this.getActiveCredentials();
      log(`[DEBUG] Config: apiKey=${apiKey ? '***set***' : 'EMPTY'} apiBase=${apiBase} cfgModel=${cfgModel} workspace=${workspaceRoot}`);
      if (!apiKey) {
        this.postMessage({ type: 'showSettings' });
        this.postMessage({ type: 'error', text: '请先配置 API Key' });
        log('[DEBUG] ERROR: No API key configured');
        return;
      }
      log(`[DEBUG] Creating engine: model=${model || cfgModel} base=${apiBase}`);
      try {
        const ctx = new VTEContextManager(workspaceRoot);
        this.engine = new AgentEngine(ctx, model || cfgModel, apiKey, apiBase, workspaceRoot);
        this.engine.setReasoningLevel(this.reasoningLevel);
        this.engine.setPermissionConfig(this.permissionConfig as any);

        // Apply API protocol + thinking style from the active model profile.
        // Falls back to 'chat' + 'auto' (style is inferred from the model name).
        const profiles = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses'; thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto'; contextWindow?: number; capability?: ModelCapability }>>('models', []);
        const activeIdx = config.get<number>('activeModelIndex', 0);
        const activeProfile = profiles[activeIdx];
        // Smart-default the protocol when the profile doesn't set `api`:
        // infer from (base URL + model), with the profile's own endpoint/model
        // taking priority, then fall back to the top-level config.
        const resolvedModel = activeProfile?.model || model || cfgModel;
        const resolvedBase = activeProfile?.apiBase || apiBase;
        const resolvedProtocol = resolveApiProtocol(activeProfile?.api, resolvedModel, resolvedBase);
        this.engine.setApiProtocol(resolvedProtocol);
        this.engine.setThinkingStyle(activeProfile?.thinkingStyle || 'auto');
        // Model-aware context window: explicit profile value wins, else engine infers from model name.
        this.engine.setContextWindow(activeProfile?.contextWindow);
        // Normalized params flow through ONE schema; capability gates which
        // native request fields are emitted per model family.
        this.engine.setCapability(activeProfile?.capability ?? inferCapability(resolvedModel));
        log(`[DEBUG] Engine created: protocol=${resolvedProtocol}${activeProfile?.api ? '' : ' (auto)'} thinkingStyle=${activeProfile?.thinkingStyle || 'auto'} model=${resolvedModel} base=${resolvedBase}`);

        // Initialize host adapter for tools
        const messaging = new VSCodeMessaging();
        const host = new VSCodeHostAdapter(messaging);
        setHost(host);

        // Load and register LSP tools from host adapter
        await host.loadLspTools();
        if (host.lspTools.length > 0) {
          registerTools(host.lspTools);
          log(`[DEBUG] Loaded ${host.lspTools.length} LSP tools from host adapter`);
        }

        // Listen to LSP stats changes and send to webview
        const lspService = getCodeIntelligenceService(workspaceRoot);
        lspService.onStatsChange((stats) => {
          this.postMessage({
            type: 'lsp:statsUpdate',
            stats: {
              totalCalls: stats.totalCalls,
              cacheHits: stats.cacheHits,
              cacheMisses: stats.cacheMisses,
              callsByLanguage: stats.callsByLanguage,
            }
          });
        });
        // Load existing feedback for calibration
        const existingFeedback = this.loadFeedback();
        if (existingFeedback.length > 0) {
          this.engine.setFeedback(existingFeedback);
          log(`[DEBUG] Loaded ${existingFeedback.length} feedback entries`);
        }
        this.engine.onViewUpdate = (update) => {
          if (update.type === 'thinking_chunk') {
            this.pendingThinking += update.text as string;
          } else if (update.type === 'thinking_start') {
            // New thinking phase — forward to webview to create new streaming message
            this.postMessage({ type: 'thinking' });
          } else if (update.type === 'tool_call') {
            this.pendingToolCalls.push({
              id: update.toolCallId as string,
              name: update.name as string,
              arguments: update.arguments as Record<string, unknown>,
              status: 'running',
            });
          } else if (update.type === 'tool_result') {
            const tc = this.pendingToolCalls.find(t => t.id === (update.toolCallId as string));
            if (tc) {
              tc.status = (update.elapsed as number) < 0 ? 'error' : 'done';
              tc.result = update.result as string;
              tc.elapsed = Math.abs(update.elapsed as number);
              // Push tasks immediately after task tool execution for real-time UI update
              if (tc.name?.startsWith('task_')) {
                this.pushTasks();
              }
            }
          } else if (update.type === 'permission_request') {
            // Forward permission request to webview
            this._pendingPermissionTool = update.toolName as string;
            this.postMessage({
              type: 'permissionRequest',
              requestId: update.requestId as string,
              toolName: update.toolName as string,
              toolArgs: update.toolArgs as Record<string, unknown>,
              category: update.category as string,
            });
          } else if (update.type === 'question_request') {
            // Forward question request to webview
            this.postMessage({
              type: 'questionRequest',
              requestId: update.requestId as string,
              question: update.question as string,
              options: update.options as Array<{ label: string; description?: string }>,
              multiple: update.multiple as boolean,
              recommended: update.recommended as string | undefined,
            });
          }
          this.postMessage(update);
        };
      } catch (engineErr: any) {
        log(`[DEBUG] ERROR creating engine: ${engineErr.message}`);
        log(`[DEBUG] Stack: ${engineErr.stack}`);
        this.postMessage({ type: 'error', text: `Failed to create engine: ${engineErr.message}` });
        return;
      }
    } else {
      log(`[DEBUG] Using existing engine`);
    }
    if (model) { this.engine.setModel(model); }

    this.pendingThinking = '';
    // thinking message is now sent by engine's thinking_start event before each LLM call
    try {
      // Read file contents for context attachments
      let enrichedContext: Array<{ path: string; name: string; content: string }> | undefined;
      if (context && context.length > 0) {
        enrichedContext = [];
        for (const ctx of context) {
          try {
            let content: string;
            if (ctx.path === '__terminal_output__') {
              content = this._pendingTerminalContent || '(empty)';
              this._pendingTerminalContent = undefined;
              enrichedContext.push({ path: ctx.path, name: ctx.name, content });
            } else if (ctx.path.startsWith('builtin:')) {
              // Built-in skill
              const builtinContent = getBuiltinSkillContent(ctx.path);
              if (builtinContent) {
                enrichedContext.push({ path: ctx.path, name: ctx.name, content: builtinContent });
                log(`Read builtin skill: ${ctx.name} (${builtinContent.length} chars)`);
              }
            } else if (ctx.path.startsWith('__git_commit__:')) {
              const commitHash = ctx.path.replace('__git_commit__:', '');
              content = this._pendingGitContents?.[commitHash] || '(empty)';
              enrichedContext.push({ path: ctx.path, name: ctx.name, content });
            } else if (fs.statSync(ctx.path).isDirectory()) {
              // Recursively read directory contents
              const files = this.readDirRecursive(ctx.path);
              for (const file of files) {
                try {
                  const fileContent = fs.readFileSync(file.path, 'utf-8');
                  enrichedContext.push({ path: file.path, name: file.name, content: fileContent });
                  log(`Read context: ${file.name} (${fileContent.length} chars)`);
                } catch { /* skip unreadable files */ }
              }
            } else {
              content = fs.readFileSync(ctx.path, 'utf-8');
              enrichedContext.push({ path: ctx.path, name: ctx.name, content });
              log(`Read context: ${ctx.name} (${content.length} chars)`);
            }
          } catch (err: any) {
            log(`Failed to read context ${ctx.name}: ${err.message}`);
          }
        }
      }
      const rawReply = await this.engine.chat(text, { temperature, topP, maxTokens }, images, enrichedContext);
      // Strip <system-reminder> tags — these are for LLM context only, not for display
      let reply = this.stripSystemReminder(rawReply);
      // Extract <next_step> suggestion — only accept actionable steps, reject questions
      const nextStepMatch = reply.match(/<next_step>(.*?)<\/next_step>/);
      let nextStepSuggestion = '';
      if (nextStepMatch) {
        const raw = nextStepMatch[1].trim();
        // Reject if it contains question marks or looks like a question
        const isQuestion = /[？?]|告诉|告诉我|你的需求|请告诉|需要.*吗|想要|你想/.test(raw);
        if (!isQuestion && raw.length > 0 && raw.length <= 20) {
          nextStepSuggestion = raw;
        }
        reply = reply.replace(/<next_step>.*?<\/next_step>/g, '').trim();
      }
      log(`Response: "${reply.substring(0, 200)}${reply.length > 200 ? '...' : ''}"`);
      this.trackAssistantMessage(reply);
      this.postMessage({ type: 'response', text: reply });
      if (nextStepSuggestion) {
        this.postMessage({ type: 'nextStep', suggestion: nextStepSuggestion });
      }
      this.pushTasks();
      this.pushTokenStats();
      // Auto-save session
      await this.autoSaveSession();
    } catch (err: any) {
      log(`ERROR: ${err.message}`);
      // Clean up error message
      let errorMsg = err.message || 'Unknown error';
      // Remove system-reminder tags (non-greedy)
      errorMsg = errorMsg.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
      // Remove any remaining HTML/XML tags
      errorMsg = errorMsg.replace(/<[^>]+>/g, '');
      // Try to extract message from JSON error
      const jsonMatch = errorMsg.match(/"message"\s*:\s*"([^"]+)"/);
      if (jsonMatch) {
        errorMsg = jsonMatch[1];
      }
      // Clean up extra whitespace
      errorMsg = errorMsg.replace(/\s+/g, ' ').trim();
      // Truncate if too long
      if (errorMsg.length > 300) {
        errorMsg = errorMsg.substring(0, 300) + '...';
      }
      this.postMessage({ type: 'response', text: `⚠️ ${errorMsg}` });
    }
  }

  private async saveModels(models: Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses'; thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto' }>, activeModelIndex: number, subAgentTimeout?: number, forceMultiAgent?: boolean, mode?: string, taskMode?: string, temperature?: number, topP?: number, maxTokens?: number) {
    const config = vscode.workspace.getConfiguration('vteCode');
    await config.update('models', models, vscode.ConfigurationTarget.Global);
    await config.update('activeModelIndex', activeModelIndex, vscode.ConfigurationTarget.Global);
    // Persist host-agnostic config. It lives in our own globalState
    // bucket, NOT in the native settings schema, so writes never get
    // silently dropped (and never show in the VSCode Settings UI).
    if (typeof subAgentTimeout === 'number') {
      this.subAgentTimeout = subAgentTimeout;
      await this.globalState.update('vte.subAgentTimeout', subAgentTimeout);
    }
    if (typeof forceMultiAgent === 'boolean') {
      this.forceMultiAgent = forceMultiAgent;
      await this.globalState.update('vte.forceMultiAgent', forceMultiAgent);
    }
    // Behavior + sampling settings (行为 / 高级 tabs). These MUST be
    // persisted too, otherwise a webview reload resets them to defaults.
    if (typeof mode === 'string') {
      this.mode = mode as AgentMode;
      await this.globalState.update('vte.mode', mode);
    }
    if (typeof taskMode === 'string') {
      this.taskMode = taskMode;
      await this.globalState.update('vte.taskMode', taskMode);
    }
    if (typeof temperature === 'number') {
      this.temperature = temperature;
      await this.globalState.update('vte.temperature', temperature);
    }
    if (typeof topP === 'number') {
      this.topP = topP;
      await this.globalState.update('vte.topP', topP);
    }
    if (typeof maxTokens === 'number') {
      this.maxTokens = maxTokens;
      await this.globalState.update('vte.maxTokens', maxTokens);
    }

    this.engine = undefined;
    log(`Models saved: ${models.length} profiles, active=${activeModelIndex}`);
    this.postMessage({ type: 'configSaved' });
  }

  private async switchModel(index: number) {
    const config = vscode.workspace.getConfiguration('vteCode');
    await config.update('activeModelIndex', index, vscode.ConfigurationTarget.Global);

    const models = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses'; thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto' }>>('models', []);
    const active = models[index];

    this.engine = undefined;
    log(`Switched to model: ${active?.name || index}`);
  }

  // ── Permission Management ──

  private handleGetPermissionConfig() {
    const config = this.engine?.getPermissionConfig() || {};
    this.postMessage({ type: 'permissionConfig', config });
  }

  private handleSetPermissionConfig(config: Record<string, string>) {
    // Persist the permission policy to globalState (not just engine memory)
    // so it survives a webview refresh — previously it was engine-only and
    // reverted to the "询问" default on reload.
    this.permissionConfig = { ...this.permissionConfig, ...config };
    void this.globalState.update('vte.permissionConfig', this.permissionConfig);
    if (this.engine) {
      this.engine.setPermissionConfig(this.permissionConfig as any);
      log(`Permission config updated: ${JSON.stringify(this.permissionConfig)}`);
    }
  }

  private handlePermissionResponse(requestId: string, decision: 'allow_once' | 'always_allow' | 'deny') {
    if (this.engine) {
      // Find the tool name from the pending request (stored in onViewUpdate handler)
      const toolName = this._pendingPermissionTool;
      this.engine.resolvePermission(decision, toolName);
      log(`Permission decision: ${decision} for ${toolName || 'unknown'}`);
    }
  }

  private _pendingPermissionTool = '';

  private handleQuestionResponse(requestId: string, answer: string) {
    if (this.engine) {
      this.engine.resolveQuestion(answer);
      log(`Question answered: ${answer || '(cancelled)'}`);
    }
  }

  // ── LSP Management ──

  private async handleGetLspProfiles() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    console.log('[VTE-LSP] handleGetLspProfiles workspaceRoot:', workspaceRoot);
    if (!workspaceRoot) {
      console.log('[VTE-LSP] No workspace root, sending empty profiles');
      this.postMessage({ type: 'lspProfiles', profiles: {} });
      return;
    }

    try {
      const resolver = getConfigurationResolver(workspaceRoot);
      const config = await resolver.reloadConfig();
      const profiles: Record<string, any> = {};
      for (const [langId, profile] of config.profiles) {
        profiles[langId] = profile;
      }
      const keys = Object.keys(profiles);
      console.log(`[VTE-LSP] handleGetLspProfiles sending ${keys.length} profiles:`, keys);
      this.postMessage({ type: 'lspProfiles', profiles });
    } catch (error) {
      console.error('[VTE-LSP] Failed to get LSP profiles:', error);
      this.postMessage({ type: 'lspProfiles', profiles: {} });
    }
  }

  private async handleGetLspConfigEditorData() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    console.log('[VTE-LSP] handleGetLspConfigEditorData workspaceRoot:', workspaceRoot);
    if (!workspaceRoot) {
      this.postMessage({ type: 'lspConfigEditor:data', profiles: {} });
      return;
    }

    try {
      const resolver = getConfigurationResolver(workspaceRoot);
      const config = await resolver.reloadConfig();
      const profiles: Record<string, any> = {};
      for (const [langId, profile] of config.profiles) {
        profiles[langId] = profile;
      }
      const keys = Object.keys(profiles);
      console.log(`[VTE-LSP] handleGetLspConfigEditorData sending ${keys.length} profiles:`, keys);
      this.postMessage({ type: 'lspConfigEditor:data', profiles });
    } catch (error) {
      console.error('[VTE-LSP] Failed to get LSP config editor data:', error);
      this.postMessage({ type: 'lspConfigEditor:data', profiles: {} });
    }
  }

  private handleLspSetup() {
    // Execute the setup wizard command
    vscode.commands.executeCommand('vteAgent.setupLsp');
  }

  private handleLspTest() {
    console.log('[VTE] handleLspTest called');
    // Test LSP by running a simple definition lookup on current file
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      console.log('[VTE] No active editor');
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const document = editor.document;
    const position = editor.selection.active;
    console.log(`[VTE] Testing LSP at ${document.fileName}:${position.line + 1}`);

    vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      document.uri,
      position
    ).then(
      (locations) => {
        const count = locations?.length ?? 0;
        console.log(`[VTE] LSP test result: ${count} definitions found`);
        if (count > 0) {
          const firstLoc = locations![0];
          const filePath = vscode.workspace.asRelativePath(firstLoc.uri);
          const line = firstLoc.range?.start?.line ?? 0;
          const msg = `LSP: Found ${count} definition(s) at ${filePath}:${line + 1}`;
          vscode.window.showInformationMessage(msg);
          this.postMessage({
            type: 'lsp:testResult',
            success: true,
            message: msg
          });
        } else {
          const msg = `LSP: No definition found at cursor position (normal for keywords/literals)`;
          vscode.window.showInformationMessage(msg);
          this.postMessage({
            type: 'lsp:testResult',
            success: true,
            message: msg
          });
        }
      },
      (error) => {
        console.log(`[VTE] LSP test error: ${error.message}`);
        vscode.window.showErrorMessage(`LSP test failed: ${error.message}`);
        this.postMessage({
          type: 'lsp:testResult',
          success: false,
          message: `LSP test failed: ${error.message || error}`
        });
      }
    );
  }

  private async handleLspRefreshStatus() {
    console.log('[VTE] LSP refresh status');
    vscode.window.showInformationMessage('LSP status refreshed');
    // Send updated profiles to webview
    await this.handleGetLspProfiles();
  }

  private handleLspClearCache() {
    console.log('[VTE] LSP clear cache');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    if (workspaceRoot) {
      const service = getCodeIntelligenceService(workspaceRoot);
      service.clearCache();
    }
    vscode.window.showInformationMessage('LSP cache cleared');
    this.postMessage({ type: 'lsp:cacheStats', stats: { size: 0 } });
  }

  private async handleLspConfigSave(profile: any) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    console.log('[VTE-LSP] handleLspConfigSave workspaceRoot:', workspaceRoot, 'profile:', profile?.languageId);
    if (!workspaceRoot) return;

    const configPath = path.join(workspaceRoot, '.github', 'agent-lsp.json');
    const dirUri = vscode.Uri.file(path.join(workspaceRoot, '.github'));
    const configUri = vscode.Uri.file(configPath);
    console.log('[VTE] handleLspConfigSave configPath:', configPath);

    try {
      // Ensure directory exists
      try {
        await vscode.workspace.fs.stat(dirUri);
      } catch {
        await vscode.workspace.fs.createDirectory(dirUri);
      }

      // Read existing config or use default
      let config: any = { version: 1, profiles: {}, deleted: [] };
      try {
        const content = await vscode.workspace.fs.readFile(configUri);
        config = JSON.parse(Buffer.from(content).toString('utf-8'));
        if (!Array.isArray(config.deleted)) {
          config.deleted = [];
        }
      } catch {
        // Use default config
      }

      config.profiles[profile.languageId] = {
        tools: profile.tools,
        strategy: profile.strategy,
        fileExtensions: profile.fileExtensions,
        timeoutMs: profile.timeoutMs,
        command: profile.command,
        args: profile.args,
      };

      // Remove from deleted list so resolver doesn't re-delete it
      if (Array.isArray(config.deleted)) {
        const delIdx = config.deleted.indexOf(profile.languageId);
        if (delIdx !== -1) {
          config.deleted.splice(delIdx, 1);
        }
      }

      const data = Buffer.from(JSON.stringify(config, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(configUri, data);
      console.log('[VTE-LSP] handleLspConfigSave file written, profiles:', Object.keys(config.profiles));
      this.postMessage({ type: 'lspConfigEditor:saved', languageId: profile.languageId });
      console.log('[VTE-LSP] handleLspConfigSave calling handleGetLspProfiles');
      await this.handleGetLspProfiles();
      console.log('[VTE-LSP] handleLspConfigSave handleGetLspProfiles done');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[VTE] handleLspConfigSave error:', error);
      vscode.window.showErrorMessage(`Failed to save profile: ${msg}`);
    }
  }

  private async handleLspConfigDelete(languageId: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    if (!workspaceRoot) return;

    const configPath = path.join(workspaceRoot, '.github', 'agent-lsp.json');
    const configUri = vscode.Uri.file(configPath);

    try {
      let config: any = { version: 1, profiles: {}, deleted: [] };
      try {
        const content = await vscode.workspace.fs.readFile(configUri);
        config = JSON.parse(Buffer.from(content).toString('utf-8'));
        if (!Array.isArray(config.deleted)) {
          config.deleted = [];
        }
      } catch {
        return;
      }

      delete config.profiles[languageId];

      if (!config.deleted.includes(languageId)) {
        config.deleted.push(languageId);
      }

      const data = Buffer.from(JSON.stringify(config, null, 2), 'utf-8');
      await vscode.workspace.fs.writeFile(configUri, data);
      this.postMessage({ type: 'lspConfigEditor:deleted', languageId });
      await this.handleGetLspProfiles();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to delete profile: ${msg}`);
    }
  }

  private async handleLspConfigAdd(profile: any) {
    console.log('[VTE-LSP] handleLspConfigAdd called, profile:', JSON.stringify(profile));
    await this.handleLspConfigSave(profile);
  }

  // ── Command Handlers (called from extension.ts) ──

  public async handleNewSession() {
    const sm = this.getSessionManager();
    if (sm) {
      try {
        const model = this.getActiveCredentials().model;
        const session = await sm.createSession(undefined, model);
        this.currentSessionId = session.id;
        this.chatHistory = [];
        this.engine?.clearHistory();
        this.postMessage({ type: 'chatHistory', messages: [] });
        this.postMessage({ type: 'session:created', session: { id: session.id, name: session.name, tags: [], createdAt: session.createdAt, updatedAt: session.updatedAt, messageCount: 0, model, tokenUsage: { prompt: 0, completion: 0 } } });
        log(`New session created: ${session.id}`);
      } catch (err: any) {
        log(`Failed to create session: ${err.message}`);
        this.postMessage({ type: 'error', text: `创建会话失败: ${err.message}` });
      }
    }
  }

  public handleClear() {
    this.engine?.clearHistory();
    this.chatHistory = [];
    this.postMessage({ type: 'cleared' });
    log('History cleared');
  }

  private sendConfig() {
    const config = vscode.workspace.getConfiguration('vteCode');
    const models = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses'; thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto' }>>('models', []);
    const activeModelIndex = config.get<number>('activeModelIndex', 0);
    // Host-agnostic config: read from globalState (private to this extension,
    // not in the VSCode Settings UI). The values were written by saveModels
    // via this.globalState.update().
    this.subAgentTimeout = this.globalState.get<number>('vte.subAgentTimeout', 300);
    this.forceMultiAgent = this.globalState.get<boolean>('vte.forceMultiAgent', false);

    this.postMessage({
      type: 'configData',
      models: models.length > 0 ? models : [{
        name: 'Default',
        apiKey: '',
        apiBase: 'https://api.openai.com/v1',
        model: 'gpt-4',
      }],
      activeModelIndex: activeModelIndex,
      subAgentTimeout: this.subAgentTimeout,
      forceMultiAgent: this.forceMultiAgent,
      mode: this.mode,
      taskMode: this.taskMode,
      temperature: this.temperature,
      topP: this.topP,
      maxTokens: this.maxTokens,
    });
    log(`Config sent: ${models.length} model profiles`);
  }

  private pushTasks() {
    const allTasks = getAllTasks().map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      subtasks: t.subtasks,
    }));
    this.postMessage({ type: 'tasks', tasks: allTasks });
  }

  private pushTokenStats() {
    const stats = getSessionStats();
    const recent = getRecentRecords(5).map(r => ({
      model: r.model,
      prompt: r.usage.promptTokens,
      completion: r.usage.completionTokens,
      total: r.usage.totalTokens,
      cost: r.usage.estimatedCost,
    }));
    this.postMessage({
      type: 'tokenStats',
      totalPrompt: stats.totalPrompt,
      totalCompletion: stats.totalCompletion,
      totalTokens: stats.totalTokens,
      totalCost: stats.totalCost,
      requestCount: stats.requestCount,
      perModel: stats.perModel,
      recent,
    });
  }

  private async handleRunTests() {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postMessage({ type: 'error', text: 'No workspace open' });
      return;
    }

    this.postMessage({ type: 'thinking' });
    log('Running gray-box tests...');

    try {
      const ctx = new VTEContextManager(workspaceRoot);
      const results = await runGrayBoxTests(ctx);

      // Send tool call results as separate messages for diff rendering
      // Small delay to ensure thinking message is processed
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const r of results) {
        if (r.scenario === 'edit_with_diff') {
          for (const step of r.steps) {
            if (step.args && step.result) {
              const toolCallId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
              // Send tool call
              this.postMessage({
                type: 'tool_call',
                toolCallId,
                name: step.tool,
                arguments: step.args,
              });
              // Send tool result
              this.postMessage({
                type: 'tool_result',
                toolCallId,
                result: step.result,
                elapsed: 0,
              });
            }
          }
        }
      }

      const report = formatTestResults(results);
      this.postMessage({ type: 'response', text: report });
      this.pushTasks();
    } catch (err: any) {
      log(`Test error: ${err.message}`);
      this.postMessage({ type: 'error', text: `Test error: ${err.message}` });
    }
  }

  // ── Multi-Agent Management ──

  private initMultiAgent() {
    if (this.agentPool) return; // Already initialized

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const messaging = new VSCodeMessaging();
    const host = new VSCodeHostAdapter(messaging);

    this.workOrderPool = new WorkOrderPool();
    this.agentCommunication = new AgentCommunication();
    this.agentPool = new AgentPool(host, this.workOrderPool, this.agentCommunication);

    // Set up scheduler with default config
    const scheduleConfig: ScheduleConfig = {
      mode: 'pool',
      maxConcurrent: 5,
      autoAssign: true,
    };
    this.scheduler = new Scheduler(this.agentPool, this.workOrderPool, scheduleConfig);

    // Forward agent updates to webview
    this.agentPool.onAgentUpdate = (agentId, update) => {
      this.postMessage({ type: 'multiAgent:agentUpdate', agentId, update });
      this.pushAgentStatuses();
    };
    // Auto-provisioned agents (spawned by the scheduler for parallelism)
    // need to show up in the dashboard immediately.
    this.agentPool.onAgentCreated = () => this.pushAgentStatuses();

    // Forward work order events to webview
    this.workOrderPool.onEvent((event) => {
      this.pushWorkOrders();
    });

    // Forward communication messages to webview
    this.agentCommunication.onBroadcast((msg) => {
      this.postMessage({
        type: 'multiAgent:agentMessage',
        agentId: msg.from,
        message: {
          id: Date.now(),
          role: 'system',
          text: `[${msg.from}] ${msg.type}: ${msg.content}`,
          timestamp: msg.timestamp,
        },
      });
    });

    log('Multi-agent system initialized');
  }

  private handleCreateAgent(roleId: string, model?: string, apiKey?: string, apiBase?: string, api?: string, thinkingStyle?: string, reasoningLevel?: string, isolation?: string) {
    this.initMultiAgent();
    if (!this.agentPool) return;

    const role = BUILTIN_ROLES.find(r => r.id === roleId);
    if (!role) {
      this.postMessage({ type: 'error', text: `Unknown role: ${roleId}` });
      return;
    }

    // Use provided config, falling back to the active model profile.
    const creds = this.getActiveCredentials();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    const agent = this.agentPool.createAgent(role, {
      model: model || creds.model,
      apiKey: apiKey || creds.apiKey,
      apiBase: apiBase || creds.apiBase,
      ...(api ? { api: api as 'chat' | 'responses' } : {}),
      ...(thinkingStyle ? { thinkingStyle: thinkingStyle as 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto' } : {}),
      ...(reasoningLevel ? { reasoningLevel: reasoningLevel as 'low' | 'medium' | 'high' } : {}),
      ...(isolation ? { isolation: isolation as 'shared' | 'snapshot' } : {}),
      workspaceRoot,
    });

    const agentApiKey = apiKey || creds.apiKey;
    if (!agentApiKey) {
      this.postMessage({ type: 'toast', level: 'warning', text: `${role.name} 已创建，但未配置 API Key。请在设置中配置。` });
    } else {
      this.postMessage({ type: 'toast', level: 'success', text: `${role.name} 已创建 (${agent.id})` });
    }

    log(`Created agent: ${agent.id} (${role.name})`);
    this.pushAgentStatuses();
  }

  private handleCreateOrder(title: string, description?: string, requiredRole?: string, dependencies?: string[], priority?: string, timeoutMs?: number) {
    this.initMultiAgent();
    if (!this.workOrderPool) return;

    const order = this.workOrderPool.create({
      title,
      description,
      requiredRole,
      dependencies,
      priority: priority as any || 'normal',
      timeoutMs,
    });
    log(`Created work order: ${order.id} (${title})`);
    this.postMessage({ type: 'toast', level: 'info', text: `工单已创建: ${title}` });
    this.pushWorkOrders();

    // Auto-schedule if scheduler is running
    if (this.scheduler) {
      this.scheduler.start();
    }
  }

  /**
   * Populate the dedicated AgentContextSystem from the MAIN agent's
   * current knowledge (project index + already-read files). Sub-agents then
   * retrieve this on demand via the `get_context` tool — we do NOT paste
   * it into their prompts (that would multiply tokens across every parallel
   * agent). The shared, cross-agent completed-work log lives in the system
   * too and is fed by AgentPool as sub-agents finish.
   */
  private async populateContextSystem(): Promise<void> {
    const sys = AgentContextSystem.instance
    sys.reset()
    const index = await this.engine?.ensureProjectIndex() ?? null
    sys.setProjectIndex(index)
    sys.setMainReadFiles(this.engine?.getContextReadFiles() ?? [])
    log('[VTE] AgentContextSystem populated (index=' + (index ? 'yes' : 'no') + ', readFiles=' + (this.engine?.getContextReadFiles()?.length ?? 0) + ')')
  }

  /**
   * Phase 3 — PM autonomous decomposition.
   * The PM agent analyzes the high-level request and breaks it into
   * WorkOrders; they are pushed and the scheduler is started so the
   * (already-created) role agents begin executing.
   */
  private async handleDecomposeRequest(request?: string) {
    if (!request || !request.trim()) {
      this.postMessage({ type: 'toast', level: 'warning', text: '请输入要拆解的需求' });
      return;
    }
    this.initMultiAgent();
    if (!this.scheduler || !this.workOrderPool) return;

    const { model, apiKey, apiBase } = this.getActiveCredentials();

    // Forward the active LLM config so auto-provisioned sub-agents get a
    // working provider instead of an empty one (which 401s every call).
    this.agentPool?.setLlmConfig({ model, apiKey, apiBase });
    const subAgentTimeoutSec = this.subAgentTimeout;
    this.agentPool?.setDefaultTimeout(subAgentTimeoutSec * 1000);
    // Populate the dedicated AgentContextSystem so PM + sub-agents can
    // retrieve project context on demand via the get_context tool (instead
    // of having it pasted into every prompt — token-efficient, opencode
    // style).
    await this.populateContextSystem();

    this.postMessage({ type: 'toast', level: 'info', text: 'PM 正在拆解需求…' });
    let orders;
    try {
      orders = await this.scheduler.decomposeRequest(request.trim(), { model, apiKey, apiBase });
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `PM 拆解失败：${err?.message || err}` });
      return;
    }

    this.pushWorkOrders();
    // Start the scheduler in parallel mode so the (auto-provisioned) role
    // agents run decomposed tasks concurrently instead of one at a time.
    (this.scheduler as any).config.mode = 'parallel';
    this.scheduler.start();

    this.postMessage({
      type: 'toast',
      level: 'success',
      text: `PM 已拆解为 ${orders.length} 个子任务，开始执行`,
    });
    log(`PM decomposed request into ${orders.length} work orders`);
  }

  /**
   * Build a throwaway AgentEngine (no tools) wired with the active model
   * profile's protocol / thinking style. Used for the cheap routing decision
   * and for the final result synthesis.
   */
  private buildAgentEngine(
    model: string, apiKey: string, apiBase: string,
    reasoningLevel: 'low' | 'medium' | 'high' = 'medium',
  ): AgentEngine {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const ctx = new VTEContextManager(workspaceRoot);
    const engine = new AgentEngine(ctx, model, apiKey, apiBase, workspaceRoot);
    const config = vscode.workspace.getConfiguration('vteCode');
    const profiles = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string; api?: 'chat' | 'responses'; thinkingStyle?: 'openai' | 'qwen' | 'anthropic' | 'none' | 'auto' }>>('models', []);
    const activeIdx = config.get<number>('activeModelIndex', 0);
    const activeProfile = profiles[activeIdx];
    const resolvedModel = activeProfile?.model || model;
    const resolvedBase = activeProfile?.apiBase || apiBase;
    const resolvedProtocol = resolveApiProtocol(activeProfile?.api, resolvedModel, resolvedBase);
    engine.setApiProtocol(resolvedProtocol);
    engine.setThinkingStyle(activeProfile?.thinkingStyle || 'auto');
    engine.setReasoningLevel(reasoningLevel);
    engine.setAllowedTools([]);
    return engine;
  }

  /**
   * Lightweight router: decide whether a user request needs multiple
   * specialized agents (dev/test/review/doc). A short LLM call with no
   * tools returns YES/NO. Trivial one-liners skip the call entirely.
   */
  private async shouldDelegate(text: string): Promise<boolean> {
    if (!text || text.trim().length < 12) return false;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return false;
    const { model, apiKey, apiBase } = this.getActiveCredentials();
    if (!apiKey) return false;
    try {
      const router = this.buildAgentEngine(model, apiKey, apiBase, 'low');
      const raw = await router.chat(
        `你是路由判断器。判断下列用户需求是否需要多个专业 Agent 协作完成（涉及编写/修改代码→dev、编写并运行测试→test、代码审查→review、编写文档→doc 等）。\n只回复一个英文单词 YES 或 NO，不要解释，不要使用中文。\n\n需求：${text}`,
        0, // temperature 0 → 确定性判定，降低模型"自由发挥"概率
      );
      const lower = raw.trim().toLowerCase();
      log(`[VTE] Routing decision raw: "${lower}"`);
      // 1) 明确否定信号 → 不委派（优先，避免误判）
      if (/(^|\b)(no|否|不|无需|不必|不用|不要|单个|一个 ?agent|直接回答|不需要)/.test(lower)) return false;
      // 2) 英文 YES 开头 → 委派
      if (/^\s*yes\b/.test(lower)) return true;
      // 3) 中文明确肯定 且 含多角色信号 → 委派（兼容中文模型）
      if (/^(是|需要|建议|推荐|可以|应当|应该|可)/.test(lower) && /(多|协作|拆分|分解|子任务|子 ?agent|分别|各自|多个)/.test(lower)) return true;
      return false;
    } catch (err: any) {
      log(`[VTE] Routing decision failed, falling back to direct chat: ${err?.message}`);
      return false;
    }
  }

  /**
   * Auto-delegation from the main chat: decompose → run sub-agents in
   * parallel → wait for all to finish → synthesize results back into the
   * MAIN chat (instead of answering directly).
   */
  private async delegateToMultiAgent(request: string, model?: string) {
    this.initMultiAgent();
    if (!this.scheduler || !this.workOrderPool || !this.agentPool) return;
    const { model: cfgModel, apiKey, apiBase } = this.getActiveCredentials();
    const useModel = model || cfgModel;

    // Fresh delegation: clear any leftover orders/agents/context from a prior run
    // so the completion watcher doesn't fire on stale terminal tasks.
    this.workOrderPool.clear();
    this.agentPool.clear();

    // Cancel any completion watcher left over from a previous delegation run.
    // A stale watcher fires on the new run's terminal tasks and can unsubscribe
    // the *new* watcher (via this.delegationWatchUnsub), leaving the UI
    // stuck without synthesis — this is the root cause of "re-sending the
    // same message leaves the main chat frozen on the collaborating state".
    this.delegationWatchUnsub?.();
    this.delegationWatchUnsub = undefined;
    // Make sure the scheduler is fully stopped before a fresh start, so a still
    // running tick loop from a prior run doesn't silently no-op the new start().
    this.scheduler.stop();
    // Forward the active LLM config so auto-provisioned sub-agents (created
    // via ensureIdleAgent) get a *working* provider instead of an empty one —
    // empty config made every sub-agent API call 401 and every task fail.
    this.agentPool.setLlmConfig({ model: useModel, apiKey, apiBase });
    const subAgentTimeoutSec = this.subAgentTimeout;
    this.agentPool.setDefaultTimeout(subAgentTimeoutSec * 1000);

    // Show a persistent "thinking" state in the main chat *during* PM decomposition
    // (a slow LLM call) instead of only a transient toast.
    this.postMessage({ type: 'thinking' });
    this.postMessage({ type: 'thinking_chunk', text: '🔀 PM 正在拆解需求并分发子任务…' });

    // Populate the dedicated AgentContextSystem for on-demand retrieval.
    await this.populateContextSystem();

    this.postMessage({ type: 'toast', level: 'info', text: 'PM 正在拆解需求…' });
    let orders;
    try {
      orders = await this.scheduler.decomposeRequest(request.trim(), { model: useModel, apiKey, apiBase });
    } catch (err: any) {
      this.postMessage({ type: 'toast', level: 'error', text: `PM 拆解失败：${err?.message || err}` });
      this.postMessage({ type: 'response', text: `（需求拆解失败：${err?.message || err}）` });
      return;
    }
    this.pushWorkOrders();
    this.pushAgentStatuses();

    // Update the thinking block with the delegation count, then show the strip.
    this.postMessage({ type: 'thinking_chunk', text: `🔀 已委派 ${orders.length} 个子任务给多个 Agent 并行协作，等待执行与结果汇总…` });
    // Signal the main chat UI to show the active-agent strip.
    this.postMessage({ type: 'multiAgent:delegationStart', request });

    // Start the scheduler in parallel mode (auto-provisions role agents).
    (this.scheduler as any).config.mode = 'parallel';
    this.scheduler.start();

    // Wait for every order to reach a terminal state, then synthesize.
    //
    // "Terminal" = done / failed / permanently stuck.  A stuck order is one
    // that can never be assigned (no agent for its role) or has been pending
    // for too long without any assignment attempt succeeding.  We aggressively
    // fail stuck orders so the main chat never hangs.
    const delegationStartTime = Date.now();
    const allTerminal = (): { ready: boolean; forceFailed: number } => {
      const all = this.workOrderPool!.getAll();
      if (all.length === 0) return { ready: false, forceFailed: 0 };
      let terminalCount = 0;
      let stuckCount = 0;
      const now = Date.now();
      const elapsedMs = now - delegationStartTime;

      for (const o of all) {
        if (o.status === 'done' || o.status === 'failed') { terminalCount++; continue; }

        // ── Stuck detection ──────────────────────────────────────
        // 1) Blocked by a failed dependency → cascade-fail it
        if (o.status === 'blocked') {
          const depFailed = o.dependencies.some(depId => {
            const dep = this.workOrderPool!.get(depId);
            return dep && dep.status === 'failed';
          });
          if (depFailed) { stuckCount++; continue; }
          return { ready: false, forceFailed: 0 };
        }

        // 2) Pending order that has been waiting too long with no progress.
        //    If > 90 s have elapsed since delegation started and this order is
        //    still pending (never assigned), treat it as stuck — something
        //    prevented the scheduler from picking it up (no agent for role,
        //    maxConcurrent hit, etc.)
        if (o.status === 'pending' && elapsedMs > 90_000) {
          stuckCount++; continue;
        }

        // 3) Running/assigned but been running past the timeout threshold.
        //    This shouldn't happen normally (executeWithTimeout handles it),
        //    but as a safety net: if running > 150s, consider it hung.
        if ((o.status === 'running' || o.status === 'assigned') && elapsedMs > 150_000) {
          stuckCount++; continue;
        }

        // Order is still actively being processed — not done yet
        return { ready: false, forceFailed: 0 };
      }

      // Force-fail all stuck orders so they become real terminals
      if (stuckCount > 0) {
        console.log(`[VTE] Delegation: force-failing ${stuckCount} stuck order(s) after ${Math.round(elapsedMs/1000)}s`);
        for (const o of all) {
          if (o.status === 'blocked') {
            const depFailed = o.dependencies.some(depId => {
              const dep = this.workOrderPool!.get(depId);
              return dep && dep.status === 'failed';
            });
            if (depFailed) this.workOrderPool!.fail(o.id, `前置任务失败，级联终止（${Math.round(elapsedMs/1000)}s）`);
          } else if (o.status === 'pending' && elapsedMs > 90_000) {
            this.workOrderPool!.fail(o.id, `任务长时间未分配，自动终止（${Math.round(elapsedMs/1000)}s）`);
          } else if ((o.status === 'running' || o.status === 'assigned') && elapsedMs > 150_000) {
            this.workOrderPool!.fail(o.id, `任务执行超时未响应，自动终止（${Math.round(elapsedMs/1000)}s）`);
          }
        }
      }
      return { ready: true, forceFailed: stuckCount };
    };

    // Safety net: if delegation is still running after 3 min, synthesize whatever we have.
    const SAFETY_TIMEOUT_MS = 3 * 60 * 1000;
    const safetyTimer = setTimeout(() => {
      console.warn('[VTE] Delegation safety timeout (3min) reached — synthesizing with partial results');
      this.delegationWatchUnsub?.();
      this.delegationWatchUnsub = undefined;
      if (this.scheduler) this.scheduler.stop();
      // Force-mark all remaining non-terminal orders as failed
      for (const o of this.workOrderPool!.getAll()) {
        if (o.status !== 'done' && o.status !== 'failed') {
          this.workOrderPool!.fail(o.id, '委派安全超时');
        }
      }
      this.synthesizeAndDeliver(request, useModel, apiKey, apiBase);
    }, SAFETY_TIMEOUT_MS);

    const terminalCheck = allTerminal();
    if (terminalCheck.ready) {
      clearTimeout(safetyTimer);
      await this.synthesizeAndDeliver(request, useModel, apiKey, apiBase);
      return;
    }

    this.delegationWatchUnsub = this.workOrderPool!.onEvent((ev) => {
      if ((ev.type === 'completed' || ev.type === 'failed')) {
        const result = allTerminal();
        if (result.ready) {
          clearTimeout(safetyTimer);
          this.delegationWatchUnsub?.();
          this.delegationWatchUnsub = undefined;
          this.synthesizeAndDeliver(request, useModel, apiKey, apiBase);
        }
      }
    });
  }

  /**
   * Collect every finished work order's result, ask a PM-style engine to
   * synthesize a coherent final answer, and stream it into the MAIN chat.
   */
  private async synthesizeAndDeliver(request: string, model: string, apiKey: string, apiBase: string) {
    if (this.scheduler) this.scheduler.stop();
    // Sub-agents are done; hide the active-agent strip (synthesis begins).
    this.postMessage({ type: 'multiAgent:delegationEnd' });
    const orders = this.workOrderPool ? this.workOrderPool.getAll() : [];
    const summary = orders.map(o => {
      const statusLabel = o.status === 'done' ? '✅ 完成' : '❌ 失败';
      const body = o.status === 'done'
        ? (o.result || '无输出').replace(/\s+/g, ' ').trim().slice(0, 2000)
        : (o.error || '未知错误');
      return `### [${o.requiredRole || '?'}] ${o.title} — ${statusLabel}\n${body}`;
    }).join('\n\n');

    const prompt =
      `你是项目主 Agent。下面的需求已经由多个子 Agent 协作完成。` +
      `请综合各个角色的工作结果，给用户一份连贯、可读的最终答复（使用中文与 Markdown，重点说明做了什么、结果如何、是否需要用户后续操作）。\n\n` +
      `## 原始需求\n${request}\n\n` +
      `## 各子 Agent 的工作结果\n${summary}`;

    const synth = this.buildAgentEngine(model, apiKey, apiBase, 'medium');
    synth.onViewUpdate = (u: Record<string, unknown>) => {
      const type = u.type as string;
      if (type === 'thinking_start') {
        this.postMessage({ type: 'thinking' });
      } else if (type === 'thinking_chunk') {
        this.postMessage({ type: 'thinking_chunk', text: u.text as string });
      } else if (type === 'stream_chunk') {
        this.postMessage({ type: 'stream_chunk', text: u.text as string });
      }
    };

    let answer = '';
    try {
      answer = await synth.chat(prompt);
    } catch (err: any) {
      answer = `（结果汇总失败：${err?.message || err}）\n\n${summary}`;
    }
    this.postMessage({ type: 'response', text: answer });
    this.postMessage({ type: 'toast', level: 'success', text: '多 Agent 协作完成，已汇总结果' });
    log(`[VTE] Multi-agent delegation finished, synthesized ${orders.length} results back to main chat`);
  }

  private handleStartScheduler(mode?: string) {
    this.initMultiAgent();
    if (!this.scheduler) return;

    if (mode) {
      (this.scheduler as any).config.mode = mode;
    }
    this.scheduler.start();
    const modeLabel = mode || 'pool';
    this.postMessage({ type: 'toast', level: 'success', text: `调度器已启动 (${modeLabel} 模式)` });
    log(`Scheduler started in mode: ${modeLabel}`);
  }

  private handleStopScheduler() {
    if (this.scheduler) {
      this.scheduler.stop();
      this.postMessage({ type: 'toast', level: 'info', text: '调度器已停止' });
      log('Scheduler stopped');
    }
  }

  private handleGetConversation(agentId: string) {
    if (!this.agentCommunication) return;
    const history = this.agentCommunication.getHistory(agentId);
    this.postMessage({ type: 'multiAgent:conversation', agentId, messages: history });
  }

  private handleStopAllAgents() {
    if (this.agentPool) {
      this.agentPool.stopAll();
      log('All agents stopped');
      this.pushAgentStatuses();
    }
  }

  private handleAgentMessage(from: string, to: string | undefined, type: string, content: string) {
    if (!this.agentCommunication) return;
    this.agentCommunication.send(from, to, type as any, content);
  }

  private pushAgentStatuses() {
    if (!this.agentPool) return;
    const statuses = this.agentPool.getAgentStatuses();
    this.postMessage({ type: 'multiAgent:agents', agents: statuses });
  }

  private pushWorkOrders() {
    if (!this.workOrderPool) return;
    const orders = this.workOrderPool.getAll().map(o => ({
      id: o.id,
      title: o.title,
      description: o.description,
      status: o.status,
      priority: o.priority,
      requiredRole: o.requiredRole,
      assignedAgentId: o.assignedAgentId,
      result: o.result,
      error: o.error,
      createdAt: o.createdAt,
    }));
    this.postMessage({ type: 'multiAgent:workOrders', orders });
  }
}
