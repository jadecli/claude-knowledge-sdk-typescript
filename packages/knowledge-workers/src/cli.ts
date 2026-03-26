#!/usr/bin/env node
/**
 * @module cli
 * CLI entry point for jade-workers.
 * Commands: migrate (run pending migrations), status (show applied migrations).
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runMigrations, getMigrationStatus } from './migrations/runner.js';

const USAGE = `Usage: jade-workers <command>

Commands:
  migrate   Run pending database migrations
  status    Show applied migration status

Environment:
  DATABASE_URL  Neon Postgres connection string (required)`;

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    console.error(USAGE);
    process.exit(command ? 0 : 1);
  }

  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const migrationsDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'migrations');

  switch (command) {
    case 'migrate': {
      console.error('Running migrations...');
      const result = await runMigrations(connectionString, migrationsDir);
      if (!result.ok) {
        console.error(`Migration failed: ${result.error.message}`);
        process.exit(1);
      }
      console.error(`Done. ${result.value.length} migration(s) applied.`);
      break;
    }
    case 'status': {
      const result = await getMigrationStatus(connectionString);
      if (!result.ok) {
        console.error(`Failed to get status: ${result.error.message}`);
        process.exit(1);
      }
      if (result.value.length === 0) {
        console.error('No migrations applied yet.');
      } else {
        for (const m of result.value) {
          console.error(`  ${m.filename} (checksum: ${m.checksum}, applied: ${m.applied_at})`);
        }
      }
      break;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(USAGE);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
