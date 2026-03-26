/**
 * @module db/agent-crud
 * CRUD operations for fact_agent with SCD Type 2 effective dating.
 * All mutations expire the old row and insert a new one — never delete.
 */

import type { NeonClient } from './neon-client.js';
import { insertWithEffectiveDating } from './scd.js';
import { Ok, Err, type Result } from '../types/result.js';
import type {
  FactAgent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentCrudError,
  LevelId,
} from '../types/schema.js';

class AgentCrudErrorImpl extends Error {
  constructor(
    public readonly detail: AgentCrudError,
  ) {
    super(
      detail.type === 'db_error'
        ? detail.cause.message
        : detail.type === 'constraint_violation'
          ? detail.detail
          : 'type' in detail && 'agent_id' in detail
            ? `${detail.type}: ${detail.agent_id}`
            : `${detail.type}`,
    );
    this.name = 'AgentCrudError';
  }
}

/**
 * Create a new agent with SCD Type 2 effective dating.
 */
export async function createAgent(
  client: NeonClient,
  input: CreateAgentInput,
): Promise<Result<FactAgent, AgentCrudErrorImpl>> {
  // Validate level (no L9)
  const level = input.level_id as number;
  if (level === 9 || level < 1 || level > 12) {
    return Err(new AgentCrudErrorImpl({ type: 'invalid_level', level }));
  }

  const row: Record<string, unknown> = {
    agent_id: input.agent_id,
    display_name: input.display_name,
    agent_type: input.agent_type ?? 'named',
    level_id: input.level_id,
    job_profile_id: input.job_profile_id,
    department_id: input.department_id,
    sup_org_id: input.sup_org_id,
    reports_to: input.reports_to ?? null,
    plugin_repo: input.plugin_repo ?? null,
    agent_definition: input.agent_definition ? JSON.stringify(input.agent_definition) : null,
    model_preference: input.model_preference ?? 'inherit',
    allowed_tools: input.allowed_tools ?? null,
    skills: input.skills ?? null,
    mcp_servers: input.mcp_servers ?? null,
    system_prompt: input.system_prompt ?? null,
    hire_date: input.hire_date ?? null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await insertWithEffectiveDating<FactAgent>(
    client, 'fact_agent', 'agent_id', input.agent_id, row,
  );

  if (!result.ok) {
    return Err(new AgentCrudErrorImpl(result.error.detail));
  }
  return Ok(result.value);
}

/**
 * Get the current version of an agent.
 */
export async function getAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<FactAgent | null, AgentCrudErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM fact_agent WHERE agent_id = $1 AND is_current = true LIMIT 1`,
      [agentId],
    );
    const row = rows[0] as FactAgent | undefined;
    return Ok(row ?? null);
  } catch (err) {
    return Err(new AgentCrudErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Update an agent using SCD Type 2 — expire current row, insert new version.
 */
export async function updateAgent(
  client: NeonClient,
  agentId: string,
  updates: UpdateAgentInput,
): Promise<Result<FactAgent, AgentCrudErrorImpl>> {
  // Validate level if provided
  if (updates.level_id !== undefined) {
    const level = updates.level_id as number;
    if (level === 9 || level < 1 || level > 12) {
      return Err(new AgentCrudErrorImpl({ type: 'invalid_level', level }));
    }
  }

  // Get current version
  const currentResult = await getAgent(client, agentId);
  if (!currentResult.ok) return currentResult as Result<FactAgent, AgentCrudErrorImpl>;
  if (!currentResult.value) {
    return Err(new AgentCrudErrorImpl({ type: 'agent_not_found', agent_id: agentId }));
  }

  const current = currentResult.value;

  // Merge updates with current values
  const row: Record<string, unknown> = {
    agent_id: agentId,
    display_name: updates.display_name ?? current.display_name,
    agent_type: current.agent_type,
    level_id: updates.level_id ?? current.level_id,
    job_profile_id: updates.job_profile_id ?? current.job_profile_id,
    department_id: updates.department_id ?? current.department_id,
    sup_org_id: updates.sup_org_id ?? current.sup_org_id,
    reports_to: updates.reports_to !== undefined ? updates.reports_to : current.reports_to,
    plugin_repo: updates.plugin_repo !== undefined ? updates.plugin_repo : current.plugin_repo,
    agent_definition: updates.agent_definition !== undefined
      ? (updates.agent_definition ? JSON.stringify(updates.agent_definition) : null)
      : (current.agent_definition ? JSON.stringify(current.agent_definition) : null),
    model_preference: updates.model_preference ?? current.model_preference,
    allowed_tools: updates.allowed_tools !== undefined ? updates.allowed_tools : current.allowed_tools,
    skills: updates.skills !== undefined ? updates.skills : current.skills,
    mcp_servers: updates.mcp_servers !== undefined ? updates.mcp_servers : current.mcp_servers,
    system_prompt: updates.system_prompt !== undefined ? updates.system_prompt : current.system_prompt,
    hire_date: current.hire_date,
    status: updates.status ?? current.status,
    created_at: current.created_at,
    updated_at: new Date().toISOString(),
  };

  const result = await insertWithEffectiveDating<FactAgent>(
    client, 'fact_agent', 'agent_id', agentId, row,
  );

  if (!result.ok) {
    return Err(new AgentCrudErrorImpl(result.error.detail));
  }
  return Ok(result.value);
}

/**
 * Deactivate an agent — sets status to 'inactive' via SCD update.
 */
export async function deactivateAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<void, AgentCrudErrorImpl>> {
  const result = await updateAgent(client, agentId, { status: 'inactive' });
  if (!result.ok) return result as unknown as Result<void, AgentCrudErrorImpl>;
  return Ok(undefined);
}

/**
 * List current agents by department.
 */
export async function listAgentsByDepartment(
  client: NeonClient,
  departmentId: string,
): Promise<Result<readonly FactAgent[], AgentCrudErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM fact_agent
       WHERE department_id = $1 AND is_current = true
       ORDER BY level_id DESC, display_name ASC`,
      [departmentId],
    );
    return Ok(rows as unknown as readonly FactAgent[]);
  } catch (err) {
    return Err(new AgentCrudErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * List current agents by level.
 */
export async function listAgentsByLevel(
  client: NeonClient,
  levelId: LevelId,
): Promise<Result<readonly FactAgent[], AgentCrudErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM fact_agent
       WHERE level_id = $1 AND is_current = true
       ORDER BY department_id, display_name ASC`,
      [levelId as number],
    );
    return Ok(rows as unknown as readonly FactAgent[]);
  } catch (err) {
    return Err(new AgentCrudErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Get reporting chain from an agent up to the CEO (recursive CTE).
 */
export async function getReportingChain(
  client: NeonClient,
  agentId: string,
): Promise<Result<readonly FactAgent[], AgentCrudErrorImpl>> {
  try {
    const rows = await client.sql(
      `WITH RECURSIVE chain AS (
        SELECT * FROM fact_agent WHERE agent_id = $1 AND is_current = true
        UNION ALL
        SELECT fa.* FROM fact_agent fa
        INNER JOIN chain c ON fa.agent_id = c.reports_to
        WHERE fa.is_current = true
      )
      SELECT * FROM chain ORDER BY level_id ASC`,
      [agentId],
    );
    return Ok(rows as unknown as readonly FactAgent[]);
  } catch (err) {
    return Err(new AgentCrudErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Get direct reports of an agent.
 */
export async function getDirectReports(
  client: NeonClient,
  agentId: string,
): Promise<Result<readonly FactAgent[], AgentCrudErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM fact_agent
       WHERE reports_to = $1 AND is_current = true
       ORDER BY level_id DESC, display_name ASC`,
      [agentId],
    );
    return Ok(rows as unknown as readonly FactAgent[]);
  } catch (err) {
    return Err(new AgentCrudErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}
