import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentEngine, AgentMode } from '../agent/engine';
import { getAllTasks } from '../agent/tasks';
import { getSessionStats, getRecentRecords } from '../agent/token-tracker';
import { VTEContextManager } from '../context/manager';
import { runGrayBoxTests, formatTestResults } from '../agent/test-runner';

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
  private mode: AgentMode = 'code';
  // Track chat history for cross-webview sync
  private chatHistory: Array<{ id: number; role: 'user' | 'assistant' | 'error'; text: string; timestamp: string; thinkingText?: string }> = [];
  private nextMsgId = 0;
  private pendingThinking = '';

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
          this.trackUserMessage(message.text);
          await this.handleChat(message.text, message.model, message.temperature, message.topP, message.maxTokens);
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
      }
    });
  }

  private trackUserMessage(text: string) {
    this.chatHistory.push({
      id: this.nextMsgId++,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  private trackAssistantMessage(text: string, role: 'assistant' | 'error' = 'assistant') {
    this.chatHistory.push({
      id: this.nextMsgId++,
      role,
      text,
      timestamp: new Date().toLocaleTimeString(),
      thinkingText: this.pendingThinking || undefined,
    });
    this.pendingThinking = '';
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

  private async handleChat(text: string, model?: string, temperature?: number, topP?: number, maxTokens?: number) {
    log(`Chat: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" | model=${model} temp=${temperature} topP=${topP} maxTokens=${maxTokens}`);

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
      this.engine = new AgentEngine(ctx, model || cfgModel, apiKey, apiBase);
      this.engine.onViewUpdate = (update) => {
        if (update.type === 'thinking_chunk') {
          this.pendingThinking += update.text;
        }
        this.postMessage(update);
      };
    }
    if (model) { this.engine.setModel(model); }

    this.pendingThinking = '';
    this.postMessage({ type: 'thinking' });
    try {
      log('Calling LLM...');
      const reply = await this.engine.chat(text, temperature, topP, maxTokens);
      log(`Response: "${reply.substring(0, 200)}${reply.length > 200 ? '...' : ''}"`);
      this.trackAssistantMessage(reply);
      this.postMessage({ type: 'response', text: reply });
      this.pushTasks();
      this.pushTokenStats();
    } catch (err: any) {
      log(`ERROR: ${err.message}`);
      this.trackAssistantMessage(err.message, 'error');
      this.postMessage({ type: 'error', text: err.message });
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

  private sendConfig() {
    const config = vscode.workspace.getConfiguration('vteCode');
    this.postMessage({
      type: 'configData',
      apiKey: config.get<string>('apiKey', ''),
      apiBase: config.get<string>('apiBase', 'https://api.openai.com/v1'),
      model: config.get<string>('model', 'gpt-4'),
    });
    log('Config sent to webview');
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
      const report = formatTestResults(results);
      this.postMessage({ type: 'response', text: report });
      this.pushTasks();
    } catch (err: any) {
      log(`Test error: ${err.message}`);
      this.postMessage({ type: 'error', text: `Test error: ${err.message}` });
    }
  }
}
