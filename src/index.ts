/**
 * @jadecli/claude-knowledge-sdk
 *
 * Distilled knowledge SDK for Claude Code, Agent SDK, and multi-agent research.
 * Code-first, type-safe, recursively self-improving.
 *
 * Built from:
 *   - anthropics/claude-code (v2.1.83)
 *   - anthropics/claude-code-action
 *   - @anthropic-ai/claude-agent-sdk (v0.2.33)
 *   - anthropics/claude-code-monitoring-guide
 *   - anthropic.com/engineering (8 key posts)
 *   - platform.claude.com, code.claude.com, docs.anthropic.com
 */

// ── Core Types ──────────────────────────────────────────────────
export type { Result } from './types/core.js';
export {
  Ok,
  Err,
  mapResult,
  flatMapResult,
  tryCatch,
  assertNever,
  AgentId,
  SessionId,
  ToolCallId,
  TokenCount,
  USD,
  DocUrl,
} from './types/core.js';

// ── Agent Types ─────────────────────────────────────────────────
export type {
  AgentDefinition,
  QueryOptions,
  SDKMessage,
  SystemMessage,
  AssistantMessage,
  ResultMessage,
  ContentBlock,
  HookEvent,
  TokenUsage,
  QueryClassification,
  ResearchTask,
  SubagentResult,
  ClaudeModel,
  McpServerConfig,
  BuiltInToolName,
  ToolPermission,
  ToolCategory,
  TodoWriteInput,
  TodoWriteOutput,
  TodoItem,
  AgentInput,
  AgentOutput,
  AgentOutputUsage,
  SDKTaskStartedMessage,
  SDKTaskProgressMessage,
  SDKTaskNotificationMessage,
  TaskUsage,
  TaskCreateInput,
  TaskGetInput,
  TaskListInput,
  TaskUpdateInput,
  CronCreateInput,
  CronDeleteInput,
  CronListInput,
  LSPOperation,
  LSPInput,
} from './types/agent.js';
export { TOOL_PERMISSIONS } from './types/agent.js';

// ── Knowledge Types ─────────────────────────────────────────────
export type { DocSource, DocSection, GitHubRepo, EngineeringPost } from './types/knowledge.js';
export { DOC_SOURCES, GITHUB_REPOS, ENGINEERING_POSTS } from './types/knowledge.js';

// ── Agent Loop ──────────────────────────────────────────────────
export { runLoop, estimateCost } from './agent/loop.js';
export type { LoopResult } from './agent/loop.js';
export { BudgetExceededError, MaxTurnsError } from './agent/loop.js';

// ── Orchestrator ────────────────────────────────────────────────
export {
  planScale,
  generateTasks,
  taskToAgentDef,
  orchestrateResearch,
  recursiveResearch,
} from './agent/orchestrator.js';

// ── Knowledge Fetcher ───────────────────────────────────────────
export {
  fetchAllKnowledge,
  saveKnowledgeIndex,
  loadKnowledgeIndex,
  formatKnowledgeForContext,
} from './knowledge/fetcher.js';
export type { KnowledgeEntry, KnowledgeIndex, FetchProgress } from './knowledge/fetcher.js';

// ── llms.txt Parser ─────────────────────────────────────────────
export { parseLlmsTxt, llmsTxtJsonSchema } from './knowledge/llms-txt-parser.js';
export type { LlmsTxtLink, LlmsTxtSection, LlmsTxtIndex } from './knowledge/llms-txt-parser.js';

// ── Evaluation Framework (agentskills.io) ──────────────────────
export type {
  EvalTestCase,
  EvalSuite,
  AssertionResult,
  GradingResult,
  TimingData,
  BenchmarkResult,
} from './types/evaluation.js';

// ── Context Engineering ─────────────────────────────────────────
export {
  calculateBudget,
  selectCompactionStrategy,
  createToolManifest,
  formatMemoryForContext,
  CONTEXT_PRESETS,
} from './context/manager.js';
export type {
  ContextBudget,
  CompactionStrategy,
  ToolManifestEntry,
  AgentMemoryEntry,
  MemoryCategory,
} from './context/manager.js';

// ── Action Types (claude-code-action@v1) ───────────────────────
export type {
  ActionInputs,
  ActionAuth,
  ActionOutputs,
  ActionSettings,
  ActionTriggerEvent,
  ClaudeArgs,
  McpConfigInline,
  CloudProvider,
  WorkflowPermissions,
  WorkflowPermission,
  WorkflowPreset,
  ToolPermissionSet,
  PullRequestActivityType,
  IssueActivityType,
  SecurityReviewInputs,
  SecurityReviewOutputs,
  GitHubCIMcpTool,
  GitHubInlineCommentTool,
  GitHubCommentMcpTool,
  BaseActionInputs,
  BaseActionOutputs,
  SystemPromptMode,
  ClaudeRunResult,
  ProviderRequirements,
} from './types/action.js';
export { PROVIDER_REQUIREMENTS, PLUGIN_NAME_REGEX, isValidPluginName, isValidMarketplaceUrl } from './types/action.js';

// ── Action Builders ────────────────────────────────────────────
export {
  buildClaudeArgs,
  expandToolSet,
  mcpServer,
  mcpServerPython,
  promptContext,
  jsonSchema,
  buildSystemPromptArgs,
  buildBaseActionInputs,
} from './action/directives.js';
export { generateWorkflow, generatePresetWorkflow, generateSecurityReviewWorkflow } from './action/workflow.js';
export type { WorkflowConfig, WorkflowTrigger } from './action/workflow.js';

// ── MCPB Desktop Extension Types ───────────────────────────────
export type {
  McpbManifest,
  McpbAuthor,
  McpbRepository,
  McpbServerConfig,
  McpbServerType,
  McpbMcpConfig,
  McpbPlatform,
  McpbPlatformOverride,
  McpbToolDeclaration,
  McpbPromptDeclaration,
  McpbCompatibility,
  McpbUserConfigField,
  McpbArchiveLayout,
} from './types/extension.js';

// ── MCPB Manifest Builder ──────────────────────────────────────
export { buildManifest, ManifestBuilder } from './extension/manifest.js';
export type { ManifestBuilderOptions } from './extension/manifest.js';

// ── Harness & Engineering Patterns ─────────────────────────────
export type {
  ToolDesignPattern,
  ToolQualityDimension,
  AnnotatedToolDefinition,
  HarnessPhase,
  HarnessConfig,
  ResearchScalingTier,
  CompressionMetrics,
  ContextEngineeringLayer,
  PermissionMode,
  PermissionRule,
} from './types/harness.js';
export { DEFAULT_HARNESS_CONFIG, RESEARCH_SCALING_TIERS, MEASURED_TOKEN_REDUCTIONS } from './types/harness.js';

// ── Monitoring ──────────────────────────────────────────────────
export {
  calculateCost,
  generateOtelEnvVars,
  generateOtelShellScript,
  generateDockerCompose,
  MODEL_PRICING,
  OTEL_METRICS,
  OTEL_LABELS,
} from './monitoring/telemetry.js';
export type { OtelConfig, OtelBackend, ModelPricing } from './monitoring/telemetry.js';
