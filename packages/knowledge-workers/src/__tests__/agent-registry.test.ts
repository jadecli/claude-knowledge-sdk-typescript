import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAgent,
  deregisterAgent,
  resolveAgent,
  listDepartmentAgents,
  getOrgChart,
} from '../registry/agent-registry.js';
import { LevelId } from '../types/schema.js';
import type { AgentDefinition } from '../types/schema.js';
import { createMockClient, type MockNeonClient } from './helpers/mock-neon.js';

const VALID_LEVEL = LevelId(5);
const AGENT_DEF: AgentDefinition = {
  description: 'Test agent',
  prompt: 'You are a test agent.',
};

const FAKE_AGENT = {
  agent_sk: 1,
  agent_id: 'eng-lead',
  display_name: 'Engineering Lead',
  agent_type: 'named' as const,
  level_id: VALID_LEVEL,
  job_profile_id: 'sde-ii',
  department_id: 'engineering',
  sup_org_id: 'eng-platform',
  reports_to: null,
  plugin_repo: 'jadecli/jade-engineering',
  agent_definition: AGENT_DEF,
  model_preference: 'inherit' as const,
  allowed_tools: null,
  skills: null,
  mcp_servers: null,
  system_prompt: null,
  hire_date: null,
  status: 'active' as const,
  eff_start: '2024-01-01T00:00:00Z',
  eff_end: '9999-12-31T00:00:00Z',
  is_current: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('registerAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('registers an agent via createAgent (SCD engine)', async () => {
    client.sql
      .mockResolvedValueOnce([]) // expire existing
      .mockResolvedValueOnce([FAKE_AGENT]); // insert new

    const result = await registerAgent(
      client,
      'jadecli/jade-engineering',
      AGENT_DEF,
      'eng-lead',
      'Engineering Lead',
      VALID_LEVEL,
      'sde-ii',
      'engineering',
      'eng-platform',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('eng-lead');
    }
  });

  it('re-registering same agent_id expires old row (SCD versioning)', async () => {
    // First registration
    client.sql
      .mockResolvedValueOnce([]) // expire (none found)
      .mockResolvedValueOnce([FAKE_AGENT]); // insert

    const first = await registerAgent(
      client,
      'jadecli/jade-engineering',
      AGENT_DEF,
      'eng-lead',
      'Engineering Lead',
      VALID_LEVEL,
      'sde-ii',
      'engineering',
      'eng-platform',
    );
    expect(first.ok).toBe(true);

    // Second registration — should expire old row
    const updatedAgent = { ...FAKE_AGENT, agent_sk: 2 };
    client.sql
      .mockResolvedValueOnce([{ agent_id: 'eng-lead' }]) // expire found old row
      .mockResolvedValueOnce([updatedAgent]); // insert new version

    const second = await registerAgent(
      client,
      'jadecli/jade-engineering',
      AGENT_DEF,
      'eng-lead',
      'Engineering Lead v2',
      VALID_LEVEL,
      'sde-ii',
      'engineering',
      'eng-platform',
    );
    expect(second.ok).toBe(true);
    // Verify expire was called (UPDATE)
    expect(client.sql).toHaveBeenCalledTimes(4);
  });

  it('propagates invalid level errors', async () => {
    const result = await registerAgent(
      client,
      'jadecli/jade-engineering',
      AGENT_DEF,
      'bad',
      'Bad Agent',
      9 as unknown as ReturnType<typeof LevelId>,
      'sde-ii',
      'engineering',
      'eng-platform',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_level');
    }
  });
});

describe('deregisterAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('expires the agent row', async () => {
    client.sql.mockResolvedValueOnce([{ agent_id: 'eng-lead' }]);

    const result = await deregisterAgent(client, 'eng-lead');
    expect(result.ok).toBe(true);
  });

  it('returns agent_not_found when agent does not exist', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await deregisterAgent(client, 'nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('agent_not_found');
    }
  });
});

describe('resolveAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns the agent definition', async () => {
    client.sql.mockResolvedValueOnce([{ agent_definition: AGENT_DEF }]);

    const result = await resolveAgent(client, 'eng-lead');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe('Test agent');
    }
  });

  it('returns resolution_failed when definition is null', async () => {
    client.sql.mockResolvedValueOnce([{ agent_definition: null }]);

    const result = await resolveAgent(client, 'eng-lead');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('resolution_failed');
    }
  });

  it('returns agent_not_found when agent does not exist', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await resolveAgent(client, 'nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('agent_not_found');
    }
  });
});

describe('listDepartmentAgents', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns agents with summary fields', async () => {
    const summary = {
      agent_id: 'eng-lead',
      display_name: 'Engineering Lead',
      level_id: VALID_LEVEL,
      level_code: 'L5',
      department_id: 'engineering',
      department_name: 'Engineering',
      track: 'ic' as const,
      status: 'active' as const,
    };
    client.sql.mockResolvedValueOnce([summary]);

    const result = await listDepartmentAgents(client, 'engineering');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.level_code).toBe('L5');
    }
  });

  it('applies level and track filters', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await listDepartmentAgents(client, 'engineering', {
      level: VALID_LEVEL,
      track: 'ic',
      activeOnly: true,
    });
    expect(result.ok).toBe(true);
    // Verify the SQL included filter params
    const sqlCall = client.sql.mock.calls[0];
    expect(sqlCall?.[1]).toContain(5); // level_id param
    expect(sqlCall?.[1]).toContain('ic'); // track param
  });
});

describe('getOrgChart', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('builds a tree from flat agent list', async () => {
    const flatAgents = [
      {
        agent_id: 'director',
        display_name: 'Director',
        level_id: LevelId(7),
        level_code: 'L7',
        department_id: 'engineering',
        reports_to: null,
      },
      {
        agent_id: 'lead-1',
        display_name: 'Lead 1',
        level_id: VALID_LEVEL,
        level_code: 'L5',
        department_id: 'engineering',
        reports_to: 'director',
      },
      {
        agent_id: 'lead-2',
        display_name: 'Lead 2',
        level_id: VALID_LEVEL,
        level_code: 'L5',
        department_id: 'engineering',
        reports_to: 'director',
      },
    ];
    client.sql.mockResolvedValueOnce(flatAgents);

    const result = await getOrgChart(client);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1); // one root
      expect(result.value[0]?.agent_id).toBe('director');
      expect(result.value[0]?.children).toHaveLength(2); // two direct reports
    }
  });

  it('filters by rootAgentId', async () => {
    const flatAgents = [
      {
        agent_id: 'director',
        display_name: 'Director',
        level_id: LevelId(7),
        level_code: 'L7',
        department_id: 'engineering',
        reports_to: null,
      },
      {
        agent_id: 'lead-1',
        display_name: 'Lead 1',
        level_id: VALID_LEVEL,
        level_code: 'L5',
        department_id: 'engineering',
        reports_to: 'director',
      },
    ];
    client.sql.mockResolvedValueOnce(flatAgents);

    const result = await getOrgChart(client, 'lead-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // lead-1 is found in the tree (not a root), returned as single-element array
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.agent_id).toBe('lead-1');
    }
  });

  it('returns empty array when rootAgentId not found', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await getOrgChart(client, 'nonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });
});
