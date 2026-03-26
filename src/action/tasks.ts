/**
 * @module action/tasks
 * SDK primitives for Claude Code task and todo management.
 *
 * Three distinct systems documented in this module:
 *   1. TodoWrite — in-session progress tracking (complete replacement semantics)
 *   2. Agent tool — spawning subagents (formerly Task tool, renamed v2.1.63)
 *   3. SDKTask* messages — background process lifecycle monitoring
 *
 * Key insight: TodoWrite uses COMPLETE REPLACEMENT — every call overwrites the
 * entire list. TodoRead was removed. Current state comes from TodoWriteOutput.oldTodos
 * or system reminders. Todos persist at ~/.claude/todos/[session-id].json.
 *
 * Sources:
 *   - @anthropic-ai/claude-agent-sdk v0.2.83 type exports
 *   - Claude Code changelog v2.1.0 through v2.1.83
 *   - claude-code-action track_progress integration
 */

import type { TodoItem, TodoWriteInput, AgentInput } from '../types/agent.js';
import type { SessionId, AgentId } from '../types/core.js';

// ── Todo Builders ──────────────────────────────────────────────

/**
 * Create a single todo item with the practical 5-field schema.
 * The SDK exports 3 fields (content, status, activeForm) but the runtime
 * accepts id and priority as well. This builder produces the full superset.
 */
export function todo(
  content: string,
  opts?: {
    readonly status?: 'pending' | 'in_progress' | 'completed';
    readonly priority?: 'high' | 'medium' | 'low';
    readonly activeForm?: string;
    readonly id?: string;
  },
): TodoItem {
  const status = opts?.status ?? 'pending';
  return {
    id: opts?.id ?? generateTodoId(),
    content,
    status,
    priority: opts?.priority ?? 'medium',
    activeForm: opts?.activeForm ?? (status === 'in_progress' ? toActiveForm(content) : content),
  };
}

/**
 * Build a complete TodoWriteInput from an array of items.
 * TodoWrite uses COMPLETE REPLACEMENT — this produces the full list
 * that will overwrite all existing todos.
 */
export function buildTodoList(items: ReadonlyArray<TodoItem>): TodoWriteInput {
  return {
    todos: items.map((item) => ({
      content: item.content,
      status: item.status,
      activeForm: item.activeForm,
    })),
  };
}

/**
 * Mark a specific todo as in_progress in an existing list.
 * Returns a new list (complete replacement semantics).
 */
export function markInProgress(todos: ReadonlyArray<TodoItem>, id: string): ReadonlyArray<TodoItem> {
  return todos.map((t) =>
    t.id === id
      ? { ...t, status: 'in_progress' as const, activeForm: toActiveForm(t.content) }
      : t.status === 'in_progress'
        ? { ...t, status: 'pending' as const }
        : t,
  );
}

/**
 * Mark a specific todo as completed in an existing list.
 * Returns a new list (complete replacement semantics).
 */
export function markCompleted(todos: ReadonlyArray<TodoItem>, id: string): ReadonlyArray<TodoItem> {
  return todos.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t));
}

/**
 * Create a quick task list from string descriptions.
 * All items start as pending with medium priority.
 */
export function quickTodoList(...descriptions: string[]): ReadonlyArray<TodoItem> {
  return descriptions.map((desc, i) => todo(desc, { id: String(i + 1) }));
}

// ── Agent (Subagent) Builders ──────────────────────────────────

/**
 * Build an AgentInput for spawning a subagent.
 * Renamed from Task in v2.1.63. The model field was restored in v2.1.72.
 * resume was removed in v2.1.77 — use SendMessage({to: agentId}) instead.
 */
export function buildAgentInput(opts: {
  readonly description: string;
  readonly prompt: string;
  readonly type?: string;
  readonly model?: 'sonnet' | 'opus' | 'haiku';
  readonly background?: boolean;
  readonly maxTurns?: number;
  readonly isolation?: 'worktree';
}): AgentInput {
  return {
    description: opts.description,
    prompt: opts.prompt,
    subagent_type: opts.type ?? 'general-purpose',
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.background !== undefined ? { run_in_background: opts.background } : {}),
    ...(opts.maxTurns !== undefined ? { max_turns: opts.maxTurns } : {}),
    ...(opts.isolation !== undefined ? { isolation: opts.isolation } : {}),
  };
}

/**
 * Build a research subagent input following Anthropic's multi-agent pattern.
 * Uses Sonnet for exploration, background execution, and worktree isolation.
 */
export function buildResearchAgent(topic: string, instructions: string): AgentInput {
  return buildAgentInput({
    description: `Research: ${topic.slice(0, 50)}`,
    prompt: instructions,
    type: 'Explore',
    model: 'sonnet',
    background: true,
  });
}

/**
 * Build a code implementation subagent.
 * Uses default model (inherits parent), foreground execution.
 */
export function buildImplementationAgent(task: string, instructions: string): AgentInput {
  return buildAgentInput({
    description: task.slice(0, 50),
    prompt: instructions,
    type: 'general-purpose',
  });
}

// ── Session Persistence Paths ──────────────────────────────────

/** Get the todo persistence file path for a session */
export function todoFilePath(sessionId: SessionId): string {
  return `~/.claude/todos/${sessionId}.json`;
}

/** Get the todo persistence file path for a subagent within a session */
export function subagentTodoFilePath(sessionId: SessionId, agentId: AgentId): string {
  return `~/.claude/todos/${sessionId}-agent-${agentId}.json`;
}

// ── Internal Helpers ───────────────────────────────────────────

/** Convert imperative "Fix the bug" → present continuous "Fixing the bug" */
function toActiveForm(content: string): string {
  const first = content.split(' ')[0];
  if (first === undefined) return content;

  const lower = first.toLowerCase();
  const rest = content.slice(first.length);

  // Common verb transformations
  // 1. Drop silent e: "Create" → "Creating", "Write" → "Writing"
  if (lower.endsWith('e') && !lower.endsWith('ee')) {
    return first.slice(0, -1) + 'ing' + rest;
  }
  // 2. Double final consonant for CVC verbs: "Run" → "Running", "Set" → "Setting"
  // Exclude w, x, y — these never double (fix→fixing, show→showing)
  const cvcPattern = /^[a-z]*[aeiou][bcdfghjklmnpqrstvz]$/i;
  if (cvcPattern.test(lower) && lower.length >= 3) {
    return first + first[first.length - 1] + 'ing' + rest;
  }
  // 3. Default: just append -ing
  return first + 'ing' + rest;
}

function generateTodoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
