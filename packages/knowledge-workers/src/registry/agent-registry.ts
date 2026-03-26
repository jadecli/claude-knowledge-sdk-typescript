/**
 * @module registry/agent-registry
 * Agent registry client — bridges HR data model to Claude Agent SDK.
 * Department plugins use this to register, discover, and resolve agents.
 */

import type { NeonClient } from '../db/neon-client.js';
import { Ok, Err, type Result } from '../types/result.js';
import type {
  AgentDefinition,
  AgentSummary,
  LevelId,
  OrgNode,
  RegistryError,
  Track,
} from '../types/schema.js';

class RegistryErrorImpl extends Error {
  constructor(
    public readonly detail: RegistryError,
  ) {
    super(
      detail.type === 'db_error'
        ? detail.cause.message
        : detail.type === 'resolution_failed'
          ? detail.detail
          : detail.type === 'agent_not_found'
            ? `Agent not found: ${detail.agent_id}`
            : `${detail.type}`,
    );
    this.name = 'RegistryError';
  }
}

/**
 * Register a new agent from a department plugin.
 */
export async function registerAgent(
  client: NeonClient,
  pluginRepo: string,
  agentDef: AgentDefinition,
  agentId: string,
  displayName: string,
  levelId: LevelId,
  jobProfileId: string,
  departmentId: string,
  supOrgId: string,
  reportsTo?: string | null,
): Promise<Result<string, RegistryErrorImpl>> {
  try {
    const rows = await client.sql(
      `INSERT INTO fact_agent (
        agent_id, display_name, agent_type, level_id, job_profile_id,
        department_id, sup_org_id, reports_to, plugin_repo, agent_definition,
        status, eff_start, eff_end, is_current, created_at, updated_at
      ) VALUES (
        $1, $2, 'named', $3, $4, $5, $6, $7, $8, $9,
        'active', now(), '9999-12-31T00:00:00Z', true, now(), now()
      ) RETURNING agent_id`,
      [agentId, displayName, levelId as number, jobProfileId,
       departmentId, supOrgId, reportsTo ?? null, pluginRepo,
       JSON.stringify(agentDef)],
    );
    const row = rows[0] as { agent_id: string } | undefined;
    if (!row) {
      return Err(new RegistryErrorImpl({ type: 'constraint_violation', detail: 'INSERT returned no rows' }));
    }
    return Ok(row.agent_id);
  } catch (err) {
    return Err(new RegistryErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Deregister an agent (expire via SCD).
 */
export async function deregisterAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<void, RegistryErrorImpl>> {
  try {
    const rows = await client.sql(
      `UPDATE fact_agent SET eff_end = now(), is_current = false, status = 'terminated', updated_at = now()
       WHERE agent_id = $1 AND is_current = true RETURNING agent_id`,
      [agentId],
    );
    if (rows.length === 0) {
      return Err(new RegistryErrorImpl({ type: 'agent_not_found', agent_id: agentId }));
    }
    return Ok(undefined);
  } catch (err) {
    return Err(new RegistryErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Resolve an agent ID to its AgentDefinition (for spawning via Claude Agent SDK).
 */
export async function resolveAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<AgentDefinition, RegistryErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT agent_definition FROM fact_agent
       WHERE agent_id = $1 AND is_current = true LIMIT 1`,
      [agentId],
    );
    const row = rows[0] as { agent_definition: AgentDefinition | null } | undefined;
    if (!row) {
      return Err(new RegistryErrorImpl({ type: 'agent_not_found', agent_id: agentId }));
    }
    if (!row.agent_definition) {
      return Err(new RegistryErrorImpl({
        type: 'resolution_failed',
        detail: `Agent ${agentId} has no agent_definition configured`,
      }));
    }
    return Ok(row.agent_definition);
  } catch (err) {
    return Err(new RegistryErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

export interface ListAgentsOptions {
  readonly level?: LevelId;
  readonly track?: Track;
  readonly activeOnly?: boolean;
}

/**
 * List agents in a department with optional filters.
 */
export async function listDepartmentAgents(
  client: NeonClient,
  departmentId: string,
  options?: ListAgentsOptions,
): Promise<Result<readonly AgentSummary[], RegistryErrorImpl>> {
  try {
    let sql = `SELECT
        fa.agent_id, fa.display_name, fa.level_id,
        dl.level_code, fa.department_id, dd.department_name,
        djp.track, fa.status
      FROM fact_agent fa
      JOIN dim_level dl ON fa.level_id = dl.level_id
      JOIN dim_department dd ON fa.department_id = dd.department_id AND dd.is_current = true
      JOIN dim_job_profile djp ON fa.job_profile_id = djp.job_profile_id AND djp.is_current = true
      WHERE fa.department_id = $1 AND fa.is_current = true`;

    const params: unknown[] = [departmentId];
    let paramIdx = 2;

    if (options?.level !== undefined) {
      sql += ` AND fa.level_id = $${paramIdx}`;
      params.push(options.level as number);
      paramIdx++;
    }

    if (options?.track !== undefined) {
      sql += ` AND djp.track = $${paramIdx}`;
      params.push(options.track);
      paramIdx++;
    }

    if (options?.activeOnly !== false) {
      sql += ` AND fa.status = 'active'`;
    }

    sql += ` ORDER BY fa.level_id DESC, fa.display_name ASC`;

    const rows = await client.sql(sql, params);
    return Ok(rows as unknown as readonly AgentSummary[]);
  } catch (err) {
    return Err(new RegistryErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Get the org chart as a tree structure via recursive CTE.
 */
export async function getOrgChart(
  client: NeonClient,
  rootAgentId?: string,
): Promise<Result<readonly OrgNode[], RegistryErrorImpl>> {
  try {
    // Get all current agents with level info
    const rows = await client.sql(
      `SELECT fa.agent_id, fa.display_name, fa.level_id, dl.level_code,
              fa.department_id, fa.reports_to
       FROM fact_agent fa
       JOIN dim_level dl ON fa.level_id = dl.level_id
       WHERE fa.is_current = true AND fa.status = 'active'
       ORDER BY fa.level_id DESC, fa.display_name ASC`,
    );

    type FlatNode = {
      agent_id: string;
      display_name: string;
      level_id: LevelId;
      level_code: string;
      department_id: string;
      reports_to: string | null;
    };

    const agents = rows as unknown as FlatNode[];
    const agentMap = new Map<string, FlatNode>();
    const childrenMap = new Map<string, OrgNode[]>();

    for (const agent of agents) {
      agentMap.set(agent.agent_id, agent);
      childrenMap.set(agent.agent_id, []);
    }

    // Build tree
    const roots: OrgNode[] = [];
    for (const agent of agents) {
      const node: OrgNode = {
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        level_id: agent.level_id,
        level_code: agent.level_code,
        department_id: agent.department_id,
        children: childrenMap.get(agent.agent_id) ?? [],
      };

      if (agent.reports_to && childrenMap.has(agent.reports_to)) {
        childrenMap.get(agent.reports_to)!.push(node);
      } else {
        roots.push(node);
      }

      // Replace the placeholder in childrenMap with the actual node's children array
      const existingChildren = childrenMap.get(agent.agent_id);
      if (existingChildren) {
        Object.defineProperty(node, 'children', { value: existingChildren, writable: false });
      }
    }

    if (rootAgentId) {
      const rootNode = roots.find(n => n.agent_id === rootAgentId)
        ?? findInTree(roots, rootAgentId);
      return Ok(rootNode ? [rootNode] : []);
    }

    return Ok(roots);
  } catch (err) {
    return Err(new RegistryErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

function findInTree(nodes: readonly OrgNode[], agentId: string): OrgNode | undefined {
  for (const node of nodes) {
    if (node.agent_id === agentId) return node;
    const found = findInTree(node.children, agentId);
    if (found) return found;
  }
  return undefined;
}
