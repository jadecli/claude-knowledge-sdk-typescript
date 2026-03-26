/**
 * @module db/scd
 * SCD Type 2 (Slowly Changing Dimensions) engine.
 *
 * Maintains full history of row changes by:
 *  - Expiring old rows (setting eff_end + is_current=false)
 *  - Inserting new rows with fresh surrogate keys
 */
import type { NeonClient, Row } from './neon-client.js';
import type { SCDRow, Result } from './types.js';
import { Ok, Err } from './types.js';

/** Generate a UUID-like surrogate key */
function generateSurrogateKey(): string {
  return `sk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Insert a row with SCD Type 2 effective dating.
 * If a current row exists for the same natural_key in the given table,
 * it is expired first.
 */
export async function insertWithEffectiveDating(
  client: NeonClient,
  table: string,
  naturalKey: string,
  data: Record<string, unknown>,
): Promise<Result<SCDRow>> {
  const now = new Date().toISOString();

  // Expire existing current row for this natural key
  await client.query(
    `UPDATE ${table} SET eff_end = $1, is_current = false WHERE natural_key = $2 AND is_current = true`,
    [now, naturalKey],
  );

  const surrogateKey = generateSurrogateKey();
  const row: SCDRow = {
    surrogate_key: surrogateKey,
    natural_key: naturalKey,
    eff_start: now,
    eff_end: null,
    is_current: true,
    ...data,
  };

  const columns = Object.keys(row);
  const values = Object.values(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

  await client.query(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
  );

  return Ok(row);
}

/**
 * Expire a row by its surrogate key.
 */
export async function expireRow(
  client: NeonClient,
  table: string,
  surrogateKey: string,
): Promise<Result<{ readonly expired: true }, Error>> {
  const now = new Date().toISOString();
  const result = await client.query(
    `UPDATE ${table} SET eff_end = $1, is_current = false WHERE surrogate_key = $2 AND is_current = true`,
    [now, surrogateKey],
  );

  if (result.rowCount === 0) {
    return Err(new Error(`not_found: no current row with surrogate_key=${surrogateKey}`));
  }

  return Ok({ expired: true } as const);
}

/**
 * Get the version of a row that was current at a given date.
 */
export async function getAsOf<T extends Row = Row>(
  client: NeonClient,
  table: string,
  naturalKey: string,
  asOfDate: string,
): Promise<Result<T | null>> {
  const result = await client.query<T>(
    `SELECT * FROM ${table} WHERE natural_key = $1 AND eff_start <= $2 AND (eff_end IS NULL OR eff_end > $2) LIMIT 1`,
    [naturalKey, asOfDate],
  );

  const row = result.rows[0];
  return Ok(row ?? null);
}

/**
 * Get full history of a natural key, ordered by eff_start ascending.
 */
export async function getHistory<T extends Row = Row>(
  client: NeonClient,
  table: string,
  naturalKey: string,
): Promise<Result<readonly T[]>> {
  const result = await client.query<T>(
    `SELECT * FROM ${table} WHERE natural_key = $1 ORDER BY eff_start ASC`,
    [naturalKey],
  );

  return Ok(result.rows);
}
