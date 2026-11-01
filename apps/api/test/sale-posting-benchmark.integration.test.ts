/**
 * Phase 3 PERFORMANCE EVIDENCE (final-review blocker #3): a reproducible
 * benchmark of the FULL synchronous sale-posting path — nothing is mocked
 * away. Every measured commit exercises, inside ONE transaction:
 *
 *   tax resolution + immutable per-component evidence rows (exclusive AND
 *     inclusive treatments, effective-dated version lookup)
 *   AVCO costing (cost layers + stock_cost_state inside the StockPoster's
 *     locked critical section)
 *   stock ledger (movements + balance upserts)
 *   payment + tenders + explicit allocations
 *   credit application consuming a customer deposit (waterfall)
 *   GL journal (balanced entry: revenue, tax payable per component, tender
 *     control accounts, change, AR, deposits consumed, COGS/inventory)
 *   audit event + outbox emission
 *
 * Reported per scenario: sample size, p50, p95, max, min, mean (ms) plus
 * the full environment context. The Phase 3 gate — a normal local sale
 * commit below 1 second — is asserted on p50. Results are ALSO written to
 * benchmarks/sale-posting/results/latest.json (committed evidence, same
 * convention as the orm-bench artifacts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { cpus, totalmem, platform, arch } from 'node:os';
import { createApiFixture, type ApiFixture } from './helpers.js';

const WARMUP = 8;
const SAMPLES = 50;
// vitest runs from the repo root; the artifact follows the committed
// evidence convention of benchmarks/orm-bench
const ARTIFACT_PATH = join(process.cwd(), 'benchmarks', 'sale-posting', 'results', 'latest.json');

interface Stats {
  samples: number;
  warmup: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  unit: 'ms';
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1);
  return sorted[Math.max(idx, 0)]!;
}

function statsOf(durations: number[]): Stats {
  const sorted = [...durations].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    samples: sorted.length,
    warmup: WARMUP,
    min: sorted[0]!,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]!,
    mean: Math.round(mean * 100) / 100,
    unit: 'ms',
  };
}

describe('sale posting benchmark — FULL synchronous path (tax + AVCO + stock + payment/allocation + GL + audit + outbox)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let cashier: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string; // sells 50.00, cost layer 30.0000
  let productB: string; // sells 20.00, cost layer 12.0000
  let customerC: string;
  let depositId: string;
  let pgVersion = 'unknown';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  async function commitSale(body: Record<string, unknown>) {
    return api().post('/api/sales/commit').set(cashier).send(body);
  }

  /** Scenario A — cash sale: 2 lines, mixed tax treatments, cash over-tender
   *  with change. Exercises tax evidence (exclusive + inclusive), AVCO COGS,
   *  stock ledger, payment + tender + allocation, GL journal, audit, outbox. */
  function cashSaleBody(): Record<string, unknown> {
    return {
      warehouseId: whA,
      lines: [
        { productId: productA, quantityBase: '2', unitPrice: '50.00' },
        { productId: productB, quantityBase: '1', unitPrice: '20.00' },
      ],
      tenders: [{ method: 'cash', amount: '130.00' }], // change due back
      clientDocId: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
  }

  /** Scenario B — credit sale settled by deposit credit + part cash, the
   *  remainder staying in AR: adds the credit waterfall (advisory-locked
   *  deposit consumption), explicit allocations and the AR journal lines. */
  function creditSaleBody(): Record<string, unknown> {
    return {
      warehouseId: whA,
      customerId: customerC,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [
        { method: 'credit', amount: '20.00', depositId },
        { method: 'cash', amount: '20.00' },
      ],
      clientDocId: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
  }

  async function runScenario(name: string, body: () => Record<string, unknown>): Promise<Stats> {
    for (let i = 0; i < WARMUP; i++) {
      const res = await commitSale(body());
      expect(res.status, `warmup ${name} #${i}: ${JSON.stringify(res.body)}`).toBe(201);
    }
    const durations: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      const res = await commitSale(body());
      const dt = performance.now() - t0;
      expect(res.status, `sample ${name} #${i}: ${JSON.stringify(res.body)}`).toBe(201);
      durations.push(dt);
    }
    return statsOf(durations);
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    pgVersion = (await fx.admin.query(`SELECT version()`)).rows[0].version as string;

    whA = (await api().post('/api/warehouses').set(owner).send({ code: 'BENCH-WH', name: 'Bench WH' })).body.id;
    unitPc = (await api().post('/api/units').set(owner).send({ code: 'BPC', name: 'Bench Pieces' })).body.id;
    productA = (await api().post('/api/products').set(owner).send({ code: 'BENCH-A', name: 'Bench A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await api().post('/api/products').set(owner).send({ code: 'BENCH-B', name: 'Bench B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    customerC = (await api().post('/api/customers').set(owner).send({ name: 'Bench Customer', phone: '0244000077' })).body.id;

    // cost-bearing opening stock → real AVCO layers (not mocked away)
    const opening = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '600', unitCost: '30.0000' },
        { productId: productB, quantityBase: '400', unitCost: '12.0000' },
      ],
    });
    expect(opening.status).toBe(201);

    // REAL tax configuration: an effective-dated default profile with one
    // EXCLUSIVE and one INCLUSIVE component — every measured sale resolves
    // the version server-side and writes per-component evidence rows
    const profile = await api().post('/api/tax/profiles').set(owner).send({ code: 'BENCH', name: 'Bench Profile', isDefault: true });
    expect(profile.status).toBe(201);
    const version = await api().post(`/api/tax/profiles/${profile.body.id}/versions`).set(owner).send({
      effectiveFrom: '2020-01-01',
      components: [
        { name: 'LEVY-A', rate: '0.075000', inclusive: false, seq: 1 },
        { name: 'CITY', rate: '0.025000', inclusive: true, seq: 2 },
      ],
    });
    expect(version.status).toBe(201);

    // a deposit the credit sales consume (waterfall + GL deposit lines)
    const deposit = await api().post('/api/deposits').set(cashier).send({
      customerId: customerC,
      amount: '3000.00',
      tenders: [{ method: 'cash', amount: '3000.00' }],
    });
    expect(deposit.status).toBe(201);
    depositId = deposit.body.id as string;

    // smoke: one of each scenario must post cleanly WITH full tax evidence —
    // proves nothing on the path is mocked away or silently skipped
    const smokeA = await commitSale(cashSaleBody());
    expect(smokeA.status).toBe(201);
    expect(smokeA.body.invoice.taxComponents).toHaveLength(2);
    expect(smokeA.body.invoice.costTotal).not.toBeNull();
    const smokeB = await commitSale(creditSaleBody());
    expect(smokeB.status).toBe(201);
    expect(smokeB.body.creditApplications).toHaveLength(1);
    const journalCheck = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE source_id = $1 AND source_kind = 'invoice'`, [smokeA.body.invoice.id],
    );
    expect(journalCheck.rows[0].n).toBe(1);
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('FULL cash-sale posting path: p50 < 1000ms with reproducible p50/p95 evidence', async () => {
    const cash = await runScenario('cash-sale', cashSaleBody);

    // Phase 3 gate: a normal local sale commit stays below 1 second
    expect(cash.p50).toBeLessThan(1000);

    console.log(`
┌───────────────────────── sale-posting benchmark (FULL path, nothing mocked) ─────────────────────────┐
│ scenario            │ samples │   p50 │   p95 │   max │   min │  mean │
│ ${'cash sale'.padEnd(19)} │ ${String(cash.samples).padStart(7)} │ ${cash.p50.toFixed(1).padStart(5)} │ ${cash.p95.toFixed(1).padStart(5)} │ ${cash.max.toFixed(1).padStart(5)} │ ${cash.min.toFixed(1).padStart(5)} │ ${cash.mean.toFixed(1).padStart(5)} │
│ (all times in ms; each commit = tax resolution + evidence + AVCO + stock ledger + payment/allocation
│  + credit waterfall (B) + GL journal + audit + outbox, in ONE PG transaction)
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘`);
    // expose for the artifact writer below
    (globalThis as { __benchCash?: Stats }).__benchCash = cash;
  });

  it('FULL credit-sale posting path (deposit credit + part cash + AR): p50 < 1000ms', async () => {
    const credit = await runScenario('credit-sale', creditSaleBody);
    expect(credit.p50).toBeLessThan(1000);

    console.log(`
│ ${'credit sale (dep+AR)'.padEnd(19)} │ ${String(credit.samples).padStart(7)} │ ${credit.p50.toFixed(1).padStart(5)} │ ${credit.p95.toFixed(1).padStart(5)} │ ${credit.max.toFixed(1).padStart(5)} │ ${credit.min.toFixed(1).padStart(5)} │ ${credit.mean.toFixed(1).padStart(5)} │`);
    (globalThis as { __benchCredit?: Stats }).__benchCredit = credit;
  });

  it('writes the reproducible evidence artifact (environment + stats)', async () => {
    const cash = (globalThis as { __benchCash?: Stats }).__benchCash;
    const credit = (globalThis as { __benchCredit?: Stats }).__benchCredit;
    expect(cash).toBeDefined();
    expect(credit).toBeDefined();

    const artifact = {
      benchmark: 'sale-posting (full synchronous path)',
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: `${platform()} ${arch()}`,
        cpu: `${cpus().length}× ${cpus()[0]?.model ?? 'unknown'}`,
        totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
        postgres: pgVersion.split(' on ')[0] ?? pgVersion,
        concurrency: '1 (sequential commits, as a single POS terminal posts)',
        mocked: 'nothing — tax/AVCO/GL/audit/outbox all real and in-transaction',
      },
      scenarios: {
        cashSale: {
          description: '2 lines, exclusive+inclusive tax, cash over-tender with change',
          ...cash,
        },
        creditSale: {
          description: 'customer sale: deposit credit 20 + cash 20, remainder in AR',
          ...credit,
        },
      },
      gate: 'p50 < 1000ms per scenario (Phase 3: a normal local sale commit below 1 second)',
      p50ms: { cashSale: cash!.p50, creditSale: credit!.p50 },
      p95ms: { cashSale: cash!.p95, creditSale: credit!.p95 },
      sampleSize: { cashSale: cash!.samples, creditSale: credit!.samples },
    };

    const path = ARTIFACT_PATH;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`benchmark artifact written: ${path}`);
    console.log(`p50: cash ${cash!.p50.toFixed(1)}ms / credit ${credit!.p50.toFixed(1)}ms — p95: cash ${cash!.p95.toFixed(1)}ms / credit ${credit!.p95.toFixed(1)}ms — samples: ${cash!.samples}+${credit!.samples} (+${WARMUP} warmup each)`);
  });
});
