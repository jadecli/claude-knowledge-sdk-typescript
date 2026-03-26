/**
 * @module __tests__/agent-registry.test
 * Tests for the agent registry.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockNeonClient } from './mock-neon-client.js';
import { resolveAgent, listDepartmentAgents, getOrgChart } from '../db/agent-registry.js';
import type { AgentRecord } from '../db/types.js';

describe('Agent Registry', () => {
  const client = createMockNeonClient();

  beforeEach(() => {
    client._reset();
  });

  // ── resolveAgent ─────────────────────────────────────────

  describe('resolveAgent', () => {
    it('extracts AgentDefinition from JSONB', async () => {
      const definition = {
        agent_id: 'agent-1',
        name: 'Alpha',
        department: 'engineering',
        level: 5,
        capabilities: ['code-review'],
        model: 'claude-opus-4-6',
        system_prompt: 'You are a code reviewer.',
      };

      // Seed the registry table
      const registryTable = [
        {
          agent_id: 'agent-1',
          definition: JSON.stringify(definition),
        },
      ];
      client._store.set('agent_registry', registryTable);

      const result = await resolveAgent(client, 'agent-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.agent_id).toBe('agent-1');
      expect(result.value.name).toBe('Alpha');
      expect(result.value.department).toBe('engineering');
      expect(result.value.level).toBe(5);
      expect(result.value.capabilities).toEqual(['code-review']);
      expect(result.value.model).toBe('claude-opus-4-6');
      expect(result.value.system_prompt).toBe('You are a code reviewer.');
    });

    it('handles definition as parsed object (not string)', async () => {
      const definition = {
        agent_id: 'agent-2',
        name: 'Beta',
        department: 'research',
        level: 8,
        capabilities: ['analysis'],
        model: 'claude-sonnet-4',
        system_prompt: 'You analyze data.',
      };

      // Simulate JSONB that comes back as already-parsed object
      const registryTable = [
        {
          agent_id: 'agent-2',
          definition,
        },
      ];
      client._store.set('agent_registry', registryTable);

      const result = await resolveAgent(client, 'agent-2');
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.agent_id).toBe('agent-2');
      expect(result.value.name).toBe('Beta');
    });

    it('returns error for missing agent', async () => {
      const result = await resolveAgent(client, 'nonexistent');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toContain('not found in registry');
    });
  });

  // ── listDepartmentAgents ─────────────────────────────────

  describe('listDepartmentAgents', () => {
    it('filters and joins correctly', async () => {
      // The mock's simple SQL parser handles INNER JOIN by looking at FROM table.
      // For this test, we seed both tables and verify the function call works.
      // Since mock SQL parsing is basic, we test the logic by seeding
      // the registry table with rows that also match the join condition.

      const engDef = {
        agent_id: 'eng-1',
        name: 'Engineer',
        department: 'engineering',
        level: 5,
        capabilities: ['code'],
        model: 'claude-opus-4-6',
        system_prompt: 'Engineer prompt',
      };

      // For the JOIN query, the mock will SELECT FROM agent_registry
      // then filter WHERE department = 'engineering' AND is_current = true
      // We need the mock to handle INNER JOIN — our mock treats FROM table as the primary
      // For this test we directly verify the function contract by using a custom mock

      // Seed agent_registry as the FROM table (mock uses first FROM match)
      // Include department and is_current so the WHERE clause works
      const registryTable = [
        {
          agent_id: 'eng-1',
          definition: JSON.stringify(engDef),
          department: 'engineering',
          is_current: true,
          name: 'Engineer',
        },
        {
          agent_id: 'sales-1',
          definition: JSON.stringify({ ...engDef, agent_id: 'sales-1', department: 'sales' }),
          department: 'sales',
          is_current: true,
          name: 'Salesperson',
        },
      ];
      client._store.set('agent_registry', registryTable);

      // The INNER JOIN references agents table too
      client._store.set('agents', [
        {
          agent_id: 'eng-1',
          department: 'engineering',
          is_current: true,
          name: 'Engineer',
        },
        {
          agent_id: 'sales-1',
          department: 'sales',
          is_current: true,
          name: 'Salesperson',
        },
      ]);

      // The mock's FROM parser will pick up 'agent_registry' as the table
      // and apply WHERE filters on that table's rows
      const result = await listDepartmentAgents(client, 'engineering');
      expect(result.length).toBe(1);
      expect(result[0]!.agent_id).toBe('eng-1');
      expect(result[0]!.department).toBe('engineering');
    });

    it('returns empty for nonexistent department', async () => {
      client._store.set('agent_registry', []);
      const result = await listDepartmentAgents(client, 'nonexistent');
      expect(result.length).toBe(0);
    });
  });

  // ── getOrgChart ──────────────────────────────────────────

  describe('getOrgChart', () => {
    it('builds tree structure from flat data', () => {
      const agents: AgentRecord[] = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'ceo',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'ceo',
          name: 'CEO',
          department: 'executive',
          level: 12,
          status: 'active',
          reports_to: null,
          capabilities: '[]',
        },
        {
          surrogate_key: 'sk-2',
          natural_key: 'vp-eng',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'vp-eng',
          name: 'VP Engineering',
          department: 'engineering',
          level: 10,
          status: 'active',
          reports_to: 'ceo',
          capabilities: '[]',
        },
        {
          surrogate_key: 'sk-3',
          natural_key: 'vp-sales',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'vp-sales',
          name: 'VP Sales',
          department: 'sales',
          level: 10,
          status: 'active',
          reports_to: 'ceo',
          capabilities: '[]',
        },
        {
          surrogate_key: 'sk-4',
          natural_key: 'dev-1',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'dev-1',
          name: 'Developer 1',
          department: 'engineering',
          level: 5,
          status: 'active',
          reports_to: 'vp-eng',
          capabilities: '[]',
        },
      ];

      const roots = getOrgChart(agents);

      // Should have one root: CEO
      expect(roots.length).toBe(1);
      expect(roots[0]!.agent_id).toBe('ceo');
      expect(roots[0]!.name).toBe('CEO');

      // CEO has two children
      expect(roots[0]!.children.length).toBe(2);

      const vpEng = roots[0]!.children.find((c) => c.agent_id === 'vp-eng');
      expect(vpEng).toBeDefined();
      expect(vpEng!.name).toBe('VP Engineering');

      // VP Engineering has one child
      expect(vpEng!.children.length).toBe(1);
      expect(vpEng!.children[0]!.agent_id).toBe('dev-1');

      const vpSales = roots[0]!.children.find((c) => c.agent_id === 'vp-sales');
      expect(vpSales).toBeDefined();
      expect(vpSales!.children.length).toBe(0);
    });

    it('handles multiple roots', () => {
      const agents: AgentRecord[] = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'a',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'a',
          name: 'Agent A',
          department: 'dept-1',
          level: 10,
          status: 'active',
          reports_to: null,
          capabilities: '[]',
        },
        {
          surrogate_key: 'sk-2',
          natural_key: 'b',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'b',
          name: 'Agent B',
          department: 'dept-2',
          level: 10,
          status: 'active',
          reports_to: null,
          capabilities: '[]',
        },
      ];

      const roots = getOrgChart(agents);
      expect(roots.length).toBe(2);
    });

    it('handles empty input', () => {
      const roots = getOrgChart([]);
      expect(roots.length).toBe(0);
    });

    it('treats agents with missing parent as roots', () => {
      const agents: AgentRecord[] = [
        {
          surrogate_key: 'sk-1',
          natural_key: 'orphan',
          eff_start: '2024-01-01',
          eff_end: null,
          is_current: true,
          agent_id: 'orphan',
          name: 'Orphan',
          department: 'dept-1',
          level: 5,
          status: 'active',
          reports_to: 'nonexistent-parent',
          capabilities: '[]',
        },
      ];

      const roots = getOrgChart(agents);
      expect(roots.length).toBe(1);
      expect(roots[0]!.agent_id).toBe('orphan');
    });
  });
});
