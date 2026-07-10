import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentEngine, AgentMode } from '../agent/engine';
import { getAllTasks } from '../agent/tasks';
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
  // Track chat history for cross-webview sync
  private chatHistory: Array<{
    id: number;
    role: 'user' | 'assistant' | 'error';
    text: string;
    timestamp: string;
    thinkingText?: string;
    images?: Array<{ name: string; dataUrl: string; mimeType: string }>;
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
  private postMessage(msg: any) {
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
      switch (message.type) {
        case 'chat':
          this.trackUserMessage(message.text, message.images);
          await this.handleChat(message.text, message.model, message.temperature, message.topP, message.maxTokens, message.images);
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
        case 'abort':
          this.engine?.abort();
          this.postMessage({ type: 'error', text: '已停止' });
          break;
        case 'runTests':
          await this.handleRunTests();
          break;
        case 'feedback':
          this.handleFeedback(message.messageId, message.rating, message.userMessage, message.assistantMessage, message.comment);
          break;
        case 'saveCheckpoint':
          await this.saveCheckpoint(message.name);
          break;
        case 'restoreCheckpoint':
          await this.restoreCheckpoint(message.checkpointId);
          break;
        case 'deleteCheckpoint':
          await this.deleteCheckpoint(message.checkpointId);
          break;
        case 'listCheckpoints':
          this.listCheckpoints();
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
      }
    });
  }

  private trackUserMessage(text: string, images?: Array<{ name: string; dataUrl: string; mimeType: string }>) {
    this.chatHistory.push({
      id: this.nextMsgId++,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
      images,
    });
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

  // ── Checkpoint Methods ──

  private getCheckpointDir(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return path.join(workspaceRoot, '.vte', 'checkpoints');
  }

  private async saveCheckpoint(name?: string) {
    if (!this.engine) {
      this.postMessage({ type: 'checkpointError', text: 'No active session' });
      return;
    }

    try {
      const result = this.engine.createCheckpoint(name);
      if (!result) {
        this.postMessage({ type: 'checkpointError', text: 'No changes to checkpoint' });
        return;
      }

      log(`Checkpoint saved: ${name} (${result.commitHash.substring(0, 7)})`);
      this.postMessage({ type: 'checkpointSaved', checkpoint: { id: result.commitHash, name: name || 'Checkpoint', timestamp: Date.now() } });
    } catch (err: any) {
      log(`Failed to save checkpoint: ${err.message}`);
      this.postMessage({ type: 'checkpointError', text: `保存失败: ${err.message}` });
    }
  }

  private async restoreCheckpoint(commitHash: string) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      this.postMessage({ type: 'checkpointError', text: '没有打开的工作区' });
      return;
    }

    log(`Restoring checkpoint: ${commitHash}`);

    // Use engine's shadow-git if available, otherwise create standalone instance
    let shadowGit: ShadowGit | undefined = this.engine?.getShadowGit();
    if (!shadowGit) {
      shadowGit = new ShadowGit(workspaceRoot);
    }

    try {
      const restoredFiles = shadowGit.restoreCheckpoint(commitHash);
      log(`Restored files: ${restoredFiles.length} - ${restoredFiles.join(', ')}`);

      if (restoredFiles.length > 0) {
        this.postMessage({ type: 'checkpointRestored', name: commitHash.substring(0, 7) });
        log(`Checkpoint restored: ${commitHash.substring(0, 7)} (${restoredFiles.length} files)`);
      } else {
        this.postMessage({ type: 'checkpointError', text: '没有找到可恢复的文件' });
      }
    } catch (err: any) {
      log(`Failed to restore checkpoint: ${err.message}`);
      this.postMessage({ type: 'checkpointError', text: `恢复失败: ${err.message}` });
    }
  }

  private async deleteCheckpoint(commitHash: string) {
    // Git commits are immutable, but we can try to remove the reference
    // For now, just inform the user
    this.postMessage({ type: 'checkpointError', text: '快照是 Git 提交，无法删除。旧的快照会自动清理。' });
  }

  private listCheckpoints() {
    // Try to get shadow-git from engine or use standalone instance
    let shadowGit: ShadowGit | undefined = this.engine?.getShadowGit();

    if (!shadowGit) {
      // Create standalone shadow-git instance for listing checkpoints
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this.postMessage({ type: 'checkpointList', checkpoints: [] });
        return;
      }
      shadowGit = new ShadowGit(workspaceRoot);
    }

    try {
      const commits = shadowGit.log(20);
      const checkpoints = commits
        .filter((c: any) => c.message.startsWith('Checkpoint:'))
        .map((c: any) => ({
          id: c.hash,
          name: c.message.replace('Checkpoint: ', ''),
          timestamp: c.timestamp,
        }));

      this.postMessage({ type: 'checkpointList', checkpoints });
    } catch (err: any) {
      log(`Failed to list checkpoints: ${err.message}`);
      this.postMessage({ type: 'checkpointList', checkpoints: [] });
    }
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

  private async handleChat(text: string, model?: string, temperature?: number, topP?: number, maxTokens?: number, images?: Array<{ name: string; dataUrl: string; mimeType: string }>) {
    log(`Chat: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" | model=${model} temp=${temperature} topP=${topP} maxTokens=${maxTokens} images=${images?.length || 0}`);

    // Auto-create session if none exists
    if (!this.currentSessionId) {
      const sm = this.getSessionManager();
      if (sm) {
        const sessionModel = model || vscode.workspace.getConfiguration('vteCode').get<string>('model', 'unknown');
        const session = await sm.createSession(undefined, sessionModel);
        this.currentSessionId = session.id;
        log(`Auto-created session: ${session.id}`);
      }
    }

    if (!this.engine) {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        this.postMessage({ type: 'error', text: 'No workspace open' });
        log('ERROR: No workspace open');
        return;
      }
      const config = vscode.workspace.getConfiguration('vteCode');
      const apiKey = config.get<string>('apiKey', '');
      const apiBase = config.get<string>('apiBase', 'https://api.openai.com/v1');
      const cfgModel = config.get<string>('model', 'gpt-4');
      if (!apiKey) {
        this.postMessage({ type: 'showSettings' });
        this.postMessage({ type: 'error', text: '请先配置 API Key' });
        log('ERROR: No API key configured');
        return;
      }
      log(`Creating engine: model=${model || cfgModel} base=${apiBase} workspace=${workspaceRoot}`);
      const ctx = new VTEContextManager(workspaceRoot);
      this.engine = new AgentEngine(ctx, model || cfgModel, apiKey, apiBase, workspaceRoot);
      // Load existing feedback for calibration
      const existingFeedback = this.loadFeedback();
      if (existingFeedback.length > 0) {
        this.engine.setFeedback(existingFeedback);
        log(`Loaded ${existingFeedback.length} feedback entries`);
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
        }
        this.postMessage(update);
      };
    }
    if (model) { this.engine.setModel(model); }

    this.pendingThinking = '';
    this.postMessage({ type: 'thinking' });
    try {
      log('Calling LLM...');
      const rawReply = await this.engine.chat(text, temperature, topP, maxTokens, images);
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
      // Remove system-reminder tags (greedy match)
      errorMsg = errorMsg.replace(/<system-reminder>[\s\S]*<\/system-reminder>/g, '');
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
