/**
 * Task Complexity Analyzer
 * Evaluates user requests to determine if task tracking is needed.
 */

export type TaskMode = 'llm-auto' | 'plugin-auto' | 'off'

export interface ComplexityResult {
  score: number        // 0-100
  level: 'trivial' | 'simple' | 'moderate' | 'complex'
  needsTasks: boolean
  reasons: string[]
}

// Keywords that indicate complexity
const COMPLEX_KEYWORDS: Record<string, number> = {
  // High complexity (+20)
  '重构': 20, 'refactor': 20, '迁移': 20, 'migrate': 20,
  '架构': 20, 'architecture': 20, '重写': 20, 'rewrite': 20,
  '实现': 15, 'implement': 15, '开发': 15, 'develop': 15,
  '搭建': 15, 'scaffold': 15,
  // Medium complexity (+10)
  '优化': 10, 'optimize': 10, '修复': 10, 'fix': 10,
  '添加': 10, 'add': 10, '创建': 10, 'create': 10,
  '修改': 10, 'modify': 10, '更新': 10, 'update': 10,
  '集成': 10, 'integrate': 10, '配置': 10, 'configure': 10,
  // Low complexity (+5)
  '查看': 5, 'check': 5, '分析': 5, 'analyze': 5,
  '解释': 5, 'explain': 5, '列出': 5, 'list': 5,
  '搜索': 5, 'search': 5, '查找': 5, 'find': 5,
}

// Patterns that indicate multi-step work
const MULTI_STEP_PATTERNS = [
  /和|与|以及|then|also|and/i,
  /第[一二三四五六七八九十]步|step\s*\d/i,
  /先.*再.*然后|first.*then/i,
  /整个|全部|all|entire/i,
]

// File-related patterns
const FILE_PATTERNS = [
  /多个文件|multiple files|所有文件/i,
  /所有.*组件|all.*components/i,
  /整个项目|whole project/i,
  /src\/|pages\/|components\//i,
]

export function analyzeComplexity(userMessage: string): ComplexityResult {
  let score = 0
  const reasons: string[] = []

  // Check keywords
  for (const [keyword, points] of Object.entries(COMPLEX_KEYWORDS)) {
    if (userMessage.includes(keyword)) {
      score += points
      reasons.push(`关键词: ${keyword}`)
    }
  }

  // Check multi-step patterns
  for (const pattern of MULTI_STEP_PATTERNS) {
    if (pattern.test(userMessage)) {
      score += 15
      reasons.push(`多步骤模式: ${pattern.source}`)
      break
    }
  }

  // Check file patterns
  for (const pattern of FILE_PATTERNS) {
    if (pattern.test(userMessage)) {
      score += 15
      reasons.push(`多文件操作: ${pattern.source}`)
      break
    }
  }

  // Message length factor (longer = more complex)
  if (userMessage.length > 200) {
    score += 10
    reasons.push('长描述')
  }
  if (userMessage.length > 500) {
    score += 10
    reasons.push('非常详细的描述')
  }

  // Cap at 100
  score = Math.min(score, 100)

  let level: ComplexityResult['level']
  if (score < 15) level = 'trivial'
  else if (score < 35) level = 'simple'
  else if (score < 60) level = 'moderate'
  else level = 'complex'

  // Threshold: moderate and above need task tracking
  const needsTasks = score >= 35

  return { score, level, needsTasks, reasons }
}

/**
 * For LLM-auto mode: check if LLM used task tools when it should have.
 * Returns true if the LLM is "lazy" (skipped tasks when needed).
 */
export function checkLLMLaziness(
  userMessage: string,
  toolCalls: string[],
  complexity: ComplexityResult
): { isLazy: boolean; message: string } {
  if (!complexity.needsTasks) {
    return { isLazy: false, message: '' }
  }

  const usedTaskTools = toolCalls.some(t =>
    t.startsWith('task_')
  )

  if (!usedTaskTools && complexity.level === 'complex') {
    return {
      isLazy: true,
      message: `⚠️ 任务复杂度较高(${complexity.level}/${complexity.score}分)，但你没有使用任务清单。建议先用 task_create 创建任务再执行。`,
    }
  }

  if (!usedTaskTools && complexity.level === 'moderate') {
    return {
      isLazy: false, // Not strictly lazy for moderate, just a suggestion
      message: '',
    }
  }

  return { isLazy: false, message: '' }
}

/**
 * For plugin-auto mode: generate system prompt instruction based on complexity.
 */
export function getComplexityInstruction(complexity: ComplexityResult): string {
  if (!complexity.needsTasks) {
    return ''
  }

  const reasons = complexity.reasons.slice(0, 3).join('、')

  if (complexity.level === 'complex') {
    return `\n\n[TASK INSTRUCTION] This is a complex task (score: ${complexity.score}/100, reasons: ${reasons}). You MUST use task_create to break it into subtasks first, then use task_update to track progress as you work. Do not skip task tracking.`
  }

  return `\n\n[TASK INSTRUCTION] This is a moderately complex task (score: ${complexity.score}/100, reasons: ${reasons}). Consider using task_create to track your progress if the work involves multiple steps.`
}
