/**
 * LSP Integration - Default Profiles
 *
 * Built-in default configurations for common programming languages.
 * These profiles are used as fallback when no user or project config exists.
 */

import { LspProfile } from './types';

/** Default LSP profiles for common languages */
export const DEFAULT_LSP_PROFILES: Record<string, LspProfile> = {
  // ── TypeScript/JavaScript ──
  typescript: {
    languageId: 'typescript',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.ts', '.tsx', '.mts', '.cts'],
    timeoutMs: 5000,
  },
  javascript: {
    languageId: 'javascript',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.js', '.jsx', '.mjs', '.cjs'],
    timeoutMs: 5000,
  },
  typescriptreact: {
    languageId: 'typescriptreact',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.tsx'],
    timeoutMs: 5000,
  },
  javascriptreact: {
    languageId: 'javascriptreact',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.jsx'],
    timeoutMs: 5000,
  },

  // ── Python ──
  python: {
    languageId: 'python',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.py', '.pyi'],
    timeoutMs: 5000,
  },

  // ── Rust ──
  rust: {
    languageId: 'rust',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.rs'],
    timeoutMs: 5000,
  },

  // ── Go ──
  go: {
    languageId: 'go',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.go'],
    timeoutMs: 5000,
  },

  // ── Java ──
  java: {
    languageId: 'java',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.java'],
    timeoutMs: 5000,
  },

  // ── C/C++ ──
  c: {
    languageId: 'c',
    tools: ['definition', 'references', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.c', '.h'],
    timeoutMs: 5000,
  },
  cpp: {
    languageId: 'cpp',
    tools: ['definition', 'references', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.cpp', '.cxx', '.cc', '.hpp', '.hxx', '.hh'],
    timeoutMs: 5000,
  },

  // ── C# ──
  csharp: {
    languageId: 'csharp',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.cs'],
    timeoutMs: 5000,
  },

  // ── Ruby ──
  ruby: {
    languageId: 'ruby',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.rb', '.erb'],
    timeoutMs: 5000,
  },

  // ── PHP ──
  php: {
    languageId: 'php',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.php'],
    timeoutMs: 5000,
  },

  // ── Swift ──
  swift: {
    languageId: 'swift',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.swift'],
    timeoutMs: 5000,
  },

  // ── Kotlin ──
  kotlin: {
    languageId: 'kotlin',
    tools: ['definition', 'references', 'hover', 'documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.kt', '.kts'],
    timeoutMs: 5000,
  },

  // ── JSON ──
  json: {
    languageId: 'json',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.json', '.jsonc'],
    timeoutMs: 3000,
  },

  // ── YAML ──
  yaml: {
    languageId: 'yaml',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.yaml', '.yml'],
    timeoutMs: 3000,
  },

  // ── Markdown ──
  markdown: {
    languageId: 'markdown',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.md', '.mdx'],
    timeoutMs: 3000,
  },

  // ── XML ──
  xml: {
    languageId: 'xml',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.xml', '.xsd', '.xsl'],
    timeoutMs: 3000,
  },

  // ── HTML ──
  html: {
    languageId: 'html',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.html', '.htm', '.vue', '.svelte'],
    timeoutMs: 3000,
  },

  // ── CSS/SCSS/Less ──
  css: {
    languageId: 'css',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.css'],
    timeoutMs: 3000,
  },
  scss: {
    languageId: 'scss',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.scss'],
    timeoutMs: 3000,
  },
  less: {
    languageId: 'less',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.less'],
    timeoutMs: 3000,
  },

  // ── Shell Script ──
  shellscript: {
    languageId: 'shellscript',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.sh', '.bash', '.zsh'],
    timeoutMs: 3000,
  },

  // ── SQL ──
  sql: {
    languageId: 'sql',
    tools: ['documentSymbol'],
    strategy: 'builtin',
    fileExtensions: ['.sql'],
    timeoutMs: 3000,
  },
};

/** File extension to language ID mapping */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {};

// Build reverse mapping from extensions to language IDs
for (const [langId, profile] of Object.entries(DEFAULT_LSP_PROFILES)) {
  for (const ext of profile.fileExtensions) {
    EXTENSION_TO_LANGUAGE[ext] = langId;
  }
}

/** Get default profile for a language */
export function getDefaultProfile(languageId: string): LspProfile | undefined {
  return DEFAULT_LSP_PROFILES[languageId];
}

/** Get language ID from file extension */
export function getLanguageFromExtension(extension: string): string | undefined {
  return EXTENSION_TO_LANGUAGE[extension];
}

/** Get all supported file extensions */
export function getAllSupportedExtensions(): string[] {
  const extensions = new Set<string>();
  for (const profile of Object.values(DEFAULT_LSP_PROFILES)) {
    for (const ext of profile.fileExtensions) {
      extensions.add(ext);
    }
  }
  return Array.from(extensions);
}
