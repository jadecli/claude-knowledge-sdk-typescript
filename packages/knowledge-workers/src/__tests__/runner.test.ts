import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @neondatabase/serverless before importing runner
const mockSql = vi.fn().mockResolvedValue([]);
vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => mockSql),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => ''),
}));

import { readdirSync, readFileSync } from 'node:fs';
import { runMigrations, getMigrationStatus } from '../migrations/runner.js';

describe('getMigrationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
  });

  it('returns applied migrations', async () => {
    const migrations = [{ id: 1, filename: '001_initial.sql', checksum: 'abc123', applied_at: '2024-01-01' }];
    // First call: CREATE TABLE IF NOT EXISTS _migrations
    // Second call: SELECT * FROM _migrations
    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce(migrations); // SELECT

    const result = await getMigrationStatus('postgres://test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.filename).toBe('001_initial.sql');
    }
  });

  it('returns empty array when no migrations applied', async () => {
    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([]); // SELECT

    const result = await getMigrationStatus('postgres://test');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('returns db_error on connection failure', async () => {
    mockSql.mockRejectedValueOnce(new Error('connection refused'));

    const result = await getMigrationStatus('postgres://test');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('db_error');
    }
  });
});

describe('runMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
  });

  it('returns empty array when no pending migrations', async () => {
    vi.mocked(readdirSync).mockReturnValue([]);
    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([]); // SELECT applied

    const result = await runMigrations('postgres://test', '/tmp/migrations');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('applies a new migration', async () => {
    vi.mocked(readdirSync).mockReturnValue(['001_test.sql' as unknown as ReturnType<typeof readdirSync>[0]]);
    vi.mocked(readFileSync).mockReturnValue('CREATE TABLE test (id INT)');

    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([]) // SELECT applied (none)
      .mockResolvedValueOnce([]) // execute SQL statement
      .mockResolvedValueOnce([]); // INSERT into _migrations

    const result = await runMigrations('postgres://test', '/tmp/migrations');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.filename).toBe('001_test.sql');
    }
  });

  it('returns checksum_mismatch when migration file changed', async () => {
    vi.mocked(readdirSync).mockReturnValue(['001_test.sql' as unknown as ReturnType<typeof readdirSync>[0]]);
    vi.mocked(readFileSync).mockReturnValue('CREATE TABLE test (id INT)');

    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([{ filename: '001_test.sql', checksum: 'different_checksum' }]); // applied with different checksum

    const result = await runMigrations('postgres://test', '/tmp/migrations');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.detail.type).toBe('checksum_mismatch');
    }
  });

  it('applies multiple migrations in sorted order', async () => {
    vi.mocked(readdirSync).mockReturnValue([
      '002_second.sql' as unknown as ReturnType<typeof readdirSync>[0],
      '001_first.sql' as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync)
      .mockReturnValueOnce('CREATE TABLE first (id INT)')
      .mockReturnValueOnce('CREATE TABLE second (id INT)');

    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([]) // SELECT applied
      .mockResolvedValueOnce([]) // execute first SQL
      .mockResolvedValueOnce([]) // INSERT _migrations for first
      .mockResolvedValueOnce([]) // execute second SQL
      .mockResolvedValueOnce([]); // INSERT _migrations for second

    const result = await runMigrations('postgres://test', '/tmp/migrations');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.filename).toBe('001_first.sql');
      expect(result.value[1]?.filename).toBe('002_second.sql');
    }
  });

  it('skips already-applied migrations with matching checksum', async () => {
    vi.mocked(readdirSync).mockReturnValue(['001_test.sql' as unknown as ReturnType<typeof readdirSync>[0]]);
    const content = 'CREATE TABLE test (id INT)';
    vi.mocked(readFileSync).mockReturnValue(content);

    // Compute the same checksum the runner will produce
    const { createHash } = await import('node:crypto');
    const checksum = createHash('sha256').update(content).digest('hex').slice(0, 16);

    mockSql
      .mockResolvedValueOnce([]) // ensureMigrationsTable
      .mockResolvedValueOnce([{ filename: '001_test.sql', checksum }]); // already applied

    const result = await runMigrations('postgres://test', '/tmp/migrations');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0); // nothing new applied
    }
  });
});
