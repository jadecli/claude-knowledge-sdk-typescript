/**
 * @module types/agent
 * Types distilled from @anthropic-ai/claude-agent-sdk@0.2.33
 *
 * Source of truth:
 *   platform.claude.com/docs/en/agent-sdk/typescript
 *   platform.claude.com/docs/en/agent-sdk/agent-loop
 *   platform.claude.com/docs/en/agent-sdk/subagents
 */

import type { AgentId, TokenCount, USD } from './core.js';

// ── Model Selection ─────────────────────────────────────────────
// From Agent SDK: model field on AgentDefinition
export type ClaudeModel =
  | 'claude-opus-4-6'    // planning + synthesis (lead agent)
  | 'claude-sonnet-4-6'  // exploration + execution (subagent default)
  | 'claude-haiku-4-5'   // fast classification + low-cost tasks
  | 'sonnet'             // alias in AgentDefinition
  | 'opus'               // alias in AgentDefinition
  | 'haiku'              // alias in AgentDefinition
  | 'inherit';           // inherit parent model

// ── Agent Definition (matches SDK AgentDefinition exactly) ──────
export type AgentDefinition = {
  readonly description: string;
  readonly prompt: string;
  readonly tools?: ReadonlyArray<string>;
  readonly disallowedTools?: ReadonlyArray<string>;
  readonly model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  readonly mcpServers?: ReadonlyArray<AgentMcpServerSpec>;
  readonly skills?: ReadonlyArray<string>;
  readonly maxTurns?: number;
  readonly criticalSystemReminder_EXPERIMENTAL?: string;
};

export type AgentMcpServerSpec =
  | string // server name reference
  | Record<string, McpServerConfig>;

export type McpServerConfig =
  | { readonly type: 'stdio'; readonly command: string; readonly args?: ReadonlyArray<string>; readonly env?: Record<string, string> }
  | { readonly type: 'sse'; readonly url: string; readonly headers?: Record<string, string> }
  | { readonly type: 'http'; readonly url: string; readonly headers?: Record<string, string> }
  | { readonly type: 'sdk'; /* in-process MCP server */ };

// ── Query Options (matches SDK Options) ─────────────────────────
export type QueryOptions = {
  readonly model?: ClaudeModel;
  readonly systemPrompt?: string;
  readonly allowedTools?: ReadonlyArray<string>;
  readonly disallowedTools?: ReadonlyArray<string>;
  readonly permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';
  readonly maxTurns?: number;
  readonly effort?: 'low' | 'medium' | 'high' | 'max';
  readonly mcpServers?: Record<string, McpServerConfig>;
  readonly agents?: Record<string, AgentDefinition>;
  readonly settingSources?: ReadonlyArray<'user' | 'project' | 'local'>;
  readonly cwd?: string;
  readonly resume?: string; // session ID to resume
  readonly includePartialMessages?: boolean;
};

// ── SDK Message Types (discriminated union from agent loop docs) ─
export type SDKMessage =
  | SystemMessage
  | AssistantMessage
  | UserMessage
  | ResultMessage;

export type SystemMessage = {
  readonly type: 'system';
  readonly subtype: 'init' | 'compact_boundary';
  readonly session_id?: string;
};

export type AssistantMessage = {
  readonly type: 'assistant';
  readonly message: {
    readonly content: ReadonlyArray<ContentBlock>;
  };
  readonly parent_tool_use_id?: string; // populated inside subagent context
};

export type ContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string; readonly is_error?: boolean };

export type UserMessage = {
  readonly type: 'user';
  readonly content: string;
};

export type ResultMessage = {
  readonly type: 'result';
  readonly subtype: 'success' | 'error' | 'max_turns' | 'budget_exceeded';
  readonly result?: string;
  readonly session_id: string;
  readonly cost_usd: number;
  readonly duration_ms: number;
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
  };
};

// ── Hook Events (full set from TypeScript SDK reference) ────────
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'Notification'
  | 'SessionStart'
  | 'SessionEnd'
  | 'TeammateIdle'
  | 'TaskCompleted'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'PermissionRequest'
  | 'Setup';

// ── Token Usage with Cost ───────────────────────────────────────
export type TokenUsage = {
  readonly inputTokens: TokenCount;
  readonly outputTokens: TokenCount;
  readonly cacheCreationTokens: TokenCount;
  readonly cacheReadTokens: TokenCount;
  readonly cost: USD;
};

// ── Research-Specific Types ─────────────────────────────────────

/** Classification of a research query — drives scaling decisions */
export type QueryClassification =
  | { readonly type: 'simple'; readonly directAnswer: true }
  | { readonly type: 'lookup'; readonly sources: ReadonlyArray<string> }
  | { readonly type: 'comparison'; readonly entities: ReadonlyArray<string> }
  | { readonly type: 'deep_dive'; readonly facets: ReadonlyArray<string> }
  | { readonly type: 'survey'; readonly subtopics: ReadonlyArray<string>; readonly breadth: number };

/** Subagent task created by the lead orchestrator */
export type ResearchTask = {
  readonly id: AgentId;
  readonly objective: string;
  readonly outputFormat: 'summary' | 'structured_json' | 'code' | 'comparison_table';
  readonly tools: ReadonlyArray<string>;
  readonly model: 'sonnet' | 'haiku' | 'opus';
  readonly maxTurns: number;
  readonly sources: ReadonlyArray<string>;
};

/** Result returned by a subagent to the lead */
export type SubagentResult = {
  readonly agentId: AgentId;
  readonly taskObjective: string;
  readonly findings: string;
  readonly confidence: number; // 0-1
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
  readonly sourcesConsulted: ReadonlyArray<string>;
};
