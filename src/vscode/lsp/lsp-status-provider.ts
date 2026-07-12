/**
 * LSP Control Panel - TreeView Status Provider
 *
 * Displays LSP health status, cache stats, and call metrics in the sidebar.
 * Uses EventEmitter for real-time updates from CodeIntelligenceService.
 */

import * as vscode from 'vscode';
import {
  LspHealthMetrics,
  CacheStats,
  CircuitBreakerStatus,
} from './types';
import { CodeIntelligenceService, getCodeIntelligenceService } from './code-intelligence';
import { getLanguageCircuitBreakers } from './circuit-breaker';
import { getLspCache } from './cache';

// ── Tree Node Types ──

export type LspTreeNode = LanguageNode | StatsNode | ActionNode;

export class LanguageNode extends vscode.TreeItem {
  constructor(
    public readonly metrics: LspHealthMetrics,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(metrics.languageId, collapsibleState);

    this.description = this.getDescription();
    this.iconPath = this.getIcon();
    this.tooltip = this.getTooltip();
    this.contextValue = 'language';

    // Click action
    this.command = {
      command: 'vte-lsp.showLanguageDetails',
      title: 'Show Language Details',
      arguments: [this],
    };
  }

  private getDescription(): string {
    const status = this.metrics.status === 'online' ? '●' :
                   this.metrics.status === 'offline' ? '○' : '⚠';
    return `${status} ${this.metrics.strategy} | ${(this.metrics.cacheHitRate * 100).toFixed(0)}%`;
  }

  private getIcon(): vscode.ThemeIcon {
    switch (this.metrics.status) {
      case 'online':
        return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
      case 'offline':
        return new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
      case 'circuit-breaker-open':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      default:
        return new vscode.ThemeIcon('circle-outline');
    }
  }

  private getTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### ${this.metrics.languageId}\n\n`);
    md.appendMarkdown(`| Metric | Value |\n|--------|-------|\n`);
    md.appendMarkdown(`| Status | ${this.metrics.status} |\n`);
    md.appendMarkdown(`| Strategy | ${this.metrics.strategy} |\n`);
    md.appendMarkdown(`| Cache Hit Rate | ${(this.metrics.cacheHitRate * 100).toFixed(1)}% |\n`);
    md.appendMarkdown(`| Success | ${this.metrics.successCount} |\n`);
    md.appendMarkdown(`| Failures | ${this.metrics.failureCount} |\n`);

    if (this.metrics.lastError) {
      md.appendMarkdown(`\n**Last Error:**\n\`\`\`\n${this.metrics.lastError}\n\`\`\``);
    }

    return md;
  }
}

export class StatsNode extends vscode.TreeItem {
  constructor(
    public readonly stats: CacheStats
  ) {
    super('Cache Statistics', vscode.TreeItemCollapsibleState.None);

    this.description = `${stats.size} entries`;
    this.iconPath = new vscode.ThemeIcon('database');
    this.tooltip = this.getTooltip();
    this.contextValue = 'stats';
  }

  private getTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`### Cache Statistics\n\n`);
    md.appendMarkdown(`| Metric | Value |\n|--------|-------|\n`);
    md.appendMarkdown(`| Entries | ${this.stats.size} |\n`);
    md.appendMarkdown(`| Hit Rate | ${(this.stats.hitRate * 100).toFixed(1)}% |\n`);
    md.appendMarkdown(`| Oldest Entry | ${this.formatAge(this.stats.oldestEntryAge)} |\n`);

    return md;
  }

  private formatAge(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  }
}

export class ActionNode extends vscode.TreeItem {
  constructor(
    public readonly action: string,
    public readonly label: string,
    public readonly iconId: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'action';

    this.command = {
      command: `vte-lsp.${action}`,
      title: label,
    };
  }
}

// ── Tree Data Provider ──

export class LspStatusProvider implements vscode.TreeDataProvider<LspTreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<LspTreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private metrics = new Map<string, LspHealthMetrics>();
  private cacheStats: CacheStats = { size: 0, hitRate: 0, oldestEntryAge: 0, ttlMs: 5 * 60 * 1000, maxSize: 1000 };
  private service: CodeIntelligenceService | null = null;

  constructor(private workspaceRoot: string) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log(`[VTE-LSP] Initializing with workspace: ${this.workspaceRoot || '(empty)'}`);

    if (this.workspaceRoot) {
      this.service = getCodeIntelligenceService(this.workspaceRoot);
    }

    // Always load default language data
    await this.loadInitialData();
  }

  private async loadInitialData(): Promise<void> {
    console.log('[VTE-LSP] Loading initial data');

    // Load default languages if no config available
    const defaultLanguages = [
      { id: 'typescript', strategy: 'builtin' as const },
      { id: 'python', strategy: 'builtin' as const },
      { id: 'rust', strategy: 'builtin' as const },
      { id: 'go', strategy: 'builtin' as const },
      { id: 'java', strategy: 'builtin' as const },
    ];

    // Add default languages
    for (const lang of defaultLanguages) {
      if (!this.metrics.has(lang.id)) {
        this.metrics.set(lang.id, {
          languageId: lang.id,
          status: 'online',
          strategy: lang.strategy,
          successCount: 0,
          failureCount: 0,
          cacheHitRate: 0,
        });
        console.log(`[VTE-LSP] Added default language: ${lang.id}`);
      }
    }

    // Try to load from config if service is available
    if (this.service) {
      try {
        const config = await this.service['configResolver']?.getConfig();
        if (config) {
          console.log(`[VTE-LSP] Found ${config.profiles.size} language profiles from config`);
          for (const [langId, profile] of config.profiles) {
            if (!this.metrics.has(langId)) {
              this.metrics.set(langId, {
                languageId: langId,
                status: 'online',
                strategy: profile.strategy,
                successCount: 0,
                failureCount: 0,
                cacheHitRate: 0,
              });
              console.log(`[VTE-LSP] Added language from config: ${langId}`);
            }
          }
        }
      } catch (err) {
        console.log('[VTE-LSP] Error loading config:', err);
      }
    }

    // Load cache stats
    const cache = getLspCache();
    const stats = cache.getStats();
    this.cacheStats = {
      size: stats.size,
      hitRate: stats.hitRate,
      oldestEntryAge: stats.oldestEntryAge,
      ttlMs: 5 * 60 * 1000,
      maxSize: 1000,
    };
    console.log(`[VTE-LSP] Cache stats: ${stats.size} entries`);

    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: LspTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: LspTreeNode): LspTreeNode[] {
    console.log(`[VTE-LSP] getChildren called, element: ${element ? 'exists' : 'root'}`);

    if (!element) {
      // Root nodes
      const nodes: LspTreeNode[] = [];

      console.log(`[VTE-LSP] Metrics count: ${this.metrics.size}`);

      // Language nodes
      for (const metrics of this.metrics.values()) {
        nodes.push(new LanguageNode(metrics, vscode.TreeItemCollapsibleState.None));
      }

      // Stats node
      nodes.push(new StatsNode(this.cacheStats));

      // Action nodes
      nodes.push(new ActionNode('clearCache', 'Clear Cache', 'trash'));
      nodes.push(new ActionNode('refreshStatus', 'Refresh Status', 'refresh'));
      nodes.push(new ActionNode('openConfigEditor', 'Open Config Editor', 'settings-gear'));

      console.log(`[VTE-LSP] Returning ${nodes.length} nodes`);
      return nodes;
    }

    return [];
  }

  getParent(element: LspTreeNode): undefined {
    return undefined;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

// ── Tree View Registration ──

export function registerLspStatusView(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): void {
  console.log('[VTE-LSP] Registering LSP status view');
  const provider = new LspStatusProvider(workspaceRoot);

  const treeView = vscode.window.createTreeView('vte-lsp-status', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  console.log('[VTE-LSP] TreeView created');
  context.subscriptions.push(treeView);

  // Register commands (only showLanguageDetails is unique to this provider)
  context.subscriptions.push(
    vscode.commands.registerCommand('vte-lsp.showLanguageDetails', (node: LanguageNode) => {
      // Show details in output channel
      const channel = vscode.window.createOutputChannel('VTE LSP Details');
      channel.appendLine(`Language: ${node.metrics.languageId}`);
      channel.appendLine(`Status: ${node.metrics.status}`);
      channel.appendLine(`Strategy: ${node.metrics.strategy}`);
      channel.appendLine(`Cache Hit Rate: ${(node.metrics.cacheHitRate * 100).toFixed(1)}%`);
      channel.appendLine(`Success: ${node.metrics.successCount}`);
      channel.appendLine(`Failures: ${node.metrics.failureCount}`);
      if (node.metrics.lastError) {
        channel.appendLine(`Last Error: ${node.metrics.lastError}`);
      }
      channel.show();
    })
  );
}
