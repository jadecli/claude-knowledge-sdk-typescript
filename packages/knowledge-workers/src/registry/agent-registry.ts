/**
 * @module registry/agent-registry
 * Agent registry with SCD Type 2 consistent registration.
 *
 * All agent registration goes through the SCD engine via `createAgent()`
 * to maintain the temporal invariant: at most one current row per agent_id.
 */

import type { DbConnection } from '../db/scd.js';
import { createAgent, getAgent } from '../db/agent-crud.js';
import type { AgentRow } from '../db/agent-crud.js';

// ── Registry Types ───────────────────────────────────────────────

export type AgentRegistration = {
  readonly agent_id: string;
  readonly name: string;
  readonly role: string;
  readonly capabilities: readonly string[];
  readonly reports_to: string | null;
  readonly metadata?: Record<string, unknown>;
};

export type AgentTreeNode = {
  readonly agent: AgentRow;
  readonly children: readonly AgentTreeNode[];
};

// ── Registry Operations ──────────────────────────────────────────

/**
 * Register an agent in the registry.
 *
 * Uses `createAgent()` from the CRUD layer which delegates to
 * `insertWithEffectiveDating()` — ensuring that if the agent already
 * exists, the old current row is expired before the new one is inserted.
 *
 * Previously this did a direct INSERT which violated the SCD Type 2
 * invariant by leaving stale current rows when re-registering.
 */
export async function registerAgent(
  db: DbConnection,
  registration: AgentRegistration,
): Promise<{ readonly expired: boolean; readonly row: AgentRow }> {
  return createAgent(db, {
    agent_id: registration.agent_id,
    name: registration.name,
    role: registration.role,
    status: 'active',
    capabilities: registration.capabilities,
    reports_to: registration.reports_to,
    metadata: registration.metadata ?? {},
  });
}

/**
 * Look up a single agent by agent_id (current version only).
 */
export async function lookupAgent(db: DbConnection, agentId: string): Promise<AgentRow | undefined> {
  return getAgent(db, agentId);
}

/**
 * List all current (non-expired) agents.
 */
export async function listAgents(db: DbConnection): Promise<readonly AgentRow[]> {
  return db.query<AgentRow>('SELECT * FROM agents WHERE effective_to IS NULL ORDER BY name ASC', []);
}

/**
 * Build the agent reporting hierarchy as a tree.
 *
 * Uses optional chaining on `childrenMap.get()` to safely handle
 * agents whose `reports_to` references a parent not in the current set.
 */
export async function buildAgentTree(db: DbConnection): Promise<readonly AgentTreeNode[]> {
  const agents = await listAgents(db);

  // Build a mutable children map for tree construction
  const childrenMap = new Map<string, AgentTreeNode[]>();
  const nodeMap = new Map<string, AgentTreeNode>();

  // Initialize nodes and children lists
  for (const agent of agents) {
    const node: AgentTreeNode = { agent, children: [] };
    nodeMap.set(agent.agent_id, node);
    childrenMap.set(agent.agent_id, []);
  }

  // Wire up parent-child relationships
  const roots: AgentTreeNode[] = [];
  for (const agent of agents) {
    const node = nodeMap.get(agent.agent_id);
    if (!node) continue;

    if (agent.reports_to) {
      // Use optional chaining — the parent might not exist in the current set
      childrenMap.get(agent.reports_to)?.push(node);
    } else {
      roots.push(node);
    }
  }

  // Attach children arrays to nodes (rebuild as readonly)
  return roots.map((root) => attachChildren(root, childrenMap));
}

/** Recursively attach children from the mutable map into readonly tree nodes. */
function attachChildren(
  node: AgentTreeNode,
  childrenMap: ReadonlyMap<string, readonly AgentTreeNode[]>,
): AgentTreeNode {
  const children = childrenMap.get(node.agent.agent_id) ?? [];
  return {
    agent: node.agent,
    children: children.map((child) => attachChildren(child, childrenMap)),
  };
}
