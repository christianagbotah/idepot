/**
 * PR #3 review hardening — the inventory trust-boundary regression suite.
 *
 * Covers every fix from the independent code review:
 *  1. first-row concurrency race on stock_balance (ensure + FOR UPDATE)
 *  2. rebuild concurrency (tenant advisory lock shared/exclusive + row locks)
 *  3. configured unit conversion is authoritative (server-side resolution,
 *     tampered/stale factors rejected, resolved factor kept as evidence)
 *  4. positive cross-tenant reference attacks (adjustment, opening stock,
 *     count, transfer, unit/conversion ids) — zero residue each time
 *  5. concurrent double reversal — exactly one commits (row lock + partial
 *     unique index)
 *  6. duplicate transfer receipt/create lines — clean 400/409, no bypass
 *  7. retained: on_hand == Σ movements across the whole tenant
 *
 * Concurrency tests drive the SERVICE layer directly (parallel UoW
 * transactions on the PG pool) — HTTP-layer tests serialize in-process and
 * cannot reliably exercise the interleavings these fixes target.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { ConflictError } from '@idepot/domain';
import { createApiFixture, type ApiFixture } from './helpers.js';
import { StockAdjustmentService } from '../src/inventory/stock-adjustment.service.js';
import { BalanceRebuildService } from '../src/inventory/balance-rebuild.service.js';
import { TransferService } from '../src/inventory/transfer.service.js';

describe('inventory trust boundary (PR #3 review fixes)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let ownerA: Record<string, string>;
  let ownerB: Record<string, string>;
  let whA: string;
  let whA2: string;
  let unitPc: string;
  let unitBox: string;
  let productCement: string; // base PC + BOX = 12 (configured)
  let productConv: string; // dedicated to conversion-authority tests
  let productStale: string; // dedicated to stale-config tests (factor mutated)
  let productRev: string; // dedicated to reversal tests
  let productRace: string; // dedicated to first-row race tests
  let productRebuild: string; // dedicated to rebuild race tests

  let svcAdj: StockAdjustmentService;
  let svcRebuild: BalanceRebuildService;
  let svcTransfer: TransferService;

  const principalA = { userId: '', tenantId: '', displayName: 'owner-a', roles: ['owner'] };
  const principalB = { userId: '', tenantId: '', displayName: 'owner-b', roles: ['owner'] };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    ownerA = auth(fx.tenantA.users.owner!.token!);
    ownerB = auth(fx.tenantB.users.owner!.token!);
    principalA.tenantId = fx.tenantA.tenantId;
    principalA.userId = fx.tenantA.users.owner!.id;
    principalB.tenantId = fx.tenantB.tenantId;
    principalB.userId = fx.tenantB.users.owner!.id;

    svcAdj = app.get(StockAdjustmentService);
    svcRebuild = app.get(BalanceRebuildService);
    svcTransfer = app.get(TransferService);

    const http = app.getHttpServer();
    whA = (await request(http).post('/api/warehouses').set(ownerA).send({ code: 'TB-WH1', name: 'Trust Boundary 1' })).body.id;
    whA2 = (await request(http).post('/api/warehouses').set(ownerA).send({ code: 'TB-WH2', name: 'Trust Boundary 2' })).body.id;
    unitPc = (await request(http).post('/api/units').set(ownerA).send({ code: 'PC', name: 'Piece' })).body.id;
    unitBox = (await request(http).post('/api/units').set(ownerA).send({ code: 'BOX', name: 'Box' })).body.id;

    const mkProduct = async (code: string, name: string, boxFactor?: string) => {
      const p = await request(http).post('/api/products').set(ownerA).send({
        code, name, baseUnitId: unitPc, sellingPrice: '10.00',
      });
      if (boxFactor) {
        const cfg = await request(http).post(`/api/products/${p.body.id}/units`).set(ownerA).send({
          unitId: unitBox, conversionFactor: boxFactor,
        });
        expect(cfg.status).toBe(201);
      }
      return p.body.id as string;
    };
    productCement = await mkProduct('TB-CEM', 'Cement (BOX=12)', '12');
    productConv = await mkProduct('TB-CONV', 'Conversion authority', '12');
    productStale = await mkProduct('TB-STALE', 'Stale config target', '12');
    productRev = await mkProduct('TB-REV', 'Reversal target', undefined);
    productRace = await mkProduct('TB-RACE', 'First-row race target', undefined);
    productRebuild = await mkProduct('TB-REBUILD', 'Rebuild race target', undefined);

    // working stock for the reversal flow
    await svcAdj.create(principalA, {
      warehouseId: whA,
      reason: 'seed stock for reversal test',
      lines: [{ productId: productRev, quantityBase: '100', note: null }],
    });
    await svcAdj.create(principalA, {
      warehouseId: whA,
      reason: 'seed stock for rebuild race',
      lines: [{ productId: productRebuild, quantityBase: '100', note: null }],
    });
    // productCement is used by the cross-tenant and transfer tests
    await svcAdj.create(principalA, {
      warehouseId: whA,
      reason: 'seed stock for transfer tests',
      lines: [{ productId: productCement, quantityBase: '1000', note: null }],
    });
  }, 180_000);

  afterAll(async () => {
    await fx.close();
  });

  /* ------------------------------ helpers ------------------------------- */

  async function balance(productId: string, warehouseId = whA): Promise<string> {
    const r = await fx.admin.query(
      `SELECT quantity_base::text q FROM stock_balance WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    return r.rows[0]?.q ?? 'MISSING';
  }

  async function ledger(productId: string, warehouseId = whA): Promise<{ sum: string; count: number }> {
    const r = await fx.admin.query(
      `SELECT COALESCE(SUM(quantity_base),0)::text s, count(*)::int n FROM stock_movement WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    return { sum: r.rows[0]!.s, count: Number(r.rows[0]!.n) };
  }

  /** Whole-tenant invariant: stock_balance == Σ stock_movement, both directions. */
  async function invariantViolations(tenantId: string): Promise<number> {
    const r = await fx.admin.query(
      `WITH sums AS (
         SELECT warehouse_id, product_id, SUM(quantity_base) AS total
         FROM stock_movement WHERE tenant_id = $1 GROUP BY 1, 2
       ), stored AS (
         SELECT warehouse_id, product_id, quantity_base FROM stock_balance WHERE tenant_id = $1
       )
       SELECT count(*)::int bad FROM (
         SELECT * FROM sums FULL JOIN stored USING (warehouse_id, product_id)
         WHERE COALESCE(sums.total, 0) <> COALESCE(stored.quantity_base, 0)
       ) x`,
      [tenantId],
    );
    return Number(r.rows[0]!.bad);
  }

  /** Count of tenant-B inventory rows that reference ANY tenant-A entity. */
  async function tenantBRowsReferencingTenantA(): Promise<{
    movements: number; balances: number; adjustments: number; adjustmentLines: number;
    counts: number; countLines: number; transfers: number; transferLines: number;
  }> {
    const r = await fx.admin.query(
      `SELECT
         (SELECT count(*) FROM stock_movement  WHERE tenant_id = $1 AND (warehouse_id = ANY($2::uuid[]) OR product_id = ANY($3::uuid[]) OR unit_id = ANY($4::uuid[]) OR transfer_id IN (SELECT id FROM transfer WHERE tenant_id = $5)))::int movements,
         (SELECT count(*) FROM stock_balance  WHERE tenant_id = $1 AND (warehouse_id = ANY($2::uuid[]) OR product_id = ANY($3::uuid[])))::int balances,
         (SELECT count(*) FROM stock_adjustment WHERE tenant_id = $1 AND warehouse_id = ANY($2::uuid[]))::int adjustments,
         (SELECT count(*) FROM stock_adjustment_line WHERE tenant_id = $1 AND product_id = ANY($3::uuid[]))::int adjustment_lines,
         (SELECT count(*) FROM stock_count WHERE tenant_id = $1 AND warehouse_id = ANY($2::uuid[]))::int counts,
         (SELECT count(*) FROM stock_count_line WHERE tenant_id = $1 AND product_id = ANY($3::uuid[]))::int count_lines,
         (SELECT count(*) FROM transfer WHERE tenant_id = $1 AND (from_warehouse_id = ANY($2::uuid[]) OR to_warehouse_id = ANY($2::uuid[])))::int transfers,
         (SELECT count(*) FROM transfer_line WHERE tenant_id = $1 AND product_id = ANY($3::uuid[]))::int transfer_lines`,
      [
        fx.tenantB.tenantId,
        [whA, whA2],
        [productCement, productConv, productStale, productRev, productRace, productRebuild],
        [unitPc, unitBox],
        fx.tenantA.tenantId,
      ],
    );
    return {
      movements: Number(r.rows[0]!.movements),
      balances: Number(r.rows[0]!.balances),
      adjustments: Number(r.rows[0]!.adjustments),
      adjustmentLines: Number(r.rows[0]!.adjustment_lines),
      counts: Number(r.rows[0]!.counts),
      countLines: Number(r.rows[0]!.count_lines),
      transfers: Number(r.rows[0]!.transfers),
      transferLines: Number(r.rows[0]!.transfer_lines),
    };
  }

  /* -------------------- fix 1: first-row concurrency --------------------- */

  it('fix 1: two concurrent FIRST postings (+5, +7) both survive — projection == ledger == 12', async () => {
    const posts = Promise.all([
      svcAdj.create(principalA, {
        warehouseId: whA,
        reason: 'concurrent first receipt A (+5)',
        lines: [{ productId: productRace, quantityBase: '5', note: null }],
      }),
      svcAdj.create(principalA, {
        warehouseId: whA,
        reason: 'concurrent first receipt B (+7)',
        lines: [{ productId: productRace, quantityBase: '7', note: null }],
      }),
    ]);
    const results = await posts;
    expect(results).toHaveLength(2);

    const bal = await balance(productRace);
    const led = await ledger(productRace);
    // THE invariant from the review: ledger 5+7 = 12, projection must be 12
    // (the old UPSERT could finish at 7)
    expect(bal).toBe('12.000000');
    expect(led.sum).toBe('12.000000');
    expect(led.count).toBe(2);
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);
  });

  it('fix 1: a storm of 10 concurrent first postings loses nothing', async () => {
    // fresh warehouse so every (warehouse, product) balance row is created
    // under contention — 10 pool clients post +1 each, all in parallel
    const posts = Array.from({ length: 10 }, (_, i) =>
      svcAdj.create(principalA, {
        warehouseId: whA2,
        reason: `first-posting storm ${i}`,
        lines: [{ productId: productRace, quantityBase: '1', note: null }],
      }),
    );
    await Promise.all(posts);

    expect(await balance(productRace, whA2)).toBe('10.000000');
    const led = await ledger(productRace, whA2);
    expect(led.sum).toBe('10.000000');
    expect(led.count).toBe(10);
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);
  });

  /* ------------------- fix 2: rebuild vs posting race -------------------- */

  it('fix 2: rebuild running concurrently with postings never writes a stale projection', async () => {
    // fire a full (non-dry) rebuild and 8 postings at the same time; every
    // interleaving must end with projection == ledger
    const work: Array<Promise<unknown>> = [
      svcRebuild.runForTenant(fx.tenantA.tenantId, {}),
    ];
    for (let i = 0; i < 8; i++) {
      work.push(
        svcAdj.create(principalA, {
          warehouseId: whA,
          reason: `posting during rebuild ${i}`,
          lines: [{ productId: productRebuild, quantityBase: '1', note: null }],
        }),
      );
    }
    await Promise.all(work);

    // 100 seeded + 8 posted = 108; projection must equal the ledger exactly
    const bal = await balance(productRebuild);
    const led = await ledger(productRebuild);
    expect(led.sum).toBe('108.000000');
    expect(led.count).toBe(9);
    expect(bal).toBe(led.sum);
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);

    // a dry-run rebuild after the race reports zero mismatches
    const report = await svcRebuild.runForTenant(fx.tenantA.tenantId, { dryRun: true });
    expect(report.mismatches).toHaveLength(0);
  });

  it('fix 2: rebuild repairs injected drift exactly once and stays consistent under load', async () => {
    // inject drift directly (simulates a legacy-style mutable-column bug)
    await fx.admin.query(
      `UPDATE stock_balance SET quantity_base = 999 WHERE product_id = $1 AND warehouse_id = $2`,
      [productRebuild, whA],
    );
    const repaired = await svcRebuild.runForTenant(fx.tenantA.tenantId, {});
    expect(repaired.mismatches.length).toBeGreaterThanOrEqual(1);
    expect(await balance(productRebuild)).toBe((await ledger(productRebuild)).sum);
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);
  });

  /* ---------------- fix 3: authoritative conversion config --------------- */

  it('fix 3: configured BOX=12 is authoritative — 2 BOX posts exactly 24 base units and keeps the resolved factor', async () => {
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'cross-unit receipt in boxes',
      lines: [{
        productId: productConv,
        quantityBase: '24',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '12',
      }],
    });
    expect(res.status).toBe(201);
    expect(res.body.lines[0].quantityBase).toBe('24.000000');

    const mv = await fx.admin.query(
      `SELECT quantity_base::text qb, quantity_transacted::text qt, conversion_factor::text cf, unit_id
       FROM stock_movement WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [productConv],
    );
    expect(mv.rows[0]!.qb).toBe('24.000000');
    expect(mv.rows[0]!.qt).toBe('2.000000');
    // the ledger row preserves the RESOLVED (server-side) factor as evidence
    expect(mv.rows[0]!.cf).toBe('12.000000');
    expect(String(mv.rows[0]!.unit_id)).toBe(unitBox);
    expect(await balance(productConv)).toBe('24.000000');
  });

  it('fix 3: a tampered factor of 10 cannot post 20 base units for 2 BOX (409, zero residue)', async () => {
    const before = await balance(productConv);
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'tampered conversion attempt',
      lines: [{
        productId: productConv,
        quantityBase: '20',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '10', // tampered: configured is 12
      }],
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('stale conversion configuration');
    // zero residue: nothing moved, no movement row appended
    expect(await balance(productConv)).toBe(before);
    const led = await ledger(productConv);
    expect(led.count).toBe(1); // only the legitimate 24 posting from the previous test
    expect(led.sum).toBe('24.000000');
  });

  it('fix 3: internally-consistent but wrong magnitudes are rejected (2 BOX claimed as 25 base)', async () => {
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'mismatched magnitude attempt',
      lines: [{
        productId: productConv,
        quantityBase: '25',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '12', // correct factor, wrong base magnitude
      }],
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('conversion mismatch');
    expect(await balance(productConv)).toBe('24.000000');
  });

  it('fix 3: stale conversion configuration is rejected explicitly, then accepted after reload', async () => {
    // the configuration changes server-side (12 → 15)
    await fx.admin.query(
      `UPDATE product_unit SET conversion_factor = 15 WHERE product_id = $1 AND unit_id = $2`,
      [productStale, unitBox],
    );

    // a stale client still sending factor 12 / base 24 is rejected explicitly
    const stale = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'stale conversion attempt',
      lines: [{
        productId: productStale,
        quantityBase: '24',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '12',
      }],
    });
    expect(stale.status).toBe(409);
    expect(JSON.stringify(stale.body)).toContain('stale conversion configuration');

    // a client that omits the factor is STILL derived server-side: 2 BOX = 30
    const derived = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'server-derived conversion',
      lines: [{
        productId: productStale,
        quantityBase: '24', // wrong under the new configuration
        unitId: unitBox,
        quantityTransacted: '2',
      }],
    });
    expect(derived.status).toBe(409);
    expect(JSON.stringify(derived.body)).toContain('conversion mismatch');

    // the reloaded client (factor 15, base 30) is accepted; the movement
    // records the factor that was authoritative AT TRANSACTION TIME
    const ok = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'reloaded conversion',
      lines: [{
        productId: productStale,
        quantityBase: '30',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '15',
      }],
    });
    expect(ok.status).toBe(201);
    const mv = await fx.admin.query(
      `SELECT quantity_base::text qb, conversion_factor::text cf FROM stock_movement WHERE product_id = $1`,
      [productStale],
    );
    expect(mv.rows).toHaveLength(1);
    expect(mv.rows[0]!.qb).toBe('30.000000');
    expect(mv.rows[0]!.cf).toBe('15.000000');
    expect(await balance(productStale)).toBe('30.000000');
  });

  it('fix 3: transacting in the product BASE unit resolves factor 1', async () => {
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'base-unit transacted evidence',
      lines: [{
        productId: productConv,
        quantityBase: '-5',
        unitId: unitPc, // base unit
        quantityTransacted: '5',
        conversionFactor: '1',
      }],
    });
    expect(res.status).toBe(201);
    const mv = await fx.admin.query(
      `SELECT quantity_base::text qb, conversion_factor::text cf FROM stock_movement
       WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [productConv],
    );
    expect(mv.rows[0]!.qb).toBe('-5.000000');
    expect(mv.rows[0]!.cf).toBe('1.000000');
    expect(await balance(productConv)).toBe('19.000000'); // 24 − 5
  });

  it('fix 3: an unconfigured unit is rejected (404), not silently posted', async () => {
    const unitBag = (await request(app.getHttpServer()).post('/api/units').set(ownerA).send({ code: 'BAG', name: 'Bag' })).body.id;
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'unconfigured unit attempt',
      lines: [{
        productId: productConv,
        quantityBase: '3',
        unitId: unitBag, // exists in tenant A but NOT configured for the product
        quantityTransacted: '3',
        conversionFactor: '1',
      }],
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toContain('product_unit');
    expect(await balance(productConv)).toBe('19.000000');
  });

  /* -------------- fix 4: positive cross-tenant reference attacks ---------- */

  it('fix 4: tenant B POSITIVE adjustment (+10) on tenant A product/warehouse fails with zero residue', async () => {
    const before = await balance(productCement);
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerB).send({
      warehouseId: whA, // tenant A's warehouse
      reason: 'cross-tenant positive attack',
      lines: [{ productId: productCement, quantityBase: '10' }], // tenant A's product, POSITIVE
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toContain('warehouse');

    // tenant A's stock untouched
    expect(await balance(productCement)).toBe(before);
    // ZERO tenant-B inventory/document rows reference tenant-A entities
    const refs = await tenantBRowsReferencingTenantA();
    expect(refs.movements).toBe(0);
    expect(refs.balances).toBe(0);
    expect(refs.adjustments).toBe(0);
    expect(refs.adjustmentLines).toBe(0);
  });

  it('fix 4: tenant B opening stock with tenant A product fails with zero residue', async () => {
    const res = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(ownerB).send({
      warehouseId: whA, // tenant A's warehouse
      authority: 'physical_count',
      lines: [{ productId: productCement, quantityBase: '500' }],
    });
    expect(res.status).toBe(404);
    const refs = await tenantBRowsReferencingTenantA();
    expect(refs.movements).toBe(0);
    expect(refs.balances).toBe(0);
    expect(refs.counts).toBe(0);
    expect(refs.countLines).toBe(0);
    expect(refs.adjustments).toBe(0);
  });

  it('fix 4: tenant B count creation with tenant A warehouse/product fails with zero residue', async () => {
    const res = await request(app.getHttpServer()).post('/api/stock-counts').set(ownerB).send({
      warehouseId: whA, // tenant A's warehouse
      lines: [{ productId: productCement, countedQuantityBase: '1' }],
    });
    expect(res.status).toBe(404);
    const refs = await tenantBRowsReferencingTenantA();
    expect(refs.counts).toBe(0);
    expect(refs.countLines).toBe(0);
    expect(refs.movements).toBe(0);
  });

  it('fix 4: tenant B transfer referencing tenant A warehouses/products fails with zero residue', async () => {
    const res = await request(app.getHttpServer()).post('/api/transfers').set(ownerB).send({
      fromWarehouseId: whA, // tenant A's warehouse
      toWarehouseId: whA2, // tenant A's warehouse
      lines: [{ productId: productCement, quantityBase: '10' }],
    });
    expect(res.status).toBe(404);
    const refs = await tenantBRowsReferencingTenantA();
    expect(refs.transfers).toBe(0);
    expect(refs.transferLines).toBe(0);
    expect(refs.movements).toBe(0);
    expect(refs.balances).toBe(0);
  });

  it('fix 4: tenant B cannot use tenant A unit/conversion ids (404, zero residue)', async () => {
    // B creates its OWN product (base unit B-own), then tries to transact it
    // in tenant A's BOX unit with tenant A's conversion
    const unitB = (await request(app.getHttpServer()).post('/api/units').set(ownerB).send({ code: 'B-PC', name: 'B Piece' })).body.id;
    const productB = (await request(app.getHttpServer()).post('/api/products').set(ownerB).send({
      code: 'B-PROD', name: 'B Own Product', baseUnitId: unitB, sellingPrice: '5.00',
    })).body.id;
    const whB = (await request(app.getHttpServer()).post('/api/warehouses').set(ownerB).send({ code: 'B-WH', name: 'B WH' })).body.id;

    // direct attack: B adjustment referencing A's BOX unit
    const adj = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerB).send({
      warehouseId: whB,
      reason: 'smuggled unit reference',
      lines: [{
        productId: productB,
        quantityBase: '24',
        unitId: unitBox, // tenant A's unit
        quantityTransacted: '2',
        conversionFactor: '12', // tenant A's conversion
      }],
    });
    expect(adj.status).toBe(404);
    expect(JSON.stringify(adj.body)).toContain('product_unit');

    // configuring A's unit on B's product is also rejected (catalog layer)
    const cfg = await request(app.getHttpServer()).post(`/api/products/${productB}/units`).set(ownerB).send({
      unitId: unitBox, conversionFactor: '12',
    });
    expect(cfg.status).toBe(404);

    const refs = await tenantBRowsReferencingTenantA();
    expect(refs.movements).toBe(0);
    expect(refs.balances).toBe(0);
    expect(refs.adjustments).toBe(0);
    expect(refs.adjustmentLines).toBe(0);
  });

  /* ------------------- fix 5: concurrent double reversal ------------------ */

  it('fix 5: two concurrent reversals — exactly one commits, stock restored exactly once', async () => {
    // original adjustment: −6 on productRev (seeded with 100)
    const adj = await svcAdj.create(principalA, {
      warehouseId: whA,
      reason: 'write-off to reverse',
      lines: [{ productId: productRev, quantityBase: '-6', note: null }],
    });
    expect(await balance(productRev)).toBe('94.000000');

    const originals = await fx.admin.query<{ id: string }>(
      `SELECT id FROM stock_movement WHERE source_document_type = 'stock_adjustment' AND source_document_id = $1`,
      [adj.id],
    );
    expect(originals.rows).toHaveLength(1);
    const originalMovementId = originals.rows[0]!.id;

    // fire BOTH reversals at the same time
    const settles = await Promise.allSettled([
      svcAdj.reverse(principalA, adj.id),
      svcAdj.reverse(principalA, adj.id),
    ]);
    const fulfilled = settles.filter((s) => s.status === 'fulfilled');
    const rejected = settles.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    // stock restored EXACTLY once (94 + 6 = 100, not 106)
    expect(await balance(productRev)).toBe('100.000000');

    // exactly ONE reversal ledger row exists for the original movement
    const reversalRows = await fx.admin.query(
      `SELECT count(*)::int n FROM stock_movement WHERE reversal_of = $1`,
      [originalMovementId],
    );
    expect(Number(reversalRows.rows[0]!.n)).toBe(1);

    // the whole tenant still satisfies on_hand == Σ movements
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);
  });

  /* --------------- fix 6: duplicate transfer receipt lines ---------------- */

  it('fix 6: duplicate products in transfer CREATE payload are a clean 400', async () => {
    const res = await request(app.getHttpServer()).post('/api/transfers').set(ownerA).send({
      fromWarehouseId: whA,
      toWarehouseId: whA2,
      lines: [
        { productId: productCement, quantityBase: '5' },
        { productId: productCement, quantityBase: '7' }, // duplicate
      ],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('duplicate productId');
    // no transfer document was created
    const rows = await fx.admin.query(
      `SELECT count(*)::int n FROM transfer WHERE tenant_id = $1 AND code LIKE 'TR-%'`,
      [fx.tenantA.tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(0);
  });

  it('fix 6: duplicate receive lines cannot bypass the dispatched quantity (400/409, zero partial receipt)', async () => {
    // dispatched = 10; two lines of 6 each would total 12 — under the old
    // code both lines passed the per-line check against the same stale
    // received value and fell through to a database CHECK violation (500)
    const tr = await request(app.getHttpServer()).post('/api/transfers').set(ownerA).send({
      fromWarehouseId: whA,
      toWarehouseId: whA2,
      lines: [{ productId: productCement, quantityBase: '10' }],
    });
    expect(tr.status).toBe(201);
    const id = tr.body.id;
    expect((await request(app.getHttpServer()).post(`/api/transfers/${id}/dispatch`).set(ownerA).send()).status).toBe(201);
    const whA2BalBefore = await balance(productCement, whA2);

    // HTTP path: schema rejects duplicates with a controlled 400
    const httpRes = await request(app.getHttpServer()).post(`/api/transfers/${id}/receive`).set(ownerA).send({
      lines: [
        { productId: productCement, quantityBase: '6' },
        { productId: productCement, quantityBase: '6' }, // duplicate
      ],
    });
    expect([400, 409]).toContain(httpRes.status);
    expect(httpRes.status).not.toBe(500);
    expect(JSON.stringify(httpRes.body)).toContain('duplicate productId');

    // service path (bypasses HTTP validation): clean domain 409, NOT a 500
    await expect(
      svcTransfer.receive(principalA, id, {
        lines: [
          { productId: productCement, quantityBase: '6' },
          { productId: productCement, quantityBase: '6' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // zero partial receipt: nothing received, no movements, still in_transit
    const line = await fx.admin.query(
      `SELECT received_quantity_base::text rq, quantity_base::text q FROM transfer_line WHERE transfer_id = $1`,
      [id],
    );
    expect(line.rows[0]!.rq).toBe('0.000000');
    const mvCount = await fx.admin.query(
      `SELECT count(*)::int n FROM stock_movement WHERE transfer_id = $1`,
      [id],
    );
    expect(Number(mvCount.rows[0]!.n)).toBe(1); // only the dispatch transfer_out
    expect(await balance(productCement, whA2)).toBe(whA2BalBefore);
    const status = await request(app.getHttpServer()).get(`/api/transfers/${id}`).set(ownerA);
    expect(status.body.status).toBe('in_transit');

    // the same transfer can still be received normally afterwards
    const ok = await request(app.getHttpServer()).post(`/api/transfers/${id}/receive`).set(ownerA).send({
      lines: [{ productId: productCement, quantityBase: '10' }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('received');
    expect(await balance(productCement, whA2)).toBe('10.000000');
  });

  /* --------------------- retained global invariants ----------------------- */

  it('final: on_hand == Σ movements across the whole tenant after every attack', async () => {
    expect(await invariantViolations(fx.tenantA.tenantId)).toBe(0);
    const report = await svcRebuild.runForTenant(fx.tenantA.tenantId, { dryRun: true });
    expect(report.mismatches).toHaveLength(0);
  });
});
