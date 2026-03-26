/**
 * @module agent/loop
 * The core agent loop — wraps @anthropic-ai/claude-agent-sdk query()
 * with typed Result handling, cost tracking, and budget enforcement.
 *
 * This is the exact query() → async generator → message stream pattern
 * from platform.claude.com/docs/en/agent-sdk/agent-loop
 */

import type { QueryOptions, TokenUsage } from '../types/agent.js';
import type { Result, SessionId } from '../types/core.js';
import { SessionId as makeSessionId, TokenCount, USD, tryCatch } from '../types/core.js';

// ── Loop Result ─────────────────────────────────────────────────

export type LoopResult = {
  readonly text: string;
  readonly sessionId: SessionId;
  readonly usage: TokenUsage;
  readonly turns: number;
  readonly durationMs: number;
};

// ── Error Types ─────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  readonly name = 'BudgetExceededError' as const;
  constructor(
    readonly spent: number,
    readonly budget: number,
  ) {
    super(`Budget exceeded: $${spent.toFixed(4)} > $${budget.toFixed(4)}`);
  }
}

export class MaxTurnsError extends Error {
  readonly name = 'MaxTurnsError' as const;
  constructor(readonly turns: number) {
    super(`Max turns reached: ${turns}`);
  }
}

// ── Cost Estimation ──────────────────────────────────────────────
// Single source of truth: MODEL_PRICING in monitoring/telemetry.ts
// This re-exports a simplified estimator for the agent loop.

import { calculateCost as _calculateCost } from '../monitoring/telemetry.js';

export function estimateCost(model: string, input: number, output: number): number {
  return _calculateCost(model, input, output) as number;
}

// ── The Loop ────────────────────────────────────────────────────
// Uses dynamic import so this module compiles even without the SDK installed.
// The SDK is a peer dependency — consumers install it.

export async function runLoop(prompt: string, options: QueryOptions = {}): Promise<Result<LoopResult, Error>> {
  const start = Date.now();

  return tryCatch(async () => {
    // Dynamic import — the SDK is a peer dep
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const query = sdk.query;

    let resultText = '';
    let sessionId = '';
    let totalInput = 0;
    let totalOutput = 0;
    let turns = 0;

    const q = query({
      prompt,
      options: {
        model: options.model ?? 'claude-sonnet-4-6',
        systemPrompt: options.systemPrompt,
        allowedTools: options.allowedTools ? [...options.allowedTools] : undefined,
        disallowedTools: options.disallowedTools ? [...options.disallowedTools] : undefined,
        permissionMode: options.permissionMode ?? 'acceptEdits',
        maxTurns: options.maxTurns ?? 30,
        effort: options.effort ?? 'high',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK uses mutable types, we use readonly
        mcpServers: options.mcpServers as any,
        agents: options.agents as any,
        settingSources: options.settingSources ? [...options.settingSources] : undefined,
        cwd: options.cwd,
        resume: options.resume,
      },
    });

    for await (const message of q) {
      switch (message.type) {
        case 'system':
          if ('session_id' in message && typeof message.session_id === 'string') {
            sessionId = message.session_id;
          }
          break;

        case 'assistant':
          turns++;
          if ('message' in message) {
            const msg = message.message as { content: ReadonlyArray<{ type: string; text?: string }> };
            for (const block of msg.content) {
              if (block.type === 'text' && block.text) {
                resultText += block.text;
              }
            }
          }
          break;

        case 'result': {
          const rm = message as unknown as {
            subtype: string;
            result?: string;
            session_id?: string;
            cost_usd?: number;
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          if (rm.result) resultText = rm.result;
          if (rm.session_id) sessionId = rm.session_id;
          if (rm.usage) {
            totalInput += rm.usage.input_tokens ?? 0;
            totalOutput += rm.usage.output_tokens ?? 0;
          }
          break;
        }
      }
    }

    const model = options.model ?? 'claude-sonnet-4-6';

    return {
      text: resultText,
      sessionId: makeSessionId(sessionId),
      usage: {
        inputTokens: TokenCount(totalInput),
        outputTokens: TokenCount(totalOutput),
        cacheCreationTokens: TokenCount(0),
        cacheReadTokens: TokenCount(0),
        cost: USD(estimateCost(model, totalInput, totalOutput)),
      },
      turns,
      durationMs: Date.now() - start,
    };
  });
}
