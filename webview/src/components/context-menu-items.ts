import { h } from 'vue'

export interface ContextMenuItem {
  key: string
  label: string
  description: string
  icon: () => any
}

const FileIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
  h('polyline', { points: '14 2 14 8 20 8' })
])

const FolderIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })
])

const DocIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
  h('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' })
])

const SkillsIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }),
  h('path', { d: 'M2 17l10 5 10-5' }),
  h('path', { d: 'M2 12l10 5 10-5' })
])

const TerminalIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('polyline', { points: '4 17 10 11 4 5' }),
  h('line', { x1: '12', y1: '19', x2: '20', y2: '19' })
])

const GitIcon = () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', width: '14', height: '14' }, [
  h('circle', { cx: '18', cy: '18', r: '3' }),
  h('circle', { cx: '6', cy: '6', r: '3' }),
  h('path', { d: 'M6 21V9a9 9 0 0 0 9 9' })
])

export const DEFAULT_CONTEXT_ITEMS: ContextMenuItem[] = [
  { key: 'file', label: '文件', description: '选择项目中的代码文件', icon: FileIcon },
  { key: 'folder', label: '文件夹', description: '递归读取整个目录结构', icon: FolderIcon },
  { key: 'doc', label: '文档', description: 'Markdown、TXT 等文档文件', icon: DocIcon },
  { key: 'skills', label: 'Skills', description: '已配置的 Agent 技能文件', icon: SkillsIcon },
  { key: 'terminal', label: '终端', description: '读取终端当前输出内容', icon: TerminalIcon },
  { key: 'git', label: 'Git 变更', description: '工作区修改或最近提交记录', icon: GitIcon },
]
