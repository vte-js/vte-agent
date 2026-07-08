/**
 * Tool Registry - central tool management
 * Tools are registered here and automatically available to the agent.
 */

import { ToolDefinition } from '../shared/types';

const registry: Map<string, ToolDefinition> = new Map();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
}

export function registerTools(tools: ToolDefinition[]): void {
  for (const tool of tools) {
    registry.set(tool.name, tool);
  }
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

export function getToolNames(): string[] {
  return Array.from(registry.keys());
}

export function hasTool(name: string): boolean {
  return registry.has(name);
}
