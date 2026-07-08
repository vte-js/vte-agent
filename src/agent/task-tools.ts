/**
 * Task tools - LLM can manage task lists with subtask support
 */

import { ToolDefinition } from '../shared/types';
import { formatTextResult } from '../context/protocol';
import { createTask, updateTask, listTasks, deleteTask, getTaskSummary, formatTaskList, getTask, listAllTasks } from './tasks';

export const taskCreateTool: ToolDefinition = {
  name: 'task_create',
  description: 'Create a new task. Can optionally be a subtask of an existing task (set parent_id).',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description (optional)' },
      parent_id: { type: 'number', description: 'Parent task ID to create as subtask (optional)' },
    },
    required: ['title'],
  },
  execute: async (args) => {
    const title = args.title as string;
    const description = (args.description as string) || '';
    const parentId = (args.parent_id as number) || null;
    const task = createTask(title, description, parentId);
    const parentInfo = parentId ? ` (subtask of #${parentId})` : '';
    return formatTextResult(`Task #${task.id} created${parentInfo}: ${task.title}\n${getTaskSummary()}`);
  },
};

export const taskUpdateTool: ToolDefinition = {
  name: 'task_update',
  description: 'Update a task status or details. When all subtasks of a parent are done, parent auto-completes.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'Task ID' },
      status: { type: 'string', description: 'New status: pending, in_progress, done, blocked' },
      title: { type: 'string', description: 'New title (optional)' },
      description: { type: 'string', description: 'New description (optional)' },
    },
    required: ['id'],
  },
  execute: async (args) => {
    const id = args.id as number;
    const updates: any = {};
    if (args.status) updates.status = args.status;
    if (args.title) updates.title = args.title;
    if (args.description) updates.description = args.description;

    const task = updateTask(id, updates);
    if (!task) return formatTextResult(`Task #${id} not found.`);
    return formatTextResult(`Task #${task.id} updated: [${task.status}] ${task.title}\n${getTaskSummary()}`);
  },
};

export const taskListTool: ToolDefinition = {
  name: 'task_list',
  description: 'List tasks (top-level only, subtasks shown nested). Filter by status optional.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status: pending, in_progress, done, blocked (optional)' },
    },
  },
  execute: async (args) => {
    const status = args.status as string | undefined;
    const tasks = listTasks(status);
    return formatTextResult(`${getTaskSummary()}\n\n${formatTaskList(tasks)}`);
  },
};

export const taskDeleteTool: ToolDefinition = {
  name: 'task_delete',
  description: 'Delete a task and all its subtasks.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'Task ID to delete' },
    },
    required: ['id'],
  },
  execute: async (args) => {
    const id = args.id as number;
    const task = getTask(id);
    const deleted = deleteTask(id);
    if (!deleted) return formatTextResult(`Task #${id} not found.`);
    return formatTextResult(`Task #${id} deleted: ${task?.title}\n${getTaskSummary()}`);
  },
};
