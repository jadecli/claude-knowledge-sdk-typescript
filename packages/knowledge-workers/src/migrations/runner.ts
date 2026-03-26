/**
 * @module migrations/runner
 * SQL migration runner for Neon Postgres.
 * Reads .sql files from migrations/ directory, applies in numeric order.
 * Tracks applied migrations in _migrations table with checksums.
 *
 * Can be run as CLI: npx tsx packages/knowledge-workers/src/migrations/runner.ts
 * Or programmatically: import { runMigrations } from './runner.js'
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { Ok, Err, type Result } from '../types/result.js';
import type { MigrationResult, AppliedMigration, MigrationError } from '../types/schema.js';

class MigrationErrorImpl extends Error {
  constructor(
    public readonly detail: MigrationError,
  ) {
    super(
      detail.type === 'checksum_mismatch'
        ? `Checksum mismatch for ${detail.filename}: expected ${detail.expected}, got ${detail.actual}`
        : detail.type === 'migration_failed'
          ? `Migration ${detail.filename} failed: ${detail.cause.message}`
          : detail.cause.message,
    );
    this.name = 'MigrationError';
  }
}

function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable(sql: ReturnType<typeof neon<false, false>>): Promise<void> {
  await sql(`CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL UNIQUE,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ DEFAULT now()
  )`);
}

/**
 * Get list of already-applied migrations.
 */
export async function getMigrationStatus(
  connectionString: string,
): Promise<Result<readonly AppliedMigration[], MigrationErrorImpl>> {
  try {
    const sql = neon(connectionString);
    await ensureMigrationsTable(sql);
    const rows = await sql(`SELECT * FROM _migrations ORDER BY id ASC`);
    return Ok(rows as unknown as readonly AppliedMigration[]);
  } catch (err) {
    return Err(new MigrationErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

/**
 * Run all pending migrations from the migrations directory.
 */
export async function runMigrations(
  connectionString: string,
  migrationsDir?: string,
): Promise<Result<readonly MigrationResult[], MigrationErrorImpl>> {
  const dir = migrationsDir ?? resolve(import.meta.dirname, '..', '..', 'migrations');

  try {
    const sql = neon(connectionString);
    await ensureMigrationsTable(sql);

    // Get already applied migrations
    const applied = await sql(`SELECT filename, checksum FROM _migrations ORDER BY id ASC`);
    const appliedMap = new Map<string, string>();
    for (const row of applied) {
      const r = row as { filename: string; checksum: string };
      appliedMap.set(r.filename, r.checksum);
    }

    // Read migration files sorted by name
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const results: MigrationResult[] = [];

    for (const filename of files) {
      const content = readFileSync(join(dir, filename), 'utf-8');
      const checksum = computeChecksum(content);

      // Check if already applied
      const existingChecksum = appliedMap.get(filename);
      if (existingChecksum !== undefined) {
        if (existingChecksum !== checksum) {
          return Err(new MigrationErrorImpl({
            type: 'checksum_mismatch',
            filename,
            expected: existingChecksum,
            actual: checksum,
          }));
        }
        continue; // Already applied, skip
      }

      // Apply migration — split by semicolons since Neon HTTP driver
      // doesn't support multiple statements in a single prepared statement
      try {
        const statements = content
          .split(';')
          .map(s => s.trim())
          .filter(s => {
            // Strip leading comment lines to check if there's actual SQL
            const withoutComments = s
              .split('\n')
              .filter(line => !line.trimStart().startsWith('--') && line.trim().length > 0)
              .join('\n')
              .trim();
            return withoutComments.length > 0;
          });

        for (const stmt of statements) {
          await sql(stmt);
        }

        await sql(
          `INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)`,
          [filename, checksum],
        );
        results.push({
          filename,
          applied_at: new Date().toISOString(),
          checksum,
        });
        console.error(`  ✓ Applied: ${filename}`);
      } catch (err) {
        return Err(new MigrationErrorImpl({
          type: 'migration_failed',
          filename,
          cause: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    }

    if (results.length === 0) {
      console.error('  No pending migrations.');
    }

    return Ok(results);
  } catch (err) {
    return Err(new MigrationErrorImpl({ type: 'db_error', cause: err instanceof Error ? err : new Error(String(err)) }));
  }
}

// ── CLI Entry Point ─────────────────────────────────────────────

const isDirectRun = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('runner.ts') ||
  process.argv[1]?.endsWith('runner.js');

if (isDirectRun) {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Usage: DATABASE_URL=postgres://... npx tsx src/migrations/runner.ts');
    process.exit(1);
  }

  console.error(`Running migrations against Neon...`);
  const result = await runMigrations(connectionString);

  if (!result.ok) {
    console.error(`Migration failed: ${result.error.message}`);
    process.exit(1);
  }

  console.error(`Done. ${result.value.length} migration(s) applied.`);
}
