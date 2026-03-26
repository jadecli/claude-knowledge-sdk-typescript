/**
 * @module registry/agent-registry
 * Agent registry client — bridges HR data model to Claude Agent SDK.
 * Department plugins use this to register, discover, and resolve agents.
 *
 * All agent registration goes through the SCD engine via `createAgent()`
 * to maintain the temporal invariant: at most one current row per agent_id.
 */

import type { NeonClient } from '../db/neon-client.js';
import { createAgent } from '../db/agent-crud.js';
import { Ok, Err, assertNever, type Result } from '../types/result.js';
import type {
  AgentDefinition,
  AgentSummary,
  CreateAgentInput,
  LevelId,
  OrgNode,
  RegistryError,
  Track,
} from '../types/schema.js';

class RegistryErrorImpl extends Error {
  constructor(public readonly detail: RegistryError) {
    super(RegistryErrorImpl.message(detail));
    this.name = 'RegistryError';
  }

  private static message(d: RegistryError): string {
    switch (d.type) {
      case 'not_found':
        return `Not found: ${d.entity}/${d.id}`;
      case 'already_expired':
        return `Already expired: ${d.entity}/${d.id}`;
      case 'constraint_violation':
        return d.detail;
      case 'invalid_identifier':
        return `Invalid SQL identifier: ${d.identifier}`;
      case 'db_error':
        return d.cause.message;
      case 'invalid_level':
        return `Invalid level: ${d.level}`;
      case 'duplicate_agent':
        return `Duplicate agent: ${d.agent_id}`;
      case 'invalid_reporting_chain':
        return d.detail;
      case 'agent_not_found':
        return `Agent not found: ${d.agent_id}`;
      case 'resolution_failed':
        return d.detail;
      default:
        return assertNever(d);
    }
  }
}

/**
 * Register a new agent from a department plugin.
 * Delegates to createAgent (SCD Type 2) — re-registering the same agent_id
 * correctly expires the old row and inserts a new version.
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
  const input: CreateAgentInput = {
    agent_id: agentId,
    display_name: displayName,
    level_id: levelId,
    job_profile_id: jobProfileId,
    department_id: departmentId,
    sup_org_id: supOrgId,
    reports_to: reportsTo ?? null,
    plugin_repo: pluginRepo,
    agent_definition: agentDef,
  };

  const result = await createAgent(client, input);
  if (!result.ok) {
    return Err(new RegistryErrorImpl(result.error.detail));
  }
  return Ok(result.value.agent_id);
}

/**
 * Deregister an agent (expire via SCD).
 */
export async function deregisterAgent(client: NeonClient, agentId: string): Promise<Result<void, RegistryErrorImpl>> {
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
      return Err(
        new RegistryErrorImpl({
          type: 'resolution_failed',
          detail: `Agent ${agentId} has no agent_definition configured`,
        }),
      );
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
 * Get the org chart as a tree structure.
 * Two-pass build: allocate child arrays first, then construct nodes.
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

    // Pass 1: pre-allocate mutable child arrays keyed by agent_id.
    // Note: OrgNode.children is `readonly OrgNode[]` for callers, but we mutate
    // the backing array via the childNodes alias during construction. This is an
    // intentional post-construction mutation — a known JS/TS limitation where
    // readonly prevents external mutation but not internal aliased writes.
    const nodeMap = new Map<string, { readonly agent: FlatNode; readonly childNodes: OrgNode[] }>();
    for (const agent of agents) {
      nodeMap.set(agent.agent_id, { agent, childNodes: [] });
    }

    // Pass 2: build OrgNode objects, assign children via map entry
    const roots: OrgNode[] = [];
    for (const agent of agents) {
      const entry = nodeMap.get(agent.agent_id)!;
      const node: OrgNode = {
        agent_id: agent.agent_id,
        display_name: agent.display_name,
        level_id: agent.level_id,
        level_code: agent.level_code,
        department_id: agent.department_id,
        children: entry.childNodes,
      };

      if (agent.reports_to && nodeMap.has(agent.reports_to)) {
        nodeMap.get(agent.reports_to)!.childNodes.push(node);
      } else {
        roots.push(node);
      }
    }

    if (rootAgentId) {
      const rootNode = roots.find((n) => n.agent_id === rootAgentId) ?? findInTree(roots, rootAgentId);
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
