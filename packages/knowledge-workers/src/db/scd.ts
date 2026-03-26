/**
 * @module db/scd
 * Generic SCD Type 2 effective dating engine.
 * Pattern: PeopleSoft EFFDT/EFFSEQ with timestamps instead of dates.
 *
 * Invariant: NEVER delete rows. To "update", expire the old row and insert a new one.
 */

import type { NeonClient } from './neon-client.js';
import { Ok, Err, type Result } from '../types/result.js';
import type { ScdError } from '../types/schema.js';

const FUTURE_END = '9999-12-31T00:00:00Z';

class ScdErrorImpl extends Error {
  constructor(
    public readonly detail: ScdError,
  ) {
    super(
      detail.type === 'db_error'
        ? detail.cause.message
        : detail.type === 'constraint_violation'
          ? detail.detail
          : `${detail.type}: ${detail.entity}/${detail.id}`,
    );
    this.name = 'ScdError';
  }
}

/**
 * Insert a new row with effective dating.
 * If a current row exists for the same natural key, expire it first.
 */
export async function insertWithEffectiveDating<T>(
  client: NeonClient,
  table: string,
  naturalKeyColumn: string,
  naturalKeyValue: string,
  row: Record<string, unknown>,
): Promise<Result<T, ScdErrorImpl>> {
  try {
    // Expire any existing current row
    await client.sql(
      `UPDATE ${table} SET eff_end = now(), is_current = false, updated_at = now()
       WHERE ${naturalKeyColumn} = $1 AND is_current = true`,
      [naturalKeyValue],
    );

    // Build INSERT from row fields
    const merged: Record<string, unknown> = { ...row, eff_end: FUTURE_END, is_current: true };
    const insertColumns: string[] = ['eff_start'];
    const insertPlaceholders: string[] = ['now()'];
    const insertValues: unknown[] = [];
    let paramIdx = 1;

    for (const col of Object.keys(merged)) {
      if (col === 'eff_start') continue; // handled above
      insertColumns.push(col);
      insertPlaceholders.push(`$${paramIdx}`);
      insertValues.push(merged[col]);
      paramIdx++;
    }

    const sql = `INSERT INTO ${table} (${insertColumns.join(', ')})
                 VALUES (${insertPlaceholders.join(', ')})
                 RETURNING *`;
    const rows = await client.sql(sql, insertValues);
    const inserted = rows[0] as T | undefined;
    if (!inserted) {
      return Err(
        new ScdErrorImpl({ type: 'constraint_violation', detail: `INSERT into ${table} returned no rows` }),
      );
    }
    return Ok(inserted);
  } catch (err) {
    return Err(new ScdErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Expire a row by surrogate key — sets eff_end = now(), is_current = false.
 */
export async function expireRow(
  client: NeonClient,
  table: string,
  surrogateKeyColumn: string,
  surrogateKeyValue: number,
): Promise<Result<void, ScdErrorImpl>> {
  try {
    const rows = await client.sql(
      `UPDATE ${table} SET eff_end = now(), is_current = false, updated_at = now()
       WHERE ${surrogateKeyColumn} = $1 AND is_current = true
       RETURNING ${surrogateKeyColumn}`,
      [surrogateKeyValue],
    );
    if (rows.length === 0) {
      return Err(
        new ScdErrorImpl({
          type: 'not_found',
          entity: table,
          id: String(surrogateKeyValue),
        }),
      );
    }
    return Ok(undefined);
  } catch (err) {
    return Err(new ScdErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Point-in-time query: find the row that was current at a specific date.
 */
export async function getAsOf<T>(
  client: NeonClient,
  table: string,
  naturalKeyColumn: string,
  naturalKeyValue: string,
  asOfDate: Date,
): Promise<Result<T | null, ScdErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM ${table}
       WHERE ${naturalKeyColumn} = $1
         AND eff_start <= $2
         AND eff_end > $2
       LIMIT 1`,
      [naturalKeyValue, asOfDate.toISOString()],
    );
    const row = rows[0] as T | undefined;
    return Ok(row ?? null);
  } catch (err) {
    return Err(new ScdErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Get full version history for an entity, ordered by eff_start.
 */
export async function getHistory<T>(
  client: NeonClient,
  table: string,
  naturalKeyColumn: string,
  naturalKeyValue: string,
): Promise<Result<readonly T[], ScdErrorImpl>> {
  try {
    const rows = await client.sql(
      `SELECT * FROM ${table}
       WHERE ${naturalKeyColumn} = $1
       ORDER BY eff_start ASC`,
      [naturalKeyValue],
    );
    return Ok(rows as unknown as readonly T[]);
  } catch (err) {
    return Err(new ScdErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}
