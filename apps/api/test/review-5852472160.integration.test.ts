/**
 * Regression coverage for independent review 5852472160 on PR #8 — the
 * four cross-module accounting/reporting defects found after 8ce6ef1:
 *
 * P0-A — the AR accounting control check never subtracted store-credit
 *        redemptions: GL AR = 70 and aged AR = 70 for a 100 invoice
 *        settled by 30 of store credit, but the subledger said 100 and
 *        the check failed by exactly the redeemed value. The fix adds
 *        the dated redemption leg to the canonical reconciliation query.
 *
 * P0-B — the product-sales dimension could not reconcile to the dated
 *        revenue reports: it filtered status='posted' (erasing reversed
 *        invoices from history), used raw line_net (no order-discount
 *        proration, no embedded inclusive-tax strip: a 110 tax-inclusive
 *        item reported 110 instead of the canonical 100), and subtracted
 *        returns at the pre-tax-strip credit_net_slice. item-margin
 *        originated every row from in-window invoice lines, so a
 *        reversal-only window had no product row to net into.
 *
 * P1-C — daily-sales filtered its sales/reversal/credit legs by
 *        warehouse but let returnsRows/refundRows/tenderRows apply
 *        tenant+date only: a W1-filtered day subtracted W2 returns and
 *        included W2 POS cash.
 *
 * P1-D — the customer statement's store-credit column was all-time and
 *        status-guessing: a later redemption retroactively rewrote an
 *        older as-of statement, an expired credit still showed as
 *        redeemable (its liability was already posted to breakage), and
 *        a credit whose status moved to redeemed/void vanished entirely.
 *
 * All scenarios run on real PostgreSQL through the API, with historical
 * business dates, two warehouses, tax-inclusive/exclusive products and
 * exact money assertions. Sums by dimension are tied to the dated
 * daily-sales figures (the money view that reconciles to the GL).
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

describe('review 5852472160 — P1-C + P0-B: warehouse isolation and canonical product revenue', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh1: string;
  let wh2: string;
  let pInc: string; // 110.00 tax-INCLUSIVE (GETFUND 10% embedded), cost 60
  let pExc: string; // 100.00 tax-EXCLUSIVE (VAT 10% on top), cost 40
  let customer: string;

  const D1 = day(-2);
  const D2 = day(-1);
  const D3 = day(0); // today — the reversal lands here naturally
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function getRows(path: string) {
    const res = await request(app.getHttpServer()).get(`/api/reports/${path}`).set(owner);
    expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(200);
    return res.body as Array<Record<string, string | number>>;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh1 = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'RV-W1', name: 'Review WH1' })).body.id;
    wh2 = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'RV-W2', name: 'Review WH2' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'RV-PC', name: 'Review Pieces' })).body.id;
    const mkProduct = async (code: string, price: string, cost: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/products')
          .set(owner)
          .send({ code, name: `Review ${code}`, baseUnitId: unit, sellingPrice: price, purchasePrice: cost })
      ).body.id as string;
    pInc = await mkProduct('RV-PI', '110.00', '60.00');
    pExc = await mkProduct('RV-PE', '100.00', '40.00');
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Review Customer', phone: '0244001999' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'RV_RTN',
      name: 'Review return',
      requiresApproval: false,
      refundPermitted: true,
      replacementPermitted: false,
      storeCreditPermitted: true,
      restockPermitted: true,
    });
    expect(reason.status).toBe(201);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000000)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000000`,
      [fx.tenantA.tenantId],
    );

    // two tax profiles — inclusive for the WH1 product, exclusive for WH2
    const mkProfile = async (code: string, components: Array<{ name: string; rate: string; inclusive: boolean; seq: number }>) => {
      const p = await request(app.getHttpServer()).post('/api/tax/profiles').set(owner).send({ code, name: `Review ${code}` });
      expect(p.status, JSON.stringify(p.body)).toBe(201);
      const v = await request(app.getHttpServer()).post(`/api/tax/profiles/${p.body.id}/versions`).set(owner).send({
        effectiveFrom: '2000-01-01',
        components,
      });
      expect(v.status, JSON.stringify(v.body)).toBe(201);
      return p.body.id as string;
    };
    const inclId = await mkProfile('RV-INCL', [{ name: 'GETFUND', rate: '0.100000', inclusive: true, seq: 1 }]);
    const exclId = await mkProfile('RV-EXCL', [{ name: 'VAT', rate: '0.100000', inclusive: false, seq: 1 }]);
    const setDefault = async (id: string) => {
      await fx.admin.query(`UPDATE tax_profile SET is_default = false WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
      await fx.admin.query(`UPDATE tax_profile SET is_default = true WHERE tenant_id = $1 AND id = $2`, [fx.tenantA.tenantId, id]);
    };

    const opening1 = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh1,
      authority: 'physical_count',
      businessDate: D1,
      lines: [{ productId: pInc, quantityBase: '100', unitCost: '60.00' }],
    });
    expect(opening1.status).toBe(201);
    const opening2 = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh2,
      authority: 'physical_count',
      businessDate: D1,
      lines: [{ productId: pExc, quantityBase: '100', unitCost: '40.00' }],
    });
    expect(opening2.status).toBe(201);

    // ---- D1 (WH1): cash sale of 2 × 110 INCLUSIVE — subtotal 220,
    // embedded GETFUND 20, CANONICAL net revenue 200 (never 220)
    await setDefault(inclId);
    const saleInc = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh1,
      customerId: customer,
      lines: [{ productId: pInc, quantityBase: '2', unitPrice: '110.00' }],
      tenders: [{ method: 'cash', amount: '220.00' }],
    });
    expect(saleInc.status, JSON.stringify(saleInc.body)).toBe(201);
    expect(saleInc.body.invoice.total).toBe('220.0000');

    // ---- D1 (WH2): credit sale of 1 × 100 EXCLUSIVE — total 110 AR
    await setDefault(exclId);
    const saleExc = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh2,
      customerId: customer,
      lines: [{ productId: pExc, quantityBase: '1', unitPrice: '100.00' }],
      tenders: [],
    });
    expect(saleExc.status, JSON.stringify(saleExc.body)).toBe(201);
    expect(saleExc.body.invoice.total).toBe('110.0000');

    // backdate both sales and their journals/tender to D1 (house pattern)
    for (const invoiceId of [saleInc.body.invoice.id, saleExc.body.invoice.id]) {
      await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [invoiceId, D1]);
      await fx.admin.query(
        `UPDATE journal_entry SET business_date = $2 WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $3`,
        [fx.tenantA.tenantId, D1, invoiceId],
      );
    }
    await fx.admin.query(`UPDATE payment SET business_date = $2 WHERE id = $1`, [saleInc.body.payment.id, D1]);

    // settle Q's receivable BEFORE the return (receipt dated today — AFTER
    // the D1 invoice date, so the D1 credit-sales figure keeps its point-in-
    // time 110) so the AR-first decomposition leaves a CASH REFUND residual
    const preReceipt = await request(app.getHttpServer()).post('/api/payments').set(owner).send({
      customerId: customer,
      amount: '110.00',
      tenders: [{ method: 'cash', amount: '110.00' }],
      allocations: [{ invoiceId: saleExc.body.invoice.id, amount: '110.00' }],
    });
    expect(preReceipt.status, JSON.stringify(preReceipt.body)).toBe(201);

    // ---- D2 (WH2): return the WH2 sale → credit note 110 (net 100 +
    // VAT 10), cash refund 110 — ALL dated D2, ALL in WH2
    const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: saleExc.body.invoice.id,
      reasonCode: 'RV_RTN',
      creditDisposition: 'refund',
      businessDate: D2,
      clientDocId: `rv-return-${Date.now()}`,
      lines: [{ invoiceLineId: saleExc.body.invoice.lines[0].id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect(ret.body.status).toBe('approved');
    expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);
    expect(processed.body.refundAmount).toBe('110.0000');
    const refund = await request(app.getHttpServer()).post('/api/returns/refunds').set(owner).send({
      creditNoteId: processed.body.creditNoteId, amount: '110.00', method: 'cash', businessDate: D2, approveAndPost: true,
    });
    expect(refund.status, JSON.stringify(refund.body)).toBe(201);

    // ---- D3 (WH1, today): reverse the WH1 cash sale — append-only
    const reversal = await request(app.getHttpServer())
      .post(`/api/sales/invoices/${saleInc.body.invoice.id}/reverse`)
      .set(owner)
      .send({ reason: 'review 5852472160: reversal-only window fixture' });
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);
  });

  afterAll(async () => {
    await fx?.close();
  });

  // ------------------------------------------------------------ P1-C

  it('daily-sales unfiltered: canonical net on D1, return on its own D2, reversal nets D3', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D3}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));

    const d1 = byDate.get(D1)!;
    expect(d1.salesCount).toBe(2);
    expect(d1.grossSales).toBe('330.0000');
    // canonical: inclusive strip (220 − 20) + exclusive untaxed net (100)
    expect(d1.netSales).toBe('300.0000');
    expect(d1.taxTotal).toBe('30.0000');
    expect(d1.cogsTotal).toBe('160.0000'); // 2×60 inclusive + 1×40 exclusive
    expect(d1.cashSales).toBe('220.0000');
    expect(d1.creditSales).toBe('110.0000');
    expect(d1.netRevenue).toBe('300.0000');

    const d2 = byDate.get(D2)!;
    expect(d2.salesCount).toBe(0);
    expect(d2.returnsTotal).toBe('110.0000'); // credit note TOTAL
    expect(d2.refundsTotal).toBe('110.0000');
    expect(d2.netRevenue).toBe('-100.0000'); // NET-REVENUE reversal, not 110
    expect(d2.grossProfit).toBe('-60.0000'); // −(100 − 40 cost-at-sale reversal)

    const d3 = byDate.get(D3)!;
    expect(d3.salesCount).toBe(-1);
    expect(d3.grossSales).toBe('-220.0000');
    expect(d3.netSales).toBe('-200.0000');
    expect(d3.taxTotal).toBe('-20.0000');
    expect(d3.cogsTotal).toBe('-120.0000'); // the reversed 2 × 60
    expect(d3.netRevenue).toBe('-200.0000');
    expect(d3.grossProfit).toBe('-80.0000');

    const sum = (k: string) => rows.reduce((acc, r) => acc + Number(r[k]), 0);
    expect(sum('netRevenue')).toBe(0); // nothing kept: one reversal + one full return
    expect(sum('grossProfit')).toBe(0);
  });

  it('P1-C: a WH1-filtered day never subtracts WH2 returns/refunds or shows WH2 cash', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D3}&warehouseId=${wh1}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));
    // WH1 activity only: D1 sale + D3 reversal. The D2 WH2 return/refund
    // must NOT create a WH1 row (old code mixed warehouses here).
    expect([...byDate.keys()].sort()).toEqual([D1, D3]);
    expect(byDate.get(D1)!.netSales).toBe('200.0000'); // canonical, not 220
    expect(byDate.get(D1)!.cashSales).toBe('220.0000');
    expect(byDate.get(D1)!.returnsTotal).toBe('0.0000');
    expect(byDate.get(D3)!.grossSales).toBe('-220.0000');
    expect(byDate.get(D3)!.netRevenue).toBe('-200.0000');

    const wh2Rows = await getRows(`daily-sales?from=${D1}&to=${D3}&warehouseId=${wh2}`);
    const wh2ByDate = new Map(wh2Rows.map((r) => [String(r.businessDate), r]));
    expect([...wh2ByDate.keys()].sort()).toEqual([D1, D2]);
    expect(wh2ByDate.get(D1)!.netSales).toBe('100.0000');
    expect(wh2ByDate.get(D1)!.cashSales).toBe('0.0000'); // WH1's cash stays in WH1
    expect(wh2ByDate.get(D1)!.creditSales).toBe('110.0000');
    expect(wh2ByDate.get(D2)!.returnsTotal).toBe('110.0000');
    expect(wh2ByDate.get(D2)!.refundsTotal).toBe('110.0000');
    // the WH1 reversal must not leak into WH2's D3
    expect(wh2ByDate.get(D3)).toBeUndefined();
  });

  it('P1-C: warehouse slices tie exactly to the unfiltered daily-sales rows', async () => {
    const [all, w1, w2] = await Promise.all([
      getRows(`daily-sales?from=${D1}&to=${D3}`),
      getRows(`daily-sales?from=${D1}&to=${D3}&warehouseId=${wh1}`),
      getRows(`daily-sales?from=${D1}&to=${D3}&warehouseId=${wh2}`),
    ]);
    const fields = ['grossSales', 'netSales', 'taxTotal', 'cogsTotal', 'cashSales', 'creditSales', 'returnsTotal', 'refundsTotal', 'netRevenue'];
    for (const row of all) {
      const date = String(row.businessDate);
      const r1 = w1.find((r) => String(r.businessDate) === date);
      const r2 = w2.find((r) => String(r.businessDate) === date);
      for (const f of fields) {
        const total = Number(row[f]);
        const parts = (r1 ? Number(r1[f]) : 0) + (r2 ? Number(r2[f]) : 0);
        expect(parts, `${date} ${f}: ${parts} != unfiltered ${total}`).toBe(total);
      }
    }
  });

  // ------------------------------------------------------------ P0-B

  it('P0-B: sales-by-product reports canonical net revenue and ties to the dated daily-sales figures', async () => {
    const rows = await getRows(`sales-by-product?from=${D1}&to=${D2}`);
    const byProduct = new Map(rows.map((r) => [String(r.dimensionId), r]));
    const inc = byProduct.get(pInc)!;
    const exc = byProduct.get(pExc)!;
    // the OLD code reported 220 (raw line_net) for the inclusive product —
    // the canonical revenue is 200 (embedded GETFUND stripped)
    expect(inc.netSales).toBe('200.0000');
    expect(inc.returns).toBe('0.0000');
    expect(inc.netRevenue).toBe('200.0000');
    // the OLD code subtracted the return at credit_net_slice 110 — the
    // dated NET-REVENUE reversal is 100 (exclusive VAT is not revenue)
    expect(exc.netSales).toBe('100.0000');
    expect(exc.returns).toBe('100.0000');
    expect(exc.netRevenue).toBe('0.0000');

    const daily = await getRows(`daily-sales?from=${D1}&to=${D2}`);
    const dailyNet = daily.reduce((acc, r) => acc + Number(r.netRevenue), 0);
    const productNet = rows.reduce((acc, r) => acc + Number(r.netRevenue), 0);
    expect(productNet).toBe(200);
    expect(productNet).toBe(dailyNet); // dimension ↔ dated money view tie
  });

  it('P0-B: a reversal-only window has a product row to net into (append-only)', async () => {
    const rows = await getRows(`sales-by-product?from=${D3}&to=${D3}`);
    const byProduct = new Map(rows.map((r) => [String(r.dimensionId), r]));
    const inc = byProduct.get(pInc)!;
    expect(inc).toBeTruthy();
    expect(inc.salesCount).toBe(-1);
    expect(inc.netSales).toBe('-200.0000');
    expect(inc.netRevenue).toBe('-200.0000');
    // the WH2 product has no D3 activity
    expect(byProduct.get(pExc)).toBeUndefined();
  });

  it('P0-B: item-margin uses the canonical revenue basis, labels its cohort convention, and nets reversal-only windows', async () => {
    const rows = await getRows(`item-margin?from=${D1}&to=${D2}`);
    const byProduct = new Map(rows.map((r) => [String(r.productCode), r]));
    const inc = byProduct.get('RV-PI')!;
    const exc = byProduct.get('RV-PE')!;
    expect(inc.grossRevenue).toBe('200.0000'); // canonical, not 220
    expect(inc.cogs).toBe('120.0000');
    expect(inc.netRevenue).toBe('200.0000');
    expect(exc.grossRevenue).toBe('100.0000');
    expect(exc.returns).toBe('100.0000'); // net-revenue reversal, not 110
    expect(exc.cogsReversal).toBe('40.0000'); // cost-at-sale evidence
    expect(exc.netCogs).toBe('0.0000');
    expect(exc.grossProfit).toBe('0.0000');
    for (const row of [inc, exc]) {
      expect(row.returnsAttribution).toBe('sale-period-cohort');
    }

    // reversal-only window: the P row EXISTS with the negative correction
    const reversalOnly = await getRows(`item-margin?from=${D3}&to=${D3}`);
    const pRow = reversalOnly.find((r) => String(r.productCode) === 'RV-PI');
    expect(pRow).toBeTruthy();
    expect(pRow!.grossRevenue).toBe('-200.0000');
    expect(pRow!.quantitySold).toBe('-2.000000');
    expect(pRow!.netRevenue).toBe('-200.0000');
  });

  it('P0-B: the full window sums by product to the same truth as daily-sales', async () => {
    const products = await getRows(`sales-by-product?from=${D1}&to=${D3}`);
    const productNet = products.reduce((acc, r) => acc + Number(r.netRevenue), 0);
    const daily = await getRows(`daily-sales?from=${D1}&to=${D3}`);
    const dailyNet = daily.reduce((acc, r) => acc + Number(r.netRevenue), 0);
    expect(productNet).toBe(0);
    expect(dailyNet).toBe(0);
    expect(productNet).toBe(dailyNet);

    const byWh = await getRows(`sales-by-warehouse?from=${D1}&to=${D2}`);
    const whNet = byWh.reduce((acc, r) => acc + Number(r.netRevenue), 0);
    expect(whNet).toBe(200); // WH1 200 kept + WH2 (100 − 100) 0
  });
});

describe('review 5852472160 — P0-A: store-credit redemptions reconcile AR aging, GL and control', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh: string;
  let product: string; // 100.00 / cost 30.00, no tax (fresh tenant)
  let customer: string;
  let invoiceB: string; // credit sale settled by the redemption on D2
  let invoiceC: string; // credit sale that stays open, then gets a receipt

  const D1 = day(-3); // sales + store-credit issue
  const D2 = day(-2); // redemption
  const D3 = day(-1); // mid-history assertions
  const D4 = day(0); // today — subsequent payment
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function reconciliation(asOf: string) {
    const res = await request(app.getHttpServer()).get(`/api/accounting/reconciliation?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    const checks = res.body.checks as Array<{ check: string; passed: boolean; difference: string; controlBalance: string; subledgerBalance: string }>;
    return new Map(checks.map((c) => [c.check, c]));
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'AR-WH', name: 'AR WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'AR-PC', name: 'AR Pieces' })).body.id;
    product = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'AR-P', name: 'AR Product', baseUnitId: unit, sellingPrice: '100.00', purchasePrice: '30.00' })).body.id;
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'AR Customer', phone: '0244002111' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'AR_RTN',
      name: 'AR return',
      requiresApproval: false,
      refundPermitted: true,
      replacementPermitted: false,
      storeCreditPermitted: true,
      restockPermitted: true,
    });
    expect(reason.status).toBe(201);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000000)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000000`,
      [fx.tenantA.tenantId],
    );

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: D1,
      lines: [{ productId: product, quantityBase: '100', unitCost: '30.00' }],
    });
    expect(opening.status).toBe(201);

    // ---- D1: cash sale R (2 × 100 paid), credit sales B and C (1 × 100 each)
    const saleR = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '2', unitPrice: '100.00' }],
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(saleR.status, JSON.stringify(saleR.body)).toBe(201);
    const saleB = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '1', unitPrice: '100.00' }],
      tenders: [],
    });
    expect(saleB.status, JSON.stringify(saleB.body)).toBe(201);
    const saleC = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '1', unitPrice: '100.00' }],
      tenders: [],
    });
    expect(saleC.status, JSON.stringify(saleC.body)).toBe(201);
    invoiceB = saleB.body.invoice.id;
    invoiceC = saleC.body.invoice.id;

    // backdate all three invoices, their journals and the cash tender to D1
    for (const invoiceId of [saleR.body.invoice.id, invoiceB, invoiceC]) {
      await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [invoiceId, D1]);
      await fx.admin.query(
        `UPDATE journal_entry SET business_date = $2 WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $3`,
        [fx.tenantA.tenantId, D1, invoiceId],
      );
    }
    await fx.admin.query(`UPDATE payment SET business_date = $2 WHERE id = $1`, [saleR.body.payment!.id, D1]);

    // ---- D1: return 1 of the 2 units from R → store credit 100
    const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: saleR.body.invoice.id,
      reasonCode: 'AR_RTN',
      creditDisposition: 'store_credit',
      businessDate: D1,
      clientDocId: `ar-return-${Date.now()}`,
      lines: [{ invoiceLineId: saleR.body.invoice.lines[0].id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status, JSON.stringify(ret.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);
    expect(processed.body.storeCreditAmount).toBe('100.0000');

    const scList = await request(app.getHttpServer()).get(`/api/returns/store-credits?customerId=${customer}`).set(owner);
    expect(scList.status).toBe(200);
    const storeCreditId = (scList.body as Array<{ id: string; remainingAmount: string }>).find((c) => c.remainingAmount === '100.0000')!.id;

    // ---- D2: redeem the WHOLE store credit against invoice B (a
    // DIFFERENT invoice) — Dr store_credit_liability / Cr AR, dated D2
    const redeem = await request(app.getHttpServer()).post('/api/returns/store-credits/redeem').set(owner).send({
      storeCreditId,
      invoiceId: invoiceB,
      amount: '100.00',
      businessDate: D2,
      clientDocId: `ar-redeem-${Date.now()}`,
    });
    expect(redeem.status, JSON.stringify(redeem.body)).toBe(201);

    // ---- D4 (today): subsequent payment of 30 against the still-open C
    const receipt = await request(app.getHttpServer()).post('/api/payments').set(owner).send({
      customerId: customer,
      amount: '30.00',
      tenders: [{ method: 'cash', amount: '30.00' }],
      allocations: [{ invoiceId: invoiceC, amount: '30.00' }],
    });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
  });

  afterAll(async () => {
    await fx?.close();
  });

  it('as-of D1 (before the redemption): AR aging 200, control reconciles', async () => {
    const aging = await request(app.getHttpServer()).get(`/api/reports/ar-aging?asOf=${D1}`).set(owner);
    expect(aging.status).toBe(200);
    const row = (aging.body as Array<Record<string, string>>).find((r) => r.partyId === customer);
    expect(row!.total).toBe('200.0000'); // B + C open

    const rec = await reconciliation(D1);
    const ar = rec.get('accounts_receivable')!;
    expect(ar.passed, `difference ${ar.difference}`).toBe(true);
    expect(ar.difference).toBe('0.0000');
    expect(ar.controlBalance).toBe('200.0000');
    expect(ar.subledgerBalance).toBe('200.0000');
  });

  it('P0-A: as-of D3 the redemption settles the subledger AND the GL — aging 100, statement usable 0 / issued 100, control PASS', async () => {
    // aging (already redemption-aware): only C remains open
    const aging = await request(app.getHttpServer()).get(`/api/reports/ar-aging?asOf=${D3}`).set(owner);
    expect(aging.status).toBe(200);
    const row = (aging.body as Array<Record<string, string>>).find((r) => r.partyId === customer);
    expect(row!.total).toBe('100.0000');

    const st = await request(app.getHttpServer()).get(`/api/reports/customer-statement?customerId=${customer}&asOf=${D3}`).set(owner);
    expect(st.status).toBe(200);
    expect(st.body.receivable).toBe('100.0000');
    expect(st.body.storeCredit).toBe('0.0000'); // fully redeemed on D2
    expect(st.body.storeCreditIssued).toBe('100.0000'); // it WAS issued on D1
    const redemptionLine = (st.body.lines as Array<{ documentType: string; credit: string }>).find(
      (l) => l.documentType === 'store_credit_redemption',
    );
    expect(redemptionLine).toBeTruthy();
    expect(redemptionLine!.credit).toBe('100.0000');

    // THE FIX UNDER TEST: the GL AR control (sale journals D1: +200 AR;
    // redemption journal D2: −100 AR) is 100 — the subledger must say 100
    // too, not 200. Before the fix the check failed by exactly 100.
    const rec = await reconciliation(D3);
    const ar = rec.get('accounts_receivable')!;
    expect(ar.passed, `difference ${ar.difference} (control ${ar.controlBalance} vs subledger ${ar.subledgerBalance})`).toBe(true);
    expect(ar.difference).toBe('0.0000');
    expect(ar.controlBalance).toBe('100.0000');
    expect(ar.subledgerBalance).toBe('100.0000');
  });

  it('P0-A: the reconciliation rerun is safe and identical (idempotent read)', async () => {
    const first = await reconciliation(D3);
    const second = await reconciliation(D3);
    const a = first.get('accounts_receivable')!;
    const b = second.get('accounts_receivable')!;
    expect(b.passed).toBe(true);
    expect(b.difference).toBe(a.difference);
    expect(b.controlBalance).toBe(a.controlBalance);
    expect(b.subledgerBalance).toBe(a.subledgerBalance);
  });

  it('P0-A: the subsequent payment (D4) moves both the aging and the GL control consistently', async () => {
    const aging = await request(app.getHttpServer()).get(`/api/reports/ar-aging?asOf=${D4}`).set(owner);
    expect(aging.status).toBe(200);
    const row = (aging.body as Array<Record<string, string>>).find((r) => r.partyId === customer);
    expect(row!.total).toBe('70.0000'); // C 100 − receipt 30

    const rec = await reconciliation(D4);
    const ar = rec.get('accounts_receivable')!;
    expect(ar.passed, `difference ${ar.difference}`).toBe(true);
    expect(ar.controlBalance).toBe('70.0000');
    expect(ar.subledgerBalance).toBe('70.0000');
  });
});

describe('review 5852472160 — P1-D: point-in-time store credit on the customer statement', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh: string;
  let product: string; // 50.00 / cost 30.00
  let customer: string;
  let sc1: string; // redeemed on D2
  let sc2: string; // expires on D3 (breakage journal dated D3)
  let sc3: string; // voided on D4 (today)

  const D1 = day(-3); // three 50-credits issued
  const D2 = day(-2); // SC1 fully redeemed
  const D3 = day(-1); // SC2 expiry evidence date
  const D4 = day(0); // today — SC2 expired (action), SC3 voided
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function statement(asOf: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/reports/customer-statement?customerId=${customer}&asOf=${asOf}`)
      .set(owner);
    expect(res.status).toBe(200);
    return res.body as { storeCredit: string; storeCreditIssued: string; receivable: string; lines: Array<{ documentType: string; credit: string }> };
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'SC-WH', name: 'SC WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'SC-PC', name: 'SC Pieces' })).body.id;
    product = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'SC-P', name: 'SC Product', baseUnitId: unit, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'SC Customer', phone: '0244003222' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'SC_RTN',
      name: 'SC return',
      requiresApproval: false,
      refundPermitted: false,
      replacementPermitted: false,
      storeCreditPermitted: true,
      restockPermitted: true,
    });
    expect(reason.status).toBe(201);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 1000000)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 1000000`,
      [fx.tenantA.tenantId],
    );

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: D1,
      lines: [{ productId: product, quantityBase: '200', unitCost: '30.00' }],
    });
    expect(opening.status).toBe(201);

    // three cash sales (2 × 50 each) + one credit sale Y (1 × 50)
    const cashSales: Array<{ invoice: { id: string; lines: Array<{ id: string }> }; payment: { id: string } | null }> = [];
    for (let i = 1; i <= 3; i++) {
      const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
        warehouseId: wh,
        customerId: customer,
        lines: [{ productId: product, quantityBase: '2', unitPrice: '50.00' }],
        tenders: [{ method: 'cash', amount: '100.00' }],
      });
      expect(sale.status, JSON.stringify(sale.body)).toBe(201);
      cashSales.push(sale.body);
    }
    const saleY = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [],
    });
    expect(saleY.status, JSON.stringify(saleY.body)).toBe(201);

    // backdate everything to D1 (invoices, journals, cash tenders)
    for (const sale of [...cashSales, saleY.body]) {
      await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [sale.invoice.id, D1]);
      await fx.admin.query(
        `UPDATE journal_entry SET business_date = $2 WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $3`,
        [fx.tenantA.tenantId, D1, sale.invoice.id],
      );
      if (sale.payment) {
        await fx.admin.query(`UPDATE payment SET business_date = $2 WHERE id = $1`, [sale.payment.id, D1]);
      }
    }

    // ---- D1: one return per cash sale → three 50-credits issued on D1
    const issued: string[] = [];
    for (let i = 0; i < cashSales.length; i++) {
      const ret = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
        invoiceId: cashSales[i]!.invoice.id,
        reasonCode: 'SC_RTN',
        creditDisposition: 'store_credit',
        businessDate: D1,
        clientDocId: `sc-return-${i}-${Date.now()}`,
        lines: [{ invoiceLineId: cashSales[i]!.invoice.lines[0]!.id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
        submit: true,
      });
      expect(ret.status, JSON.stringify(ret.body)).toBe(201);
      expect((await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(owner).send({})).status).toBe(201);
      const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(owner).send({});
      expect(processed.status, JSON.stringify(processed.body)).toBe(201);
      expect(processed.body.storeCreditAmount).toBe('50.0000');
      issued.push(processed.body.creditNoteId);
    }

    const scList = await request(app.getHttpServer()).get(`/api/returns/store-credits?customerId=${customer}`).set(owner);
    expect(scList.status).toBe(200);
    const byRemaining = (scList.body as Array<{ id: string; remainingAmount: string }>).slice().sort((a, b) => a.id.localeCompare(b.id));
    expect(byRemaining.length).toBe(3);
    const scIds = byRemaining.map((c) => c.id);
    sc1 = scIds[0]!;
    sc2 = scIds[1]!;
    sc3 = scIds[2]!;
    void issued;

    // ---- D2: SC1 fully redeemed against the credit sale Y
    const redeem = await request(app.getHttpServer()).post('/api/returns/store-credits/redeem').set(owner).send({
      storeCreditId: sc1,
      invoiceId: saleY.body.invoice.id,
      amount: '50.00',
      businessDate: D2,
      clientDocId: `sc-redeem-${Date.now()}`,
    });
    expect(redeem.status, JSON.stringify(redeem.body)).toBe(201);

    // ---- D3 evidence: SC2 reaches its expiry date (the breakage journal
    // the expire action posts carries sc.expiry_date as its business date)
    await fx.admin.query(`UPDATE store_credit SET expiry_date = $2 WHERE id = $1 AND tenant_id = $3`, [sc2, D3, fx.tenantA.tenantId]);
    const expire = await request(app.getHttpServer()).post(`/api/returns/store-credits/${sc2}/expire`).set(owner).send({
      reason: 'review 5852472160 P1-D: expiry as-of fixture',
    });
    expect(expire.status, JSON.stringify(expire.body)).toBe(201);
    expect(expire.body.status).toBe('expired');

    // ---- D4 (today): SC3 voided — the liability returns to refund payable
    const voided = await request(app.getHttpServer()).post(`/api/returns/store-credits/${sc3}/void`).set(owner).send({
      reason: 'review 5852472160 P1-D: void as-of fixture',
    });
    expect(voided.status, JSON.stringify(voided.body)).toBe(201);
    expect(voided.body.status).toBe('void');
  });

  afterAll(async () => {
    await fx?.close();
  });

  it('as-of D1: all three credits are usable; gross issued == usable == 150', async () => {
    const st = await statement(D1);
    expect(st.storeCredit).toBe('150.0000');
    expect(st.storeCreditIssued).toBe('150.0000');
  });

  it('as-of D2: the redemption (dated D2) reduces USABLE to 100 but ISSUED stays 150 — no retroactive rewrite either way', async () => {
    const st = await statement(D2);
    expect(st.storeCredit).toBe('100.0000'); // SC1 redeemed → unusable
    expect(st.storeCreditIssued).toBe('150.0000'); // the redemption never un-issues it
    // the D1 statement (an older as-of view) is unchanged by the D2 event
    const d1 = await statement(D1);
    expect(d1.storeCredit).toBe('150.0000');
  });

  it('as-of D3: the expired credit leaves the usable balance (its liability went to breakage) — issued still 150', async () => {
    const st = await statement(D3);
    expect(st.storeCredit).toBe('50.0000'); // SC2's unredeemed 50 expired at D3
    expect(st.storeCreditIssued).toBe('150.0000');
  });

  it('as-of D4: voided credit is out of usable; every defect state is dead (expired/redeemed/void)', async () => {
    const st = await statement(D4);
    // the OLD formula (all-time amount − all-time redemptions, status IN
    // ('active','expired')) reported 50.0000 here: SC1 (redeemed) and SC3
    // (void) were excluded entirely while EXPIRED SC2 still showed its
    // unredeemed remainder as redeemable money.
    expect(st.storeCredit).toBe('0.0000');
    expect(st.storeCreditIssued).toBe('150.0000');
  });

  it('P1-D side-effect: the D2 redemption line is on the ledger and the receivable is settled as-of D3', async () => {
    const st = await statement(D3);
    const redemptionLine = st.lines.find((l) => l.documentType === 'store_credit_redemption');
    expect(redemptionLine).toBeTruthy();
    expect(redemptionLine!.credit).toBe('50.0000');
    // Y (50) was settled by the D2 redemption — nothing open
    expect(st.receivable).toBe('0.0000');
  });
});
