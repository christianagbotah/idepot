/**
 * iDepot migration CLI.
 *
 *   idepot-migrate smoke --dump <path> [--tenant-id <uuid>] [--artifacts-dir <dir>]
 *
 * Smoke = full pipeline against an isolated staging MySQL and a PostgreSQL
 * with the migration DDL applied. Falls back to the dump parser when no MySQL
 * server is configured (documented fallback; CI always exercises MySQL).
 */
import { createMySqlStagingSource } from './source-mysql.js';
import { createParsedDumpSource } from './dump-parser.js';
import { runMigration } from './engine.js';
import { randomUUID } from 'node:crypto';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command !== 'smoke') {
    console.error('usage: idepot-migrate smoke --dump <path> [--tenant-id <uuid>] [--artifacts-dir <dir>]');
    return 2;
  }
  const dump = arg('dump');
  if (!dump) {
    console.error('--dump is required');
    return 2;
  }
  const pgAdminUrl =
    arg('pg-url') ?? process.env.IDEPOT_MIGRATION_PG_ADMIN_URL ?? process.env.IDEPOT_DATABASE_ADMIN_URL;
  if (!pgAdminUrl) {
    console.error(
      'PostgreSQL admin URL missing: pass --pg-url or set IDEPOT_MIGRATION_PG_ADMIN_URL',
    );
    return 2;
  }
  const mysqlUrl = arg('mysql-url') ?? process.env.IDEPOT_MIGRATION_MYSQL_URL;
  const artifactsDir = arg('artifacts-dir') ?? process.env.IDEPOT_MIGRATION_ARTIFACTS_DIR;

  // resolve/create the smoke tenant (fixture bootstrap; production passes an id)
  const tenantId = arg('tenant-id') ?? (await ensureSmokeTenant(pgAdminUrl));

  const source = mysqlUrl
    ? await createMySqlStagingSource({ mysqlUrl, dumpPath: dump })
    : createParsedDumpSource(dump);
  if (!mysqlUrl) {
    console.warn('WARNING: IDEPOT_MIGRATION_MYSQL_URL not set — using parsed-dump fallback (no staging MySQL).');
  }

  const t0 = Date.now();
  const result = await runMigration({ pgAdminUrl, source, tenantId, artifactsDir });
  const a = result.artifact;
  const allChecksumsOk = a.tables.every((t) => t.checksumMatch);

  console.log(`run ${result.runId} (${a.stagingBackend}) in ${Date.now() - t0}ms`);
  for (const t of a.tables) {
    console.log(
      `  ${t.table.padEnd(10)} staged=${t.stagedRows} loaded=${t.loadedRows} checksum=${t.checksumMatch ? 'OK' : 'MISMATCH'}`,
    );
  }
  console.log(`  quarantine: ${a.quarantine.total} (${Object.entries(a.quarantine.byReason).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'})`);
  console.log(`  reconciliation records: ${a.reconciliation.summary.records} (manual approval: ${a.reconciliation.summary.requiresManualApproval})`);
  console.log(`  transform: imported=${a.transform.storesImported} reused=${a.transform.storesReused} idmap=${a.transform.legacyIdMapRows}`);
  if (result.artifactPath) console.log(`  artifact: ${result.artifactPath}`);

  const ok = allChecksumsOk && a.transform.storesImported + a.transform.storesReused > 0;
  console.log(ok ? 'MIGRATION SMOKE PASS' : 'MIGRATION SMOKE FAILED');
  return ok ? 0 : 1;
}

async function ensureSmokeTenant(pgAdminUrl: string): Promise<string> {
  const { Client } = await import('pg');
  const c = new Client({ connectionString: pgAdminUrl });
  await c.connect();
  try {
    const existing = await c.query<{ id: string }>(`SELECT id FROM tenant WHERE slug='migration-smoke'`);
    if (existing.rowCount) return existing.rows[0]!.id;
    const inserted = await c.query<{ id: string }>(
      `INSERT INTO tenant (slug, name) VALUES ('migration-smoke','Migration Smoke Fixture Tenant') RETURNING id`,
    );
    return inserted.rows[0]!.id;
  } finally {
    await c.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`migration smoke FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
