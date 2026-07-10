import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentEngine, AgentMode } from '../agent/engine';
import { getAllTasks } from '../agent/tasks';
import { loadBuiltinSkills, getBuiltinSkillContent } from '../skills/builtin';
import { getSessionStats, getRecentRecords } from '../agent/token-tracker';
import { VTEContextManager } from '../context/manager';
import { runGrayBoxTests, formatTestResults } from '../agent/test-runner';
import { ShadowGit } from '../agent/shadow-git';
import { SessionManager } from '../agent/session-manager';
import { ChatMessage } from '../agent/session-types';

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
  private reasoningLevel: 'low' | 'medium' | 'high' = 'medium';
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

  constructor(private readonly extensionUri: vscode.Uri) {
    outputChannel = vscode.window.createOutputChannel('VTE Agent');
  }

  /** Get the active webview (panel takes priority over sidebar view) */
  private get webview(): vscode.Webview | undefined {
    return this.panel?.webview ?? this.view?.webview;
  }

  /** Post message to all active webviews */
  public postMessage(msg: any) {
    this.view?.webview.postMessage(msg);
    this.panel?.webview.postMessage(msg);
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

  openPanel() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
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
        case 'saveConfig':
          await this.saveConfig(message.apiKey, message.apiBase, message.model);
          break;
        case 'saveModels':
          await this.saveModels(message.models, message.activeModelIndex);
          break;
        case 'switchModel':
          await this.switchModel(message.index);
          break;
        case 'getConfig':
          this.sendConfig();
          break;
        case 'setMode':
          this.mode = message.mode;
          this.engine?.setMode(message.mode);
          log(`Mode changed to: ${message.mode}`);
          break;
        case 'setTaskMode':
          this.engine?.setTaskMode(message.taskMode);
          log(`Task mode changed to: ${message.taskMode}`);
          break;
        case 'setReasoningLevel':
          this.reasoningLevel = message.level;
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
      }
      } catch (err: any) {
        log(`[DEBUG] ERROR in onDidReceiveMessage handler: ${err.message}`);
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
      // Get current model from config
      const config = vscode.workspace.getConfiguration('vteCode');
      const model = config.get<string>('model', 'unknown');

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

      // Get model from config
      const config = vscode.workspace.getConfiguration('vteCode');
      const model = config.get<string>('model', 'unknown');

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
        const sessionModel = model || vscode.workspace.getConfiguration('vteCode').get<string>('model', 'unknown');
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

    if (!this.engine) {
      log(`[DEBUG] No engine, creating new one`);
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this.postMessage({ type: 'error', text: 'No workspace open' });
        log('[DEBUG] ERROR: No workspace open');
        return;
      }
      const config = vscode.workspace.getConfiguration('vteCode');
      const apiKey = config.get<string>('apiKey', '');
      const apiBase = config.get<string>('apiBase', 'https://api.openai.com/v1');
      const cfgModel = config.get<string>('model', 'gpt-4');
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
        log(`[DEBUG] Engine created successfully`);
        // Load existing feedback for calibration
        const existingFeedback = this.loadFeedback();
        if (existingFeedback.length > 0) {
          this.engine.setFeedback(existingFeedback);
          log(`[DEBUG] Loaded ${existingFeedback.length} feedback entries`);
        }
        this.engine.onViewUpdate = (update) => {
          if (update.type === 'thinking_chunk') {
            this.pendingThinking += update.text as string;
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
    this.postMessage({ type: 'thinking' });
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
      const rawReply = await this.engine.chat(text, temperature, topP, maxTokens, images, enrichedContext);
      // Strip <system-reminder> tags — these are for LLM context only, not for display
      const reply = this.stripSystemReminder(rawReply);
      log(`Response: "${reply.substring(0, 200)}${reply.length > 200 ? '...' : ''}"`);
      this.trackAssistantMessage(reply);
      this.postMessage({ type: 'response', text: reply });
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

  private async saveConfig(apiKey: string, apiBase: string, model: string) {
    const config = vscode.workspace.getConfiguration('vteCode');
    await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
    await config.update('apiBase', apiBase, vscode.ConfigurationTarget.Global);
    await config.update('model', model, vscode.ConfigurationTarget.Global);
    this.engine = undefined;
    log(`Config saved: model=${model} base=${apiBase}`);
    this.postMessage({ type: 'configSaved' });
  }

  private async saveModels(models: Array<{ name: string; apiKey: string; apiBase: string; model: string }>, activeModelIndex: number) {
    const config = vscode.workspace.getConfiguration('vteCode');
    await config.update('models', models, vscode.ConfigurationTarget.Global);
    await config.update('activeModelIndex', activeModelIndex, vscode.ConfigurationTarget.Global);

    // Also update legacy single-model config for backwards compatibility
    const active = models[activeModelIndex];
    if (active) {
      await config.update('apiKey', active.apiKey, vscode.ConfigurationTarget.Global);
      await config.update('apiBase', active.apiBase, vscode.ConfigurationTarget.Global);
      await config.update('model', active.model, vscode.ConfigurationTarget.Global);
    }

    this.engine = undefined;
    log(`Models saved: ${models.length} profiles, active=${activeModelIndex}`);
    this.postMessage({ type: 'configSaved' });
  }

  private async switchModel(index: number) {
    const config = vscode.workspace.getConfiguration('vteCode');
    await config.update('activeModelIndex', index, vscode.ConfigurationTarget.Global);

    const models = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string }>>('models', []);
    const active = models[index];
    if (active) {
      await config.update('apiKey', active.apiKey, vscode.ConfigurationTarget.Global);
      await config.update('apiBase', active.apiBase, vscode.ConfigurationTarget.Global);
      await config.update('model', active.model, vscode.ConfigurationTarget.Global);
    }

    this.engine = undefined;
    log(`Switched to model: ${active?.name || index}`);
  }

  // ── Permission Management ──

  private handleGetPermissionConfig() {
    const config = this.engine?.getPermissionConfig() || {};
    this.postMessage({ type: 'permissionConfig', config });
  }

  private handleSetPermissionConfig(config: Record<string, string>) {
    if (this.engine) {
      this.engine.setPermissionConfig(config as any);
      log(`Permission config updated: ${JSON.stringify(config)}`);
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

  // ── Command Handlers (called from extension.ts) ──

  public async handleNewSession() {
    const sm = this.getSessionManager();
    if (sm) {
      try {
        const model = vscode.workspace.getConfiguration('vteCode').get<string>('model', 'unknown');
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
    const models = config.get<Array<{ name: string; apiKey: string; apiBase: string; model: string }>>('models', []);
    const activeModelIndex = config.get<number>('activeModelIndex', 0);

    this.postMessage({
      type: 'configData',
      models: models.length > 0 ? models : [{
        name: 'Default',
        apiKey: config.get<string>('apiKey', ''),
        apiBase: config.get<string>('apiBase', 'https://api.openai.com/v1'),
        model: config.get<string>('model', 'gpt-4'),
      }],
      activeModelIndex: activeModelIndex,
      // Legacy fields for backwards compatibility
      apiKey: config.get<string>('apiKey', ''),
      apiBase: config.get<string>('apiBase', 'https://api.openai.com/v1'),
      model: config.get<string>('model', 'gpt-4'),
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
}
