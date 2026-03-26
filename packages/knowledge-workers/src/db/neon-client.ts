/**
 * @module db/neon-client
 * Neon Postgres client interface. Designed for easy mocking in tests.
 */

/** A single row returned from a query */
export type Row = Record<string, unknown>;

/** Query result from Neon */
export interface QueryResult<T extends Row = Row> {
  readonly rows: readonly T[];
  readonly rowCount: number;
}

/** Neon client interface — thin wrapper around SQL execution */
export interface NeonClient {
  /** Execute a parameterized SQL query */
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
}
