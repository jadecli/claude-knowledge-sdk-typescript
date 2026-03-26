/**
 * @module types/harness
 * Types for Claude Code harness design patterns.
 *
 * Sources:
 *   - anthropic.com/engineering/harness-design-long-running-apps
 *   - anthropic.com/engineering/writing-tools-for-agents
 *   - anthropic.com/engineering/multi-agent-research-system
 *
 * The harness is the host application that wraps the agent loop,
 * managing lifecycle, permissions, context, and tool execution.
 */

// ── Tool Design Patterns ───────────────────────────────────────
// From "Writing Tools for Agents" blog post

/**
 * Tool design pattern categories from Anthropic's engineering blog.
 * Each pattern addresses a specific agent-tool interaction challenge.
 */
export type ToolDesignPattern =
  | 'format_hint' // Add response_format param (concise|detailed)
  | 'pagination' // Return pages with next_token instead of all results
  | 'confirmation' // Require explicit confirmation for destructive ops
  | 'dry_run' // Preview changes without executing them
  | 'targeted_search' // Accept filters to narrow results instead of dumping all
  | 'progressive_disclosure' // Return summary first, details on demand
  | 'idempotent' // Safe to retry without side effects
  | 'batched' // Accept arrays for bulk operations
  | 'streaming'; // Yield partial results for long operations

/**
 * Tool quality rubric from Anthropic's tool design guidelines.
 * A well-designed tool scores high on all dimensions.
 */
export type ToolQualityDimension =
  | 'discoverability' // Can the agent find the right tool?
  | 'parameter_clarity' // Are inputs self-documenting?
  | 'error_actionability' // Do errors tell the agent what to do next?
  | 'output_parsability' // Can the agent reliably extract data from output?
  | 'scope_appropriateness'; // Is the tool the right granularity?

/** Tool definition with quality annotations */
export type AnnotatedToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly patterns: ReadonlyArray<ToolDesignPattern>;
  readonly qualityNotes?: Partial<Record<ToolQualityDimension, string>>;
};

// ── Harness Lifecycle ──────────────────────────────────────────
// From "Harness Design for Long-Running Apps"

/**
 * Harness lifecycle phases.
 * The harness manages transitions between these phases.
 */
export type HarnessPhase =
  | 'initializing' // Setting up context, loading tools
  | 'authenticating' // Validating credentials, obtaining tokens
  | 'preparing' // Building prompt, fetching GitHub data
  | 'executing' // Agent loop running
  | 'post_processing' // Parsing output, posting comments
  | 'cleaning_up' // Revoking tokens, uploading artifacts
  | 'completed' // Done successfully
  | 'failed'; // Error state

/** Harness configuration for long-running agent tasks */
export type HarnessConfig = {
  /** Maximum execution time in minutes */
  readonly timeoutMinutes: number;
  /** Whether to checkpoint state for resumability */
  readonly enableCheckpoints: boolean;
  /** How to handle tool errors */
  readonly errorStrategy: 'fail_fast' | 'retry_then_fail' | 'skip_and_continue';
  /** Maximum retries per tool call */
  readonly maxRetries: number;
  /** Backoff strategy for retries */
  readonly backoff: 'fixed' | 'exponential';
  /** Whether to preserve conversation for --resume */
  readonly preserveSession: boolean;
};

/** Default harness config matching claude-code-action behavior */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  timeoutMinutes: 20,
  enableCheckpoints: false,
  errorStrategy: 'retry_then_fail',
  maxRetries: 3,
  backoff: 'exponential',
  preserveSession: true,
};

// ── Multi-Agent Research Patterns ──────────────────────────────
// From "Multi-Agent Research System" blog post

/**
 * Research agent scaling tiers from Anthropic's measured results.
 * Token usage explains 80% of performance variance.
 */
export type ResearchScalingTier = {
  /** Descriptive name of the tier */
  readonly name: 'simple_lookup' | 'comparison' | 'deep_research' | 'comprehensive_survey';
  /** Number of subagents to spawn */
  readonly agentCount: number;
  /** Tool calls per subagent */
  readonly toolCallsPerAgent: number;
  /** Recommended model for subagents */
  readonly subagentModel: 'haiku' | 'sonnet' | 'opus';
  /** Expected token budget per subagent */
  readonly tokenBudgetPerAgent: number;
};

/** Anthropic's documented scaling tiers with measured performance */
export const RESEARCH_SCALING_TIERS: ReadonlyArray<ResearchScalingTier> = [
  { name: 'simple_lookup', agentCount: 1, toolCallsPerAgent: 5, subagentModel: 'haiku', tokenBudgetPerAgent: 10_000 },
  { name: 'comparison', agentCount: 3, toolCallsPerAgent: 10, subagentModel: 'sonnet', tokenBudgetPerAgent: 50_000 },
  {
    name: 'deep_research',
    agentCount: 5,
    toolCallsPerAgent: 15,
    subagentModel: 'sonnet',
    tokenBudgetPerAgent: 100_000,
  },
  {
    name: 'comprehensive_survey',
    agentCount: 10,
    toolCallsPerAgent: 15,
    subagentModel: 'sonnet',
    tokenBudgetPerAgent: 100_000,
  },
];

/**
 * Subagent compression ratio — key metric from Anthropic's research system.
 * Each subagent explores 10K+ tokens and compresses to 1-2K summary.
 * This 5-10x compression is what makes multi-agent viable.
 */
export type CompressionMetrics = {
  /** Raw tokens consumed during exploration */
  readonly explorationTokens: number;
  /** Tokens in the compressed summary */
  readonly summaryTokens: number;
  /** Compression ratio (exploration / summary) */
  readonly compressionRatio: number;
  /** Confidence in summary completeness (0-1) */
  readonly confidence: number;
};

// ── Context Engineering Patterns ───────────────────────────────
// From the context engineering and tool search posts

/**
 * Context engineering layers from Anthropic's documentation.
 * Applied in order from cheapest to most expensive.
 */
export type ContextEngineeringLayer =
  | 'system_prompt_optimization' // Reduce system prompt tokens
  | 'tool_token_efficiency' // Progressive tool disclosure (85% reduction)
  | 'just_in_time_retrieval' // Load context only when needed
  | 'compaction' // Summarize old conversation turns
  | 'structured_notes' // Agent writes persistent notes
  | 'subagent_isolation' // Fresh context per subagent
  | 'programmatic_tool_calling'; // Keep intermediates in code, not context (37% reduction)

/** Token reduction measurements from Anthropic's blog posts */
export const MEASURED_TOKEN_REDUCTIONS: ReadonlyArray<{
  readonly technique: ContextEngineeringLayer;
  readonly reductionPercent: number;
  readonly source: string;
}> = [
  { technique: 'tool_token_efficiency', reductionPercent: 85, source: 'Tool Search Tool' },
  { technique: 'programmatic_tool_calling', reductionPercent: 37, source: 'Code execution blog' },
  { technique: 'subagent_isolation', reductionPercent: 90, source: 'Multi-agent research (vs single-agent)' },
];

// ── Permission Model ───────────────────────────────────────────

/**
 * Claude Code permission modes.
 * Controls how tool calls are authorized during execution.
 */
export type PermissionMode =
  | 'default' // Ask user for each tool call
  | 'acceptEdits' // Auto-approve file edits, ask for others
  | 'plan' // Read-only exploration, no writes
  | 'bypassPermissions' // Approve everything (CI/CD only)
  | 'dontAsk'; // Never prompt, deny if not pre-approved

/** Permission rule for settings.json */
export type PermissionRule = {
  /** Tool name or glob pattern (e.g., "Bash(npm run *)") */
  readonly tool: string;
  /** Whether to allow or deny */
  readonly action: 'allow' | 'deny';
};
