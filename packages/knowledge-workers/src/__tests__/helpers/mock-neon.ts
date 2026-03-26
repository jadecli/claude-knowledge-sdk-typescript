/**
 * Mock NeonClient factory for unit tests.
 * The sql function is a vi.fn() that can be configured per-test with mockResolvedValueOnce.
 */

import { vi, type Mock } from 'vitest';
import type { NeonClient } from '../../db/neon-client.js';
import type { ConnectionString } from '../../types/schema.js';
import { Ok } from '../../types/result.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockSqlFn = Mock<(...args: any[]) => any>;

export interface MockNeonClient {
  readonly sql: MockSqlFn;
  readonly connectionString: ConnectionString;
  readonly query: NeonClient['query'];
  readonly batch: NeonClient['batch'];
}

export function createMockClient(): MockNeonClient {
  const sqlFn = vi.fn().mockResolvedValue([]);

  return {
    sql: sqlFn,
    connectionString: 'postgres://mock:mock@localhost/test' as ConnectionString,
    async query<T>(_sqlStr: string, _params?: readonly unknown[]) {
      return Ok([] as readonly T[]);
    },
    async batch<T>(_statements: ReadonlyArray<{ readonly sql: string; readonly params?: readonly unknown[] }>) {
      return Ok([] as readonly T[]);
    },
  };
}
