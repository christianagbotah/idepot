/**
 * Phase 2 inventory invariants (ROADMAP exit criteria):
 *   - on_hand == Σ stock movements (ledger is the only truth; rebuild proves it)
 *   - unit conversion conserves base quantity exactly (box → pieces)
 *   - reversing a movement restores quantity
 *   - tenant A cannot observe or mutate tenant B stock
 *   - a failed Posting Coordinator transaction leaves ZERO partial
 *     ledger/balance/audit/outbox state
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('inventory invariants (Phase 2 exit criteria)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let ownerA: Record<string, string>;
  let ownerB: Record<string, string>;
  let whA: string;
  let whB: string;
  let unitPc: string;
  let unitBox: string;
  let productCement: string; // base PC + conversion BOX = 12
  let productPlain: string; // base PC only

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    ownerA = auth(fx.tenantA.users.owner!.token!);
    ownerB = auth(fx.tenantB.users.owner!.token!);

    const whA1 = await request(app.getHttpServer()).post('/api/warehouses').set(ownerA).send({ code: 'INV-WHA', name: 'Invariant WH A' });
    const whB1 = await request(app.getHttpServer()).post('/api/warehouses').set(ownerA).send({ code: 'INV-WHB', name: 'Invariant WH B' });
    whA = whA1.body.id;
    whB = whB1.body.id;

    unitPc = (await request(app.getHttpServer()).post('/api/units').set(ownerA).send({ code: 'PC', name: 'Piece' })).body.id;
    unitBox = (await request(app.getHttpServer()).post('/api/units').set(ownerA).send({ code: 'BOX', name: 'Box' })).body.id;

    const p1 = await request(app.getHttpServer()).post('/api/products').set(ownerA).send({
      code: 'INV-CEM', name: 'Invariant Cement', baseUnitId: unitPc, sellingPrice: '85.00',
    });
    productCement = p1.body.id;
    await request(app.getHttpServer()).post(`/api/products/${productCement}/units`).set(ownerA).send({
      unitId: unitBox, conversionFactor: '12',
    });
    const p2 = await request(app.getHttpServer()).post('/api/products').set(ownerA).send({
      code: 'INV-PLAIN', name: 'Invariant Plain', baseUnitId: unitPc, sellingPrice: '10.00',
    });
    productPlain = p2.body.id;

    // opening stock: 120 PC cement + 50 PC plain at WH-A
    await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(ownerA).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productCement, quantityBase: '120' },
        { productId: productPlain, quantityBase: '50' },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    // beforeAll may have failed before assigning fx (e.g. embedded PG boot);
    // teardown must not turn a failed setup into a crash on undefined.
    await fx?.close();
  });

  async function balances(token: Record<string, string> | string = ownerA, warehouseId?: string): Promise<Record<string, string>> {
    if (typeof token === 'string') warehouseId = token;
    const wh = warehouseId ?? whA;
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/balances?warehouseId=${wh}`)
      .set(typeof token === 'string' ? ownerA : token);
    expect(res.status).toBe(200);
    return Object.fromEntries(res.body.items.map((b: { productId: string; quantityBase: string }) => [b.productId, b.quantityBase]));
  }

  async function movementCount(productId: string, warehouseId = whA): Promise<number> {
    const res = await fx.admin.query(
      `SELECT count(*)::int n FROM stock_movement WHERE product_id = $1 AND warehouse_id = $2`,
      [productId, warehouseId],
    );
    return Number(res.rows[0]!.n);
  }

  it('cross-unit issue conserves base quantity exactly (2 BOX − 24 PC)', async () => {
    // issue 2 BOX = 24 PC exactly, recorded with the transacted unit
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'issue to site works',
      lines: [{
        productId: productCement,
        quantityBase: '-24',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '12',
      }],
    });
    expect(res.status).toBe(201);
    const bal = await balances();
    expect(bal[productCement]).toBe('96.000000'); // 120 − 24

    // the movement stores BOTH the transacted and base quantities
    const mv = await fx.admin.query(
      `SELECT unit_id, quantity_transacted::text qt, conversion_factor::text cf, quantity_base::text qb
       FROM stock_movement WHERE product_id = $1 ORDER BY occurred_at DESC, created_at DESC LIMIT 1`,
      [productCement],
    );
    expect(mv.rows[0]!.qt).toBe('2.000000');
    expect(mv.rows[0]!.cf).toBe('12.000000');
    expect(mv.rows[0]!.qb).toBe('-24.000000');
    expect(mv.rows[0]!.unit_id).toBe(unitBox);
  });

  it('rejects conversions that do not conserve base exactly (409)', async () => {
    // 1.5 BOX × 12 = 18 exact... use a mismatching pair: 2 BOX claimed as 25 base
    const res = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'fraudulent conversion attempt',
      lines: [{
        productId: productCement,
        quantityBase: '-25',
        unitId: unitBox,
        quantityTransacted: '2',
        conversionFactor: '12',
      }],
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('conversion mismatch');
    // zero partial state
    expect((await balances())[productCement]).toBe('96.000000');
  });

  it('on_hand == Σ movements; rebuild detects and repairs injected drift', async () => {
    // mixed sequence already executed; rebuild dryRun must find ZERO mismatches
    const clean = await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(ownerA).send({ dryRun: true });
    expect(clean.status).toBe(201);
    expect(clean.body.mismatches).toHaveLength(0);

    // inject drift directly (simulates a mutable-column bug from the legacy world)
    await fx.admin.query(`UPDATE stock_balance SET quantity_base = 999 WHERE product_id = $1 AND warehouse_id = $2`, [
      productPlain, whA,
    ]);
    const drifted = await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(ownerA).send({ dryRun: true });
    expect(drifted.body.mismatches).toHaveLength(1);
    expect(drifted.body.mismatches[0].balance).toBe('999.000000');
    expect(drifted.body.mismatches[0].computed).toBe('50.000000');

    // repair: the LEDGER wins, the mutable projection is corrected
    const repaired = await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(ownerA).send({});
    expect(repaired.status).toBe(201);
    expect((await balances())[productPlain]).toBe('50.000000');
    const verified = await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(ownerA).send({ dryRun: true });
    expect(verified.body.mismatches).toHaveLength(0);
  });

  it('reversing an adjustment restores the exact prior quantity (append-only)', async () => {
    const before = (await balances())[productCement];
    const adj = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'damaged goods write-off',
      lines: [{ productId: productCement, quantityBase: '-6' }],
    });
    expect(adj.status).toBe(201);
    const adjId = adj.body.id;
    expect((await balances())[productCement]).toBe('90.000000');

    const rev = await request(app.getHttpServer()).post(`/api/stock-adjustments/${adjId}/reverse`).set(ownerA).send();
    expect(rev.status).toBe(201);
    expect((await balances())[productCement]).toBe(before);

    // the reversal movements reference the originals; ledger is append-only
    const mvs = await fx.admin.query(
      `SELECT movement_type, reversal_of FROM stock_movement
       WHERE source_document_id = $1 ORDER BY movement_type`,
      [rev.body.id],
    );
    expect(mvs.rows[0]!.movement_type).toBe('reversal');
    expect(mvs.rows[0]!.reversal_of).toBeTruthy();

    // double reversal rejected
    const again = await request(app.getHttpServer()).post(`/api/stock-adjustments/${adjId}/reverse`).set(ownerA).send();
    expect(again.status).toBe(409);
  });

  it('tenant A stock is invisible and immutable from tenant B', async () => {
    // B sees no balances and no movements of A
    const balB = await balances(ownerB);
    expect(Object.keys(balB)).toHaveLength(0);
    const mvB = await request(app.getHttpServer()).get(`/api/inventory/movements?productId=${productCement}`).set(ownerB);
    expect(mvB.status).toBe(200);
    expect(mvB.body.items).toHaveLength(0);

    // B cannot mutate A's stock through its own documents
    const adjB = await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerB).send({
      warehouseId: whA, // A's warehouse id smuggled in — RLS + FK scoping must defeat it
      reason: 'cross tenant attack',
      lines: [{ productId: productCement, quantityBase: '-10' }],
    });
    expect([404, 409]).toContain(adjB.status);
    expect((await balances())[productCement]).toBe('96.000000');
  });

  it('failed Posting Coordinator transaction leaves ZERO partial state', async () => {
    // create + dispatch a small transfer, then fail the receive after writes
    const tr = await request(app.getHttpServer()).post('/api/transfers').set(ownerA).send({
      fromWarehouseId: whA,
      toWarehouseId: whB,
      lines: [{ productId: productPlain, quantityBase: '10' }],
    });
    expect(tr.status).toBe(201);
    const transferId = tr.body.id;
    expect((await request(app.getHttpServer()).post(`/api/transfers/${transferId}/dispatch`).set(ownerA).send()).status).toBe(201);
    expect((await balances(whA))[productPlain]).toBe('40.000000');

    // snapshot all participant counts
    const snap = async () => {
      const r = await fx.admin.query(
        `SELECT
           (SELECT count(*) FROM stock_movement WHERE transfer_id = $1)::int mv,
           (SELECT count(*) FROM audit_event WHERE details->>'transferId' = $1::text)::int aud,
           (SELECT count(*) FROM outbox_event WHERE payload->>'transferId' = $1::text)::int outb,
           (SELECT quantity_base::text FROM stock_balance WHERE product_id = $2 AND warehouse_id = $3)::text balB`,
        [transferId, productPlain, whB],
      );
      return r.rows[0]!;
    };
    const before = await snap();

    const fail = await request(app.getHttpServer()).post(`/api/transfers/${transferId}/receive`).set(ownerA).send({
      lines: [{ productId: productPlain, quantityBase: '10' }],
      simulateFailureAfterWrites: true,
    });
    expect(fail.status).toBe(500);

    const after = await snap();
    expect(after.mv).toBe(before.mv); // no transfer_in rows appeared at destination
    expect(after.balB).toBe(before.balB); // destination balance unchanged
    expect(after.aud).toBe(before.aud); // no audit rows
    expect(after.outb).toBe(before.outb); // no outbox rows

    // the same receive WITHOUT the injected failure succeeds and is complete
    const ok = await request(app.getHttpServer()).post(`/api/transfers/${transferId}/receive`).set(ownerA).send({
      lines: [{ productId: productPlain, quantityBase: '10' }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('received');
    expect((await balances(whB))[productPlain]).toBe('10.000000');
    expect((await balances())[productPlain]).toBe('40.000000');
    expect((await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(ownerA).send({ dryRun: true })).body.mismatches).toHaveLength(0);
  });

  it('ledger is append-only at the DB level even for the API role', async () => {
    // covered by the migration guard test; here prove movements accumulate
    const before = await movementCount(productCement);
    await request(app.getHttpServer()).post('/api/stock-adjustments').set(ownerA).send({
      warehouseId: whA,
      reason: 'customer return',
      lines: [{ productId: productCement, quantityBase: '4' }],
    });
    expect(await movementCount(productCement)).toBe(before + 1);
    const bal = await balances();
    expect(bal[productCement]).toBe('100.000000'); // 96 + 4
  });
});
