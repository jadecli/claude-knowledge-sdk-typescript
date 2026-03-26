/**
 * @module db/worker-config
 * Knowledge worker configuration: maps departments to Slack channels,
 * GitHub repos, and default agent personas.
 *
 * Boris Cherny patterns:
 *   - Branded types: SlackChannel, GitHubRepo
 *   - Result<T, WorkerConfigError> — no exceptions across boundaries
 *   - Discriminated union: WorkerConfigErrorType
 *   - readonly throughout
 */
import type { NeonClient } from './neon-client.js';
import type { FactAgent } from '../types/schema.js';
import { Ok, Err, type Result } from '../types/result.js';
import { getAgent, listAgentsByDepartment } from './agent-crud.js';

// ── Branded Types ────────────────────────────────────────────

type Brand<K, T> = K & { readonly __brand: T };

export type SlackChannel = Brand<string, 'SlackChannel'>;
export type GitHubRepo = Brand<string, 'GitHubRepo'>;

export const SlackChannel = (raw: string): SlackChannel => {
  if (!raw.startsWith('#')) throw new TypeError(`SlackChannel must start with #, got ${raw}`);
  return raw as SlackChannel;
};

export const GitHubRepo = (raw: string): GitHubRepo => {
  if (!raw.includes('/')) throw new TypeError(`GitHubRepo must be owner/repo, got ${raw}`);
  return raw as GitHubRepo;
};

// ── Error Type (discriminated union) ─────────────────────────

export type WorkerConfigErrorType =
  | 'department_not_found'
  | 'channel_not_found'
  | 'agent_resolution_failed';

export class WorkerConfigError extends Error {
  constructor(
    readonly type: WorkerConfigErrorType,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerConfigError';
  }
}

// ── Types ────────────────────────────────────────────────────

export interface WorkerConfig {
  readonly department: string;
  readonly slack_channel: SlackChannel;
  readonly default_agent_id: string;
  readonly repo: GitHubRepo;
  readonly description: string;
}

export interface WorkerContext {
  readonly config: WorkerConfig;
  readonly agent: FactAgent;
  readonly team: readonly FactAgent[];
  readonly context_string: string;
}

// ── Static Config ────────────────────────────────────────────

const WORKER_CONFIGS: readonly WorkerConfig[] = [
  { department: 'product-management', slack_channel: SlackChannel('#jade-product-management'), default_agent_id: 'product-pm', repo: GitHubRepo('jadecli/jade-product-management'), description: 'Product roadmap, specs, user stories, stakeholder updates' },
  { department: 'engineering', slack_channel: SlackChannel('#jade-engineering'), default_agent_id: 'eng-lead', repo: GitHubRepo('jadecli/jade-engineering'), description: 'Code review, architecture, incident response, design docs' },
  { department: 'sales', slack_channel: SlackChannel('#jade-sales'), default_agent_id: 'sales-ae', repo: GitHubRepo('jadecli/jade-sales'), description: 'Prospect research, call prep, pipeline review, battlecards' },
  { department: 'customer-support', slack_channel: SlackChannel('#jade-customer-support'), default_agent_id: 'support-agent', repo: GitHubRepo('jadecli/jade-customer-support'), description: 'Ticket triage, KB articles, escalation, CSAT analysis' },
  { department: 'marketing', slack_channel: SlackChannel('#jade-marketing'), default_agent_id: 'marketing-spe', repo: GitHubRepo('jadecli/jade-marketing'), description: 'Content creation, campaigns, brand voice, competitor briefs' },
  { department: 'legal', slack_channel: SlackChannel('#jade-legal'), default_agent_id: 'legal-counsel', repo: GitHubRepo('jadecli/jade-legal'), description: 'Contract review, NDAs, compliance, risk assessment' },
  { department: 'finance', slack_channel: SlackChannel('#jade-finance'), default_agent_id: 'finance-analyst', repo: GitHubRepo('jadecli/jade-finance'), description: 'Journal entries, reconciliation, close process, variance analysis' },
  { department: 'data', slack_channel: SlackChannel('#jade-data'), default_agent_id: 'data-analyst', repo: GitHubRepo('jadecli/jade-data'), description: 'SQL queries, dashboards, data validation, statistical analysis' },
  { department: 'operations', slack_channel: SlackChannel('#jade-operations'), default_agent_id: 'ops-analyst', repo: GitHubRepo('jadecli/jade-operations'), description: 'Process optimization, capacity planning, vendor management' },
  { department: 'design', slack_channel: SlackChannel('#jade-design'), default_agent_id: 'design-lead', repo: GitHubRepo('jadecli/jade-design'), description: 'Design systems, UX review, prototyping, engineering handoff' },
  { department: 'enterprise-search', slack_channel: SlackChannel('#jade-enterprise-search'), default_agent_id: 'search-lead', repo: GitHubRepo('jadecli/jade-enterprise-search'), description: 'Cross-tool search, index management, knowledge graph' },
  { department: 'productivity', slack_channel: SlackChannel('#jade-productivity'), default_agent_id: 'productivity-mgr', repo: GitHubRepo('jadecli/jade-productivity'), description: 'Task management, calendar optimization, daily standups' },
];

// ── Lookups ──────────────────────────────────────────────────

export function getWorkerConfig(department: string): Result<WorkerConfig, WorkerConfigError> {
  const config = WORKER_CONFIGS.find((c) => c.department === department);
  return config
    ? Ok(config)
    : Err(new WorkerConfigError('department_not_found', `No worker config for department: ${department}`));
}

export function getWorkerConfigByChannel(channel: string): Result<WorkerConfig, WorkerConfigError> {
  const config = WORKER_CONFIGS.find((c) => c.slack_channel === channel);
  return config
    ? Ok(config)
    : Err(new WorkerConfigError('channel_not_found', `No worker config for channel: ${channel}`));
}

export function listWorkerConfigs(): readonly WorkerConfig[] {
  return WORKER_CONFIGS;
}

// ── Context Generation ───────────────────────────────────────

export async function getWorkerContext(
  client: NeonClient,
  department: string,
): Promise<Result<WorkerContext, WorkerConfigError>> {
  const configResult = getWorkerConfig(department);
  if (!configResult.ok) return configResult;
  const config = configResult.value;

  const agentResult = await getAgent(client, config.default_agent_id);
  if (!agentResult.ok) {
    return Err(new WorkerConfigError('agent_resolution_failed', `Failed to resolve agent ${config.default_agent_id}: ${agentResult.error.message}`));
  }
  if (!agentResult.value) {
    return Err(new WorkerConfigError('agent_resolution_failed', `Agent not found: ${config.default_agent_id}`));
  }

  const teamResult = await listAgentsByDepartment(client, department);
  const team = teamResult.ok ? teamResult.value : [];

  return Ok({
    config,
    agent: agentResult.value,
    team,
    context_string: buildContextString(config, agentResult.value, team),
  });
}

export function buildContextString(
  config: WorkerConfig,
  agent: FactAgent,
  team: readonly FactAgent[],
): string {
  const capabilities = agent.agent_definition?.tools ?? agent.allowed_tools ?? [];
  const systemPrompt = agent.system_prompt ?? agent.agent_definition?.prompt ?? '';
  const teamRoster = team.map((a) => `  - ${a.display_name} (L${a.level_id}, ${a.status})`).join('\n');

  return [
    `# ${config.department} Knowledge Worker`,
    '',
    `**Agent**: ${agent.display_name} (L${agent.level_id})`,
    `**Department**: ${config.department}`,
    `**Repo**: ${config.repo}`,
    `**Slack**: ${config.slack_channel}`,
    '',
    '## Role',
    config.description,
    '',
    '## System Prompt',
    systemPrompt,
    '',
    '## Capabilities',
    capabilities.map((c) => `- ${c}`).join('\n') || '  (none configured)',
    '',
    '## Team',
    teamRoster || '  (no team members registered)',
    '',
    '## Model',
    agent.model_preference,
  ].join('\n');
}
