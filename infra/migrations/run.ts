#!/usr/bin/env node
/**
 * CLI: apply infra/migrations to a database.
 *   tsx infra/migrations/run.ts --url postgresql://postgres:pw@host:5432/db [--app-role-password pw]
 */
import { runMigrations } from './runner.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = arg('url') ?? process.env.IDEPOT_DATABASE_URL;
if (!url) {
  console.error('usage: run.ts --url <postgres-url>  (or set IDEPOT_DATABASE_URL)');
  process.exit(2);
}

try {
  const applied = await runMigrations({
    adminUrl: url,
    appRolePassword: arg('app-role-password') ?? process.env.IDEPOT_APP_ROLE_PASSWORD,
  });
  for (const m of applied) {
    console.log(`  ${m.action === 'applied' ? 'APPLY ' : 'SKIP  '} ${m.name} (${m.checksum.slice(0, 12)})`);
  }
  console.log(`migrations complete: ${applied.length} file(s) considered`);
} catch (err) {
  console.error(`migrations FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
