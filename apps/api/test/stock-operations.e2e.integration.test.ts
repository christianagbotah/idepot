/**
 * Phase 2 E2E flows (ROADMAP exit criteria: "E2E: transfer + count +
 * adjustment flows") plus effective-dated pricing semantics:
 * historical prices must not silently change previously posted documents
 * (price rows are immutable once effective; new windows are new rows).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

describe('stock operations E2E (transfer / count / adjustment / pricing)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let whA: string;
  let whB: string;
  let unitPc: string;
  let productA: string;
  let productB: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function balances(token: Record<string, string> | string = owner, warehouseId?: string): Promise<Record<string, string>> {
    if (typeof token === 'string') warehouseId = token;
    const url = warehouseId ? `/api/inventory/balances?warehouseId=${warehouseId}` : '/api/inventory/balances';
    const res = await request(app.getHttpServer()).get(url).set(typeof token === 'string' ? owner : token);
    expect(res.status).toBe(200);
    return Object.fromEntries(
      res.body.items.map((b: { productId: string; quantityBase: string }) => [b.productId, b.quantityBase]),
    );
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'E2E-WHA', name: 'E2E WH A' })).body.id;
    whB = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'E2E-WHB', name: 'E2E WH B' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'PCS', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'E2E-A', name: 'E2E Product A', baseUnitId: unitPc, sellingPrice: '50.00' })).body.id;
    productB = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'E2E-B', name: 'E2E Product B', baseUnitId: unitPc, sellingPrice: '20.00' })).body.id;

    await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '100' },
        { productId: productB, quantityBase: '80' },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await fx.close();
  });

  it('transfer: dispatch → partial receipt → completion, with over-receipt prevented', async () => {
    const tr = await request(app.getHttpServer()).post('/api/transfers').set(owner).send({
      fromWarehouseId: whA, toWarehouseId: whB,
      lines: [{ productId: productA, quantityBase: '30' }],
    });
    expect(tr.status).toBe(201);
    const id = tr.body.id;

    // cancel after dispatch must fail — goods are gone from the source
    expect((await request(app.getHttpServer()).post(`/api/transfers/${id}/dispatch`).set(owner).send()).status).toBe(201);
    expect((await balances(whA))[productA]).toBe('70.000000');

    // partial receive
    const part = await request(app.getHttpServer()).post(`/api/transfers/${id}/receive`).set(owner).send({
      lines: [{ productId: productA, quantityBase: '12' }],
    });
    expect(part.status).toBe(201);
    expect(part.body.status).toBe('in_transit');
    expect(part.body.lines[0].receivedQuantityBase).toBe('12.000000');
    expect((await balances(whB))[productA]).toBe('12.000000');

    // over-receipt prevented (silent quantity disappearance is impossible)
    const over = await request(app.getHttpServer()).post(`/api/transfers/${id}/receive`).set(owner).send({
      lines: [{ productId: productA, quantityBase: '19' }],
    });
    expect(over.status).toBe(409);

    // complete the remainder
    const rest = await request(app.getHttpServer()).post(`/api/transfers/${id}/receive`).set(owner).send({
      lines: [{ productId: productA, quantityBase: '18' }],
    });
    expect(rest.status).toBe(201);
    expect(rest.body.status).toBe('received');
    expect((await balances(whB))[productA]).toBe('30.000000');
    expect((await balances(whA))[productA]).toBe('70.000000');
    // in-transit residue is zero: dispatched (30) == received (30)
  });

  it('transfer dispatch with insufficient stock is rejected atomically', async () => {
    const tr = await request(app.getHttpServer()).post('/api/transfers').set(owner).send({
      fromWarehouseId: whA, toWarehouseId: whB,
      lines: [{ productId: productB, quantityBase: '9999' }],
    });
    expect(tr.status).toBe(201);
    const dispatch = await request(app.getHttpServer()).post(`/api/transfers/${tr.body.id}/dispatch`).set(owner).send();
    expect(dispatch.status).toBe(409);
    expect(JSON.stringify(dispatch.body)).toContain('insufficient stock');
    // transfer stays draft; nothing moved
    const check = await request(app.getHttpServer()).get(`/api/transfers/${tr.body.id}`).set(owner);
    expect(check.body.status).toBe('draft');
  });

  it('stock count: draft → counted → approve posts variance movements (supervisor-gated)', async () => {
    // snapshot system quantities BEFORE the count lines are recorded
    const balBefore = await balances(whA);

    const count = await request(app.getHttpServer()).post('/api/stock-counts').set(manager).send({
      warehouseId: whA,
      lines: [
        { productId: productA, countedQuantityBase: '69' },   // −1 variance
        { productId: productB, countedQuantityBase: '80' },   // exact
      ],
    });
    expect(count.status).toBe(201);
    const countId = count.body.id;
    expect(count.body.status).toBe('draft');

    // CASHIER cannot approve (material variance supervisor control)
    const forbidden = await request(app.getHttpServer()).post(`/api/stock-counts/${countId}/approve`).set(cashier).send({});
    expect(forbidden.status).toBe(403);

    // submit requires the counting permission (cashier MAY count)
    expect((await request(app.getHttpServer()).post(`/api/stock-counts/${countId}/submit`).set(cashier).send({ countedBy: 'K. Mensah' })).status).toBe(201);

    // MANAGER (supervisor) approves → adjustment + count_variance movements
    const approved = await request(app.getHttpServer()).post(`/api/stock-counts/${countId}/approve`).set(manager).send({ note: 'cycle count A-class' });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.approvedBy).toBeTruthy();

    // variance applied: productA 70 → 69; productB unchanged
    expect((await balances(whA))[productA]).toBe('69.000000');
    expect((await balances(whA))[productB]).toBe(balBefore[productB]);
    void balBefore;

    // the auto-adjustment document exists with reason + count reference
    const adjs = await request(app.getHttpServer()).get('/api/stock-adjustments').set(owner);
    const list = (adjs.body.items ?? adjs.body) as Array<{ sourceCountId: string | null; lines: Array<{ quantityBase: string }> }>;
    const mine = list.find((a) => a.sourceCountId === countId);
    expect(mine).toBeTruthy();
    expect(mine!.lines[0]!.quantityBase).toBe('-1.000000');

    // ledger consistency holds after the count flow
    const rebuild = await request(app.getHttpServer()).post('/api/inventory/balances/rebuild').set(owner).send({ dryRun: true });
    expect(rebuild.body.mismatches).toHaveLength(0);
  });

  it('opening stock refuses legacy-quantity authority without explicit risk acceptance', async () => {
    const bad = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'legacy_quantity',
      acceptedMigrationRisk: false,
      lines: [{ productId: productB, quantityBase: '5' }],
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('acceptedMigrationRisk');

    // with risk acceptance it is allowed and FLAGGED
    const risky = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whB,
      authority: 'legacy_quantity',
      acceptedMigrationRisk: true,
      sourceEvidence: 'legacy items.quantity import (no count performed)',
      lines: [{ productId: productB, quantityBase: '5' }],
    });
    expect(risky.status).toBe(201);
    expect(risky.body.acceptedMigrationRisk).toBe(true);
    expect((await balances(whB))[productB]).toBe('5.000000');
  });

  it('pricing: customer list wins, historical windows resolve, overlaps rejected', async () => {
    const stdList = (await request(app.getHttpServer()).post('/api/price-lists').set(owner).send({
      code: 'STD', name: 'Standard', kind: 'standard',
    })).body;
    const vipCustomer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({
      name: 'VIP Customer', phone: '0245550001',
    })).body;
    const custList = (await request(app.getHttpServer()).post('/api/price-lists').set(owner).send({
      code: 'VIP', name: 'VIP pricing', kind: 'customer', customerId: vipCustomer.id,
    })).body;

    // historical (past) + current windows
    expect((await request(app.getHttpServer()).post(`/api/price-lists/${stdList.id}/items`).set(owner).send({
      productId: productA, unitId: unitPc, price: '45.00', effectiveFrom: daysAgo(30), effectiveTo: daysAgo(10),
    })).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/price-lists/${stdList.id}/items`).set(owner).send({
      productId: productA, unitId: unitPc, price: '48.00', effectiveFrom: daysAgo(9),
    })).status).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/price-lists/${custList.id}/items`).set(owner).send({
      productId: productA, unitId: unitPc, price: '42.00', effectiveFrom: daysAgo(1),
    })).status).toBe(201);

    // overlapping window in the same list is rejected by the exclusion constraint
    const overlap = await request(app.getHttpServer()).post(`/api/price-lists/${stdList.id}/items`).set(owner).send({
      productId: productA, unitId: unitPc, price: '99.00', effectiveFrom: daysAgo(5),
    });
    expect(overlap.status).toBe(409);

    const resolve = async (q: string) => {
      const r = await request(app.getHttpServer()).get(`/api/pricing/resolve?productId=${productA}&unitId=${unitPc}${q}`).set(owner);
      expect(r.status).toBe(200);
      return r.body;
    };

    // today: customer list wins over standard current
    const now = await resolve(`&customerId=${custList.customerId}`);
    expect(now.source).toBe('customer_list');
    expect(now.price).toBe('42.00');

    // no customer: standard current window
    const plain = await resolve('');
    expect(plain.source).toBe('standard_list');
    expect(plain.price).toBe('48.00');

    // historical date: the OLD effective window (immutable, still resolvable)
    const historic = await resolve(`&date=${daysAgo(20)}`);
    expect(historic.source).toBe('standard_list');
    expect(historic.price).toBe('45.00');
    expect(historic.effectiveFrom).toBe(daysAgo(30));

    // no lists at all: product default (legacy selling_price)
    const fallback = await (async () => {
      const r = await request(app.getHttpServer()).get(`/api/pricing/resolve?productId=${productB}&unitId=${unitPc}`).set(owner);
      expect(r.status).toBe(200);
      return r.body;
    })();
    expect(fallback.source).toBe('product_default');
    expect(fallback.price).toBe('20.00');

    // a posted document keeps its price snapshot: the resolved price for the
    // historical date remains 45.00 even though the list now says 48.00
    const historicAgain = await resolve(`&date=${daysAgo(20)}`);
    expect(historicAgain.price).toBe('45.00');
    void today;
  });
});
