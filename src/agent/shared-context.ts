/**
 * Shared (read-only) context across agents.
 *
 * Realizes the "all agents share context" half of the original multi-agent
 * design WITHOUT giving every agent a mutable view of every other agent's
 * conversation. Instead we aggregate *completed work* (finished work orders
 * and their results) and expose it as a read-only summary that the prompt
 * builder injects into each agent's task. This gives siblings visibility
 * into what others have done (so e.g. the test agent sees the dev agent's
 * output) while writes remain isolated in each agent's sandbox.
 */

export interface SharedContextEntry {
  agentId: string
  role: string
  roleName: string
  title: string
  result: string
  timestamp: string
}

export class SharedContext {
  private entries: SharedContextEntry[] = []

  addEntry(entry: SharedContextEntry): void {
    this.entries.push(entry)
  }

  /**
   * Read-only summary of OTHER agents' completed work, for context sharing.
   * Excludes the requesting agent's own entries so it doesn't echo itself.
   */
  getContextForAgent(excludeAgentId?: string): string {
    const others = this.entries.filter(e => e.agentId !== excludeAgentId)
    if (others.length === 0) return ''

    const lines = others.map(e => {
      const snippet = e.result.replace(/\s+/g, ' ').trim().slice(0, 400)
      return `- [${e.roleName}] ${e.title}: ${snippet}`
    })

    return (
      `## 其他 Agent 的已完成工作（只读共享上下文，请勿修改）\n` + lines.join('\n')
    )
  }

  clear(): void {
    this.entries = []
  }
}
