/**
 * @module db/neon-client
 * Neon Postgres client using @neondatabase/serverless HTTP driver.
 * Works in Node.js, Cloudflare Workers, and edge runtimes.
 * All errors wrapped in Result — no thrown exceptions.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { ConnectionString } from '../types/schema.js';
import { Ok, Err, type Result } from '../types/result.js';

export interface NeonClient {
  readonly sql: NeonQueryFunction<false, false>;
  readonly connectionString: ConnectionString;

  /** Execute a parameterized query. Returns rows typed as T[]. */
  query<T>(sql: string, params?: readonly unknown[]): Promise<Result<readonly T[], Error>>;

  /** Execute multiple statements in a pseudo-transaction (Neon HTTP doesn't support real transactions). */
  batch<T>(statements: ReadonlyArray<{ readonly sql: string; readonly params?: readonly unknown[] }>): Promise<Result<readonly T[], Error>>;
}

/**
 * Create a Neon client from a connection string.
 * Supports both pooled (with -pooler suffix) and unpooled Neon URLs.
 */
export function connect(connectionString: ConnectionString): NeonClient {
  const sql = neon(connectionString);

  return {
    sql,
    connectionString,

    async query<T>(sqlStr: string, params?: readonly unknown[]): Promise<Result<readonly T[], Error>> {
      try {
        const rows = await sql(sqlStr, params as unknown[]);
        return Ok(rows as unknown as readonly T[]);
      } catch (err) {
        return Err(err instanceof Error ? err : new Error(String(err)));
      }
    },

    async batch<T>(statements: ReadonlyArray<{ readonly sql: string; readonly params?: readonly unknown[] }>): Promise<Result<readonly T[], Error>> {
      try {
        const allRows: T[] = [];
        for (const stmt of statements) {
          const rows = await sql(stmt.sql, stmt.params as unknown[]);
          allRows.push(...(rows as unknown as T[]));
        }
        return Ok(allRows);
      } catch (err) {
        return Err(err instanceof Error ? err : new Error(String(err)));
      }
    },
  };
}
