/**
 * Local migration-smoke runner: boots the embedded PostgreSQL, exposes the
 * admin URL to the migration CLI (mirroring the CI environment variables),
 * runs the smoke command, tears down.
 */
import { execFileSync } from 'node:child_process';
import { getTestPostgres } from '../packages/testing/src/index.js';

const pg = await getTestPostgres();
const dbName = `smoke_${Date.now()}`;
await pg.createDatabase(dbName);
process.env.IDEPOT_MIGRATION_PG_ADMIN_URL = pg.adminUrlFor(dbName);
process.env.IDEPOT_MIGRATION_ARTIFACTS_DIR = './migration-artifacts';
try {
  // CI sequence: apply migrations from zero to the CI database FIRST
  execFileSync('npx', ['tsx', 'infra/migrations/run.ts', '--url', pg.adminUrlFor(dbName)], {
    stdio: 'inherit',
    env: process.env,
  });
  execFileSync(
    'npx',
    ['tsx', 'packages/migration/src/cli.ts', 'smoke', '--dump', 'fixtures/legacy-mysql/idepot_phase1_fixture.sql'],
    { stdio: 'inherit', env: process.env },
  );
  console.log('[smoke-runner] SMOKE OK');
} finally {
  await pg.dropDatabase(dbName).catch(() => undefined);
  await pg.close?.().catch?.(() => undefined);
  process.exit(0);
}
