/**
 * get_context — the on-demand context retrieval tool for sub-agents.
 *
 * Sub-agents call this tool to learn about the project / what the main agent
 * already explored / what sibling agents have produced. They do NOT get this
 * context pasted into their prompt — retrieval is just-in-time and focused,
 * which keeps token usage low (opencode / TUI style).
 *
 * Register this tool once (in src/tools/index.ts) so it is available to every
 * AgentEngine instance, including auto-provisioned sub-agents.
 */

import { ToolDefinition } from '../shared/types'
import { AgentContextSystem, ContextTopic } from './context-system'

export const getContextTool: ToolDefinition = {
  name: 'get_context',
  description:
    '检索项目上下文。当你需要了解项目结构、主 agent 已经读过哪些文件、或其他 agent 的产出时，调用本工具按需获取（不要假设项目结构，也不要在脑中凭空猜测）。' +
    '可选参数 topic：' +
    '"structure"（默认，返回项目顶层结构概要 + 主 agent 已读文件列表，最省 token）、' +
    '"read_files"（仅返回主 agent 已读文件列表）、' +
    '"shared"（仅返回其他 agent 已完成的产出，只读共享上下文）、' +
    '"full"（返回完整项目索引，仅在确实需要全量结构时使用，较费 token）。' +
    '只在需要时调用，不要每次都拉取 full。',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        enum: ['structure', 'read_files', 'shared', 'full'],
        description: '要检索的上下文类型（见工具描述）',
      },
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const topic = (args?.topic as ContextTopic) || 'structure'
    const text = AgentContextSystem.instance.query(topic)
    return { type: 'text', content: text }
  },
}
