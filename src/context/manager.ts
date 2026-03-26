/**
 * @module context/manager
 * Context window management from anthropic.com/engineering/effective-context-engineering
 *
 * Seven-layer context stack:
 *   1. System prompt optimization
 *   2. Tool token efficiency (progressive disclosure)
 *   3. Just-in-time retrieval
 *   4. Compaction (tool result clearing → conversation summary → delegation)
 *   5. Structured note-taking (agentic memory)
 *   6. Sub-agent isolation
 *   7. Programmatic tool calling
 */

import type { TokenCount } from '../types/core.js';
import { TokenCount as makeTokenCount } from '../types/core.js';

// ── Context Budget ──────────────────────────────────────────────

export type ContextBudget = {
  readonly maxTokens: TokenCount;
  readonly systemPromptTokens: TokenCount;
  readonly toolDefinitionTokens: TokenCount;
  readonly conversationTokens: TokenCount;
  readonly remainingTokens: TokenCount;
  readonly usageRatio: number; // 0-1
};

export function calculateBudget(
  maxTokens: number,
  systemTokens: number,
  toolTokens: number,
  conversationTokens: number,
): ContextBudget {
  const remaining = Math.max(0, maxTokens - systemTokens - toolTokens - conversationTokens);
  return {
    maxTokens: makeTokenCount(maxTokens),
    systemPromptTokens: makeTokenCount(systemTokens),
    toolDefinitionTokens: makeTokenCount(toolTokens),
    conversationTokens: makeTokenCount(conversationTokens),
    remainingTokens: makeTokenCount(remaining),
    usageRatio: 1 - remaining / maxTokens,
  };
}

// ── Compaction Strategy ─────────────────────────────────────────
// Three-tier approach from Anthropic's context engineering post

export type CompactionStrategy =
  | { readonly type: 'tool_result_clearing'; readonly keepRecent: number }
  | { readonly type: 'conversation_summary'; readonly preservePatterns: ReadonlyArray<string> }
  | { readonly type: 'sub_agent_delegation'; readonly taskDescription: string };

export function selectCompactionStrategy(budget: ContextBudget): CompactionStrategy {
  if (budget.usageRatio < 0.7) {
    return { type: 'tool_result_clearing', keepRecent: 5 };
  }
  if (budget.usageRatio < 0.9) {
    return {
      type: 'conversation_summary',
      preservePatterns: ['architectural_decision', 'unresolved_bug', 'file_path', 'key_finding'],
    };
  }
  return {
    type: 'sub_agent_delegation',
    taskDescription: 'Continue the current task with fresh context window',
  };
}

// ── Progressive Tool Disclosure ─────────────────────────────────
// From Anthropic's "Tool Search Tool" — 85% token reduction

export type ToolManifestEntry = {
  readonly name: string;
  readonly briefDescription: string; // ~20 tokens in context
  readonly fullSchema: Record<string, unknown>; // ~200+ tokens loaded on demand
  readonly alwaysLoad: boolean;
};

export function createToolManifest(tools: ReadonlyArray<ToolManifestEntry>): {
  alwaysLoaded: ReadonlyArray<Record<string, unknown>>;
  deferred: ReadonlyArray<{ name: string; description: string }>;
  tokenSavings: number;
} {
  const alwaysLoaded = tools.filter((t) => t.alwaysLoad).map((t) => t.fullSchema);
  const deferred = tools
    .filter((t) => !t.alwaysLoad)
    .map((t) => ({
      name: t.name,
      description: t.briefDescription,
    }));

  const fullTokens = tools.reduce((sum, t) => sum + estimateSchemaTokens(t.fullSchema), 0);
  const reducedTokens = alwaysLoaded.reduce((sum, s) => sum + estimateSchemaTokens(s), 0) + deferred.length * 20; // ~20 tokens per brief description

  return {
    alwaysLoaded,
    deferred,
    tokenSavings: fullTokens - reducedTokens,
  };
}

function estimateSchemaTokens(schema: Record<string, unknown>): number {
  return Math.ceil(JSON.stringify(schema).length / 4);
}

// ── Structured Agent Memory ─────────────────────────────────────
// From Anthropic: agents write notes to files persisted outside context

export type MemoryCategory =
  | 'architectural_decision'
  | 'unresolved_bug'
  | 'key_finding'
  | 'todo'
  | 'code_pattern'
  | 'api_discovery';

export type AgentMemoryEntry = {
  readonly timestamp: string;
  readonly category: MemoryCategory;
  readonly content: string;
  readonly source: string;
  readonly confidence: number; // 0-1
};

export function formatMemoryForContext(entries: ReadonlyArray<AgentMemoryEntry>, maxTokens: number): string {
  const priorityOrder: Record<MemoryCategory, number> = {
    key_finding: 0,
    unresolved_bug: 1,
    api_discovery: 2,
    architectural_decision: 3,
    code_pattern: 4,
    todo: 5,
  };

  const sorted = [...entries].sort((a, b) => priorityOrder[a.category] - priorityOrder[b.category]);

  let output = '## Agent Memory\n\n';
  let tokens = 10;

  for (const entry of sorted) {
    const line = `- **[${entry.category}]** ${entry.content} _(${entry.source}, confidence: ${entry.confidence})_\n`;
    const lineTokens = Math.ceil(line.length / 4);
    if (tokens + lineTokens > maxTokens) break;
    output += line;
    tokens += lineTokens;
  }

  return output;
}

// ── Context Window Presets ───────────────────────────────────────

export const CONTEXT_PRESETS = {
  /** Standard 200K context (most models) */
  standard: { maxTokens: 200_000, outputReserve: 8_192 },
  /** Extended 1M context (Opus on Max/Team/Enterprise) */
  extended: { maxTokens: 1_000_000, outputReserve: 32_000 },
  /** Conservative budget for cost-sensitive operations */
  conservative: { maxTokens: 200_000, outputReserve: 4_096 },
} as const;
