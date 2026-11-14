/**
 * Phase 6 — cogs_vs_stock_ledger control after RESTOCKING returns.
 *
 * Defect found during Phase 6 staging/UAT preparation: the COGS ↔ stock
 * ledger control subtracted the credit-note COGS reversal (Cr COGS at
 * cost-at-sale) on the GL side but never subtracted the matching
 * customer_return receipt movement on the ledger side, so the check failed
 * by exactly the restocked cost for ANY tenant that processed a restocking
 * return (e.g. diff −30.0000 for one unit returned at cost 30). No prior
 * test asserted this check after a restocking return — the historical
 * reconciliation test only pinned accounts_receivable.
 *
 * Fix under test: the ledger arm subtracts return_order receipts dated by
 * the RETURN ORDER'S business date (the same date the credit-note journal
 * carries), mirroring the GL arm exactly.
 *
 * Cases (real PostgreSQL, exact money):
 *  1. same-day restocking return → ALL reconciliation checks pass,
 *     cogs difference exactly 0.0000;
 *  2. BACKDATED return (sale D-3, return business date D-1): the check
 *     passes at every as-of (before the return nothing subtracted on either
 *     side; from the return's date both sides subtract symmetrically);
 *  3. scrap return (no restock movement, no COGS reversal): both sides
 *     unchanged — check still passes (scrap keeps the cost in COGS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function seedReason(fx: ApiFixture, app: INestApplication, owner: Record<string, string>) {
  const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
    code: 'COGS_CTRL_RTN',
    name: 'COGS control return',
    requiresApproval: false,
    refundPermitted: true,
    replacementPermitted: false,
    storeCreditPermitted: true,
    restockPermitted: true,
  });
  expect(reason.status, JSON.stringify(reason.body)).toBe(201);
  await fx.admin.query(
    `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000000)
     ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000000`,
    [fx.tenantA.tenantId],
  );
}

async function reconciliationChecks(app: INestApplication, owner: Record<string, string>, asOf: string) {
  const rec = await request(app.getHttpServer()).get(`/api/accounting/reconciliation?asOf=${asOf}`).set(owner);
  expect(rec.status).toBe(200);
  const byCheck = new Map<string, { passed: boolean; difference: string }>(
    rec.body.checks.map((c: { check: string; passed: boolean; difference: string }) => [c.check, c]),
  );
  return byCheck;
}

describe('cogs_vs_stock_ledger control with restocking returns (Phase 6 staging defect)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh: string;
  let product: string;
  let customer: string;

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = { Authorization: `Bearer ${fx.tenantA.users.owner!.token!}` };
    await seedReason(fx, app, owner);

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'CC-WH', name: 'COGS control WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'CC-PC', name: 'COGS control pieces' })).body.id;
    product = (
      await request(app.getHttpServer())
        .post('/api/products')
        .set(owner)
        .send({ code: 'CC-P', name: 'COGS control product', baseUnitId: unit, sellingPrice: '50.00', purchasePrice: '30.00' })
    ).body.id;
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'COGS control customer', phone: '0244000777' })).body.id;

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: day(-4),
      lines: [{ productId: product, quantityBase: '50', unitCost: '30.00' }],
    });
    expect(opening.status, JSON.stringify(opening.body)).toBe(201);
  });

  afterAll(async () => {
    await fx.close();
  });

  it('a same-day restocking return keeps EVERY control check green with exact 0.0000 COGS difference', async () => {
    const today = day(0);
    const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '4', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);

    const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'COGS_CTRL_RTN',
      creditDisposition: 'store_credit',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0]!.id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);

    const checks = await reconciliationChecks(app, owner, today);
    const cogs = checks.get('cogs_vs_stock_ledger')!;
    expect(cogs.passed, `cogs diff ${cogs.difference}`).toBe(true);
    expect(cogs.difference).toBe('0.0000');
    // sale COGS 4×30 − reversal 1×30 == ledger 120 − 30 — and EVERY check passes
    for (const [name, c] of checks) {
      expect(c.passed, `${name} diff ${c.difference}`).toBe(true);
    }
  });

  it('a BACKDATED restocking return reconciles at every as-of (business-date symmetric subtraction)', async () => {
    const D3 = day(-3); // sale date
    const D1 = day(-1); // return business date
    const D0 = day(0); // today

    const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [],
    });
    expect(sale.status).toBe(201);
    // backdate the sale to D3 (invoice + journal + stock movement)
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [sale.body.invoice.id, D3]);
    await fx.admin.query(
      `UPDATE journal_entry SET business_date = $2 WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $3`,
      [fx.tenantA.tenantId, D3, sale.body.invoice.id],
    );
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $2::timestamptz WHERE source_document_type = 'invoice' AND source_document_id = $1`,
      [sale.body.invoice.id, `${D3}T12:00:00Z`],
    );

    const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'COGS_CTRL_RTN',
      creditDisposition: 'store_credit',
      businessDate: D1,
      lines: [{ invoiceLineId: sale.body.invoice.lines[0]!.id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);

    // as-of D2 (sale posted, return NOT yet): both sides carry the sale only
    const atD2 = await reconciliationChecks(app, owner, day(-2));
    expect(atD2.get('cogs_vs_stock_ledger')!.passed, atD2.get('cogs_vs_stock_ledger')!.difference).toBe(true);
    // as-of D1 (return effective): GL subtracts the COGS reversal dated D1;
    // the ledger subtracts the restock by the RETURN ORDER's business date D1
    const atD1 = await reconciliationChecks(app, owner, D1);
    expect(atD1.get('cogs_vs_stock_ledger')!.passed, atD1.get('cogs_vs_stock_ledger')!.difference).toBe(true);
    // today: everything visible on both sides
    const atD0 = await reconciliationChecks(app, owner, D0);
    expect(atD0.get('cogs_vs_stock_ledger')!.passed, atD0.get('cogs_vs_stock_ledger')!.difference).toBe(true);
    expect(atD0.get('cogs_vs_stock_ledger')!.difference).toBe('0.0000');
  });

  it('a SCRAP return (no restock movement, no COGS reversal) leaves the control green', async () => {
    const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '50.00' }],
    });
    expect(sale.status).toBe(201);

    const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'COGS_CTRL_RTN',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0]!.id, quantity: '1', condition: 'damaged', disposition: 'scrap' }],
      submit: true,
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);

    // scrap: NO stock receipt, NO COGS reversal — both sides keep the cost
    const scrapMovements = await fx.admin.query(
      `SELECT count(*)::int AS n FROM stock_movement
       WHERE tenant_id = $1 AND source_document_type = 'return_order' AND reason = 'customer_return'
         AND source_document_id = $2`,
      [fx.tenantA.tenantId, ret.body.id],
    );
    expect(scrapMovements.rows[0]!.n).toBe(0);

    const checks = await reconciliationChecks(app, owner, day(0));
    expect(checks.get('cogs_vs_stock_ledger')!.passed, checks.get('cogs_vs_stock_ledger')!.difference).toBe(true);
    expect(checks.get('cogs_vs_stock_ledger')!.difference).toBe('0.0000');
  });
});
