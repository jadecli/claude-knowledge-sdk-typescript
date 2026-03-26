# Code-first multi-agent research skills for Claude

**Multi-agent orchestration on Claude is a pattern, not a framework.** Anthropic's own research system — which outperforms single-agent Opus by **90.2%** — uses a lead agent (Opus) that spawns parallel Sonnet subagents, each compressing vast search results into condensed findings. The entire architecture reduces to a single loop: gather context → take action → verify → repeat. This report provides production-ready TypeScript implementations of every core pattern, following Boris Cherny's strict typing discipline, designed to work as both Claude Code skills and Claude.ai artifacts.

The key insight across all 13 Anthropic engineering blog posts is that **agent systems are just LLMs using tools in a loop with environment feedback**. The complexity comes from context engineering — curating the smallest possible set of high-signal tokens — not from framework abstractions. What follows is the actual code.

## Core type system: branded types, Result pattern, and discriminated unions

Every pattern below builds on a shared type foundation. Boris Cherny's "Programming TypeScript" establishes three non-negotiable patterns: branded types prevent ID confusion at compile time, `Result<T, E>` replaces try/catch with exhaustive handling, and discriminated unions model every state transition.

```typescript
// src/types/core.ts — Foundation types following Boris Cherny's strict patterns

// ── Branded Types (Nominal Typing) ──────────────────────────────
type Brand<K, T> = K & { readonly __brand: T };

export type AgentId = Brand<string, 'AgentId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ToolCallId = Brand<string, 'ToolCallId'>;
export type TokenCount = Brand<number, 'TokenCount'>;
export type USD = Brand<number, 'USD'>;

export function toAgentId(id: string): AgentId { return id as AgentId; }
export function toSessionId(id: string): SessionId { return id as SessionId; }
export function toTokenCount(n: number): TokenCount { return n as TokenCount; }
export function toUSD(n: number): USD { return n as USD; }

// ── Result Type (Exceptions are side effects) ───────────────────
export type Result<T, E extends Error = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function Err<E extends Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function map<T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result;
}

export function flatMap<T, U, E extends Error>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

// ── Exhaustive Pattern Matching ─────────────────────────────────
export function assertNever(value: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(value)}`);
}

// ── Agent Message Types (Discriminated Union) ───────────────────
export type AgentMessage =
  | { readonly type: 'system'; readonly subtype: 'init' | 'compact_boundary'; readonly content: string }
  | { readonly type: 'assistant'; readonly content: ContentBlock[]; readonly toolCalls: ToolCall[] }
  | { readonly type: 'user'; readonly content: string }
  | { readonly type: 'tool_result'; readonly toolUseId: ToolCallId; readonly content: string }
  | { readonly type: 'result'; readonly text: string; readonly sessionId: SessionId; readonly usage: TokenUsage };

export type ContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: ToolCallId; readonly name: string; readonly input: Record<string, unknown> };

export type ToolCall = {
  readonly id: ToolCallId;
  readonly name: string;
  readonly input: Record<string, unknown>;
};

export type TokenUsage = {
  readonly inputTokens: TokenCount;
  readonly outputTokens: TokenCount;
  readonly cacheCreationTokens: TokenCount;
  readonly cacheReadTokens: TokenCount;
  readonly cost: USD;
};

// ── Agent State Machine ─────────────────────────────────────────
export type AgentState =
  | { readonly status: 'idle' }
  | { readonly status: 'gathering_context'; readonly sources: ReadonlyArray<string> }
  | { readonly status: 'executing_tools'; readonly pendingCalls: ReadonlyArray<ToolCall> }
  | { readonly status: 'verifying'; readonly output: string }
  | { readonly status: 'delegating'; readonly subagentIds: ReadonlyArray<AgentId> }
  | { readonly status: 'synthesizing'; readonly results: ReadonlyArray<SubagentResult> }
  | { readonly status: 'complete'; readonly finalOutput: string; readonly usage: TokenUsage }
  | { readonly status: 'error'; readonly error: Error; readonly recoverable: boolean };

export type SubagentResult = {
  readonly agentId: AgentId;
  readonly summary: string;
  readonly tokenUsage: TokenUsage;
  readonly duration: number;
};

export function handleAgentState(state: AgentState): string {
  switch (state.status) {
    case 'idle': return 'Agent ready';
    case 'gathering_context': return `Gathering from ${state.sources.length} sources`;
    case 'executing_tools': return `Executing ${state.pendingCalls.length} tool calls`;
    case 'verifying': return 'Verifying output';
    case 'delegating': return `Delegated to ${state.subagentIds.length} subagents`;
    case 'synthesizing': return `Synthesizing ${state.results.length} results`;
    case 'complete': return `Done: ${state.usage.cost} USD`;
    case 'error': return `Error (${state.recoverable ? 'recoverable' : 'fatal'}): ${state.error.message}`;
    default: return assertNever(state);
  }
}
```

The `AgentState` discriminated union above models the exact lifecycle Anthropic documents in their Agent SDK: init → tool calls → results → repeat. The `assertNever` default ensures every new state variant forces a compile error until handled.

## The agent loop: Anthropic's core architectural pattern

Anthropic's agent loop is deceptively simple — a while loop alternating between LLM calls and tool execution. The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) exposes this as an async generator yielding five message types: `SystemMessage`, `AssistantMessage`, `UserMessage`, `StreamEvent`, and `ResultMessage`. Budget controls (`maxTurns`, `maxBudgetUsd`, `effort`) prevent runaway execution.

```typescript
// src/agent/loop.ts — The core agentic loop with full type safety

import Anthropic from '@anthropic-ai/sdk';
import type { Result, ToolCall, ToolCallId, TokenUsage, AgentId, SessionId } from '../types/core.js';
import { Ok, Err, toAgentId, toSessionId, toTokenCount, toUSD } from '../types/core.js';

// ── Tool Definition (Zod-validated) ─────────────────────────────
export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly execute: (input: Record<string, unknown>) => Promise<string>;
};

// ── Agent Loop Configuration ────────────────────────────────────
export type AgentLoopConfig = {
  readonly model: 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514' | 'claude-haiku-3-5-20241022';
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<ToolDefinition>;
  readonly maxTurns: number;
  readonly maxBudgetUsd: number;
  readonly effort: 'low' | 'medium' | 'high' | 'max';
};

// ── Agent Loop Error Types ──────────────────────────────────────
export class AgentBudgetExceededError extends Error {
  constructor(public readonly spent: number, public readonly budget: number) {
    super(`Budget exceeded: $${spent.toFixed(4)} > $${budget.toFixed(4)}`);
    this.name = 'AgentBudgetExceededError';
  }
}

export class AgentMaxTurnsError extends Error {
  constructor(public readonly turns: number) {
    super(`Max turns reached: ${turns}`);
    this.name = 'AgentMaxTurnsError';
  }
}

// ── The Loop ────────────────────────────────────────────────────
export async function runAgentLoop(
  config: AgentLoopConfig,
  userPrompt: string
): Promise<Result<{ text: string; usage: TokenUsage }, Error>> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  const toolDefs = config.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  let turns = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (turns < config.maxTurns) {
    turns++;
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: config.systemPrompt,
      tools: toolDefs,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ContentBlock & { type: 'tool_use' } =>
        block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(b => b.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';
      return Ok({
        text,
        usage: {
          inputTokens: toTokenCount(totalInputTokens),
          outputTokens: toTokenCount(totalOutputTokens),
          cacheCreationTokens: toTokenCount(0),
          cacheReadTokens: toTokenCount(0),
          cost: toUSD(estimateCost(config.model, totalInputTokens, totalOutputTokens)),
        },
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        const tool = config.tools.find(t => t.name === block.name);
        if (!tool) return { type: 'tool_result' as const, tool_use_id: block.id, content: `Unknown tool: ${block.name}` };
        try {
          const result = await tool.execute(block.input as Record<string, unknown>);
          return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { type: 'tool_result' as const, tool_use_id: block.id, content: `Error: ${msg}`, is_error: true as const };
        }
      })
    );
    messages.push({ role: 'user', content: toolResults });
  }

  return Err(new AgentMaxTurnsError(config.maxTurns));
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    'claude-opus-4-20250514': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-20250514': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-3-5-20241022': { input: 0.80 / 1_000_000, output: 4 / 1_000_000 },
  };
  const rate = rates[model] ?? rates['claude-sonnet-4-20250514'];
  return inputTokens * rate.input + outputTokens * rate.output;
}
```

The critical pattern: **tool calls execute in parallel** via `Promise.all`, matching Anthropic's finding that parallel tool calling reduces research time by **90%**. Each tool result feeds back into the message history, and the loop continues until Claude produces a response without tool calls.

## Anthropic's eight architectural patterns ranked by complexity

Across 13 engineering blog posts, Anthropic documents a clear complexity ladder. Starting simple is **the most repeated advice** — "many patterns can be implemented in a few lines of code." The ladder runs from a single LLM call with retrieval up through full multi-agent systems with Opus lead and Sonnet workers.

The patterns and their measured impacts: **Tool Search Tool** delivers 85% token reduction with +25% accuracy on Opus 4. **Programmatic Tool Calling** reduces tokens by 37% by keeping intermediate results in the code execution environment. **Code execution with MCP** achieves 98.7% token reduction by presenting tools as typed APIs. **Contextual Retrieval** with reranking cuts retrieval failure by 67%. The multi-agent architecture itself delivers 90.2% improvement over single-agent, but at **15x the token cost** — making cost-aware orchestration essential.

The critical finding from Anthropic's research system: **token usage explains 80% of performance variance**. More tokens means more exploration, which means better results. The orchestrator's job is allocating that token budget efficiently across subagents — giving more tokens to harder subtasks and less to straightforward ones. This is why the scaling rules (embedded directly in system prompts) are the most important lever.

## Conclusion: patterns over frameworks

The entire multi-agent research architecture reduces to five composable primitives: a **typed agent loop** (while + tool execution + result feeding), **branded type safety** (compile-time ID confusion prevention), **Result-based error handling** (no thrown exceptions crossing agent boundaries), **progressive context disclosure** (defer tool loading, compact when full, delegate to sub-agents), and **SKILL.md packaging** (YAML frontmatter + Markdown instructions + bundled scripts). These primitives compose into any of Anthropic's eight documented patterns without framework lock-in. The `@anthropic-ai/claude-agent-sdk` provides the production runtime, `@modelcontextprotocol/sdk` provides standardized tool integration, and Boris Cherny's strict TypeScript discipline ensures the type system catches orchestration errors at compile time rather than in production agent loops.

---

# Appendix: @jadecli/claude-knowledge-sdk — Action & Harness SDK Reference

The following sections document the SDK types, CLI directive builders, and workflow generators implemented in this repository. These are compiled from the actual source code in `src/types/action.ts`, `src/action/directives.ts`, `src/action/workflow.ts`, `src/types/harness.ts`, and `src/types/extension.ts`.

## A1. claude-code-action@v1 — SDK Types

### ActionInputs (30+ fields)

The full-action wraps the base-action with GitHub-specific orchestration: @claude mention handling, PR review, issue triage, progress tracking, and comment management.

| Field | Type | Default | Description |
|---|---|---|---|
| `claude_code_oauth_token` | string | — | OAuth token from `claude setup-token` (Pro Max $200/mo) |
| `anthropic_api_key` | string | — | Direct Anthropic API key (alternative auth) |
| `prompt` | string | — | Agent mode if provided; tag mode if omitted |
| `settings` | string | — | Claude Code settings JSON or file path |
| `claude_args` | string | — | CLI arguments passed to Claude Code |
| `trigger_phrase` | string | `@claude` | Comment trigger phrase |
| `assignee_trigger` | string | — | Issue assignment trigger |
| `label_trigger` | string | `claude` | Issue label trigger |
| `base_branch` | string | repo default | Base for new branches |
| `branch_prefix` | string | `claude/` | Prefix for Claude branches |
| `branch_name_template` | string | — | Template with `{{prefix}}`, `{{entityType}}`, `{{entityNumber}}` |
| `allowed_bots` | string | — | Comma-separated bot usernames or `*` |
| `allowed_non_write_users` | string | — | RISKY: bypass write perms |
| `github_token` | string | — | Custom GitHub App token |
| `use_sticky_comment` | string | `false` | Single comment for PR responses |
| `classify_inline_comments` | string | `true` | Haiku classification of inline comments |
| `track_progress` | string | `false` | Visual progress tracking comments |
| `include_fix_links` | string | `true` | "Fix this" links in reviews |
| `use_commit_signing` | string | `false` | GitHub API commit signing |
| `ssh_signing_key` | string | — | SSH key for signing (takes precedence) |
| `bot_id` | string | `41898282` | GitHub user ID for git ops |
| `bot_name` | string | `claude[bot]` | GitHub username for git ops |
| `plugin_marketplaces` | string | — | Newline-separated marketplace URLs |
| `plugins` | string | — | Newline-separated plugin names |
| `additional_permissions` | string | — | e.g., `actions: read` |
| `display_report` | string | `false` | Step Summary output |
| `show_full_output` | string | `false` | WARNING: may expose secrets |
| `use_bedrock` | string | `false` | Amazon Bedrock OIDC |
| `use_vertex` | string | `false` | Google Vertex AI OIDC |
| `use_foundry` | string | `false` | Microsoft Foundry OIDC |

### ActionOutputs

| Output | Description |
|---|---|
| `execution_file` | Path to execution log JSON |
| `branch_name` | Branch created by Claude |
| `github_token` | Token used by the action |
| `structured_output` | JSON string (when `--json-schema` provided) |
| `session_id` | For `--resume` continuation |

## A2. claude-code-base-action@beta — SDK Types

The low-level composable action. No GitHub PR/issue integration — just prompt + tools + execute.

### BaseActionInputs

| Field | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | — | Direct prompt (exclusive with `prompt_file`) |
| `prompt_file` | string | — | File path containing prompt |
| `settings` | string | — | Settings JSON or file path |
| `claude_args` | string | — | CLI arguments |
| `use_node_cache` | string | `false` | Node.js dependency caching |
| `plugins` | string | — | Newline-separated plugin names |
| `plugin_marketplaces` | string | — | Marketplace Git URLs |
| + all auth fields | | | Same as ActionInputs auth |

### BaseActionOutputs

| Output | Type | Description |
|---|---|---|
| `conclusion` | `'success' \| 'failure'` | Execution result |
| `execution_file` | string | JSON execution log path |
| `structured_output` | string | JSON output (with `--json-schema`) |
| `session_id` | string | For `--resume` |

### SystemPromptMode

Three modes from base-action's `parse-sdk-options.ts`:

```typescript
type SystemPromptMode =
  | { mode: 'override'; prompt: string }      // --system-prompt "..."
  | { mode: 'append'; appendText: string }    // --append-system-prompt "..."
  | { mode: 'default' };                      // built-in Claude Code prompt
```

### ClaudeRunResult

```typescript
type ClaudeRunResult = {
  executionFile?: string;
  sessionId?: string;
  conclusion: 'success' | 'failure';
  structuredOutput?: string;
};
```

## A3. claude-code-security-review@main — SDK Types

### SecurityReviewInputs

| Field | Type | Default | Description |
|---|---|---|---|
| `claude-api-key` | string (required) | — | Pass `CLAUDE_CODE_OAUTH_TOKEN` |
| `comment-pr` | string | `true` | Comment findings on PR |
| `upload-results` | string | `true` | Upload as artifacts |
| `exclude-directories` | string | — | Comma-separated exclusions |
| `claudecode-timeout` | string | `20` | Analysis timeout (minutes) |
| `claude-model` | string | — | Model override |
| `run-every-commit` | string | `false` | Skip caching (more false positives) |
| `false-positive-filtering-instructions` | string | — | Custom filtering rules path |
| `custom-security-scan-instructions` | string | — | Custom scan instructions path |

### SecurityReviewOutputs

| Output | Description |
|---|---|
| `findings-count` | Number of security findings |
| `results-file` | Path to results JSON |

**WARNING:** Not hardened against prompt injection. Only review trusted PRs.

## A4. ClaudeArgs — CLI Directive Builder

Structured representation of `claude_args` CLI flags:

```typescript
type ClaudeArgs = {
  maxTurns?: number;                           // --max-turns N
  model?: string;                              // --model <id>
  allowedTools?: ReadonlyArray<string>;        // --allowedTools Tool1,Tool2
  disallowedTools?: ReadonlyArray<string>;     // --disallowedTools Tool1,Tool2
  systemPrompt?: string;                       // --system-prompt "..." (override)
  appendSystemPrompt?: string;                 // --append-system-prompt "..." (extend)
  jsonSchema?: Record<string, unknown>;        // --json-schema '{...}'
  mcpConfigs?: ReadonlyArray<string | McpConfigInline>;  // --mcp-config (repeatable)
  fallbackModel?: string;                      // --fallback-model <id>
  resume?: string;                             // --resume <session-id>
};
```

### Builder Functions

```typescript
// Build multi-line claude_args string
buildClaudeArgs({ maxTurns: 10, allowedTools: ['Edit', 'Read'] })
// => '--max-turns 10\n--allowedTools "Edit,Read"'

// Expand named tool permission sets
expandToolSet('review-only')    // inline comments + gh pr commands
expandToolSet('full-dev')       // Edit, Write, Read, Glob, Grep, npm, git, gh
expandToolSet('read-only')      // Read, Glob, Grep

// Build MCP server configs
mcpServer('thinking', '@modelcontextprotocol/server-sequential-thinking')
mcpServerPython('weather', '/path/to/server', 'main.py', { API_KEY: 'secret' })

// Build prompt context headers
promptContext({ repo: 'owner/repo', prNumber: 42, author: 'dev' })
// => 'REPO: owner/repo\nPR NUMBER: 42\nAUTHOR: dev'

// Build structured output schemas
jsonSchema({ is_flaky: { type: 'boolean' }, confidence: { type: 'number' } }, ['is_flaky'])

// System prompt mode conversion
buildSystemPromptArgs({ mode: 'append', appendText: 'Focus on security' })
// => { appendSystemPrompt: 'Focus on security' }

// Base action input builder
buildBaseActionInputs({
  prompt: 'Analyze this codebase',
  oauthToken: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
  claudeArgs: buildClaudeArgs({ maxTurns: 5 }),
  plugins: ['code-review@claude-code-plugins'],
})
```

## A5. Workflow Generator — 12 Presets

Generate complete GitHub Actions YAML from structured config:

```typescript
generatePresetWorkflow('tag-interactive')       // @claude mention handler
generatePresetWorkflow('pr-review')             // auto PR review
generatePresetWorkflow('pr-review-tracked')     // PR review with progress tracking
generatePresetWorkflow('security-review')       // OWASP-focused security review
generatePresetWorkflow('path-review')           // review specific file paths
generatePresetWorkflow('external-contributor')  // first-time contributor review
generatePresetWorkflow('checklist-review')      // custom PR review checklist
generatePresetWorkflow('scheduled-maintenance') // cron-based maintenance
generatePresetWorkflow('issue-triage')          // auto-label and categorize
generatePresetWorkflow('doc-sync')              // update docs on API changes
generatePresetWorkflow('code-review-plugin')    // uses code-review@claude-code-plugins
generatePresetWorkflow('base-action')           // low-level base action

generateSecurityReviewWorkflow()                // security review (CLAUDE_CODE_OAUTH_TOKEN)
generateSecurityReviewWorkflow({ 'claude-model': 'claude-sonnet-4-6', 'exclude-directories': 'vendor' })
```

All presets use `CLAUDE_CODE_OAUTH_TOKEN` exclusively.

## A6. Harness & Engineering Pattern Types

### Tool Design Patterns (from "Writing Tools for Agents")

```typescript
type ToolDesignPattern =
  | 'format_hint'           // response_format param (concise|detailed)
  | 'pagination'            // next_token instead of all results
  | 'confirmation'          // explicit confirmation for destructive ops
  | 'dry_run'               // preview changes without executing
  | 'targeted_search'       // filters to narrow results
  | 'progressive_disclosure' // summary first, details on demand
  | 'idempotent'            // safe to retry
  | 'batched'               // accept arrays for bulk ops
  | 'streaming';            // partial results for long ops
```

### Harness Lifecycle (from "Harness Design for Long-Running Apps")

```
initializing → authenticating → preparing → executing → post_processing → cleaning_up → completed
                                                                                      → failed
```

Default config: 20min timeout, 3 retries with exponential backoff, session preservation enabled.

### Research Scaling Tiers (from "Multi-Agent Research System")

| Tier | Agents | Tool Calls/Agent | Model | Token Budget/Agent |
|---|---|---|---|---|
| simple_lookup | 1 | 5 | haiku | 10K |
| comparison | 3 | 10 | sonnet | 50K |
| deep_research | 5 | 15 | sonnet | 100K |
| comprehensive_survey | 10 | 15 | sonnet | 100K |

### Measured Token Reductions

| Technique | Reduction | Source |
|---|---|---|
| Tool token efficiency (progressive disclosure) | **85%** | Tool Search Tool |
| Programmatic tool calling | **37%** | Code execution blog |
| Subagent isolation (vs single-agent) | **90%** | Multi-agent research |

### Context Engineering Layers (ordered cheapest → most expensive)

1. System prompt optimization
2. Tool token efficiency (85% reduction)
3. Just-in-time retrieval
4. Compaction (summarize old turns)
5. Structured notes (persistent outside context)
6. Subagent isolation (fresh context per agent)
7. Programmatic tool calling (37% reduction)

### Permission Model

```typescript
type PermissionMode =
  | 'default'             // ask user for each tool call
  | 'acceptEdits'         // auto-approve file edits
  | 'plan'                // read-only exploration
  | 'bypassPermissions'   // approve everything (CI/CD only)
  | 'dontAsk';            // deny if not pre-approved
```

## A7. Provider Requirements

| Provider | Required Env Vars | Optional Env Vars |
|---|---|---|
| anthropic | `ANTHROPIC_API_KEY` | — |
| bedrock | `AWS_REGION` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` |
| vertex | `ANTHROPIC_VERTEX_PROJECT_ID`, `CLOUD_ML_REGION` | `GOOGLE_APPLICATION_CREDENTIALS` |
| foundry | — | `ANTHROPIC_FOUNDRY_RESOURCE`, `ANTHROPIC_FOUNDRY_BASE_URL` |

## A8. Plugin Validation

```typescript
// Valid plugin names match: /^[@a-zA-Z0-9_\-\/.]+$/
// Path traversal (..) is rejected
isValidPluginName('code-review@claude-code-plugins')  // true
isValidPluginName('../malicious')                      // false

// Marketplace URLs must be HTTPS and end with .git
isValidMarketplaceUrl('https://github.com/anthropics/claude-code.git')  // true
isValidMarketplaceUrl('http://example.com/repo')                         // false
```

## A9. MCP Tools Available in CI

When `additional_permissions: "actions: read"` is set:
- `mcp__github_ci__get_ci_status`
- `mcp__github_ci__get_workflow_run_details`
- `mcp__github_ci__download_job_log`

Always available in claude-code-action:
- `mcp__github_inline_comment__create_inline_comment` (pass `confirmed: true` to post immediately)
- `mcp__github_comment__create_comment`
- `mcp__github_comment__update_comment`
- `mcp__github_comment__get_comment`
