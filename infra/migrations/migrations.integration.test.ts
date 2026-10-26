/**
 * Infrastructure integration test: migrations apply cleanly and the
 * least-privilege contract for the application role holds.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getTestPostgres } from '@idepot/testing';
import { runMigrations } from './runner.js';
import { Client } from 'pg';

describe('infra/migrations', () => {
  const dbName = 'mig_infra_test';
  let adminUrl: string;
  let appUrl: string;

  beforeAll(async () => {
    const pg = await getTestPostgres();
    await pg.createDatabase(dbName);
    adminUrl = pg.adminUrlFor(dbName);
    appUrl = pg.appUrl(dbName);
    await runMigrations({ adminUrl, appRolePassword: 'idepot_app_test' });
  }, 120_000);

  it('applies all migrations idempotently', async () => {
    const second = await runMigrations({ adminUrl, appRolePassword: 'idepot_app_test' });
    expect(second.length).toBeGreaterThanOrEqual(2);
    expect(second.every((m) => m.action === 'skipped-identical')).toBe(true);
  });

  it('creates the expected tables', async () => {
    const c = new Client({ connectionString: adminUrl });
    await c.connect();
    try {
      const res = await c.query<{ table_name: string; table_schema: string }>(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_name IN ('tenant','warehouse','app_user','device','audit_event','outbox_event',
                              'sample_document','migration_run','legacy_id_map','quarantine_row','reconciliation_record')
           OR (table_schema='legacy_raw' AND table_name IN ('store','item','invoice','payment'))`,
      );
      const names = res.rows.map((r) => `${r.table_schema}.${r.table_name}`).sort();
      expect(names).toContain('public.tenant');
      expect(names).toContain('legacy_raw.store');
      expect(names.length).toBe(15);
    } finally {
      await c.end();
    }
  });

  it('app role cannot TRUNCATE (least privilege)', async () => {
    const c = new Client({ connectionString: appUrl });
    await c.connect();
    try {
      await expect(c.query('TRUNCATE warehouse')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });

  it('app role cannot CREATE tables', async () => {
    const c = new Client({ connectionString: appUrl });
    await c.connect();
    try {
      await expect(
        c.query('CREATE TABLE public.sneaky_test (id int)'),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await c.end();
    }
  });

  it('RLS hides all rows from the app role when tenant context is absent', async () => {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    try {
      await admin.query(
        `INSERT INTO tenant (slug, name) VALUES ('mig-rls-t','Mig RLS Tenant')
         ON CONFLICT (slug) DO NOTHING`,
      );
      const t = await admin.query<{ id: string }>(`SELECT id FROM tenant WHERE slug='mig-rls-t'`);
      const tenantId = t.rows[0]!.id;
      await admin.query(
        `INSERT INTO warehouse (tenant_id, code, name) VALUES ($1,'WH-R','RLS Warehouse')`,
        [tenantId],
      );
    } finally {
      await admin.end();
    }

    const app = new Client({ connectionString: appUrl });
    await app.connect();
    try {
      const noCtx = await app.query<{ n: string }>('SELECT count(*)::text n FROM warehouse');
      expect(Number(noCtx.rows[0]!.n)).toBe(0);
      // RLS also hides tenant rows without context — resolve the id as admin.
      const admin2 = new Client({ connectionString: adminUrl });
      await admin2.connect();
      const tenantId = (
        await admin2.query<{ id: string }>(`SELECT id FROM tenant WHERE slug='mig-rls-t'`)
      ).rows[0]!.id;
      await admin2.end();
      await app.query('BEGIN');
      await app.query('SELECT set_config($1,$2,true)', ['app.tenant_id', tenantId]);
      const withCtx = await app.query<{ n: string }>('SELECT count(*)::text n FROM warehouse');
      expect(Number(withCtx.rows[0]!.n)).toBe(1);
      await app.query('COMMIT');
    } finally {
      await app.end();
    }
  });
});
