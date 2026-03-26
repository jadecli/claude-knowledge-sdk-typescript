/**
 * @module db/agent-registry
 * Agent registry: resolves agent definitions from JSONB, builds org charts.
 */
import type { NeonClient } from './neon-client.js';
import type { AgentDefinition, AgentRecord, OrgChartNode, Result } from './types.js';
import { Ok, Err } from './types.js';

const REGISTRY_TABLE = 'agent_registry';
const AGENTS_TABLE = 'agents';

/**
 * Resolve an agent definition from the JSONB registry.
 */
export async function resolveAgent(
  client: NeonClient,
  agentId: string,
): Promise<Result<AgentDefinition>> {
  const result = await client.query<{ readonly definition: string }>(
    `SELECT definition FROM ${REGISTRY_TABLE} WHERE agent_id = $1 LIMIT 1`,
    [agentId],
  );

  const row = result.rows[0];
  if (!row) {
    return Err(new Error(`Agent not found in registry: ${agentId}`));
  }

  const definition: AgentDefinition =
    typeof row.definition === 'string'
      ? (JSON.parse(row.definition) as AgentDefinition)
      : (row.definition as unknown as AgentDefinition);

  return Ok(definition);
}

/**
 * List agents in a department by joining agents table with registry.
 */
export async function listDepartmentAgents(
  client: NeonClient,
  department: string,
): Promise<readonly AgentDefinition[]> {
  const result = await client.query<{ readonly definition: string }>(
    `SELECT r.definition FROM ${REGISTRY_TABLE} r
     INNER JOIN ${AGENTS_TABLE} a ON r.agent_id = a.agent_id
     WHERE a.department = $1 AND a.is_current = true
     ORDER BY a.name ASC`,
    [department],
  );

  return result.rows.map((row) => {
    const def =
      typeof row.definition === 'string'
        ? (JSON.parse(row.definition) as AgentDefinition)
        : (row.definition as unknown as AgentDefinition);
    return def;
  });
}

/**
 * Build an org chart tree from flat agent data.
 */
export function getOrgChart(agents: readonly AgentRecord[]): readonly OrgChartNode[] {
  const nodeMap = new Map<string, OrgChartNode & { children: OrgChartNode[] }>();

  // Create nodes
  for (const agent of agents) {
    nodeMap.set(agent.agent_id, {
      agent_id: agent.agent_id,
      name: agent.name,
      department: agent.department,
      level: agent.level,
      children: [],
    });
  }

  const roots: OrgChartNode[] = [];

  // Build tree
  for (const agent of agents) {
    const node = nodeMap.get(agent.agent_id);
    if (!node) continue;

    if (agent.reports_to) {
      const parent = nodeMap.get(agent.reports_to);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not in dataset, treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}
