/**
 * @module action/directives
 * CLI primitive builders for claude_args and workflow configuration.
 *
 * These functions produce strings suitable for the `claude_args` input
 * of anthropics/claude-code-action@v1, or structured objects for `settings`.
 */

import type { ClaudeArgs, McpConfigInline, ToolPermissionSet } from '../types/action.js';

// ── claude_args string builder ─────────────────────────────────

/**
 * Build a claude_args string from structured options.
 * Multi-line format (one flag per line) for YAML readability.
 *
 * @example
 * buildClaudeArgs({ maxTurns: 10, allowedTools: ['Edit', 'Read', 'Bash(npm run *)'] })
 * // => '--max-turns 10\n--allowedTools "Edit,Read,Bash(npm run *)"'
 */
export function buildClaudeArgs(args: ClaudeArgs): string {
  const lines: string[] = [];

  if (args.maxTurns !== undefined) {
    lines.push(`--max-turns ${args.maxTurns}`);
  }

  if (args.model !== undefined) {
    lines.push(`--model ${args.model}`);
  }

  if (args.allowedTools !== undefined && args.allowedTools.length > 0) {
    lines.push(`--allowedTools "${args.allowedTools.join(',')}"`);
  }

  if (args.disallowedTools !== undefined && args.disallowedTools.length > 0) {
    lines.push(`--disallowedTools "${args.disallowedTools.join(',')}"`);
  }

  if (args.systemPrompt !== undefined) {
    lines.push(`--system-prompt "${args.systemPrompt.replace(/"/g, '\\"')}"`);
  }

  if (args.jsonSchema !== undefined) {
    lines.push(`--json-schema '${JSON.stringify(args.jsonSchema)}'`);
  }

  if (args.mcpConfigs !== undefined) {
    for (const config of args.mcpConfigs) {
      if (typeof config === 'string') {
        lines.push(`--mcp-config ${config}`);
      } else {
        lines.push(`--mcp-config '${JSON.stringify(config)}'`);
      }
    }
  }

  return lines.join('\n');
}

// ── Tool permission set expander ───────────────────────────────

/** Well-known tool sets from claude-code-action solutions docs */
const TOOL_SETS: Record<Exclude<ToolPermissionSet, 'custom'>, ReadonlyArray<string>> = {
  'review-only': [
    'mcp__github_inline_comment__create_inline_comment',
    'Bash(gh pr comment:*)',
    'Bash(gh pr diff:*)',
    'Bash(gh pr view:*)',
  ],
  'review-and-edit': [
    'mcp__github_inline_comment__create_inline_comment',
    'Bash(gh pr comment:*)',
    'Bash(gh pr diff:*)',
    'Bash(gh pr view:*)',
    'Read',
    'Write',
    'Edit',
  ],
  'full-dev': [
    'Edit',
    'Write',
    'Read',
    'Glob',
    'Grep',
    'Bash(npm run *)',
    'Bash(npx *)',
    'Bash(git *)',
    'Bash(gh pr *)',
    'Bash(gh issue *)',
  ],
  'read-only': ['Read', 'Glob', 'Grep'],
};

/**
 * Expand a named tool permission set to its tool list.
 * Pass 'custom' with an explicit tools array to use your own set.
 */
export function expandToolSet(preset: Exclude<ToolPermissionSet, 'custom'>): ReadonlyArray<string>;
export function expandToolSet(preset: 'custom', tools: ReadonlyArray<string>): ReadonlyArray<string>;
export function expandToolSet(preset: ToolPermissionSet, tools?: ReadonlyArray<string>): ReadonlyArray<string> {
  if (preset === 'custom') {
    return tools ?? [];
  }
  return TOOL_SETS[preset];
}

// ── MCP config builders ────────────────────────────────────────

/**
 * Build an inline MCP config for a single npx-based server.
 *
 * @example
 * mcpServer('sequential-thinking', '@modelcontextprotocol/server-sequential-thinking')
 * // => { mcpServers: { "sequential-thinking": { command: "npx", args: ["-y", "..."] } } }
 */
export function mcpServer(name: string, npmPackage: string, env?: Record<string, string>): McpConfigInline {
  return {
    mcpServers: {
      [name]: {
        command: 'npx',
        args: ['-y', npmPackage],
        ...(env !== undefined ? { env } : {}),
      },
    },
  };
}

/**
 * Build an inline MCP config for a uv-based Python server.
 */
export function mcpServerPython(
  name: string,
  directory: string,
  scriptFile: string,
  env?: Record<string, string>,
): McpConfigInline {
  return {
    mcpServers: {
      [name]: {
        command: 'uv',
        args: ['--directory', directory, 'run', scriptFile],
        ...(env !== undefined ? { env } : {}),
      },
    },
  };
}

// ── Prompt builders ────────────────────────────────────────────

/** Standard context header for agent-mode prompts (from solutions docs) */
export function promptContext(vars: {
  readonly repo: string;
  readonly prNumber?: number | string;
  readonly issueNumber?: number | string;
  readonly title?: string;
  readonly author?: string;
}): string {
  const lines: string[] = [`REPO: ${vars.repo}`];
  if (vars.prNumber !== undefined) lines.push(`PR NUMBER: ${vars.prNumber}`);
  if (vars.issueNumber !== undefined) lines.push(`ISSUE NUMBER: ${vars.issueNumber}`);
  if (vars.title !== undefined) lines.push(`TITLE: ${vars.title}`);
  if (vars.author !== undefined) lines.push(`AUTHOR: ${vars.author}`);
  return lines.join('\n');
}

/**
 * Build a structured output JSON schema for --json-schema.
 * Convenience for common patterns.
 */
export function jsonSchema(
  properties: Record<string, { type: string; description?: string }>,
  required?: ReadonlyArray<string>,
): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    ...(required !== undefined ? { required } : {}),
  };
}
