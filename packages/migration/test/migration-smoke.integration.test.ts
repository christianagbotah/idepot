/**
 * Migration smoke + idempotency (Phase 1 exit criterion:
 * "migration smoke test runs a fixture dump end-to-end and emits
 * reconciliation.json"; plus repeatable/idempotent importer harness).
 *
 * Staging backend: MySQL protocol when IDEPOT_MIGRATION_MYSQL_URL is set
 * (CI + this sandbox's MariaDB); otherwise the documented parsed-dump fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { join } from 'node:path';
import { getTestPostgres } from '@idepot/testing';
import { runMigrations } from '../../../infra/migrations/runner.js';
import { createMySqlStagingSource } from '../src/source-mysql.js';
import { createParsedDumpSource } from '../src/dump-parser.js';
import { runMigration, type MigrationRunResult } from '../src/engine.js';
import { LegacyRawMissingError } from '../src/stager.js';

const FIXTURE = join(__dirname, '../../../fixtures/legacy-mysql/idepot_phase1_fixture.sql');

async function makeSource() {
  const mysqlUrl = process.env.IDEPOT_MIGRATION_MYSQL_URL;
  if (mysqlUrl) {
    return { source: await createMySqlStagingSource({ mysqlUrl, dumpPath: FIXTURE }), mysqlUrl };
  }
  return { source: createParsedDumpSource(FIXTURE), mysqlUrl: undefined };
}

describe('migration smoke pipeline (fixture dump → staging → legacy_raw → reconcile)', () => {
  let pg: Awaited<ReturnType<typeof getTestPostgres>>;
  let dbName: string;
  let adminUrl: string;
  let tenantId: string;
  let first: MigrationRunResult;
  let backend = '';

  beforeAll(async () => {
    pg = await getTestPostgres();
    dbName = `mig_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    await pg.createDatabase(dbName);
    adminUrl = pg.adminUrlFor(dbName);
    await runMigrations({ adminUrl, appRolePassword: 'idepot_app_test' });
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    const t = await c.query<{ id: string }>(
      `INSERT INTO tenant (slug, name) VALUES ('migration-smoke','Migration Smoke Fixture Tenant') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;
    await c.end();

    const { source } = await makeSource();
    backend = source.backend;
    first = await runMigration({
      pgAdminUrl: adminUrl,
      source,
      tenantId,
      artifactsDir: join(__dirname, '../../migration-artifacts'),
    });
  }, 180_000);

  afterAll(async () => {
    if (dbName) await pg.dropDatabase(dbName).catch(() => undefined);
  });

  it('loads all fixture tables into legacy_raw with matching checksums', () => {
    const tables = Object.fromEntries(first.artifact.tables.map((t) => [t.table, t]));
    expect(tables.store!.stagedRows).toBe(3);
    expect(tables.item!.stagedRows).toBe(5);
    expect(tables.invoice!.stagedRows).toBe(3);
    expect(tables.payment!.stagedRows).toBe(3);
    for (const t of first.artifact.tables) {
      expect(t.checksumMatch, `checksum ${t.table}`).toBe(true);
    }
  });

  it('quarantines the three corrupted rows with precise reasons', () => {
    expect(first.artifact.quarantine.total).toBe(3);
    expect(first.artifact.quarantine.byReason.encoding_mojibake).toBe(1);
    expect(first.artifact.quarantine.byReason.date_unparsable).toBe(1);
    expect(first.artifact.quarantine.byReason.fk_orphan).toBe(1);
  });

  it('emits correction-aware D1 reconciliation records with the full contract', () => {
    const records = first.artifact.reconciliation.records;
    const d1 = records.filter(
      (r) => r.correction_reason === 'D1_SPLIT_PAYMENT_RECEIPT_TOTAL_MULTIPLIED',
    );
    expect(d1).toHaveLength(2);
    const inv1001 = d1.find((r) => r.legacy_id === '1001')!;
    const inv1002 = d1.find((r) => r.legacy_id === '1002')!;

    // full correction-aware record contract (strategy doc §3a)
    for (const r of d1) {
      expect(r.legacy_stored_value).toBeDefined();
      expect(r.legacy_reconstructed_value).toBeDefined();
      expect(r.new_system_value).toBeDefined();
      expect(r.correction_delta).toBeDefined();
      expect(r.correction_reason).toBe('D1_SPLIT_PAYMENT_RECEIPT_TOTAL_MULTIPLIED');
      expect(r.evidence).toBeDefined();
      expect(r.severity).toBe('critical');
      expect(r.requires_manual_approval).toBe(true);
    }
    // stored = receipt total (D1 corruption); reconstructed = pro-rata share
    expect(inv1001.legacy_stored_value.amount_paid).toBe('100.0000');
    expect(inv1001.legacy_reconstructed_value.amount_paid).toBe('40.0000');
    expect(inv1001.correction_delta.amount_paid).toBe('-60.0000');
    expect(inv1002.legacy_stored_value.amount_paid).toBe('100.0000');
    expect(inv1002.legacy_reconstructed_value.amount_paid).toBe('60.0000');
    expect(inv1002.correction_delta.amount_paid).toBe('-40.0000');
    expect(inv1001.evidence.defect).toBe('D1');
    expect(String(inv1001.evidence.source)).toContain('Admin.php:17270-17438');
    // the clean invoice (single payment, sum matches) gets NO record
    expect(records.find((r) => r.legacy_id === '2001')).toBeUndefined();
  });

  it('imports stores into the target tenant with legacy_id_map rows', async () => {
    expect(first.artifact.transform.storesImported).toBe(3);
    expect(first.artifact.transform.legacyIdMapRows).toBe(3);
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    try {
      const wh = await c.query<{ n: string }>(
        'SELECT count(*)::text n FROM warehouse WHERE tenant_id = $1',
        [tenantId],
      );
      expect(Number(wh.rows[0]!.n)).toBe(3);
      const q = await c.query<{ reason: string }>(
        'SELECT reason_code reason FROM quarantine_row WHERE run_id = $1 GROUP BY reason_code',
        [first.runId],
      );
      expect(q.rows.length).toBe(3);
      const rr = await c.query<{ n: string }>(
        'SELECT count(*)::text n FROM reconciliation_record WHERE run_id = $1',
        [first.runId],
      );
      expect(Number(rr.rows[0]!.n)).toBe(2);
    } finally {
      await c.end();
    }
  });

  it('writes reconciliation.json + human report artifacts', () => {
    expect(first.artifactPath).toBeTruthy();
     
    const artifact = require(first.artifactPath!) as {
      runId: string;
      reconciliation: { summary: { records: number } };
      stagingBackend: string;
    };
    expect(artifact.runId).toBe(first.runId);
    expect(artifact.reconciliation.summary.records).toBe(2);
    expect(artifact.stagingBackend).toBe(backend);
  });

  it('is idempotent: re-run reuses mappings, never duplicates targets or evidence', async () => {
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    const before = {
      warehouses: Number(
        (
          await c.query<{ n: string }>(
            'SELECT count(*)::text n FROM warehouse WHERE tenant_id = $1',
            [tenantId],
          )
        ).rows[0]!.n,
      ),
      idmap: (
        await c.query<{ target_id: string }>(
          `SELECT target_id FROM legacy_id_map WHERE legacy_table='store' ORDER BY legacy_id`,
        )
      ).rows.map((r) => r.target_id),
      quarantineSet: (
        await c.query<{ s: string }>(
          `SELECT md5(string_agg(legacy_table || ':' || legacy_pk || ':' || reason_code, ',' ORDER BY legacy_table, legacy_pk, reason_code)) s FROM quarantine_row WHERE run_id = $1`,
          [first.runId],
        )
      ).rows[0]!.s,
    };
    await c.end();

    const { source } = await makeSource();
    const second = await runMigration({ pgAdminUrl: adminUrl, source, tenantId });

    expect(second.runId).not.toBe(first.runId);
    expect(second.artifact.transform.storesReused).toBe(3);
    expect(second.artifact.transform.storesImported).toBe(0);
    expect(second.artifact.quarantine.total).toBe(3);

    const c2 = new Client({ connectionString: adminUrl });
    await c2.connect();
    try {
      const after = {
        warehouses: Number(
          (
            await c2.query<{ n: string }>(
              'SELECT count(*)::text n FROM warehouse WHERE tenant_id = $1',
              [tenantId],
            )
          ).rows[0]!.n,
        ),
        idmap: (
          await c2.query<{ target_id: string }>(
            `SELECT target_id FROM legacy_id_map WHERE legacy_table='store' ORDER BY legacy_id`,
          )
        ).rows.map((r) => r.target_id),
        quarantineSet: (
          await c2.query<{ s: string }>(
            `SELECT md5(string_agg(legacy_table || ':' || legacy_pk || ':' || reason_code, ',' ORDER BY legacy_table, legacy_pk, reason_code)) s FROM quarantine_row WHERE run_id = $1`,
            [second.runId],
          )
        ).rows[0]!.s,
      };
      // no duplicate target records; stable legacy-ID mapping; stable reconciliation result
      expect(after.warehouses).toBe(before.warehouses);
      expect(after.idmap).toEqual(before.idmap);
      expect(after.quarantineSet).toBe(before.quarantineSet);
      expect(second.artifact.reconciliation.records).toEqual(first.artifact.reconciliation.records);
      const runs = await c2.query<{ n: string }>(
        `SELECT count(*)::text n FROM migration_run WHERE status='completed'`,
      );
      expect(Number(runs.rows[0]!.n)).toBeGreaterThanOrEqual(2);
    } finally {
      await c2.end();
    }
  }, 120_000);
});

describe('stager ownership contract: legacy_raw is never created at runtime', () => {
  it('fails fast with LegacyRawMissingError when the DDL layer has not run', async () => {
    const pg = await getTestPostgres();
    const dbName = `mig_missing_${Date.now()}`;
    await pg.createDatabase(dbName);
    try {
      // full DDL first, then drop legacy_raw to simulate "DDL layer not applied"
      await runMigrations({ adminUrl: pg.adminUrlFor(dbName), appRolePassword: 'idepot_app_test' });
      const c = new Client({ connectionString: pg.adminUrlFor(dbName) });
      await c.connect();
      await c.query('DROP SCHEMA IF EXISTS legacy_raw CASCADE');
      await c.end();

      const { source } = await makeSource();
      const tenant = new Client({ connectionString: pg.adminUrlFor(dbName) });
      await tenant.connect();
      const t = await tenant.query<{ id: string }>(
        `INSERT INTO tenant (slug,name) VALUES ('smoke-missing','x') RETURNING id`,
      );
      const tid = t.rows[0]!.id;
      await tenant.end();

      await expect(
        runMigration({ pgAdminUrl: pg.adminUrlFor(dbName), source, tenantId: tid }),
      ).rejects.toThrow(LegacyRawMissingError);
      await expect(
        runMigration({
          pgAdminUrl: pg.adminUrlFor(dbName),
          source: createParsedDumpSource(FIXTURE),
          tenantId: tid,
        }),
      ).rejects.toThrow(/NEVER creates schemas/i);
    } finally {
      await pg.dropDatabase(dbName).catch(() => undefined);
    }
  }, 120_000);
});
