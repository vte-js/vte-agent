/**
 * AgentContextSystem — the single, dedicated context authority for a
 * multi-agent delegation.
 *
 * Design principle (the whole point of this module):
 *   Sub-agents do NOT receive the project context pasted into their prompt.
 *   Dumping the same context blob into every parallel sub-agent's prompt is
 *   exactly the token-wasteful pattern of traditional GUI agent frameworks.
 *   Instead, sub-agents *retrieve* context on demand through the
 *   `get_context` tool (see context-tool.ts), which queries THIS system.
 *   This mirrors the opencode / TUI philosophy: a tiny system prompt plus
 *   just-in-time retrieval keeps token usage low.
 *
 * The system aggregates three sources of context:
 *   1. projectIndex  — the file-tree / package / git snapshot of the workspace
 *   2. mainReadFiles — files the MAIN agent already explored (so sub-agents
 *      can skip re-reading them)
 *   3. shared        — read-only, aggregated *completed work* from sibling
 *      agents (so e.g. the test agent sees what the dev agent produced)
 *
 * A single instance is shared across the whole delegation. The host (panel)
 * populates it once at delegation start; sub-agents query it as needed.
 */

import { ProjectIndex, FileNode } from '../shared/types'
import { formatIndexForLLM } from '../context/protocol'
import { SharedContext } from './shared-context'

export type ContextTopic = 'structure' | 'read_files' | 'shared' | 'full'

const MAX_TREE_DEPTH = 2
const MAX_READ_FILES = 80

export class AgentContextSystem {
  private static _instance: AgentContextSystem | null = null

  /** Process-wide singleton — one delegation's context authority. */
  static get instance(): AgentContextSystem {
    if (!this._instance) this._instance = new AgentContextSystem()
    return this._instance
  }

  private projectIndex: ProjectIndex | null = null
  private mainReadFiles: string[] = []
  private shared = new SharedContext()

  // ── Population (called by the host at delegation start) ──

  /** Wipe all context for a fresh delegation. */
  reset(): void {
    this.projectIndex = null
    this.mainReadFiles = []
    this.shared.clear()
  }

  setProjectIndex(index: ProjectIndex | null): void {
    this.projectIndex = index
  }

  setMainReadFiles(files: string[]): void {
    this.mainReadFiles = files
  }

  /** The shared, cross-agent completed-work log (fed by AgentPool). */
  getShared(): SharedContext {
    return this.shared
  }

  // ── Retrieval (called by the get_context tool) ──

  /**
   * Return FOCUSED context by topic. Each branch is deliberately cheap;
   * the caller (a sub-agent) opts into how much it pulls.
   */
  query(topic?: ContextTopic): string {
    switch (topic) {
      case 'read_files':
        return this.readFiles()
      case 'shared':
        return this.sharedContext()
      case 'full':
        return this.fullIndex()
      case 'structure':
      default:
        return [this.structure(), this.readFiles()].filter(Boolean).join('\n\n')
    }
  }

  /** Concise project skeleton — only the top levels, cheap to return. */
  private structure(): string {
    if (!this.projectIndex) {
      return '## 项目结构\n（项目索引尚未构建；如需完整结构，调用 get_context({ topic: "full" })）'
    }
    const pkg = this.projectIndex.packageInfo
    const lines: string[] = ['## 项目结构（概要，仅顶层）']
    if (pkg?.name) {
      lines.push(`名称: ${pkg.name}`)
    }
    lines.push(...this.renderTree(this.projectIndex.structure, 0))
    return lines.join('\n')
  }

  private renderTree(nodes: FileNode[], depth: number): string[] {
    const out: string[] = []
    if (depth > MAX_TREE_DEPTH) return out
    for (const node of nodes) {
      const prefix = '  '.repeat(depth)
      if (node.type === 'directory') {
        out.push(`${prefix}${node.name}/`)
        if (node.children) out.push(...this.renderTree(node.children, depth + 1))
      } else {
        out.push(`${prefix}${node.name}`)
      }
    }
    return out
  }

  /** Files the main agent already explored — sub-agents can skip re-reading. */
  private readFiles(): string {
    if (this.mainReadFiles.length === 0) {
      return '## 主 agent 已读文件\n（主 agent 尚未读取任何文件；子 agent 可正常使用 read/list 工具自行探索）'
    }
    const list = this.mainReadFiles.slice(0, MAX_READ_FILES).map((f) => `- ${f}`).join('\n')
    const more = this.mainReadFiles.length > MAX_READ_FILES
      ? `\n…（共 ${this.mainReadFiles.length} 个，仅展示前 ${MAX_READ_FILES} 个）`
      : ''
    return `## 主 agent 已读文件（供参考，避免重复读取）\n${list}${more}`
  }

  /** Read-only summary of OTHER agents' completed work. */
  private sharedContext(): string {
    const text = this.shared.getContextForAgent(undefined)
    return text || '（尚无其他 agent 的已完成产出）'
  }

  /** Full project index — only when a sub-agent explicitly needs the whole map. */
  private fullIndex(): string {
    if (!this.projectIndex) return '（无项目索引）'
    return formatIndexForLLM(this.projectIndex)
  }
}
