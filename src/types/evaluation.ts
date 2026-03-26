/**
 * @module types/evaluation
 * Types for the agentskills.io skill evaluation framework.
 *
 * Evaluation flow:
 *   evals.json → spawn subagent per test case → capture timing → grade assertions
 *   → benchmark (with_skill vs without_skill)
 *
 * Directory structure:
 *   skill-name/evals/evals.json          — test cases
 *   skill-name-workspace/iteration-N/
 *     eval-test-case-name/{with_skill,without_skill}/
 *       outputs/     — files produced
 *       timing.json  — token/duration data
 *       grading.json — assertion results
 *     benchmark.json — aggregated comparison
 *     feedback.json  — human review notes
 */

// ── Eval Test Cases ─────────────────────────────────────────

/** A single evaluation test case from evals.json */
export type EvalTestCase = {
  readonly id: number;
  readonly prompt: string;
  readonly expected_output: string;
  readonly files: ReadonlyArray<string>;
  readonly assertions: ReadonlyArray<string>;
};

/** Complete evaluation suite matching agentskills.io evals.json format */
export type EvalSuite = {
  readonly skill_name: string;
  readonly evals: ReadonlyArray<EvalTestCase>;
};

// ── Grading ─────────────────────────────────────────────────

/** Result of evaluating a single assertion */
export type AssertionResult = {
  readonly text: string;
  readonly passed: boolean;
  readonly evidence: string; // concrete quote/reference from output
};

/** Grading result for one eval run (stored in grading.json) */
export type GradingResult = {
  readonly assertion_results: ReadonlyArray<AssertionResult>;
  readonly summary: {
    readonly passed: number;
    readonly failed: number;
    readonly total: number;
    readonly pass_rate: number; // 0.0-1.0
  };
};

// ── Timing ──────────────────────────────────────────────────

/** Resource usage for one eval run (stored in timing.json) */
export type TimingData = {
  readonly total_tokens: number;
  readonly duration_ms: number;
};

// ── Benchmark ───────────────────────────────────────────────

/** Aggregated benchmark comparing with_skill vs without_skill runs */
export type BenchmarkResult = {
  readonly run_summary: {
    readonly with_skill: {
      readonly pass_rate: { readonly mean: number };
      readonly tokens: { readonly mean: number };
    };
    readonly without_skill: {
      readonly pass_rate: { readonly mean: number };
      readonly tokens: { readonly mean: number };
    };
    readonly delta: {
      readonly pass_rate: number; // difference (with - without)
      readonly tokens: number; // difference (with - without)
    };
  };
};
