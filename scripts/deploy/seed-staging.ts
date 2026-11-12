/**
 * Synthetic staging seeder (staging-runbook §Deployment step 3; issue #10).
 *
 * Creates the DEMO tenant for UAT with six role users
 * (owner/admin/accountant/manager/cashier/auditor) and enough reference data
 * to walk every workflow: units, tax profiles (Ghana-style VAT/GETFUND),
 * two warehouses, demo products, a supplier, customers and a return reason.
 * ALL DATA IS SYNTHETIC — no legacy dump, no PII (issue #9 gate).
 *
 * Idempotent: re-running detects the tenant by slug and only fills gaps.
 * Credentials: generated randomly on FIRST run and written to
 *   $IDEPOT_SEED_CREDS (default: <app-root>/staging-credentials.txt, chmod 600)
 * — never to stdout logs, never to Git.
 *
 * Runs against the staging DB through the REAL API (Nest bootstrap in-process,
 * same as the integration fixtures) so every row carries the app's own
 * validation, audit and posting pipeline — no hand-rolled SQL shapes.
 *
 * Layouts (computed dynamic imports, release layout first):
 *   repo:    scripts/deploy/seed-staging.ts  → ../../apps/api/src, ../../infra
 *   release: <release>/api/seed-staging.ts   → ./dist, ../migrations
 *
 * Usage (VPS, from the release root):
 *   set -a; . /home/lightworld/webapps/idepot-staging/.env.seed; set +a
 *   node runner/node_modules/.bin/tsx api/seed-staging.ts
 */
import 'reflect-metadata';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashPassword } from '@idepot/auth';
import type { AppModule as AppModuleType } from '../../apps/api/src/app.module.js';
import type { runMigrations as runMigrationsType } from '../../infra/migrations/runner.js';

async function tryImport<T>(candidates: string[], name: string): Promise<T> {
  for (const spec of candidates) {
    try {
      return (await import(/* webpackIgnore: true */ spec)) as T;
    } catch {
      /* next layout */
    }
  }
  throw new Error(`could not locate ${name} (neither release nor repo layout)`);
}

const loadAppModule = () =>
  tryImport<{ AppModule: typeof AppModuleType }>(
    // release layout: <release>/api/seed-staging.ts → ./dist/app.module.js
    // repo layout: scripts/deploy/seed-staging.ts → apps/api/dist (after npm run build)
    // (source imports would need apps/api's decorator tsconfig — use compiled output)
    ['./dist/app.module.js', '../../apps/api/dist/app.module.js'],
    'AppModule',
  ).then((m) => m.AppModule);

const loadMigrationRunner = () =>
  tryImport<{ runMigrations: typeof runMigrationsType }>(
    ['../migrations/runner.js', '../../infra/migrations/runner.js'],
    'migration runner',
  ).then((m) => m.runMigrations);

const TENANT_SLUG = process.env.IDEPOT_SEED_TENANT_SLUG ?? 'demo';
const TENANT_NAME = 'Lightworld Demo Depot (SYNTHETIC UAT)';
const CREDENTIALS_FILE =
  process.env.IDEPOT_SEED_CREDS ?? '/home/lightworld/webapps/idepot-staging/staging-credentials.txt';

const ROLES: Array<{ key: string; email: string; roles: string[] }> = [
  { key: 'owner', email: 'owner@demo.idepot', roles: ['owner'] },
  { key: 'admin', email: 'admin@demo.idepot', roles: ['admin'] },
  { key: 'accountant', email: 'accountant@demo.idepot', roles: ['accountant'] },
  { key: 'manager', email: 'manager@demo.idepot', roles: ['manager'] },
  { key: 'cashier', email: 'cashier@demo.idepot', roles: ['cashier'] },
  { key: 'auditor', email: 'auditor@demo.idepot', roles: ['auditor'] },
];

function randomPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () =>
    Array.from(randomBytes(5))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `${group()}-${group()}-${group()}`;
}

async function main() {
  const adminUrl = process.env.IDEPOT_DATABASE_ADMIN_URL ?? process.env.IDEPOT_SEED_DB_URL;
  const appUrl = process.env.IDEPOT_DATABASE_URL ?? adminUrl;
  if (!adminUrl || !appUrl) {
    console.error('need IDEPOT_DATABASE_ADMIN_URL (+ IDEPOT_DATABASE_URL or IDEPOT_SEED_DB_URL)');
    process.exit(2);
  }
  process.env.IDEPOT_JWT_SECRET ??= 'REPLACE-ME-staging-seed';

  // migrations are idempotent — a fresh DB reaches the full schema, an
  // existing one is a no-op (additive-only policy)
  const runMigrations = await loadMigrationRunner();
  await runMigrations({ adminUrl });

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();

  // ---------------------------------------------------------------- tenant
  const existing = await admin.query<{ id: string }>(`SELECT id FROM tenant WHERE slug = $1`, [
    TENANT_SLUG,
  ]);
  const isFresh = existing.rowCount === 0;
  const tenantId = isFresh
    ? (
        await admin.query<{ id: string }>(
          `INSERT INTO tenant (slug, name) VALUES ($1,$2) RETURNING id`,
          [TENANT_SLUG, TENANT_NAME],
        )
      ).rows[0]!.id
    : existing.rows[0]!.id;
  console.log(`tenant: ${TENANT_SLUG} (${isFresh ? 'created' : 'exists'}) ${tenantId}`);

  // ---------------------------------------------------------------- users
  const credentials: Array<{ email: string; password: string; roles: string[] }> = [];
  for (const r of ROLES) {
    const found = await admin.query(`SELECT id FROM app_user WHERE tenant_id=$1 AND email=$2`, [
      tenantId,
      r.email,
    ]);
    if (found.rowCount === 0) {
      const password = randomPassword();
      await admin.query(
        `INSERT INTO app_user (tenant_id, email, password_hash, display_name, roles)
         VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, r.email, await hashPassword(password), r.key, r.roles],
      );
      credentials.push({ email: r.email, password, roles: r.roles });
    } else {
      credentials.push({ email: r.email, password: '(existing — unchanged)', roles: r.roles });
    }
  }

  const newOnes = credentials.filter((c) => !c.password.startsWith('('));
  if (!existsSync(CREDENTIALS_FILE) || newOnes.length > 0) {
    mkdirSync(dirname(CREDENTIALS_FILE), { recursive: true });
    writeFileSync(
      CREDENTIALS_FILE,
      [
        `# iDepot SYNTHETIC staging credentials — generated ${new Date().toISOString()}`,
        `# tenant: ${TENANT_SLUG} (${TENANT_NAME}) — SHARE OVER A SIDE CHANNEL, NEVER IN GIT`,
        ...credentials.map((c) => `${c.roles.join('+')}\t${c.email}\t${c.password}`),
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    chmodSync(CREDENTIALS_FILE, 0o600);
    console.log(
      `credentials: ${CREDENTIALS_FILE} (chmod 600; new passwords written: ${newOnes.length})`,
    );
  } else {
    console.log('credentials: existing file kept (no new users)');
  }

  // ------------------------------------------- reference data (SQL existence check)
  const existingWarehouses = await admin.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM warehouse WHERE tenant_id = $1`,
    [tenantId],
  );
  const referenceDataExists = Number(existingWarehouses.rows[0]?.n ?? '0') > 0;
  if (referenceDataExists && newOnes.length === 0) {
    console.log('reference data: exists (SQL check) — nothing to do');
    console.log('SEED OK — synthetic tenant ready for UAT (issue #10)');
    await admin.end();
    return;
  }

  // login requires a password we KNOW: fresh users carry theirs; for an
  // existing owner the operator may pass IDEPOT_SEED_OWNER_PASSWORD (from the
  // side-channel credentials file) to complete a partial re-seed.
  const ownerCreds = credentials.find((c) => c.email === 'owner@demo.idepot')!;
  const ownerPassword =
    !ownerCreds.password.startsWith('(')
      ? ownerCreds.password
      : (process.env.IDEPOT_SEED_OWNER_PASSWORD ?? '');
  if (!ownerPassword) {
    console.error(
      'SEED INCOMPLETE: owner exists (password unknown) and reference data is missing. ' +
        'Re-run with IDEPOT_SEED_OWNER_PASSWORD from the credentials file, or drop the demo ' +
        'tenant deliberately and re-seed fresh.',
    );
    await admin.end();
    process.exit(3);
  }

  // --------------------------------------------------- reference data via API
  process.env.IDEPOT_DATABASE_URL = appUrl;
  process.env.IDEPOT_DATABASE_ADMIN_URL = adminUrl;
  const AppModule = await loadAppModule();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();

  try {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({
      tenantSlug: TENANT_SLUG,
      email: 'owner@demo.idepot',
      password: ownerPassword,
    });
    if (login.status !== 201) {
      throw new Error(`owner login failed: ${login.status} ${JSON.stringify(login.body)}`);
    }
    const owner = { Authorization: `Bearer ${login.body.accessToken}` };
    const list = async (path: string) => (await request(app.getHttpServer()).get(path).set(owner)).body;
    const post = (path: string, body: unknown) =>
      request(app.getHttpServer()).post(path).set(owner).send(body);
    /** List endpoints may return a bare array or a {items,total} envelope. */
    const hasAny = async (path: string) => {
      const res = await request(app.getHttpServer()).get(path).set(owner);
      const body = res.body;
      console.log(`  probe ${path} -> ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
      if (Array.isArray(body)) return body.length > 0;
      return Array.isArray((body as { items?: unknown[] })?.items) ? (body as { items: unknown[] }).items.length > 0 : false;
    };

    if (!(await hasAny('/api/warehouses'))) {
      console.log('seeding: warehouses, units, tax, products, parties, return reason…');
      await post('/api/warehouses', { code: 'MAIN', name: 'Main Store' }).expect(201);
      await post('/api/warehouses', { code: 'BRANCH', name: 'Accra Road Branch' }).expect(201);
      const unit = (await post('/api/units', { code: 'PC', name: 'Piece' }).expect(201)).body.id;

      // Ghana-style tax profiles (DEMO rates, not legal advice)
      const vat = (await post('/api/tax/profiles', { code: 'VAT', name: 'VAT 15%' }).expect(201))
        .body.id;
      await post(`/api/tax/profiles/${vat}/versions`, {
        effectiveFrom: '2000-01-01',
        components: [{ name: 'VAT', rate: '0.150000', inclusive: false, seq: 1 }],
      }).expect(201);
      const incl = (
        await post('/api/tax/profiles', { code: 'GETFUND-LEVY', name: 'Inclusive GETFUND/LEVY 6%' })
          .expect(201)
      ).body.id;
      await post(`/api/tax/profiles/${incl}/versions`, {
        effectiveFrom: '2000-01-01',
        components: [{ name: 'GETFUND', rate: '0.060000', inclusive: true, seq: 1 }],
      }).expect(201);
      await admin.query(`UPDATE tax_profile SET is_default = true WHERE tenant_id=$1 AND id=$2`, [
        tenantId,
        vat,
      ]);

      const products = [
        { code: 'DEMO-CEM', name: 'Cement Bag (demo)', price: '95.00', cost: '72.00' },
        { code: 'DEMO-PLT', name: 'Paint 20L (demo)', price: '320.00', cost: '240.00' },
        { code: 'DEMO-IRN', name: 'Iron Rod 12mm (demo)', price: '78.00', cost: '59.00' },
        { code: 'DEMO-PVL', name: 'Roofing Sheet (demo)', price: '56.50', cost: '41.00' },
      ];
      for (const p of products) {
        await post('/api/products', {
          code: p.code,
          name: p.name,
          baseUnitId: unit,
          sellingPrice: p.price,
          purchasePrice: p.cost,
        }).expect(201);
      }

      await post('/api/suppliers', { name: 'Demo Building Supplies Ltd', phone: '0302000000' }).expect(
        201,
      );
      await post('/api/customers', { name: 'Ama Mensah (demo)', phone: '0244000111' }).expect(201);
      await post('/api/customers', { name: 'Kofi Boateng (demo)', phone: '0244000222' }).expect(201);

      await post('/api/returns/reasons', {
        code: 'DEMO_DAMAGED',
        name: 'Damaged in transit (demo)',
        requiresApproval: false,
        refundPermitted: true,
        replacementPermitted: true,
        storeCreditPermitted: true,
        restockPermitted: true,
      }).expect(201);
      // UAT-friendly auto-approval for demo reasons (requiresApproval=false)
      // up to 1000.00 estimated credit — cashiers can complete demo returns
      // without waiting for a manager; larger credits still need approval.
      await admin.query(
        `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000)
         ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000`,
        [tenantId],
      );
      console.log('seeding: done (synthetic reference data)');
    } else {
      console.log('reference data: exists — skipping (idempotent re-run)');
    }
  } catch (seedErr) {
    // A 409 mid-seed means the demo tenant is in a PARTIAL state (some unique
    // codes already exist). Never half-seed silently — fail loud with the fix.
    console.error(
      'SEED FAILED mid-reference-data (the demo tenant is partially seeded — e.g. units/tax ' +
        'profiles/products exist while warehouses do not). Reset deliberately: DELETE the demo ' +
        "tenant's rows (tenant cascade) or finish manually. Original error: " +
        (seedErr instanceof Error ? seedErr.message : String(seedErr)),
    );
    process.exit(4);
  } finally {
    await app.close();
    await admin.end();
  }
  console.log('SEED OK — synthetic tenant ready for UAT (issue #10)');
}

main().catch((err: unknown) => {
  console.error('SEED FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
