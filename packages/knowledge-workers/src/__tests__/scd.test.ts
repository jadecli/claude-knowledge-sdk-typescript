import { describe, it, expect, beforeEach } from 'vitest';
import { validateIdentifier, insertWithEffectiveDating, expireRow, getAsOf, getHistory } from '../db/scd.js';
import { createMockClient, type MockNeonClient } from './helpers/mock-neon.js';

describe('validateIdentifier', () => {
  it('accepts valid lowercase identifiers', () => {
    expect(validateIdentifier('agent_id').ok).toBe(true);
    expect(validateIdentifier('fact_agent').ok).toBe(true);
    expect(validateIdentifier('a').ok).toBe(true);
    expect(validateIdentifier('a_b_c_1').ok).toBe(true);
    expect(validateIdentifier('_private').ok).toBe(true);
  });

  it('rejects uppercase identifiers', () => {
    const result = validateIdentifier('AgentId');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });

  it('rejects identifiers starting with a digit', () => {
    const result = validateIdentifier('1bad');
    expect(result.ok).toBe(false);
  });

  it('rejects identifiers with hyphens', () => {
    const result = validateIdentifier('bad-name');
    expect(result.ok).toBe(false);
  });

  it('rejects identifiers with spaces', () => {
    const result = validateIdentifier('drop table');
    expect(result.ok).toBe(false);
  });

  it('rejects identifiers with semicolons', () => {
    const result = validateIdentifier('col;--');
    expect(result.ok).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validateIdentifier('');
    expect(result.ok).toBe(false);
  });

  it('rejects SQL injection attempts', () => {
    const result = validateIdentifier('users; DROP TABLE --');
    expect(result.ok).toBe(false);
  });
});

describe('insertWithEffectiveDating', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns Ok with inserted row on success', async () => {
    const fakeRow = { agent_sk: 1, agent_id: 'test', is_current: true };
    // First call: UPDATE (expire), second call: INSERT (returning)
    client.sql
      .mockResolvedValueOnce([]) // expire
      .mockResolvedValueOnce([fakeRow]); // insert

    const result = await insertWithEffectiveDating(client, 'fact_agent', 'agent_id', 'test', { agent_id: 'test' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(fakeRow);
    }
  });

  it('rejects invalid table name', async () => {
    const result = await insertWithEffectiveDating(client, 'bad table', 'agent_id', 'test', { agent_id: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });

  it('rejects invalid natural key column', async () => {
    const result = await insertWithEffectiveDating(client, 'fact_agent', 'BAD-COL', 'test', { agent_id: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });

  it('rejects invalid column names in row keys', async () => {
    const result = await insertWithEffectiveDating(client, 'fact_agent', 'agent_id', 'test', {
      agent_id: 'test',
      'BAD-COLUMN': 'injected',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });

  it('returns constraint_violation when INSERT returns no rows', async () => {
    client.sql
      .mockResolvedValueOnce([]) // expire
      .mockResolvedValueOnce([]); // insert returns empty

    const result = await insertWithEffectiveDating(client, 'fact_agent', 'agent_id', 'test', { agent_id: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('constraint_violation');
    }
  });

  it('returns db_error when sql throws', async () => {
    client.sql.mockRejectedValueOnce(new Error('connection failed'));

    const result = await insertWithEffectiveDating(client, 'fact_agent', 'agent_id', 'test', { agent_id: 'test' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('db_error');
    }
  });
});

describe('expireRow', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns Ok when row is expired', async () => {
    client.sql.mockResolvedValueOnce([{ agent_sk: 1 }]);

    const result = await expireRow(client, 'fact_agent', 'agent_sk', 1);
    expect(result.ok).toBe(true);
  });

  it('returns not_found when no row exists', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await expireRow(client, 'fact_agent', 'agent_sk', 999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('not_found');
    }
  });

  it('rejects invalid table name', async () => {
    const result = await expireRow(client, 'BAD TABLE', 'agent_sk', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });

  it('rejects invalid surrogate key column', async () => {
    const result = await expireRow(client, 'fact_agent', 'BAD-SK', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });
});

describe('getAsOf', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns the row when found', async () => {
    const fakeRow = { agent_id: 'test', eff_start: '2024-01-01' };
    client.sql.mockResolvedValueOnce([fakeRow]);

    const result = await getAsOf(client, 'fact_agent', 'agent_id', 'test', new Date('2024-06-01'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(fakeRow);
    }
  });

  it('returns null when no row matches', async () => {
    client.sql.mockResolvedValueOnce([]);

    const result = await getAsOf(client, 'fact_agent', 'agent_id', 'test', new Date('2020-01-01'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('rejects invalid identifiers', async () => {
    const result = await getAsOf(client, 'BAD', 'agent_id', 'test', new Date());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });
});

describe('getHistory', () => {
  let client: MockNeonClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it('returns all version rows', async () => {
    const rows = [
      { agent_id: 'test', eff_start: '2024-01-01' },
      { agent_id: 'test', eff_start: '2024-06-01' },
    ];
    client.sql.mockResolvedValueOnce(rows);

    const result = await getHistory(client, 'fact_agent', 'agent_id', 'test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('rejects invalid identifiers', async () => {
    const result = await getHistory(client, 'fact_agent', 'BAD COL', 'test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('invalid_identifier');
    }
  });
});
