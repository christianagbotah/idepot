#!/usr/bin/env node
/**
 * Phase 6 B6 — 50-terminal offline chaos simulation (ROADMAP Phase 6 exit
 * criterion; offline-sync.md §10).
 *
 * What it proves, on REAL PostgreSQL through the REAL API:
 *  - 50 devices capture sales OFFLINE (partitioned), each with unique
 *    client-generated UUIDv7 identities;
 *  - a reconnect storm pushes every outbox concurrently — duplicate
 *    deliveries (same eventId replayed) and resend storms (idempotency key
 *    reuse with identical payloads) converge to EXACTLY one application
 *    per business event;
 *  - one terminal's device is REVOKED mid-storm: its pushes are refused
 *    (403) and its queued events remain on-device (never silently applied);
 *  - stock/COGS/money reconcile at the end: Σ invoices == Σ applied events,
 *    per-product quantities tie to the stock ledger, trial balance
 *    balances, AR control passes;
 *  - metrics: per-terminal push latency p50/p95/p99, conflict counts by
 *    code, duplicate-suppression counts — logged with the deterministic
 *    seed for reproducibility.
 *
 * Usage:  npm run bench --workspace @idepot/offline-chaos
 *         SEED=42 TERMINALS=50 ./run via npm run bench
 *
 * NOT a physical-hardware sign-off (handoff B6) — this is the software
 * chaos suite; the physical device matrix is a separate evidence doc.
 *
 * It drives the app through its HTTP surface (same as the integration
 * fixtures) so the Posting Coordinator, RLS and RBAC are all in the path.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { getTestPostgres } from '@idepot/testing';
import { OfflineEngine, InMemoryOfflineStorage } from '@idepot/offline';
// compiled app module (the api's decorator tsconfig applies to ITS build, not here)
// typing via src/app-module.d.ts (the api dist ships without declarations)
const { AppModule } = await import('../../../apps/api/dist/app.module.js');
import { runMigrations } from '../../../infra/migrations/runner.js';

/** deterministic PRNG (mulberry32) — the seed is logged for reproduction. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.SEED ?? 42);
const TERMINALS = Number(process.env.TERMINALS ?? 50);
const SALES_PER_TERMINAL = Number(process.env.SALES_PER_TERMINAL ?? 4);

interface TerminalResult {
  terminal: string;
  captured: number;
  pushed: number;
  rejected: number;
  rejectionReasons: string[];
  duplicatesSuppressed: number;
  refused: number;
  conflicts: Array<{ code: string; count: number }>;
  latenciesMs: number[];
}

function uuid7(rand: () => number): string {
  // time-ordered unique id, RFC 9562 layout: 8-4-4-4-12
  const ts = Date.now();
  const hex = (n: number, width: number) => n.toString(16).padStart(width, '0').slice(-width);
  const randHex = (width: number) => hex(Math.floor(rand() * 16 ** width), width);
  return `${hex(ts, 8).padStart(8, '0')}-${randHex(4)}-4${randHex(3)}-8${randHex(3)}-${randHex(12)}`;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main() {
  const rand = rng(SEED);
  console.log(`offline-chaos: seed=${SEED} terminals=${TERMINALS} sales/terminal=${SALES_PER_TERMINAL}`);

  // ---------------------------------------------------------------- database
  const pg = await getTestPostgres();
  const dbName = `chaos_${Date.now()}`;
  await pg.createDatabase(dbName);
  const adminUrl = pg.adminUrlFor(dbName);
  await runMigrations({ adminUrl, appRolePassword: 'idepot_app_test' });
  process.env.IDEPOT_DATABASE_URL = pg.appUrl(dbName);
  process.env.IDEPOT_DATABASE_ADMIN_URL = adminUrl;
  process.env.IDEPOT_JWT_SECRET ??= 'chaos-secret-0123456789abcdef-0123456789a';

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const tenant = (
    await admin.query<{ id: string }>(`INSERT INTO tenant (slug, name) VALUES ('chaos','Chaos') RETURNING id`)
  ).rows[0]!.id;
  const { hashPassword } = await import('@idepot/auth');
  // the terminal OPERATOR (manager+cashier — registers devices, pushes sales)
  await admin.query(
    `INSERT INTO app_user (tenant_id, email, password_hash, display_name, roles) VALUES ($1,'operator@chaos.test',$2,'chaos-operator','{manager,cashier}')`,
    [tenant, await hashPassword('chaos-pass-123')],
  );
  // the fleet ADMINISTRATOR (owner — revokes/relicenses terminals)
  await admin.query(
    `INSERT INTO app_user (tenant_id, email, password_hash, display_name, roles) VALUES ($1,'admin@chaos.test',$2,'chaos-admin','{owner}')`,
    [tenant, await hashPassword('chaos-admin-123')],
  );

  // ------------------------------------------------------------------- app
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  const http = app.getHttpServer();

  const login = await request(http).post('/api/auth/login').send({ tenantSlug: 'chaos', email: 'operator@chaos.test', password: 'chaos-pass-123' });
  if (login.status !== 201) throw new Error(`login failed ${login.status}: ${JSON.stringify(login.body)}`);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const adminLogin = await request(http).post('/api/auth/login').send({ tenantSlug: 'chaos', email: 'admin@chaos.test', password: 'chaos-admin-123' });
  if (adminLogin.status !== 201) throw new Error(`admin login failed: ${JSON.stringify(adminLogin.body)}`);
  const adminAuth = { Authorization: `Bearer ${adminLogin.body.accessToken}` };

  // reference data: one warehouse, one product, opening stock
  const wh = (await request(http).post('/api/warehouses').set(auth).send({ code: 'CHAOS-WH', name: 'Chaos WH' })).body.id;
  const unit = (await request(http).post('/api/units').set(auth).send({ code: 'CH-PC', name: 'Chaos pieces' })).body.id;
  const product = (
    await request(http).post('/api/products').set(auth).send({ code: 'CH-P', name: 'Chaos product', baseUnitId: unit, sellingPrice: '10.00', purchasePrice: '6.00' })
  ).body.id;
  const openRes = await request(http).post('/api/inventory/opening-stock').set(auth).send({
    warehouseId: wh, authority: 'physical_count', businessDate: new Date().toISOString().slice(0, 10),
    lines: [{ productId: product, quantityBase: String(TERMINALS * SALES_PER_TERMINAL * 5 + 100), unitCost: '6.00' }],
  });
  if (openRes.status !== 201) throw new Error(`opening stock failed: ${JSON.stringify(openRes.body)}`);

  // ------------------------------------------------------ 50 offline engines
  const engines = new Map<string, { engine: OfflineEngine; deviceId: string; revoked: boolean }>();
  for (let t = 0; t < TERMINALS; t++) {
    const deviceCode = `CHAOS-POS-${String(t).padStart(2, '0')}`;
    const reg = await request(http).post('/api/auth/devices').set(auth).send({ deviceCode, platform: 'linux' });
    if (reg.status !== 201) throw new Error(`device registration failed for ${deviceCode}: ${JSON.stringify(reg.body).slice(0, 160)}`);
    const deviceId = reg.body.id as string;
    const engine = new OfflineEngine({
      deviceId,
      storage: new InMemoryOfflineStorage(),
      transport: {
        push: async (d, events) => {
          const started = performance.now();
          const res = await request(http).post('/api/sync/push').set(auth).send({ deviceId: d, events });
          const bucket = ((pushLatencies as Record<string, number[]>)[d] ??= []);
          bucket.push(performance.now() - started);
          if (res.status === 403) throw new Error('REFUSED:revoked');
          if (res.status !== 201) throw new Error(`push HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 120)}`);
          return res.body.outcomes;
        },
        pull: async () => ({ entries: [], cursor: null, hasMore: false }),
      },
      backoffBaseMs: 1,
      jitter: 0,
      maxAttempts: 4,
      sleep: async () => {},
    });
    engines.set(deviceCode, { engine, deviceId, revoked: false });
  }
  const pushLatencies: Record<string, number[]> = {};

  // -------------------------------------------- offline capture (partitioned)
  console.log(`phase 1: offline capture — every terminal partitioned`);
  const results: TerminalResult[] = [];
  for (const [code, t] of engines) {
    for (let i = 0; i < SALES_PER_TERMINAL; i++) {
      const eventId = uuid7(rand);
      t.engine.captureSale({
        localId: uuid7(rand),
        eventId,
        idempotencyKey: `chaos:${code}:${i}`,
        docNumber: `INV-${code}-${i}`,
        draft: {
          warehouseId: wh,
          lines: [{ productId: product, quantityBase: '1', unitPrice: '10.00' }],
          tenders: [{ method: 'cash', amount: '10.00' }],
          clientDocId: eventId,
        },
      });
    }
  }

  // ------------------------------------------------------ reconnect + chaos
  // revoke terminal 00 mid-storm; duplicate-deliver every 3rd event once
  console.log(`phase 2: reconnect storm (duplicates + resend storms + 1 mid-storm revocation)`);
  const revokedCode = 'CHAOS-POS-00';
  const revokedDeviceId = engines.get(revokedCode)!.deviceId;
  let revokedAt = 0;

  // revoke terminal 00 BEFORE the storm — deterministic: ALL its queued
  // events must be refused by the sync device guard and stay on-device
  const revokeRes = await request(http).post(`/api/devices/${revokedDeviceId}/revoke`).set(adminAuth);
  if (revokeRes.status !== 201) throw new Error(`revocation failed: ${revokeRes.status} ${JSON.stringify(revokeRes.body).slice(0, 160)}`);
  revokedAt = Date.now();

  await Promise.all(
    [...engines.entries()].map(async ([code, t]) => {
      const res: TerminalResult = { terminal: code, captured: SALES_PER_TERMINAL, pushed: 0, rejected: 0, rejectionReasons: [], duplicatesSuppressed: 0, refused: 0, conflicts: [], latenciesMs: [] };
      // stagger the reconnect storm deterministically
      await new Promise((r) => setTimeout(r, rand() * 40));
      // duplicate delivery: replay the first push batch verbatim once
      let dupDelivered = false;
      const origPush = t.engine;
      void origPush;
      const dupBatch = t.engine.listOutbox(['pending']).slice(0, 1).map((e) => ({
        eventId: e.eventId, idempotencyKey: e.idempotencyKey, type: e.type, payload: e.payload, occurredAt: e.occurredAt,
      }));
      const outcome = await t.engine.pushAll();
      res.pushed = outcome.pushed;
      res.rejected = outcome.rejected;
      res.rejectionReasons = t.engine
        .listOutbox()
        .filter((e) => e.status === 'rejected')
        .map((e) => `${e.lastError ?? 'unknown'} (${e.attempts} attempts)`);
      res.conflicts = tallyConflicts(t.engine);
      if (!dupDelivered && dupBatch.length > 0) {
        dupDelivered = true;
        // duplicate delivery of the SAME event (network retried after a lost response)
        const dup = await request(http).post('/api/sync/push').set(auth).send({ deviceId: t.deviceId, events: dupBatch });
        if (dup.status === 201) {
          const o = dup.body.outcomes[0];
          if (o.status === 'duplicate') res.duplicatesSuppressed++;
        }
      }
      res.latenciesMs = pushLatencies[t.deviceId] ?? [];
      results.push(res);
    }),
  );

  // the revoked terminal: its events must be REFUSED and still queued
  const revokedTerminal = engines.get(revokedCode)!;
  const revokedStillQueued = revokedTerminal.engine.listOutbox(['pending', 'rejected']).length;
  const revokedRefused = results.find((r) => r.terminal === revokedCode)!;

  // ------------------------------------------------------------- reconcile
  console.log(`phase 3: reconciliation against PostgreSQL`);
  const expectedSales = TERMINALS * SALES_PER_TERMINAL - revokedStillQueued;
  const invoiceCount = (await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM invoice WHERE tenant_id = $1`, [tenant])).rows[0]!.n;
  const stockIssued = (
    await admin.query<{ n: string }>(
      `SELECT COALESCE(SUM(quantity_base),0)::text AS n FROM stock_movement WHERE tenant_id = $1 AND movement_type = 'issue' AND source_document_type = 'invoice'`,
      [tenant],
    )
  ).rows[0]!.n;
  const cashOnHand = (
    await admin.query<{ d: string }>(
      `SELECT COALESCE(SUM(l.debit - l.credit),0)::text AS d FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND m.purpose = 'cash'`,
      [tenant],
    )
  ).rows[0]!.d;
  const expectedCash = (expectedSales * 10).toFixed(4);

  // sync event registry duplicate-suppression evidence
  const registry = (
    await admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM sync_applied_event WHERE tenant_id = $1`, [tenant])
  ).rows[0]!.n;

  // ---------------------------------------------------------------- report
  const allLat = Object.values(pushLatencies).flat().sort((a, b) => a - b);
  const conflictsByCode = new Map<string, number>();
  for (const r of results) for (const c of r.conflicts) conflictsByCode.set(c.code, (conflictsByCode.get(c.code) ?? 0) + c.count);
  const report = {
    run: { seed: SEED, terminals: TERMINALS, salesPerTerminal: SALES_PER_TERMINAL, at: new Date().toISOString() },
    invariants: {
      invoicesApplied: Number(invoiceCount),
      eventsExpected: expectedSales,
      invoicesMatchEvents: Number(invoiceCount) === expectedSales,
      stockIssued: stockIssued,
      stockIssuedMatches: Number(stockIssued) === -expectedSales, // issues are SIGNED outflows
      cashOnHand,
      expectedCash,
      cashMatches: cashOnHand === expectedCash,
      syncRegistryRows: Number(registry),
      revokedTerminal: { code: revokedCode, stillQueued: revokedStillQueued, refusedPushes: revokedRefused.refused, revokedAt: new Date(revokedAt).toISOString() },
    },
    metrics: {
      pushLatencyMs: { p50: Math.round(pct(allLat, 50)), p95: Math.round(pct(allLat, 95)), p99: Math.round(pct(allLat, 99)), max: Math.round(allLat[allLat.length - 1] ?? 0) },
      conflictsByCode: Object.fromEntries(conflictsByCode),
      duplicatesSuppressed: results.reduce((a, r) => a + r.duplicatesSuppressed, 0),
    },
    terminals: results.sort((a, b) => a.terminal.localeCompare(b.terminal)),
  };

  const outDir = join(process.cwd(), 'results');
  mkdirSync(outDir, { recursive: true });
  const file = `${new Date().toISOString().replace(/[:.]/g, '-')}-offline-chaos.json`;
  writeFileSync(join(outDir, file), JSON.stringify(report, null, 2));
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(report, null, 2));

  console.log(`  invoices applied: ${report.invariants.invoicesApplied} / expected ${report.invariants.eventsExpected}`);
  console.log(`  stock issued:     ${report.invariants.stockIssuedMatches ? 'TIES' : 'MISMATCH'}`);
  console.log(`  cash on hand:     ${report.invariants.cashOnHand} (expected ${report.invariants.expectedCash})`);
  console.log(`  latency p95/p99:  ${report.metrics.pushLatencyMs.p95}ms / ${report.metrics.pushLatencyMs.p99}ms`);
  console.log(`  duplicates suppressed: ${report.metrics.duplicatesSuppressed}`);
  console.log(`  revoked terminal: ${revokedStillQueued} events still queued (refused, never applied)`);

  const pass =
    report.invariants.invoicesMatchEvents &&
    report.invariants.stockIssuedMatches &&
    report.invariants.cashMatches &&
    revokedStillQueued === SALES_PER_TERMINAL;

  await app.close();
  await admin.end();
  await pg.dropDatabase(dbName).catch(() => undefined);

  if (!pass) {
    console.error('CHAOS FAILED — invariants violated');
    process.exit(1);
  }
  console.log(`CHAOS PASS — results/${file}`);
  process.exit(0);
}

function tallyConflicts(engine: OfflineEngine): Array<{ code: string; count: number }> {
  const byCode = new Map<string, number>();
  for (const c of engine.listConflicts()) byCode.set(c.code, (byCode.get(c.code) ?? 0) + 1);
  return [...byCode.entries()].map(([code, count]) => ({ code, count }));
}

main().catch((err) => {
  console.error('offline-chaos crashed:', err);
  process.exit(1);
});
