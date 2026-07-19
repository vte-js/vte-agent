import type { SlashCommandItem } from './components/SlashCommand.vue'

// Built-in slash commands registered for the input-area command picker.
// Single source of truth, reused by:
//   - InputArea.vue  (the "/" command picker popup)
//   - ConfigPanel.vue (Settings → 快捷命令, read-only registry view)
export const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  { name: 'code-review', description: '审查代码质量、Bug、安全和性能问题', category: 'Skills', icon: 'search', color: 'rgba(34,197,94,0.15)', iconColor: '#22c55e', action: 'skill:code-review' },
  { name: 'unit-test', description: '为代码生成单元测试用例', category: 'Skills', icon: 'test', color: 'rgba(59,130,246,0.15)', iconColor: '#3b82f6', action: 'skill:unit-test' },
  { name: 'refactor', description: '重构代码提高可维护性', category: 'Skills', icon: 'code', color: 'rgba(168,85,247,0.15)', iconColor: '#a855f7', action: 'skill:refactor' },
  { name: 'debug', description: '系统化调试和问题定位', category: 'Skills', icon: 'bug', color: 'rgba(239,68,68,0.15)', iconColor: '#ef4444', action: 'skill:debug' },
  { name: 'api-design', description: '设计 RESTful API 接口', category: 'Skills', icon: 'zap', color: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b', action: 'skill:api-design' },
  { name: 'security-audit', description: '安全审计和漏洞检测', category: 'Skills', icon: 'shield', color: 'rgba(239,68,68,0.15)', iconColor: '#ef4444', action: 'skill:security-audit' },
  { name: 'database-design', description: '数据库 Schema 设计和优化', category: 'Skills', icon: 'database', color: 'rgba(20,184,166,0.15)', iconColor: '#14b8a6', action: 'skill:database-design' },
  { name: 'performance', description: '性能分析和优化', category: 'Skills', icon: 'zap', color: 'rgba(245,158,11,0.15)', iconColor: '#f59e0b', action: 'skill:performance' },
  { name: 'git-workflow', description: 'Git 工作流最佳实践', category: 'Skills', icon: 'git', color: 'rgba(99,102,241,0.15)', iconColor: '#818cf8', action: 'skill:git-workflow' },
]
