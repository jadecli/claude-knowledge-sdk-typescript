/**
 * @module __tests__/agent-crud.test
 * Tests for agent CRUD operations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockNeonClient } from './mock-neon-client.js';
import {
  createAgent,
  getAgent,
  updateAgent,
  deactivateAgent,
  listAgentsByDepartment,
  listAgentsByLevel,
  getReportingChain,
  getDirectReports,
} from '../db/agent-crud.js';

describe('Agent CRUD', () => {
  const client = createMockNeonClient();

  beforeEach(() => {
    client._reset();
  });

  // Helper to create a standard agent
  async function makeAgent(overrides: Partial<Parameters<typeof createAgent>[1]> = {}) {
    return createAgent(client, {
      agent_id: 'agent-1',
      name: 'Alpha Agent',
      department: 'engineering',
      level: 5,
      reports_to: null,
      capabilities: ['code-review', 'testing'],
      ...overrides,
    });
  }

  // ── createAgent ──────────────────────────────────────────

  describe('createAgent', () => {
    it('creates an agent with correct SCD fields', async () => {
      const result = await makeAgent();

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.natural_key).toBe('agent-1');
      expect(result.value.is_current).toBe(true);
      expect(result.value.eff_end).toBeNull();
      expect(result.value.eff_start).toBeDefined();
      expect(result.value.surrogate_key).toMatch(/^sk_/);
      expect(result.value.agent_id).toBe('agent-1');
      expect(result.value.name).toBe('Alpha Agent');
      expect(result.value.department).toBe('engineering');
      expect(result.value.level).toBe(5);
      expect(result.value.status).toBe('active');
    });

    it('rejects invalid level L9 is valid but L0 is not', async () => {
      // L9 should be valid (1-12 range)
      const validResult = await makeAgent({ level: 9 });
      expect(validResult.ok).toBe(true);
    });

    it('rejects level 0', async () => {
      const result = await makeAgent({ level: 0 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Invalid agent level');
    });

    it('rejects level 13', async () => {
      const result = await makeAgent({ level: 13 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('Invalid agent level');
    });

    it('rejects negative level', async () => {
      const result = await makeAgent({ level: -1 });
      expect(result.ok).toBe(false);
    });

    it('rejects fractional level', async () => {
      const result = await makeAgent({ level: 5.5 });
      expect(result.ok).toBe(false);
    });

    it('serializes capabilities as JSON', async () => {
      const result = await makeAgent({ capabilities: ['a', 'b', 'c'] });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.capabilities).toBe(JSON.stringify(['a', 'b', 'c']));
    });
  });

  // ── getAgent ─────────────────────────────────────────────

  describe('getAgent', () => {
    it('returns current version of an agent', async () => {
      await makeAgent();
      const agent = await getAgent(client, 'agent-1');

      expect(agent).not.toBeNull();
      expect(agent!.agent_id).toBe('agent-1');
      expect(agent!.name).toBe('Alpha Agent');
      expect(agent!.is_current).toBe(true);
    });

    it('returns null for missing agent', async () => {
      const agent = await getAgent(client, 'nonexistent');
      expect(agent).toBeNull();
    });
  });

  // ── updateAgent ──────────────────────────────────────────

  describe('updateAgent', () => {
    it('creates new SCD version on update', async () => {
      await makeAgent();
      const result = await updateAgent(client, 'agent-1', { name: 'Beta Agent' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.name).toBe('Beta Agent');
      expect(result.value.is_current).toBe(true);

      // Old version should be expired
      const table = client._store.get('agents')!;
      const expired = table.filter((r) => r.is_current === false);
      expect(expired.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves history across updates', async () => {
      await makeAgent();
      await updateAgent(client, 'agent-1', { name: 'v2' });
      await updateAgent(client, 'agent-1', { name: 'v3' });

      const table = client._store.get('agents')!;
      const allVersions = table.filter((r) => r.agent_id === 'agent-1');
      expect(allVersions.length).toBe(3);

      const currentVersions = allVersions.filter((r) => r.is_current === true);
      expect(currentVersions.length).toBe(1);
      expect(currentVersions[0]!.name).toBe('v3');
    });

    it('returns error for nonexistent agent', async () => {
      const result = await updateAgent(client, 'nonexistent', { name: 'X' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('not found');
    });

    it('validates level on update', async () => {
      await makeAgent();
      const result = await updateAgent(client, 'agent-1', { level: 0 });
      expect(result.ok).toBe(false);
    });

    it('preserves unchanged fields', async () => {
      await makeAgent({ department: 'engineering', level: 5 });
      const result = await updateAgent(client, 'agent-1', { name: 'Renamed' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.department).toBe('engineering');
      expect(result.value.level).toBe(5);
    });
  });

  // ── deactivateAgent ──────────────────────────────────────

  describe('deactivateAgent', () => {
    it('sets status to inactive', async () => {
      await makeAgent();
      const result = await deactivateAgent(client, 'agent-1');

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('inactive');
    });

    it('returns error for nonexistent agent', async () => {
      const result = await deactivateAgent(client, 'nonexistent');
      expect(result.ok).toBe(false);
    });
  });

  // ── listAgentsByDepartment ───────────────────────────────

  describe('listAgentsByDepartment', () => {
    it('filters agents by department', async () => {
      await makeAgent({ agent_id: 'eng-1', department: 'engineering', name: 'Eng 1' });
      await makeAgent({ agent_id: 'eng-2', department: 'engineering', name: 'Eng 2' });
      await makeAgent({ agent_id: 'sales-1', department: 'sales', name: 'Sales 1' });

      const engineers = await listAgentsByDepartment(client, 'engineering');
      expect(engineers.length).toBe(2);
      expect(engineers.every((a) => a.department === 'engineering')).toBe(true);

      const sales = await listAgentsByDepartment(client, 'sales');
      expect(sales.length).toBe(1);
      expect(sales[0]!.department).toBe('sales');
    });

    it('returns empty for nonexistent department', async () => {
      const result = await listAgentsByDepartment(client, 'marketing');
      expect(result.length).toBe(0);
    });
  });

  // ── listAgentsByLevel ────────────────────────────────────

  describe('listAgentsByLevel', () => {
    it('filters agents by level', async () => {
      await makeAgent({ agent_id: 'a-1', level: 5, name: 'L5 Agent' });
      await makeAgent({ agent_id: 'a-2', level: 5, name: 'L5 Agent 2' });
      await makeAgent({ agent_id: 'a-3', level: 8, name: 'L8 Agent' });

      const level5 = await listAgentsByLevel(client, 5);
      expect(level5.length).toBe(2);
      expect(level5.every((a) => a.level === 5)).toBe(true);

      const level8 = await listAgentsByLevel(client, 8);
      expect(level8.length).toBe(1);
    });

    it('returns empty for unused level', async () => {
      const result = await listAgentsByLevel(client, 12);
      expect(result.length).toBe(0);
    });
  });

  // ── getReportingChain ────────────────────────────────────

  describe('getReportingChain', () => {
    it('follows reports_to chain up to root', async () => {
      await makeAgent({ agent_id: 'ceo', name: 'CEO', level: 12, reports_to: null });
      await makeAgent({ agent_id: 'vp', name: 'VP', level: 10, reports_to: 'ceo' });
      await makeAgent({ agent_id: 'mgr', name: 'Manager', level: 7, reports_to: 'vp' });
      await makeAgent({ agent_id: 'dev', name: 'Developer', level: 5, reports_to: 'mgr' });

      const chain = await getReportingChain(client, 'dev');
      expect(chain.length).toBe(4);
      expect(chain[0]!.agent_id).toBe('dev');
      expect(chain[1]!.agent_id).toBe('mgr');
      expect(chain[2]!.agent_id).toBe('vp');
      expect(chain[3]!.agent_id).toBe('ceo');
    });

    it('returns single-element chain for root agent', async () => {
      await makeAgent({ agent_id: 'root', reports_to: null });
      const chain = await getReportingChain(client, 'root');
      expect(chain.length).toBe(1);
      expect(chain[0]!.agent_id).toBe('root');
    });

    it('returns empty chain for nonexistent agent', async () => {
      const chain = await getReportingChain(client, 'nonexistent');
      expect(chain.length).toBe(0);
    });
  });

  // ── getDirectReports ─────────────────────────────────────

  describe('getDirectReports', () => {
    it('lists direct reports of an agent', async () => {
      await makeAgent({ agent_id: 'mgr', name: 'Manager', level: 7, reports_to: null });
      await makeAgent({ agent_id: 'dev-1', name: 'Dev 1', level: 5, reports_to: 'mgr' });
      await makeAgent({ agent_id: 'dev-2', name: 'Dev 2', level: 5, reports_to: 'mgr' });
      await makeAgent({ agent_id: 'other', name: 'Other', level: 5, reports_to: 'someone-else' });

      const reports = await getDirectReports(client, 'mgr');
      expect(reports.length).toBe(2);
      expect(reports.every((a) => a.reports_to === 'mgr')).toBe(true);
    });

    it('returns empty for agent with no reports', async () => {
      await makeAgent({ agent_id: 'leaf', reports_to: null });
      const reports = await getDirectReports(client, 'leaf');
      expect(reports.length).toBe(0);
    });
  });
});
