/**
 * @module db/agent-crud
 * CRUD operations for agents using SCD Type 2.
 */
import type { NeonClient } from './neon-client.js';
import type { AgentRecord, Result } from './types.js';
import { Ok, Err, validateAgentLevel } from './types.js';
import { insertWithEffectiveDating } from './scd.js';

const TABLE = 'agents';

/**
 * Create a new agent with SCD Type 2 effective dating.
 */
export async function createAgent(
  client: NeonClient,
  data: {
    readonly agent_id: string;
    readonly name: string;
    readonly department: string;
    readonly level: number;
    readonly reports_to: string | null;
    readonly capabilities: readonly string[];
  },
): Promise<Result<AgentRecord>> {
  const levelResult = validateAgentLevel(data.level);
  if (!levelResult.ok) {
    return levelResult;
  }

  const row = {
    agent_id: data.agent_id,
    name: data.name,
    department: data.department,
    level: data.level,
    status: 'active' as const,
    reports_to: data.reports_to,
    capabilities: JSON.stringify(data.capabilities),
  };

  const result = await insertWithEffectiveDating(client, TABLE, data.agent_id, row);
  if (!result.ok) return result;

  return Ok(result.value as unknown as AgentRecord);
}

/**
 * Get the current version of an agent by agent_id.
 */
export async function getAgent(
  client: NeonClient,
  agentId: string,
): Promise<AgentRecord | null> {
  const result = await client.query<AgentRecord>(
    `SELECT * FROM ${TABLE} WHERE agent_id = $1 AND is_current = true LIMIT 1`,
    [agentId],
  );
  return result.rows[0] ?? null;
}

/**
 * Update an agent, creating a new SCD version.
 */
export async function updateAgent(
  client: NeonClient,
  agentId: string,
  updates: Partial<{
    readonly name: string;
    readonly department: string;
    readonly level: number;
    readonly reports_to: string | null;
    readonly capabilities: readonly string[];
  }>,
): Promise<Result<AgentRecord>> {
  if (updates.level !== undefined) {
    const levelResult = validateAgentLevel(updates.level);
    if (!levelResult.ok) return levelResult;
  }

  const current = await getAgent(client, agentId);
  if (!current) {
    return Err(new Error(`Agent not found: ${agentId}`));
  }

  const merged = {
    agent_id: current.agent_id,
    name: updates.name ?? current.name,
    department: updates.department ?? current.department,
    level: updates.level ?? current.level,
    status: current.status,
    reports_to: updates.reports_to !== undefined ? updates.reports_to : current.reports_to,
    capabilities: updates.capabilities
      ? JSON.stringify(updates.capabilities)
      : current.capabilities,
  };

  const result = await insertWithEffectiveDating(client, TABLE, agentId, merged);
  if (!result.ok) return result;

  return Ok(result.value as unknown as AgentRecord);
}

/**
 * Deactivate an agent (sets status to inactive via new SCD version).
 */
export async function deactivateAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<AgentRecord>> {
  const current = await getAgent(client, agentId);
  if (!current) {
    return Err(new Error(`Agent not found: ${agentId}`));
  }

  const data = {
    agent_id: current.agent_id,
    name: current.name,
    department: current.department,
    level: current.level,
    status: 'inactive' as const,
    reports_to: current.reports_to,
    capabilities: current.capabilities,
  };

  const result = await insertWithEffectiveDating(client, TABLE, agentId, data);
  if (!result.ok) return result;

  return Ok(result.value as unknown as AgentRecord);
}

/**
 * List current agents filtered by department.
 */
export async function listAgentsByDepartment(
  client: NeonClient,
  department: string,
): Promise<readonly AgentRecord[]> {
  const result = await client.query<AgentRecord>(
    `SELECT * FROM ${TABLE} WHERE department = $1 AND is_current = true ORDER BY name ASC`,
    [department],
  );
  return result.rows;
}

/**
 * List current agents filtered by level.
 */
export async function listAgentsByLevel(
  client: NeonClient,
  level: number,
): Promise<readonly AgentRecord[]> {
  const result = await client.query<AgentRecord>(
    `SELECT * FROM ${TABLE} WHERE level = $1 AND is_current = true ORDER BY name ASC`,
    [level],
  );
  return result.rows;
}

/**
 * Get the reporting chain from an agent up to the root.
 */
export async function getReportingChain(
  client: NeonClient,
  agentId: string,
): Promise<readonly AgentRecord[]> {
  const chain: AgentRecord[] = [];
  let currentId: string | null = agentId;

  while (currentId) {
    const agent = await getAgent(client, currentId);
    if (!agent) break;
    chain.push(agent);
    currentId = agent.reports_to;
  }

  return chain;
}

/**
 * Get direct reports of an agent.
 */
export async function getDirectReports(
  client: NeonClient,
  agentId: string,
): Promise<readonly AgentRecord[]> {
  const result = await client.query<AgentRecord>(
    `SELECT * FROM ${TABLE} WHERE reports_to = $1 AND is_current = true ORDER BY name ASC`,
    [agentId],
  );
  return result.rows;
}
