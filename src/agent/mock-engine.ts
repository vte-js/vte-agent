/**
 * Mock AgentEngine for gray-box testing.
 * Returns predefined tool call sequences without hitting the real API.
 */

import { ContextManager, ToolDefinition, ToolResult } from '../shared/types';
import { getAllTools } from './registry';

export interface MockStep {
  tool: string
  args: Record<string, any>
  result?: string
}

export interface MockScenario {
  name: string
  description: string
  steps: MockStep[]
  finalResponse: string
}

// Predefined test scenarios
export const MOCK_SCENARIOS: MockScenario[] = [
  {
    name: 'list_files',
    description: '测试 list 工具 - 列出项目文件',
    steps: [
      { tool: 'list', args: { path: '.' } },
    ],
    finalResponse: '项目根目录包含以下文件和文件夹：\n- src/\n- package.json\n- tsconfig.json',
  },
  {
    name: 'read_file',
    description: '测试 read 工具 - 读取文件内容',
    steps: [
      { tool: 'read', args: { path: 'package.json' } },
    ],
    finalResponse: 'package.json 的内容显示这是一个 VSCode 扩展项目，依赖了 vue3 和 vite。',
  },
  {
    name: 'search_code',
    description: '测试 search + grep 工具 - 搜索代码',
    steps: [
      { tool: 'grep', args: { pattern: 'import', path: 'src' } },
    ],
    finalResponse: '找到了包含 import 语句的文件。',
  },
  {
    name: 'edit_file',
    description: '测试 read + edit 工具链 - 先读后改',
    steps: [
      { tool: 'read', args: { path: 'package.json' } },
    ],
    finalResponse: '已读取 package.json 文件内容。',
  },
  {
    name: 'edit_with_diff',
    description: '测试 edit 工具 - 编辑文件并显示代码差异',
    steps: [
      {
        tool: 'read',
        args: { path: 'src/app.ts' },
        result: 'export function hello() {\n  return "hello"\n}\n',
      },
      {
        tool: 'edit',
        args: { path: 'src/app.ts', oldString: 'export function hello() {\n  return "hello"\n}', newString: 'export function hello(name: string): string {\n  return `hello ${name}`\n}' },
        result: 'diff --git a/src/app.ts b/src/app.ts\nindex 1234567..abcdefg 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,3 +1,3 @@\n-export function hello() {\n-  return "hello"\n+export function hello(name: string): string {\n+  return `hello ${name}`\n }',
      },
    ],
    finalResponse: '已修改 src/app.ts：给 hello 函数添加了 name 参数和类型注解。',
  },
  {
    name: 'git_operations',
    description: '测试 git 工具 - 查看仓库状态（容错）',
    steps: [
      { tool: 'git', args: { command: 'status' } },
    ],
    finalResponse: 'Git 状态查询完成。',
  },
  {
    name: 'task_workflow',
    description: '测试任务工具链 - 完整工作流覆盖所有状态',
    steps: [
      { tool: 'task_create', args: { title: '设计数据库表结构', description: '定义用户表和权限表' } },
      { tool: 'task_create', args: { title: '实现用户注册 API', description: 'POST /api/register' } },
      { tool: 'task_create', args: { title: '实现登录鉴权', description: 'JWT token 签发和验证' } },
      { tool: 'task_create', args: { title: '编写单元测试', description: '覆盖核心接口' } },
      { tool: 'task_create', args: { title: '部署到测试环境', description: '需要运维配合' } },
      { tool: 'task_update', args: { id: 1, status: 'done' } },
      { tool: 'task_update', args: { id: 2, status: 'done' } },
      { tool: 'task_update', args: { id: 3, status: 'in_progress' } },
      { tool: 'task_update', args: { id: 5, status: 'blocked' } },
      { tool: 'task_list', args: {} },
    ],
    finalResponse: '任务清单已更新：2个已完成，1个进行中，1个待处理，1个阻塞（等待运维）。',
  },
  {
    name: 'task_subtasks',
    description: '测试子任务 - 创建父任务+子任务，验证自动完成',
    steps: [
      { tool: 'task_create', args: { title: '实现用户认证模块', description: '完整的认证功能' } },
      { tool: 'task_create', args: { title: '设计登录表单 UI', parent_id: 1 } },
      { tool: 'task_create', args: { title: '实现登录 API 接口', parent_id: 1 } },
      { tool: 'task_create', args: { title: '实现 JWT 鉴权中间件', parent_id: 1 } },
      { tool: 'task_update', args: { id: 2, status: 'done' } },
      { tool: 'task_update', args: { id: 3, status: 'done' } },
      { tool: 'task_update', args: { id: 4, status: 'done' } },
      { tool: 'task_list', args: {} },
    ],
    finalResponse: '父任务 #1 的3个子任务全部完成，父任务自动标记为完成。',
  },
  {
    name: 'task_delete',
    description: '测试任务删除 - 删除父任务应级联删除子任务',
    steps: [
      { tool: 'task_create', args: { title: '临时调试任务' } },
      { tool: 'task_create', args: { title: '调试子步骤', parent_id: 6 } },
      { tool: 'task_list', args: {} },
      { tool: 'task_delete', args: { id: 6 } },
      { tool: 'task_list', args: {} },
    ],
    finalResponse: '父任务和子任务均被删除。',
  },
  {
    name: 'glob_find',
    description: '测试 glob 工具 - 查找文件',
    steps: [
      { tool: 'glob', args: { pattern: '*.ts', path: 'src' } },
    ],
    finalResponse: '找到了项目中的 TypeScript 源文件。',
  },
  {
    name: 'diagnostics_check',
    description: '测试 diagnostics 工具 - 检查代码质量',
    steps: [
      { tool: 'diagnostics', args: { path: 'src/agent/engine.ts' } },
    ],
    finalResponse: '代码检查通过，没有发现错误。',
  },
  {
    name: 'bash_command',
    description: '测试 bash 工具 - 执行命令',
    steps: [
      { tool: 'bash', args: { command: 'node --version' } },
    ],
    finalResponse: 'Node.js 版本正常。',
  },
  {
    name: 'complex_workflow',
    description: '复合工作流 - 多工具协作完成任务',
    steps: [
      { tool: 'glob', args: { pattern: '*.json', path: '.' } },
      { tool: 'read', args: { path: 'package.json' } },
      { tool: 'bash', args: { command: 'node --version' } },
      { tool: 'task_create', args: { title: '分析项目结构', description: '了解项目依赖和配置' } },
      { tool: 'task_update', args: { id: 1, status: 'in_progress' } },
      { tool: 'task_update', args: { id: 1, status: 'done' } },
    ],
    finalResponse: '已完成项目结构分析和任务跟踪。',
  },
];

export class MockEngine {
  private context: ContextManager;
  private tools: ToolDefinition[];

  constructor(context: ContextManager) {
    this.context = context;
    this.tools = getAllTools();
  }

  async executeScenario(scenario: MockScenario): Promise<{ results: Array<{ step: MockStep; result: ToolResult }>; response: string }> {
    const results: Array<{ step: MockStep; result: ToolResult }> = [];

    // Ensure context index is built before any tool calls
    if (!this.context.getSnapshot().projectIndex) {
      await this.context.buildIndex();
    }

    for (const step of scenario.steps) {
      // Use predefined result if available (for mock scenarios)
      if (step.result) {
        results.push({
          step,
          result: { type: 'text', content: step.result },
        });
        continue;
      }

      const tool = this.tools.find(t => t.name === step.tool);
      if (!tool) {
        results.push({
          step,
          result: { type: 'error', content: `Tool not found: ${step.tool}` },
        });
        continue;
      }

      try {
        const result = await tool.execute(step.args, this.context);
        results.push({ step, result });
      } catch (err: any) {
        results.push({
          step,
          result: { type: 'error', content: err.message },
        });
      }
    }

    return { results, response: scenario.finalResponse };
  }

  getAvailableTools(): string[] {
    return this.tools.map(t => t.name);
  }
}
