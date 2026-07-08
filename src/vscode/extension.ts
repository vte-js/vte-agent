import * as vscode from 'vscode';
import { ChatViewProvider } from './panel';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('VTE Agent');
  outputChannel.appendLine('VTE Agent extension activating...');

  const provider = new ChatViewProvider(context.extensionUri);

  // Sidebar view provider (Activity Bar)
  const registration = vscode.window.registerWebviewViewProvider(
    'vte-agent.chat',
    provider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // Status bar button
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'vte-agent.openChat';
  statusBar.text = '$(comment-discussion) VTE Agent';
  statusBar.tooltip = 'Open VTE Agent Chat';
  statusBar.show();

  // Command: open chat as WebviewPanel
  const openCmd = vscode.commands.registerCommand('vte-agent.openChat', () => {
    provider.openPanel();
  });

  context.subscriptions.push(registration, statusBar, openCmd, outputChannel);
  outputChannel.appendLine('VTE Agent webview provider registered.');
}

export function deactivate() {}
