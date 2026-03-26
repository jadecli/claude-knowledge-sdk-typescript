import { describe, it, expect, beforeEach } from 'vitest';
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
import { LevelId } from '../types/schema.js';
import { createMockClient, type MockNeonClient } from './helpers/mock-neon.js';

const VALID_LEVEL = LevelId(5);
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
  plugin_repo: null,
  agent_definition: null,
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

describe('createAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('creates an agent with SCD effective dating', async () => {
    client.sql
      .mockResolvedValueOnce([]) // expire existing
      .mockResolvedValueOnce([FAKE_AGENT]); // insert new

    const result = await createAgent(client, {
      agent_id: 'eng-lead',
      display_name: 'Engineering Lead',
      level_id: VALID_LEVEL,
      job_profile_id: 'sde-ii',
      department_id: 'engineering',
      sup_org_id: 'eng-platform',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agent_id).toBe('eng-lead');
    }
  });

  it('rejects level 9', async () => {
    const result = await createAgent(client, {
      agent_id: 'bad',
      display_name: 'Bad Agent',
      level_id: 9 as unknown as ReturnType<typeof LevelId>,
      job_profile_id: 'sde-ii',
      department_id: 'engineering',
      sup_org_id: 'eng-platform',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_level');
    }
  });

  it('rejects level 0', async () => {
    const result = await createAgent(client, {
      agent_id: 'bad',
      display_name: 'Bad Agent',
      level_id: 0 as unknown as ReturnType<typeof LevelId>,
      job_profile_id: 'sde-ii',
      department_id: 'engineering',
      sup_org_id: 'eng-platform',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_level');
    }
  });

  it('propagates DB errors', async () => {
    client.sql.mockRejectedValueOnce(new Error('connection refused'));

    const result = await createAgent(client, {
      agent_id: 'eng-lead',
      display_name: 'Engineering Lead',
      level_id: VALID_LEVEL,
      job_profile_id: 'sde-ii',
      department_id: 'engineering',
      sup_org_id: 'eng-platform',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('db_error');
    }
  });
});

describe('getAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns agent when found', async () => {
    client.sql.mockResolvedValueOnce([FAKE_AGENT]);

    const result = await getAgent(client, 'eng-lead');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.agent_id).toBe('eng-lead');
    }
  });

  it('returns null when not found', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await getAgent(client, 'nonexistent');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });
});

describe('updateAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('merges updates with current row', async () => {
    const updatedAgent = { ...FAKE_AGENT, display_name: 'Updated Lead' };
    client.sql
      .mockResolvedValueOnce([FAKE_AGENT]) // getAgent
      .mockResolvedValueOnce([]) // expire
      .mockResolvedValueOnce([updatedAgent]); // insert

    const result = await updateAgent(client, 'eng-lead', { display_name: 'Updated Lead' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.display_name).toBe('Updated Lead');
    }
  });

  it('returns agent_not_found when agent does not exist', async () => {
    client.sql.mockResolvedValueOnce([]); // getAgent returns nothing

    const result = await updateAgent(client, 'nonexistent', { display_name: 'New' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('agent_not_found');
    }
  });

  it('rejects invalid level in update', async () => {
    const result = await updateAgent(client, 'eng-lead', {
      level_id: 9 as unknown as ReturnType<typeof LevelId>,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_level');
    }
  });
});

describe('deactivateAgent', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('deactivates by updating status to inactive', async () => {
    const deactivated = { ...FAKE_AGENT, status: 'inactive' as const };
    client.sql
      .mockResolvedValueOnce([FAKE_AGENT]) // getAgent
      .mockResolvedValueOnce([]) // expire
      .mockResolvedValueOnce([deactivated]); // insert

    const result = await deactivateAgent(client, 'eng-lead');
    expect(result.ok).toBe(true);
  });
});

describe('listAgentsByDepartment', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns agents filtered by department', async () => {
    client.sql.mockResolvedValueOnce([FAKE_AGENT]);

    const result = await listAgentsByDepartment(client, 'engineering');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });
});

describe('listAgentsByLevel', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns agents at specified level', async () => {
    client.sql.mockResolvedValueOnce([FAKE_AGENT]);

    const result = await listAgentsByLevel(client, VALID_LEVEL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
    }
  });
});

describe('getReportingChain', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns the reporting chain via recursive CTE', async () => {
    const chain = [
      { ...FAKE_AGENT, level_id: LevelId(5) },
      { ...FAKE_AGENT, agent_id: 'director', level_id: LevelId(7) },
    ];
    client.sql.mockResolvedValueOnce(chain);

    const result = await getReportingChain(client, 'eng-lead');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });
});

describe('getDirectReports', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns direct reports of an agent', async () => {
    const reports = [
      { ...FAKE_AGENT, agent_id: 'report-1' },
      { ...FAKE_AGENT, agent_id: 'report-2' },
    ];
    client.sql.mockResolvedValueOnce(reports);

    const result = await getDirectReports(client, 'eng-lead');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });
});
