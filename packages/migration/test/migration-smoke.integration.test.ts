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
    // Phase 2 extended the fixture: 5 Phase-1 rows (unchanged) + 5 new product rows
    expect(tables.item!.stagedRows).toBe(10);
    expect(tables.invoice!.stagedRows).toBe(3);
    expect(tables.payment!.stagedRows).toBe(3);
    expect(tables.units_items!.stagedRows).toBe(12);
    expect(tables.customers!.stagedRows).toBe(4);
    expect(tables.suppliers!.stagedRows).toBe(2);
    expect(tables.opening_stock_count!.stagedRows).toBe(4);
    for (const t of first.artifact.tables) {
      expect(t.checksumMatch, `checksum ${t.table}`).toBe(true);
    }
  });

  it('quarantines the corrupted rows with precise reasons', () => {
    // Phase 2 fixture deliberately adds: orphan category ref (item 110), the
    // orphaned box-conversion of quarantined item 103 + the orphan count row
    // for item 110 (fk_orphan total 4), a malformed conversion ('abc'), an
    // invalid factor (0) and a duplicate barcode (item 109 re-uses BC-101).
    expect(first.artifact.quarantine.total).toBe(9);
    expect(first.artifact.quarantine.byReason.encoding_mojibake).toBe(1);
    expect(first.artifact.quarantine.byReason.date_unparsable).toBe(1);
    expect(first.artifact.quarantine.byReason.fk_orphan).toBe(4);
    expect(first.artifact.quarantine.byReason.duplicate_barcode).toBe(1);
    // the malformed factor ('abc') is backend-sensitive BY DESIGN: staging MySQL
    // runs non-strict (legacy-faithful), so DOUBLE coercion turns 'abc' into 0 →
    // invalid_conversion on the mysql-protocol path, while the parsed-dump
    // fallback preserves the raw string → numeric_unparsable. Either way the
    // malformed conversion + the zero factor are quarantined (2 rows total).
    const coerced =
      (first.artifact.quarantine.byReason.numeric_unparsable ?? 0) +
      (first.artifact.quarantine.byReason.invalid_conversion ?? 0);
    expect(coerced).toBe(2);
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

  it('emits Phase 2 opening-stock correction records (count variance + accepted risk)', () => {
    const records = first.artifact.reconciliation.records;
    // count authority wins with recorded variance (I1 evidence)
    const variances = records.filter((r) => r.correction_reason === 'I1_OPENING_STOCK_COUNT_VARIANCE');
    expect(variances.map((r) => r.legacy_id).sort()).toEqual(['102', '108']);
    const v102 = variances.find((r) => r.legacy_id === '102')!;
    expect(v102.legacy_stored_value.base_quantity).toBe('35.000000');
    expect(v102.new_system_value.opening_base_quantity).toBe('34.000000');
    expect(v102.correction_delta.opening_quantity_base).toBe('-1.000000');
    expect(v102.new_system_value.authority).toBe('physical_count');
    expect(v102.requires_manual_approval).toBe(true);
    // legacy fallback WITHOUT count = accepted migration risk, never silent
    const risks = records.filter(
      (r) => r.correction_reason === 'I1_LEGACY_QUANTITY_WITHOUT_COUNT_ACCEPTED_RISK',
    );
    expect(risks.map((r) => r.legacy_id).sort()).toEqual(['106', '107']);
    const v106 = risks.find((r) => r.legacy_id === '106')!;
    expect(v106.legacy_reconstructed_value.base_quantity).toBe('105.000000'); // 0.4 ton × 250 + 5
    expect(v106.new_system_value.accepted_migration_risk).toBe(true);
    expect(v106.severity).toBe('critical');
    expect(v106.evidence.defect).toBe('I1');
    // exact count match (101) produces NO record
    expect(records.filter((r) => r.legacy_id === '101')).toHaveLength(0);
  });

  it('imports Phase 2 master data with conversions and opening stock', async () => {
    const p2 = first.artifact.phase2!;
    expect(p2.categoriesImported).toBe(7); // 3 mains + 4 subs
    expect(p2.unitsImported).toBe(10);
    expect(p2.productsImported).toBe(5); // 101,102,106,107,108
    expect(p2.conversionsImported).toBe(5); // bundle, ton, bottle, carton, coil
    expect(p2.customersImported).toBe(4);
    expect(p2.suppliersImported).toBe(2);
    expect(p2.openingStockDocs).toBe(5);
    expect(p2.openingStockMovements).toBe(5);
    expect(p2.openingStockRiskItems).toBe(2);
    expect(p2.openingStockVariances).toBe(2);

    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    try {
      // conversion factors are exact decimals to base (unit-conversion-rules §8)
      const conv = await c.query<{ code: string; f: string }>(
        `SELECT u.code, pu.conversion_factor::text f FROM product_unit pu
         JOIN unit u ON u.id = pu.unit_id ORDER BY u.code`,
      );
      const factors = Object.fromEntries(conv.rows.map((r) => [r.code, r.f]));
      expect(factors['BUNDLE']).toBe('10.000000');
      expect(factors['TON']).toBe('250.000000');
      expect(factors['BOTTLE']).toBe('30.000000');
      expect(factors['CARTON']).toBe('720.000000');
      expect(factors['COIL']).toBe('50.000000');
      // opening balances derived from the ledger movements
      const bal = await c.query<{ code: string; q: string }>(
        `SELECT p.code, b.quantity_base::text q FROM stock_balance b
         JOIN product p ON p.id = b.product_id ORDER BY p.code`,
      );
      const balances = Object.fromEntries(bal.rows.map((r) => [r.code, r.q]));
      expect(balances['ITM-CEM-50']).toBe('120.500000');
      expect(balances['ITM-RID-01']).toBe('34.000000');
      expect(balances['ITM-ROD-12']).toBe('105.000000');
      expect(balances['ITM-BEER-CL']).toBe('1455.000000');
      expect(balances['ITM-WIRE-C']).toBe('110.000000');
      // accepted-risk count documents are flagged for sign-off
      const risk = await c.query<{ n: string }>(
        `SELECT count(*)::text n FROM stock_count WHERE accepted_migration_risk = true`,
      );
      expect(Number(risk.rows[0]!.n)).toBe(2);
    } finally {
      await c.end();
    }
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
      // DB reason set mirrors the artifact (both are backend-stable in count)
      expect(q.rows.length).toBe(Object.keys(first.artifact.quarantine.byReason).length);
      const rr = await c.query<{ n: string }>(
        'SELECT count(*)::text n FROM reconciliation_record WHERE run_id = $1',
        [first.runId],
      );
      // 2 D1 + 4 opening-stock (2 count variances + 2 accepted-risk fallbacks)
      expect(Number(rr.rows[0]!.n)).toBe(6);
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
    expect(artifact.reconciliation.summary.records).toBe(6);
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
    expect(second.artifact.quarantine.total).toBe(9);
    // Phase 2 idempotency: every master-data target is reused, never duplicated
    expect(second.artifact.phase2!.productsReused).toBe(5);
    expect(second.artifact.phase2!.productsImported).toBe(0);
    expect(second.artifact.phase2!.conversionsReused).toBe(5);
    expect(second.artifact.phase2!.conversionsImported).toBe(0);
    expect(second.artifact.phase2!.customersReused).toBe(4);
    expect(second.artifact.phase2!.suppliersReused).toBe(2);
    expect(second.artifact.phase2!.openingStockDocs).toBe(0);
    expect(second.artifact.phase2!.openingStockDocsReused).toBe(5);
    expect(second.artifact.phase2!.openingStockMovements).toBe(0);

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
