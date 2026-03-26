/**
 * @module agent/orchestrator
 * Lead-Subagent research orchestrator.
 *
 * Pattern from anthropic.com/engineering/multi-agent-research-system:
 *   - Lead (Opus) classifies query → plans tasks → synthesizes
 *   - Workers (Sonnet) explore in parallel with isolated context
 *   - Each worker compresses 10K+ tokens → 1-2K summary
 *
 * The recursive improvement loop:
 *   1. Classify → plan → fan-out → fan-in → synthesize
 *   2. Evaluate synthesis quality
 *   3. If gaps found, spawn targeted follow-up agents
 *   4. Merge follow-up findings into final output
 */

import type { AgentDefinition, QueryClassification, ResearchTask, SubagentResult } from '../types/agent.js';
import type { Result } from '../types/core.js';
import { Ok, Err, AgentId as makeAgentId, assertNever } from '../types/core.js';
import { runLoop } from './loop.js';

// ── Scaling Rules ───────────────────────────────────────────────
// Directly from Anthropic's multi-agent research prompts

export function planScale(classification: QueryClassification): {
  agentCount: number;
  toolCallsPerAgent: number;
  model: 'sonnet' | 'haiku' | 'opus';
} {
  switch (classification.type) {
    case 'simple':
      return { agentCount: 0, toolCallsPerAgent: 0, model: 'haiku' };
    case 'lookup':
      return { agentCount: 1, toolCallsPerAgent: 10, model: 'sonnet' };
    case 'comparison':
      return { agentCount: Math.min(classification.entities.length, 5), toolCallsPerAgent: 12, model: 'sonnet' };
    case 'deep_dive':
      return { agentCount: Math.min(classification.facets.length, 4), toolCallsPerAgent: 15, model: 'sonnet' };
    case 'survey':
      return { agentCount: Math.min(classification.subtopics.length, 10), toolCallsPerAgent: 15, model: 'sonnet' };
    default:
      return assertNever(classification);
  }
}

// ── Task Generator ──────────────────────────────────────────────

export function generateTasks(query: string, classification: QueryClassification): ReadonlyArray<ResearchTask> {
  const scale = planScale(classification);
  if (scale.agentCount === 0) return [];

  const subtopics: ReadonlyArray<string> = (() => {
    switch (classification.type) {
      case 'simple':
        return [];
      case 'lookup':
        return classification.sources;
      case 'comparison':
        return classification.entities;
      case 'deep_dive':
        return classification.facets;
      case 'survey':
        return classification.subtopics;
      default:
        return assertNever(classification);
    }
  })();

  return subtopics.slice(0, scale.agentCount).map((topic, i) => ({
    id: makeAgentId(`research-${i}`),
    objective: `Research "${topic}" in context of: ${query}. Be thorough but concise. Return only high-signal findings.`,
    outputFormat: 'summary' as const,
    tools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    model: scale.model,
    maxTurns: scale.toolCallsPerAgent,
    sources: [topic],
  }));
}

// ── Subagent Definition Builder ─────────────────────────────────

export function taskToAgentDef(task: ResearchTask): AgentDefinition {
  return {
    description: `Research subagent for: ${task.sources.join(', ')}. Invoke this agent for exploration and fact-gathering on this specific subtopic.`,
    prompt: task.objective,
    tools: [...task.tools],
    model: task.model,
    maxTurns: task.maxTurns,
  };
}

// ── Orchestrate Full Research ────────────────────────────────────

export async function orchestrateResearch(
  query: string,
  classification: QueryClassification,
): Promise<Result<ReadonlyArray<SubagentResult>, Error>> {
  const tasks = generateTasks(query, classification);

  if (tasks.length === 0) {
    // Simple query — single-agent, no orchestration
    const result = await runLoop(query, {
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      maxTurns: 10,
    });
    if (!result.ok) return result;
    return Ok([
      {
        agentId: makeAgentId('direct'),
        taskObjective: query,
        findings: result.value.text,
        confidence: 0.9,
        tokenUsage: result.value.usage,
        durationMs: result.value.durationMs,
        sourcesConsulted: [],
      },
    ]);
  }

  // Build agent definitions for fan-out
  const agents: Record<string, AgentDefinition> = {};
  for (const task of tasks) {
    agents[task.id] = taskToAgentDef(task);
  }

  // The lead agent orchestrates the subagents
  const leadPrompt = buildLeadPrompt(query, tasks);

  const result = await runLoop(leadPrompt, {
    model: 'claude-opus-4-6',
    effort: 'high',
    maxTurns: 50,
    agents,
    allowedTools: ['Agent', 'Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'],
  });

  if (!result.ok) return result;

  return Ok([
    {
      agentId: makeAgentId('lead'),
      taskObjective: query,
      findings: result.value.text,
      confidence: 0.85,
      tokenUsage: result.value.usage,
      durationMs: result.value.durationMs,
      sourcesConsulted: tasks.map((t) => t.sources).flat(),
    },
  ]);
}

// ── Recursive Improvement Loop ──────────────────────────────────

export type ImprovementRound = {
  readonly round: number;
  readonly findings: string;
  readonly gaps: ReadonlyArray<string>;
  readonly usage: { input: number; output: number; cost: number };
};

/**
 * Run the recursive research → improve loop.
 * Each round:
 *   1. Research with current context
 *   2. Evaluate for gaps
 *   3. If gaps exist, research gaps specifically
 *   4. Merge into improved output
 */
export async function recursiveResearch(
  query: string,
  maxRounds: number = 3,
): Promise<Result<{ finalOutput: string; rounds: ReadonlyArray<ImprovementRound> }, Error>> {
  const rounds: ImprovementRound[] = [];
  let currentFindings = '';

  for (let round = 1; round <= maxRounds; round++) {
    // Step 1: Research (or follow up on gaps)
    const researchPrompt =
      round === 1
        ? query
        : `Given these existing findings:\n\n${currentFindings}\n\nThe following gaps were identified: ${rounds[rounds.length - 1]?.gaps.join(', ')}\n\nResearch these gaps specifically and produce improved, more complete findings.`;

    const result = await runLoop(researchPrompt, {
      model: round === 1 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5',
      effort: round === 1 ? 'high' : 'medium',
      maxTurns: round === 1 ? 30 : 15,
      allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    });

    if (!result.ok) return Err(result.error);
    currentFindings = result.value.text;

    // Step 2: Evaluate for gaps
    const evalResult = await runLoop(
      `Evaluate these research findings for completeness and accuracy. List any gaps, missing perspectives, or areas that need deeper investigation. If the findings are comprehensive, say "NO_GAPS".\n\nFindings:\n${currentFindings}`,
      {
        model: 'claude-haiku-4-5',
        effort: 'low',
        maxTurns: 3,
      },
    );

    const gaps: string[] = [];
    if (evalResult.ok && !evalResult.value.text.includes('NO_GAPS')) {
      // Extract gap descriptions
      const gapLines = evalResult.value.text.split('\n').filter((l) => l.trim().length > 10);
      gaps.push(...gapLines.slice(0, 5)); // Cap at 5 gaps per round
    }

    rounds.push({
      round,
      findings: currentFindings,
      gaps,
      usage: {
        input: result.value.usage.inputTokens as number,
        output: result.value.usage.outputTokens as number,
        cost: result.value.usage.cost as number,
      },
    });

    // If no gaps, we're done
    if (gaps.length === 0) break;
  }

  return Ok({ finalOutput: currentFindings, rounds });
}

// ── Lead Prompt Builder ─────────────────────────────────────────

function buildLeadPrompt(query: string, tasks: ReadonlyArray<ResearchTask>): string {
  const taskList = tasks.map((t) => `- Agent "${t.id}": ${t.objective} (tools: ${t.tools.join(', ')})`).join('\n');

  return `You are a lead research orchestrator. Your job is to coordinate subagent research and synthesize findings.

RESEARCH QUERY: ${query}

AVAILABLE SUBAGENTS:
${taskList}

INSTRUCTIONS:
1. Delegate each research subtopic to the appropriate subagent using the Agent tool
2. Run subagents in parallel where possible
3. When all results are in, synthesize into a comprehensive answer
4. Use BLUF (Bottom Line Up Front) format:
   - First paragraph: direct answer
   - Following sections: supporting evidence with bold key facts
   - Final section: limitations and confidence level

IMPORTANT: Do NOT do the research yourself. Delegate to the subagents and synthesize their findings.`;
}
