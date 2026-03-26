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
  { department: 'product-management', slack_channel: '#jade-product-management' as SlackChannel, default_agent_id: 'product-pm', repo: 'jadecli/jade-product-management' as GitHubRepo, description: 'Product roadmap, specs, user stories, stakeholder updates' },
  { department: 'engineering', slack_channel: '#jade-engineering' as SlackChannel, default_agent_id: 'eng-lead', repo: 'jadecli/jade-engineering' as GitHubRepo, description: 'Code review, architecture, incident response, design docs' },
  { department: 'sales', slack_channel: '#jade-sales' as SlackChannel, default_agent_id: 'sales-ae', repo: 'jadecli/jade-sales' as GitHubRepo, description: 'Prospect research, call prep, pipeline review, battlecards' },
  { department: 'customer-support', slack_channel: '#jade-customer-support' as SlackChannel, default_agent_id: 'support-agent', repo: 'jadecli/jade-customer-support' as GitHubRepo, description: 'Ticket triage, KB articles, escalation, CSAT analysis' },
  { department: 'marketing', slack_channel: '#jade-marketing' as SlackChannel, default_agent_id: 'marketing-spe', repo: 'jadecli/jade-marketing' as GitHubRepo, description: 'Content creation, campaigns, brand voice, competitor briefs' },
  { department: 'legal', slack_channel: '#jade-legal' as SlackChannel, default_agent_id: 'legal-counsel', repo: 'jadecli/jade-legal' as GitHubRepo, description: 'Contract review, NDAs, compliance, risk assessment' },
  { department: 'finance', slack_channel: '#jade-finance' as SlackChannel, default_agent_id: 'finance-analyst', repo: 'jadecli/jade-finance' as GitHubRepo, description: 'Journal entries, reconciliation, close process, variance analysis' },
  { department: 'data', slack_channel: '#jade-data' as SlackChannel, default_agent_id: 'data-analyst', repo: 'jadecli/jade-data' as GitHubRepo, description: 'SQL queries, dashboards, data validation, statistical analysis' },
  { department: 'operations', slack_channel: '#jade-operations' as SlackChannel, default_agent_id: 'ops-analyst', repo: 'jadecli/jade-operations' as GitHubRepo, description: 'Process optimization, capacity planning, vendor management' },
  { department: 'design', slack_channel: '#jade-design' as SlackChannel, default_agent_id: 'design-lead', repo: 'jadecli/jade-design' as GitHubRepo, description: 'Design systems, UX review, prototyping, engineering handoff' },
  { department: 'enterprise-search', slack_channel: '#jade-enterprise-search' as SlackChannel, default_agent_id: 'search-lead', repo: 'jadecli/jade-enterprise-search' as GitHubRepo, description: 'Cross-tool search, index management, knowledge graph' },
  { department: 'productivity', slack_channel: '#jade-productivity' as SlackChannel, default_agent_id: 'productivity-mgr', repo: 'jadecli/jade-productivity' as GitHubRepo, description: 'Task management, calendar optimization, daily standups' },
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
