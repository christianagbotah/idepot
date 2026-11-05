/**
 * Phase 4 PERFORMANCE EVIDENCE (scope §15): reproducible benchmarks of the
 * FULL synchronous posting paths — nothing is mocked away. Every measured
 * commit exercises, inside ONE transaction:
 *
 *   GRN posting: PO-less receipt with conversions, AVCO cost layers,
 *     stock ledger + balances + cost state, Dr Inventory / Cr GR-IR journal,
 *     audit + outbox
 *   supplier invoice posting: 3-way match evidence, tax evidence rows,
 *     GRN/PO invoiced counters under row locks, GR/IR clearing + PPV +
 *     recoverable-tax journal, audit + outbox
 *   AP payment: advisory-locked allocations, supplier subledger rows,
 *     Dr AP + Dr advances / Cr tender journal, audit + outbox
 *   trial balance + AP aging: read-path aggregation over the accumulated
 *     journal/subledger volume created by the benchmark itself
 *
 * Reported per scenario: sample size, p50, p95, max, min, mean (ms) plus
 * the full environment context. Results are written to
 * benchmarks/phase4-posting/results/latest.json (committed evidence).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus, totalmem, platform, arch } from 'node:os';
import { createApiFixture, type ApiFixture } from './helpers.js';

const WARMUP = 5;
const SAMPLES = 30;
const ARTIFACT_PATH = join(process.cwd(), 'benchmarks', 'phase4-posting', 'results', 'latest.json');
const TODAY = new Date().toISOString().slice(0, 10);

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
    mean: Number(mean.toFixed(2)),
    unit: 'ms',
  };
}

describe('Phase 4 posting benchmarks (full paths, nothing mocked)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let manager: Record<string, string>;
  let owner: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let supplierS1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const results: Record<string, Stats | { note: string }> = {};

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    manager = auth(fx.tenantA.users.manager!.token!);
    owner = auth(fx.tenantA.users.owner!.token!);
    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'BENCH-WH', name: 'Bench WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'BENCH-PC', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'BENCH-A', name: 'Bench A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    supplierS1 = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'Bench Supplier', phone: '0205555555' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
    try {
      await mkdir(join(dirnameOf(ARTIFACT_PATH)), { recursive: true });
      await writeFile(
        ARTIFACT_PATH,
        JSON.stringify(
          {
            startedAt: new Date().toISOString(),
            environment: {
              platform: platform(),
              arch: arch(),
              cpus: cpus().length,
              cpuModel: cpus()[0]?.model ?? 'unknown',
              totalMemGb: Number((totalmem() / 1024 ** 3).toFixed(1)),
              node: process.version,
              database: 'embedded-postgresql (local)',
              concurrency: 1,
              note: 'local sandbox evidence; CI re-runs the same suite',
            },
            scenarios: results,
          },
          null,
          2,
        ),
      );
      // eslint-disable-next-line no-console
      console.log(`[phase4-bench] results -> ${ARTIFACT_PATH}`);
    } catch {
      // artifact writing must never fail the benchmark
    }
  });

  function dirnameOf(p: string): string {
    const parts = p.split('/');
    parts.pop();
    return parts.join('/');
  }

  it('GRN posting: stock + AVCO + journal in one transaction', async () => {
    const durations: number[] = [];
    let seq = 0;
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      seq += 1;
      const started = performance.now();
      const res = await request(app.getHttpServer())
        .post('/api/purchasing/grns')
        .set(manager)
        .send({
          supplierId: supplierS1,
          warehouseId: whA,
          businessDate: TODAY,
          lines: [{ productId: productA, receivedQuantity: '2', unitCost: '30.00' }],
        });
      const elapsed = performance.now() - started;
      expect(res.status, `grn #${seq} failed: ${JSON.stringify(res.body)}`).toBe(201);
      if (i >= WARMUP) durations.push(elapsed);
    }
    results.grnPosting = statsOf(durations);
    // eslint-disable-next-line no-console
    console.log('[phase4-bench] GRN posting', results.grnPosting);
  });

  it('supplier invoice posting: match + counters + GR/IR + PPV journal', async () => {
    // GRNs prepared upfront (not measured); each invoice consumes one line
    const grnLines: string[] = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const grn = await request(app.getHttpServer())
        .post('/api/purchasing/grns')
        .set(manager)
        .send({
          supplierId: supplierS1,
          warehouseId: whA,
          businessDate: TODAY,
          lines: [{ productId: productA, receivedQuantity: '1', unitCost: '30.00' }],
        });
      expect(grn.status).toBe(201);
      grnLines.push(grn.body.lines[0].id);
    }
    const durations: number[] = [];
    let seq = 0;
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      seq += 1;
      const started = performance.now();
      const res = await request(app.getHttpServer())
        .post('/api/purchasing/supplier-invoices')
        .set(manager)
        .send({
          supplierId: supplierS1,
          supplierInvoiceNumber: `BENCH-SI-${seq}`,
          supplierInvoiceDate: TODAY,
          businessDate: TODAY,
          post: true,
          lines: [{ goodsReceiptLineId: grnLines[i], productId: productA, description: 'bench', quantityBase: '1', unitPrice: '30.00' }],
        });
      const elapsed = performance.now() - started;
      expect(res.status, `invoice #${seq} failed: ${JSON.stringify(res.body)}`).toBe(201);
      if (i >= WARMUP) durations.push(elapsed);
    }
    results.supplierInvoicePosting = statsOf(durations);
    // eslint-disable-next-line no-console
    console.log('[phase4-bench] supplier invoice posting', results.supplierInvoicePosting);
  });

  it('AP payment posting: advisory-locked allocation + journal', async () => {
    // fresh invoices to pay (not measured)
    const invoices: Array<{ id: string }> = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const grn = await request(app.getHttpServer())
        .post('/api/purchasing/grns')
        .set(manager)
        .send({
          supplierId: supplierS1,
          warehouseId: whA,
          businessDate: TODAY,
          lines: [{ productId: productA, receivedQuantity: '1', unitCost: '10.00' }],
        });
      const inv = await request(app.getHttpServer())
        .post('/api/purchasing/supplier-invoices')
        .set(manager)
        .send({
          supplierId: supplierS1,
          supplierInvoiceNumber: `BENCH-PAY-${i}`,
          supplierInvoiceDate: TODAY,
          businessDate: TODAY,
          post: true,
          lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'bench pay', quantityBase: '1', unitPrice: '10.00' }],
        });
      expect(inv.status).toBe(201);
      invoices.push({ id: inv.body.id });
    }
    const durations: number[] = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const started = performance.now();
      const res = await request(app.getHttpServer())
        .post('/api/purchasing/supplier-payments')
        .set(manager)
        .send({
          supplierId: supplierS1,
          businessDate: TODAY,
          amount: '10.00',
          method: 'cash',
          allocations: [{ supplierInvoiceId: invoices[i]!.id, amount: '10.0000' }],
        });
      const elapsed = performance.now() - started;
      expect(res.status).toBe(201);
      if (i >= WARMUP) durations.push(elapsed);
    }
    results.apPaymentPosting = statsOf(durations);
    // eslint-disable-next-line no-console
    console.log('[phase4-bench] AP payment posting', results.apPaymentPosting);
  });

  it('trial balance + AP aging queries on the accumulated volume', async () => {
    const journalCount = (
      await fx.admin.query<{ n: string }>(`SELECT count(*)::text AS n FROM journal_entry WHERE tenant_id = $1`, [
        fx.tenantA.tenantId,
      ])
    ).rows[0]!.n;
    expect(Number(journalCount)).toBeGreaterThan(100); // meaningful volume

    const tbDurations: number[] = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const started = performance.now();
      const res = await request(app.getHttpServer()).get(`/api/accounting/trial-balance?asOf=${TODAY}`).set(owner);
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      expect(res.body.balanced).toBe(true);
      if (i >= WARMUP) tbDurations.push(elapsed);
    }
    results.trialBalanceQuery = { ...statsOf(tbDurations), ...{} };
    // eslint-disable-next-line no-console
    console.log('[phase4-bench] trial balance', results.trialBalanceQuery);

    const agingDurations: number[] = [];
    for (let i = 0; i < WARMUP + SAMPLES; i++) {
      const started = performance.now();
      const res = await request(app.getHttpServer()).get(`/api/ap/aging?asOf=${TODAY}`).set(owner);
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      if (i >= WARMUP) agingDurations.push(elapsed);
    }
    results.apAgingQuery = statsOf(agingDurations);
    // eslint-disable-next-line no-console
    console.log('[phase4-bench] AP aging', results.apAgingQuery);
  });

  it('documents the results (all scenarios measured)', () => {
    expect(results.grnPosting).toBeDefined();
    expect(results.supplierInvoicePosting).toBeDefined();
    expect(results.apPaymentPosting).toBeDefined();
    expect(results.trialBalanceQuery).toBeDefined();
    expect(results.apAgingQuery).toBeDefined();
  });
});
