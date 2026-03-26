import { describe, it, expect } from 'vitest';
import { TOOL_PERMISSIONS } from '../types/agent.js';
import type { BuiltInToolName } from '../types/agent.js';

describe('TOOL_PERMISSIONS', () => {
  it('contains exactly 30 entries matching the complete tool set', () => {
    expect(TOOL_PERMISSIONS).toHaveLength(30);
  });

  it('covers every BuiltInToolName exactly once', () => {
    const allTools: BuiltInToolName[] = [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Bash',
      'WebFetch',
      'WebSearch',
      'TodoWrite',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskUpdate',
      'TaskStop',
      'TaskOutput',
      'Agent',
      'Skill',
      'LSP',
      'ToolSearch',
      'ListMcpResourcesTool',
      'ReadMcpResourceTool',
      'EnterPlanMode',
      'ExitPlanMode',
      'EnterWorktree',
      'ExitWorktree',
      'CronCreate',
      'CronDelete',
      'CronList',
      'AskUserQuestion',
      'NotebookEdit',
    ];

    const permissionTools = TOOL_PERMISSIONS.map((p) => p.tool);

    // Every BuiltInToolName is in TOOL_PERMISSIONS
    for (const tool of allTools) {
      expect(permissionTools).toContain(tool);
    }

    // No duplicates
    const unique = new Set(permissionTools);
    expect(unique.size).toBe(TOOL_PERMISSIONS.length);
  });

  it('assigns correct permission for key tools', () => {
    const lookup = Object.fromEntries(TOOL_PERMISSIONS.map((p) => [p.tool, p.requiresPermission]));

    // File mutation tools require permission
    expect(lookup['Write']).toBe(true);
    expect(lookup['Edit']).toBe(true);
    expect(lookup['Bash']).toBe(true);
    expect(lookup['NotebookEdit']).toBe(true);

    // Read-only tools do not
    expect(lookup['Read']).toBe(false);
    expect(lookup['Glob']).toBe(false);
    expect(lookup['Grep']).toBe(false);
    expect(lookup['LSP']).toBe(false);

    // Web tools require permission
    expect(lookup['WebFetch']).toBe(true);
    expect(lookup['WebSearch']).toBe(true);

    // Task management tools do not require permission
    expect(lookup['TodoWrite']).toBe(false);
    expect(lookup['TaskCreate']).toBe(false);
    expect(lookup['TaskUpdate']).toBe(false);

    // ExitPlanMode requires permission (presents plan for approval)
    expect(lookup['ExitPlanMode']).toBe(true);
    expect(lookup['EnterPlanMode']).toBe(false);
  });
});
