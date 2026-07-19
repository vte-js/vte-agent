import * as vscode from 'vscode';
import { ChatViewProvider } from './panel';
import { registerSetupWizardCommand, setLspWorkspaceRoot, getCodeIntelligenceService } from './lsp';
import { registerLspStatusView } from './lsp/lsp-status-provider';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('VTE Agent');
  outputChannel.appendLine('VTE Agent extension activating...');

  // Get workspace root
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

  // Initialize LSP service if workspace is open
  if (workspaceRoot) {
    setLspWorkspaceRoot(workspaceRoot);
    const lspService = getCodeIntelligenceService(workspaceRoot);
    lspService.initialize().catch((err) => {
      outputChannel.appendLine(`[VTE] LSP service initialization failed: ${err}`);
    });
    outputChannel.appendLine('VTE Agent LSP service initialized.');
  }

  const provider = new ChatViewProvider(context.extensionUri, context.globalState);

  // Sidebar view provider (Activity Bar)
  const registration = vscode.window.registerWebviewViewProvider(
    'vte-agent.chat',
    provider,
    { webviewOptions: { retainContextWhenHidden: true } }
  );

  // Register LSP Status TreeView (always register, even without workspace)
  registerLspStatusView(context, workspaceRoot);

  // Register command to show LSP Status view
  const showLspStatusCmd = vscode.commands.registerCommand('vte-lsp.showStatus', () => {
    vscode.commands.executeCommand('vte-lsp-status.focus');
  });

  // Status bar button
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'vte-agent.openChat';
  statusBar.text = '$(comment-discussion) VTE Agent';
  statusBar.tooltip = 'Open VTE Agent Chat';
  statusBar.show();

  // LSP Status bar button
  const lspStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  lspStatusBar.command = 'vte-lsp.testLsp';
  lspStatusBar.text = '$(symbol-event) LSP';
  lspStatusBar.tooltip = 'Test LSP at Cursor';
  lspStatusBar.show();

  // Commands
  const openCmd = vscode.commands.registerCommand('vte-agent.openChat', () => {
    provider.openPanel();
  });

  const newSessionCmd = vscode.commands.registerCommand('vte-agent.newSession', () => {
    provider.handleNewSession();
  });

  const openSessionsCmd = vscode.commands.registerCommand('vte-agent.openSessions', () => {
    provider.postMessage({ type: 'sessions:openPanel' });
  });

  const openSkillsCmd = vscode.commands.registerCommand('vte-agent.openSkills', () => {
    provider.postMessage({ type: 'skills:openPanel' });
  });

  const openConfigCmd = vscode.commands.registerCommand('vte-agent.openConfig', () => {
    provider.postMessage({ type: 'showSettings' });
  });

  const clearChatCmd = vscode.commands.registerCommand('vte-agent.clearChat', () => {
    provider.handleClear();
  });

  // LSP commands
  const openLspConfigEditorCmd = vscode.commands.registerCommand('vte-lsp.openConfigEditor', () => {
    provider.openPanel(() => {
      provider.postMessage({ type: 'lspConfigEditor:open' });
    });
  });

  const testLspCmd = vscode.commands.registerCommand('vte-lsp.testLsp', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
      return;
    }

    const document = editor.document;
    const position = editor.selection.active;

    try {
      // Test definition
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        position
      );

      // Test hover
      const hover = await vscode.commands.executeCommand<vscode.Hover>(
        'vscode.executeHoverProvider',
        document.uri,
        position
      );

      // Get symbol name at cursor
      const wordRange = document.getWordRangeAtPosition(position);
      const symbolName = wordRange ? document.getText(wordRange) : '(no symbol)';

      // Build result message
      const defCount = locations?.length ?? 0;
      const hasHover = hover?.contents && hover.contents.length > 0;

      let detail = '';
      if (defCount > 0) {
        const loc = locations![0];
        const filePath = vscode.workspace.asRelativePath(loc.uri);
        const line = loc.range?.start?.line ?? 0;
        detail = `Definition: ${filePath}:${line + 1}`;
      } else {
        detail = 'Definition: not found';
      }

      if (hasHover) {
        let hoverContent = '';
        if (Array.isArray(hover!.contents)) {
          hoverContent = hover!.contents
            .map(c => typeof c === 'string' ? c : c.value)
            .join(' ')
            .substring(0, 100);
        }
        detail += `\nHover: ${hoverContent}...`;
      } else {
        detail += '\nHover: not available';
      }

      // Show in output channel with details
      const channel = vscode.window.createOutputChannel('VTE LSP Test');
      channel.appendLine('═══════════════════════════════════════');
      channel.appendLine('  LSP Test Result');
      channel.appendLine('═══════════════════════════════════════');
      channel.appendLine(`File:      ${document.fileName}`);
      channel.appendLine(`Line:      ${position.line + 1}, Column: ${position.character + 1}`);
      channel.appendLine(`Symbol:    ${symbolName}`);
      channel.appendLine('───────────────────────────────────────');
      channel.appendLine(`Definition: ${defCount > 0 ? '✓' : '✗'} (${defCount} found)`);
      if (defCount > 0) {
        const loc = locations![0];
        channel.appendLine(`  → ${vscode.workspace.asRelativePath(loc.uri)}:${(loc.range?.start?.line ?? 0) + 1}`);
      }
      channel.appendLine(`Hover:     ${hasHover ? '✓' : '✗'}`);
      channel.appendLine('═══════════════════════════════════════');
      channel.show();

      // Show VS Code notification
      const shortMsg = `LSP: Found ${defCount} definition(s) for "${symbolName}"`;
      vscode.window.showInformationMessage(shortMsg);

      // Send to webview for styled notification
      provider.postMessage({
        type: 'lsp:testResult',
        success: true,
        symbol: symbolName,
        definitionCount: defCount,
        definitionFile: defCount > 0 ? vscode.workspace.asRelativePath(locations![0].uri) : undefined,
        definitionLine: defCount > 0 ? (locations![0].range?.start?.line ?? 0) + 1 : undefined,
        hasHover,
        message: shortMsg
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`LSP test failed: ${message}`);
      provider.postMessage({
        type: 'lsp:testResult',
        success: false,
        message: `LSP test failed: ${message}`
      });
    }
  });

  const clearCacheCmd = vscode.commands.registerCommand('vte-lsp.clearCache', () => {
    const service = getCodeIntelligenceService(workspaceRoot);
    service.clearCache();
    vscode.window.showInformationMessage('LSP cache cleared');
  });

  const refreshStatusCmd = vscode.commands.registerCommand('vte-lsp.refreshStatus', () => {
    vscode.window.showInformationMessage('LSP status refreshed');
  });

  // Register LSP setup wizard command
  if (workspaceRoot) {
    registerSetupWizardCommand(context, workspaceRoot);
  }

  context.subscriptions.push(
    registration, statusBar, lspStatusBar, outputChannel,
    openCmd, newSessionCmd, openSessionsCmd, openSkillsCmd, openConfigCmd, clearChatCmd,
    openLspConfigEditorCmd, testLspCmd, clearCacheCmd, refreshStatusCmd, showLspStatusCmd
  );
  outputChannel.appendLine('VTE Agent webview provider registered.');
  outputChannel.appendLine('LSP Control Panel registered.');
}

export function deactivate() {}
