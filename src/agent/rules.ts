/**
 * Rules engine — reads project/user rule files and injects into system prompt
 *
 * Pattern (inspired by Cline .clinerules / Claude Code CLAUDE.md):
 * - Built-in rules (source code) — always active, base behavior
 * - .vte/rules/*.md  — project-level rules (git-tracked)
 * - .vte/rules/local/*.md — local overrides (gitignored)
 * - ~/.vte/rules/*.md — user-wide defaults
 * - Rules are markdown files, read at runtime, injected into system prompt
 * - Order: built-in → project → local → global (later rules can override)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RuleFile {
  path: string
  name: string
  content: string
  source: 'builtin' | 'project' | 'local' | 'global'
}

// Load built-in rules from source
let builtinRulesCache: string | null = null
function getBuiltinRules(): string {
  if (builtinRulesCache !== null) return builtinRulesCache
  try {
    // In compiled output, __dirname is dist/agent/, so default-rules.md is at ../../src/agent/
    // But we bundle it, so read from the same directory as this file
    const rulesPath = path.join(__dirname, 'default-rules.md')
    builtinRulesCache = fs.readFileSync(rulesPath, 'utf-8').trim()
  } catch {
    // Fallback: try relative to src
    try {
      const rulesPath = path.resolve(__dirname, '../../src/agent/default-rules.md')
      builtinRulesCache = fs.readFileSync(rulesPath, 'utf-8').trim()
    } catch {
      builtinRulesCache = ''
    }
  }
  return builtinRulesCache
}

/**
 * Discover and load all rule files for a workspace.
 * Order: built-in → project → local → global
 */
export function loadRules(workspaceRoot: string): RuleFile[] {
  const rules: RuleFile[] = []

  // 1. Built-in rules (always first)
  const builtinContent = getBuiltinRules()
  if (builtinContent) {
    rules.push({
      path: '(built-in)',
      name: 'VTE Agent Defaults',
      content: builtinContent,
      source: 'builtin',
    })
  }

  // 2. Project rules: .vte/rules/*.md
  const projectRulesDir = path.join(workspaceRoot, '.vte', 'rules')
  rules.push(...readRuleDir(projectRulesDir, 'project'))

  // 3. Local rules: .vte/rules/local/*.md (gitignored, for personal overrides)
  const localRulesDir = path.join(projectRulesDir, 'local')
  rules.push(...readRuleDir(localRulesDir, 'local'))

  // 4. Global rules: ~/.vte/rules/*.md (user-wide defaults)
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir) {
    const globalRulesDir = path.join(homeDir, '.vte', 'rules')
    rules.push(...readRuleDir(globalRulesDir, 'global'))
  }

  console.log(`[VTE] Loaded ${rules.length} rule files: ${rules.map(r => r.name).join(', ') || '(none)'}`)
  return rules
}

function readRuleDir(dir: string, source: RuleFile['source']): RuleFile[] {
  const rules: RuleFile[] = []

  try {
    if (!fs.existsSync(dir)) return rules

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'))
    for (const file of files) {
      const filePath = path.join(dir, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8').trim()
        if (content.length > 0) {
          rules.push({
            path: filePath,
            name: file,
            content,
            source,
          })
        }
      } catch (e) {
        console.warn(`[VTE] Failed to read rule file: ${filePath}`)
      }
    }
  } catch (e) {
    // Directory doesn't exist, that's fine
  }

  return rules
}

/**
 * Format rules into a system prompt section.
 */
export function formatRulesForPrompt(rules: RuleFile[]): string {
  if (rules.length === 0) return ''

  const builtin = rules.filter(r => r.source === 'builtin')
  const user = rules.filter(r => r.source !== 'builtin')

  const lines: string[] = []

  // Built-in rules (always present)
  if (builtin.length > 0) {
    lines.push('\n## Default Rules')
    for (const rule of builtin) {
      lines.push(rule.content)
    }
  }

  // User rules (project + local + global)
  if (user.length > 0) {
    lines.push('\n## Project Rules')
    for (const rule of user) {
      lines.push(`\n### ${rule.name} (${rule.source})`)
      lines.push(rule.content)
    }
  }

  return lines.join('\n')
}

/**
 * Create the default .vte/rules directory structure with a starter rule file.
 */
export function initRulesDir(workspaceRoot: string): void {
  const rulesDir = path.join(workspaceRoot, '.vte', 'rules')
  const localDir = path.join(rulesDir, 'local')

  try {
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true })
    }
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true })
    }

    // Create starter rule file
    const starterPath = path.join(rulesDir, 'CODING_STANDARDS.md')
    if (!fs.existsSync(starterPath)) {
      fs.writeFileSync(starterPath, `# Coding Standards

## Style
- Use TypeScript strict mode
- Prefer const over let
- Use descriptive variable names

## Architecture
- Keep components small and focused
- One component per file

## Testing
- Write tests for new features
- Use descriptive test names

## Git
- Use conventional commits (feat:, fix:, refactor:)
- One logical change per commit
`)
    }

    console.log(`[VTE] Rules directory initialized at ${rulesDir}`)
  } catch (e) {
    console.warn(`[VTE] Failed to init rules dir: ${e}`)
  }
}
