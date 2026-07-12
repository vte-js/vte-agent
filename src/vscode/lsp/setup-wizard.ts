/**
 * LSP Integration - Setup Wizard
 *
 * Command: vteAgent.setupLsp
 * Scans workspace for project files and guides user through LSP configuration.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { RawLspConfig } from './types';
import { DEFAULT_LSP_PROFILES, getAllSupportedExtensions } from './defaults';

/** Configuration file path */
const CONFIG_FILE_PATH = '.github/agent-lsp.json';

/** Project file patterns for language detection */
const PROJECT_PATTERNS: Record<string, { files: string[]; languageId: string }> = {
  typescript: {
    files: ['package.json', 'tsconfig.json', 'tsconfig.*.json'],
    languageId: 'typescript',
  },
  javascript: {
    files: ['package.json', 'jsconfig.json'],
    languageId: 'javascript',
  },
  python: {
    files: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
    languageId: 'python',
  },
  rust: {
    files: ['Cargo.toml'],
    languageId: 'rust',
  },
  go: {
    files: ['go.mod'],
    languageId: 'go',
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    languageId: 'java',
  },
  csharp: {
    files: ['*.csproj', '*.sln'],
    languageId: 'csharp',
  },
  ruby: {
    files: ['Gemfile', '*.gemspec'],
    languageId: 'ruby',
  },
  php: {
    files: ['composer.json'],
    languageId: 'php',
  },
  swift: {
    files: ['Package.swift'],
    languageId: 'swift',
  },
  kotlin: {
    files: ['build.gradle.kts', 'pom.xml'],
    languageId: 'kotlin',
  },
};

export class SetupWizard {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Run the setup wizard.
   */
  async run(): Promise<void> {
    // 1. Scan for project files
    const detectedLanguages = await this.scanWorkspace();

    if (detectedLanguages.length === 0) {
      const choice = await vscode.window.showInformationMessage(
        'No programming language detected in this workspace. Would you like to create a configuration anyway?',
        'Yes',
        'No'
      );

      if (choice !== 'Yes') {
        return;
      }
      // Create configuration with default languages when user clicks Yes
      await this.createConfiguration(['typescript', 'python']);
    } else {
      // Show detected languages
      const languageList = detectedLanguages.map((l) => `• ${l}`).join('\n');
      const choice = await vscode.window.showInformationMessage(
        `Detected the following languages in this workspace:\n\n${languageList}\n\nWould you like to create LSP configuration for these languages?`,
        'Create Configuration',
        'Customize',
        'Cancel'
      );

      if (choice === 'Cancel') {
        return;
      }

      if (choice === 'Customize') {
        // Let user select which languages to include
        const selected = await this.selectLanguages(detectedLanguages);
        if (!selected || selected.length === 0) {
          return;
        }
        await this.createConfiguration(selected);
      } else {
        await this.createConfiguration(detectedLanguages);
      }
    }
  }

  /**
   * Scan workspace for project files.
   */
  private async scanWorkspace(): Promise<string[]> {
    const detectedLanguages: string[] = [];

    console.log('[VTE-LSP] Scanning workspace for project files...');

    for (const [langId, pattern] of Object.entries(PROJECT_PATTERNS)) {
      for (const filePattern of pattern.files) {
        try {
          const files = await vscode.workspace.findFiles(filePattern, '**/node_modules/**', 1);
          console.log(`[VTE-LSP] Pattern "${filePattern}": found ${files.length} files`);
          if (files.length > 0) {
            if (!detectedLanguages.includes(pattern.languageId)) {
              detectedLanguages.push(pattern.languageId);
              console.log(`[VTE-LSP] Detected language: ${pattern.languageId}`);
            }
            break;
          }
        } catch (error) {
          console.error(`[VTE-LSP] Error scanning pattern "${filePattern}":`, error);
        }
      }
    }

    console.log(`[VTE-LSP] Scan complete. Detected languages: ${detectedLanguages.join(', ') || 'none'}`);
    return detectedLanguages;
  }

  /**
   * Let user select which languages to configure.
   */
  private async selectLanguages(detectedLanguages: string[]): Promise<string[] | undefined> {
    const items: vscode.QuickPickItem[] = detectedLanguages.map((lang) => ({
      label: lang,
      description: DEFAULT_LSP_PROFILES[lang]?.fileExtensions.join(', '),
      picked: true,
    }));

    // Add common languages not detected
    const commonLanguages = ['typescript', 'python', 'rust', 'go', 'java'];
    for (const lang of commonLanguages) {
      if (!detectedLanguages.includes(lang) && DEFAULT_LSP_PROFILES[lang]) {
        items.push({
          label: lang,
          description: DEFAULT_LSP_PROFILES[lang].fileExtensions.join(', '),
          picked: false,
        });
      }
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select languages to configure',
      canPickMany: true,
    });

    return selected?.map((item) => item.label);
  }

  /**
   * Create configuration file.
   */
  private async createConfiguration(languages: string[]): Promise<void> {
    console.log(`[VTE-LSP] Creating configuration for languages: ${languages.join(', ')}`);

    // Build configuration
    const config: RawLspConfig = {
      version: 1,
      profiles: {},
    };

    for (const langId of languages) {
      const defaultProfile = DEFAULT_LSP_PROFILES[langId];
      if (defaultProfile) {
        config.profiles[langId] = {
          tools: defaultProfile.tools,
          strategy: defaultProfile.strategy,
          fileExtensions: defaultProfile.fileExtensions,
          timeoutMs: defaultProfile.timeoutMs,
        };
        console.log(`[VTE-LSP] Added profile for ${langId}`);
      }
    }

    // Check if config already exists
    const configPath = path.join(this.workspaceRoot, CONFIG_FILE_PATH);
    const configUri = vscode.Uri.file(configPath);
    console.log(`[VTE-LSP] Config path: ${configPath}`);

    try {
      await vscode.workspace.fs.stat(configUri);
      // File exists, ask to overwrite
      const choice = await vscode.window.showWarningMessage(
        'LSP configuration file already exists. Overwrite?',
        'Overwrite',
        'Cancel'
      );

      if (choice !== 'Overwrite') {
        console.log('[VTE-LSP] User cancelled overwrite');
        return;
      }
    } catch {
      // File doesn't exist, proceed
    }

    // Create directory if needed
    const dirPath = path.join(this.workspaceRoot, '.github');
    const dirUri = vscode.Uri.file(dirPath);
    try {
      await vscode.workspace.fs.stat(dirUri);
    } catch {
      console.log('[VTE-LSP] Creating .github directory');
      await vscode.workspace.fs.createDirectory(dirUri);
    }

    // Write configuration file
    const content = JSON.stringify(config, null, 2);
    console.log(`[VTE-LSP] Writing config: ${content}`);
    await vscode.workspace.fs.writeFile(configUri, Buffer.from(content, 'utf-8'));
    console.log('[VTE-LSP] Config file written successfully');

    // Show success message
    const choice = await vscode.window.showInformationMessage(
      `LSP configuration created successfully at ${CONFIG_FILE_PATH}`,
      'Open File',
      'Done'
    );

    if (choice === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(configUri);
      await vscode.window.showTextDocument(doc);
    }
  }
}

/**
 * Register the setup wizard command.
 */
export function registerSetupWizardCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): void {
  const command = vscode.commands.registerCommand(
    'vteAgent.setupLsp',
    async () => {
      console.log(`[VTE-LSP] Setup wizard started. Workspace: ${workspaceRoot}`);
      try {
        const wizard = new SetupWizard(workspaceRoot);
        await wizard.run();
        console.log('[VTE-LSP] Setup wizard completed');
      } catch (error) {
        console.error('[VTE-LSP] Setup wizard failed:', error);
        vscode.window.showErrorMessage(`LSP Setup failed: ${error}`);
      }
    }
  );

  context.subscriptions.push(command);
}
