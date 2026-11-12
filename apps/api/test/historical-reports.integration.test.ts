/**
 * History-stability coverage for the operational reports — independent
 * review 5834590343, corrections #2 and #3.
 *
 * daily-sales (correction #2) — events span SIX distinct business dates:
 *   D1  cash sale 100 + credit sale 60      (backdated evidence)
 *   D2  credit sale 30                       (backdated evidence)
 *   D3  return + cash refund 50 — NO invoices that day
 *   D4  deposit 20 applied to the D2 invoice — NO invoices that day
 *   D5  return 30 against the unpaid D1 credit sale (AR-settling)
 *   D6  (today) standalone receipt 20 + invoice reversal of the D2 sale
 * Asserted with EXACT figures:
 *   - D3 EXISTS in the output (the old code dropped return-only dates);
 *   - D1/D2 creditSales never change when later payments (D6 receipt),
 *     deposit applications (D4) or the D6 reversal land;
 *   - the reversal nets D6 (append-only) instead of erasing D2.
 *
 * daily-stock (correction #3) — transfers, sales issues, restocking and
 * adjustments across FOUR dates; the window [from, to] is honoured on
 * BOTH ends (the old code ignored q.to) and the returned row.closing is
 * asserted directly as the ledger balance as of END of q.to.
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

describe('historical daily-sales: return-only dates, point-in-time credit, append-only reversals', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh: string;
  let p1: string; // 50.00 / cost 30.00
  let p2: string; // 30.00 / cost 18.00
  let customer: string;

  const D1 = day(-5);
  const D2 = day(-4);
  const D3 = day(-3);
  const D4 = day(-2);
  const D5 = day(-1);
  const D6 = day(0); // today
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function getRows(path: string) {
    const res = await request(app.getHttpServer()).get(`/api/reports/${path}`).set(owner);
    expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBe(200);
    return res.body as Array<Record<string, string | number>>;
  }

  async function commitSale(productId: string, units: string, unitPrice: string, tenders: unknown[]) {
    const res = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId, quantityBase: units, unitPrice }],
      tenders,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as {
      invoice: { id: string; lines: Array<{ id: string }> };
      payment: { id: string } | null;
    };
  }

  async function processReturn(invoiceId: string, lineId: string, qty: string, note: string, businessDate: string) {
    const created = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId,
      reasonCode: 'HIST_RTN',
      creditDisposition: 'refund',
      customerNote: note,
      businessDate,
      clientDocId: `hist-${note}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      lines: [{ invoiceLineId: lineId, quantity: qty, condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.status).toBe('approved');
    expect((await request(app.getHttpServer()).post(`/api/returns/${created.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${created.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);
    return processed.body as { creditNoteId: string; refundAmount: string; arAmount: string };
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'HS-WH', name: 'History WH' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'HS-PC', name: 'History Pieces' })).body.id;
    const mkProduct = async (code: string, price: string) =>
      (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code, name: `History ${code}`, baseUnitId: unit, sellingPrice: price, purchasePrice: code === 'HS-P1' ? '30.00' : '18.00' })).body.id as string;
    p1 = await mkProduct('HS-P1', '50.00');
    p2 = await mkProduct('HS-P2', '30.00');
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'History Customer', phone: '0244000666' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'HIST_RTN',
      name: 'History return',
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
      lines: [
        { productId: p1, quantityBase: '100', unitCost: '30.00' },
        { productId: p2, quantityBase: '100', unitCost: '18.00' },
      ],
    });
    expect(opening.status).toBe(201);

    // D1: cash sale A (2 × P1 = 100 cash) + credit sale B (2 × P2 = 60 AR)
    const saleA = await commitSale(p1, '2', '50.00', [{ method: 'cash', amount: '100.00' }]);
    const saleB = await commitSale(p2, '2', '30.00', []);
    for (const [doc, date] of [
      [saleA.invoice.id, D1],
      [saleB.invoice.id, D1],
    ] as Array<[string, string]>) {
      await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [doc, date]);
    }
    // the cash sale's payment is part of the same D1 evidence
    await fx.admin.query(`UPDATE payment SET business_date = $2 WHERE id = $1`, [saleA.payment!.id, D1]);

    // D2: credit sale C (1 × P2 = 30 AR)
    const saleC = await commitSale(p2, '1', '30.00', []);
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [saleC.invoice.id, D2]);

    // D3: return 1 × P1 from A → refund 50 in cash, all dated D3
    const retA = await processReturn(saleA.invoice.id, saleA.invoice.lines[0]!.id, '1', 'history return of A', D3);
    expect(retA.refundAmount).toBe('50.0000');
    const refund = await request(app.getHttpServer()).post('/api/returns/refunds').set(owner).send({
      creditNoteId: retA.creditNoteId, amount: '50.00', method: 'cash', businessDate: D3, approveAndPost: true,
    });
    expect(refund.status, JSON.stringify(refund.body)).toBe(201);

    // D4: deposit 20 taken, then applied to invoice C (application dated D4)
    const deposit = await request(app.getHttpServer()).post('/api/deposits').set(owner).send({
      customerId: customer,
      amount: '20.00',
      tenders: [{ method: 'cash', amount: '20.00' }],
    });
    expect(deposit.status, JSON.stringify(deposit.body)).toBe(201);
    const applied = await request(app.getHttpServer()).post('/api/credits/apply').set(owner).send({
      depositId: deposit.body.id, invoiceId: saleC.invoice.id, amount: '20.00',
    });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    await fx.admin.query(
      `UPDATE credit_application SET created_at = $2::timestamptz WHERE deposit_id = $1`,
      [deposit.body.id, `${D4} 12:00:00+00`],
    );

    // D5: return 1 × P2 from the UNPAID credit sale B (AR settled first)
    const retB = await processReturn(saleB.invoice.id, saleB.invoice.lines[0]!.id, '1', 'history return of B', D5);
    expect(retB.arAmount).toBe('30.0000');
    expect(retB.refundAmount).toBe('0.0000');

    // D6 (today): standalone receipt 20 against B, then reverse invoice C
    const receipt = await request(app.getHttpServer()).post('/api/payments').set(owner).send({
      customerId: customer,
      amount: '20.00',
      tenders: [{ method: 'cash', amount: '20.00' }],
      allocations: [{ invoiceId: saleB.invoice.id, amount: '20.00' }],
    });
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    const reversal = await request(app.getHttpServer())
      .post(`/api/sales/invoices/${saleC.invoice.id}/reverse`)
      .set(owner)
      .send({ reason: 'history-stability test: reverse the D2 credit sale' });
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);
  });

  afterAll(async () => {
    await fx?.close();
  });

  it('emits a row for EVERY active date — including the return-only D3 (old code dropped it)', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D6}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));
    expect([...byDate.keys()]).toEqual([D1, D2, D3, D5, D6]); // D4 has no reportable events
    const d3 = byDate.get(D3)!;
    expect(d3.salesCount).toBe(0);
    expect(d3.grossSales).toBe('0.0000');
    expect(d3.returnsTotal).toBe('50.0000');
    expect(d3.refundsTotal).toBe('50.0000');
    expect(d3.netRevenue).toBe('-50.0000');
    expect(d3.grossProfit).toBe('-20.0000'); // −(50 − 30 cogs reversal)
  });

  it('D1/D2 rows carry the exact day-of figures (cash, credit, cogs)', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D6}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));

    const d1 = byDate.get(D1)!;
    expect(d1.salesCount).toBe(2);
    expect(d1.grossSales).toBe('160.0000'); // 100 + 60
    expect(d1.netSales).toBe('160.0000');
    expect(d1.cogsTotal).toBe('96.0000'); // 2×30 + 2×18
    expect(d1.cashSales).toBe('100.0000');
    expect(d1.creditSales).toBe('60.0000');
    expect(d1.returnsTotal).toBe('0.0000');
    expect(d1.grossProfit).toBe('64.0000');

    const d2 = byDate.get(D2)!;
    expect(d2.salesCount).toBe(1);
    expect(d2.grossSales).toBe('30.0000');
    expect(d2.cogsTotal).toBe('18.0000');
    expect(d2.creditSales).toBe('30.0000');
    expect(d2.grossProfit).toBe('12.0000');
  });

  it('POINT-IN-TIME credit sales: the later receipt (D6) and deposit application (D4) never rewrite D1/D2', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D6}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));
    // B (D1): 60 credit; the D6 receipt of 20 and the D5 credit note must
    // not change the CREDIT EXTENDED on D1 — only the D6 reversal-day row
    // and the AR subledger move
    expect(byDate.get(D1)!.creditSales).toBe('60.0000');
    // C (D2): 30 credit; the D4 deposit application (20) came later
    expect(byDate.get(D2)!.creditSales).toBe('30.0000');
  });

  it('the D6 reversal nets ITS OWN date (append-only) and leaves the D2 sale in history', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D6}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));
    const d6 = byDate.get(D6)!;
    expect(d6.salesCount).toBe(-1); // one reversal, no sales today
    expect(d6.grossSales).toBe('-30.0000');
    expect(d6.netSales).toBe('-30.0000');
    expect(d6.cogsTotal).toBe('-18.0000');
    expect(d6.netRevenue).toBe('-30.0000');
    expect(d6.grossProfit).toBe('-12.0000');
    // D2 keeps the sale it actually recorded (the reversal is D6 business)
    expect(byDate.get(D2)!.salesCount).toBe(1);
    expect(byDate.get(D2)!.grossSales).toBe('30.0000');
  });

  it('the D5 AR-settling return shows on D5 and the window reconciles exactly', async () => {
    const rows = await getRows(`daily-sales?from=${D1}&to=${D6}`);
    const byDate = new Map(rows.map((r) => [String(r.businessDate), r]));
    const d5 = byDate.get(D5)!;
    expect(d5.salesCount).toBe(0);
    expect(d5.returnsTotal).toBe('30.0000');
    expect(d5.netRevenue).toBe('-30.0000');
    expect(d5.grossProfit).toBe('-12.0000');

    // window reconciliation: Σ gross = 160 + 30 − 30 = 160;
    // Σ net revenue = 160 + 30 − 50 − 30 − 30 = 80;
    // Σ gross profit = 64 + 12 − 20 − 12 − 12 = 32 (ties to the goods
    // truth: A kept 1×P1 → 20, B kept 1×P2 → 12, C reversed → 0)
    const sum = (k: string) => rows.reduce((acc, r) => acc + Number(r[k]), 0);
    expect(sum('grossSales')).toBe(160);
    expect(sum('netRevenue')).toBe(80);
    expect(sum('grossProfit')).toBe(32);
    expect(sum('cashSales')).toBe(100); // only the D1 POS sale (receipts are source=counter)
    expect(sum('refundsTotal')).toBe(50);
  });

  it('tender-totals reconciles collections and refunds across the same window', async () => {
    const rows = await getRows(`tender-totals?from=${D1}&to=${D6}`);
    const cash = rows.find((r) => r.method === 'cash')!;
    expect(cash.received).toBe('140.0000'); // 100 POS + 20 deposit + 20 standalone receipt
    expect(cash.refunded).toBe('50.0000');
    expect(cash.net).toBe('90.0000');
  });

  it('customer statement and AR aging are AS-OF D2: later settlement never shrinks history', async () => {
    const st = await request(app.getHttpServer())
      .get(`/api/reports/customer-statement?customerId=${customer}&asOf=${D2}`)
      .set(owner);
    expect(st.status).toBe(200);
    // invoices ≤ D2: A 100 (paid D1) + B 60 + C 30 → closing 90; the D4
    // deposit application and D6 receipt must not reduce the as-of view
    expect(st.body.closingBalance).toBe('90.0000');
    expect(st.body.receivable).toBe('90.0000');

    const aging = await request(app.getHttpServer()).get(`/api/reports/ar-aging?asOf=${D2}`).set(owner);
    expect(aging.status).toBe(200);
    const row = (aging.body as Array<Record<string, string>>).find((r) => r.partyId === customer);
    expect(row).toBeTruthy();
    expect(row!.total).toBe('90.0000');
    expect(row!.current).toBe('90.0000');
  });

  it('as-of TODAY: credit-note AR credits, the receipt and the reversal all settle; the AR control reconciles', async () => {
    // B: 60 − 30 (D5 credit note AR credit) − 20 (D6 receipt) = 10 open;
    // C: cancelled by the D6 reversal; A: paid on D1
    const st = await request(app.getHttpServer())
      .get(`/api/reports/customer-statement?customerId=${customer}&asOf=${D6}`)
      .set(owner);
    expect(st.status).toBe(200);
    expect(st.body.receivable).toBe('10.0000');
    // ledger composition: the C reversal appears as its own line
    const reversalLine = (st.body.lines as Array<{ documentType: string; credit: string }>).find(
      (l) => l.documentType === 'invoice_reversal',
    );
    expect(reversalLine).toBeTruthy();
    expect(reversalLine!.credit).toBe('30.0000');

    // the accounting AR control check passes over the SAME evidence —
    // credit notes, deposits, receipt and reversal included
    const rec = await request(app.getHttpServer()).get(`/api/accounting/reconciliation?asOf=${D6}`).set(owner);
    expect(rec.status).toBe(200);
    const byCheck = new Map<string, { passed: boolean; difference: string }>(
      rec.body.checks.map((c: { check: string; passed: boolean; difference: string }) => [c.check, c]),
    );
    expect(byCheck.get('accounts_receivable')!.passed, byCheck.get('accounts_receivable')!.difference).toBe(true);
  });

  it('an inverted range is rejected instead of silently mis-reporting', async () => {
    const res = await request(app.getHttpServer()).get(`/api/reports/daily-sales?from=${D6}&to=${D1}`).set(owner);
    expect(res.status).toBe(400);
  });
});

describe('daily-stock: the [from, to] range is honoured on BOTH ends', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let wh1: string;
  let wh2: string;
  let s: string; // 10.00 / cost 6.00
  let customer: string;

  const SD1 = day(-3);
  const SD2 = day(-2);
  const SD3 = day(-1);
  const SD4 = day(0); // today
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function stockRows(query: string) {
    const res = await request(app.getHttpServer()).get(`/api/reports/daily-stock?${query}`).set(owner);
    expect(res.status, `${query}: ${JSON.stringify(res.body)}`).toBe(200);
    return res.body as Array<Record<string, string>>;
  }

  /** backdate the movements of one source document (house pattern) */
  async function backdateMovements(sourceType: string, sourceId: string, date: string) {
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $4::timestamptz
        WHERE tenant_id = $1 AND source_document_type = $2 AND source_document_id = $3`,
      [fx.tenantA.tenantId, sourceType, sourceId, `${date} 10:00:00+00`],
    );
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);

    wh1 = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'DS-W1', name: 'Stock WH 1' })).body.id;
    wh2 = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'DS-W2', name: 'Stock WH 2' })).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'DS-PC', name: 'Stock Pieces' })).body.id;
    s = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'DS-P', name: 'Stock Product', baseUnitId: unit, sellingPrice: '10.00', purchasePrice: '6.00' })).body.id;
    customer = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Stock Customer', phone: '0244000555' })).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'DS_RTN',
      name: 'Stock report return',
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

    // SD1: opening 100 @ 6 in WH1 (movements carry reason='opening_balance')
    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: wh1,
      authority: 'physical_count',
      businessDate: SD1,
      lines: [{ productId: s, quantityBase: '100', unitCost: '6.00' }],
    });
    expect(opening.status).toBe(201);
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $2::timestamptz
        WHERE tenant_id = $1 AND reason = 'opening_balance'`,
      [fx.tenantA.tenantId, `${SD1} 09:00:00+00`],
    );

    // SD2: transfer 30 WH1→WH2, sale of 5 from WH1
    const transfer = await request(app.getHttpServer()).post('/api/transfers').set(owner).send({
      fromWarehouseId: wh1,
      toWarehouseId: wh2,
      lines: [{ productId: s, quantityBase: '30' }],
    });
    expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/transfers/${transfer.body.id}/dispatch`).set(owner).send()).status).toBe(201);
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/transfers/${transfer.body.id}/receive`)
          .set(owner)
          .send({ lines: [{ productId: s, quantityBase: '30' }] })
      ).status,
      'transfer receive',
    ).toBe(201);
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $3::timestamptz WHERE tenant_id = $1 AND transfer_id = $2`,
      [fx.tenantA.tenantId, transfer.body.id, `${SD2} 11:00:00+00`],
    );

    const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh1,
      customerId: customer,
      lines: [{ productId: s, quantityBase: '5', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '50.00' }],
    });
    expect(sale.status, JSON.stringify(sale.body)).toBe(201);
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [sale.body.invoice.id, SD2]);
    await backdateMovements('invoice', sale.body.invoice.id, SD2);

    // SD3: sale of 3 from WH2 + return 2 of the SD2 sale back into WH1
    const sale2 = await request(app.getHttpServer()).post('/api/sales/commit').set(owner).send({
      warehouseId: wh2,
      customerId: customer,
      lines: [{ productId: s, quantityBase: '3', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '30.00' }],
    });
    expect(sale2.status, JSON.stringify(sale2.body)).toBe(201);
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [sale2.body.invoice.id, SD3]);
    await backdateMovements('invoice', sale2.body.invoice.id, SD3);

    const created = await request(app.getHttpServer()).post('/api/returns').set(owner).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'DS_RTN',
      creditDisposition: 'refund',
      businessDate: SD3,
      clientDocId: `ds-return-${Date.now()}`,
      lines: [{ invoiceLineId: sale.body.invoice.lines[0]!.id, quantity: '2', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await request(app.getHttpServer()).post(`/api/returns/${created.body.id}/receive`).set(owner).send({})).status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${created.body.id}/process`).set(owner).send({});
    expect(processed.status, JSON.stringify(processed.body)).toBe(201);
    await backdateMovements('return_order', created.body.id, SD3);

    // SD4 (today): +4 adjustment in WH1
    const adj = await request(app.getHttpServer()).post('/api/stock-adjustments').set(owner).send({
      warehouseId: wh1,
      reason: 'found stock (daily-stock range test)',
      lines: [{ productId: s, quantityBase: '4', unitCost: '6.00' }],
    });
    expect(adj.status, JSON.stringify(adj.body)).toBe(201);
    await backdateMovements('stock_adjustment', adj.body.id, SD4);
  });

  afterAll(async () => {
    await fx?.close();
  });

  it('mid-window range [SD2, SD3]: opening carries in, and row.closing is the ledger balance at END of q.to', async () => {
    const rows = await stockRows(`from=${SD2}&to=${SD3}`);
    const wh1Row = rows.find((r) => r.warehouseId === wh1)!;
    const wh2Row = rows.find((r) => r.warehouseId === wh2)!;
    expect(wh1Row).toBeTruthy();
    expect(wh2Row).toBeTruthy();

    // WH1: opening 100 (SD1 receipt is BEFORE the window); transfersOut 30,
    // salesIssues 5 (SD2), returnsRestocked 2 (SD3) → closing 67
    expect(wh1Row.opening).toBe('100.000000');
    expect(wh1Row.transfersOut).toBe('30.000000');
    expect(wh1Row.salesIssues).toBe('5.000000');
    expect(wh1Row.returnsRestocked).toBe('2.000000');
    expect(wh1Row.closing).toBe('67.000000'); // THE returned closing — not a derived one

    // WH2: opened empty; transfersIn 30 (SD2), salesIssues 3 (SD3) → 27
    expect(wh2Row.opening).toBe('0.000000');
    expect(wh2Row.transfersIn).toBe('30.000000');
    expect(wh2Row.salesIssues).toBe('3.000000');
    expect(wh2Row.closing).toBe('27.000000');
  });

  it('the OLD defect is dead: movements dated AFTER q.to are excluded (SD4 adjustment invisible in [SD2, SD3])', async () => {
    const rows = await stockRows(`from=${SD2}&to=${SD3}`);
    const wh1Row = rows.find((r) => r.warehouseId === wh1)!;
    expect(wh1Row.positiveAdjustments).toBe('0.000000'); // +4 landed on SD4, outside
    expect(wh1Row.closing).toBe('67.000000'); // NOT 71

    // and the SD1 receipt is opening, not a window receipt
    expect(wh1Row.receipts).toBe('0.000000');
  });

  it('full range [SD1, SD4] reconciles every bucket and the closing balances', async () => {
    const rows = await stockRows(`from=${SD1}&to=${SD4}`);
    const wh1Row = rows.find((r) => r.warehouseId === wh1)!;
    const wh2Row = rows.find((r) => r.warehouseId === wh2)!;
    expect(wh1Row.opening).toBe('0.000000');
    expect(wh1Row.receipts).toBe('100.000000');
    expect(wh1Row.transfersOut).toBe('30.000000');
    expect(wh1Row.salesIssues).toBe('5.000000');
    expect(wh1Row.returnsRestocked).toBe('2.000000');
    expect(wh1Row.positiveAdjustments).toBe('4.000000');
    expect(wh1Row.closing).toBe('71.000000'); // 0 + 100 + 2 + 4 − 30 − 5
    expect(wh2Row.transfersIn).toBe('30.000000');
    expect(wh2Row.salesIssues).toBe('3.000000');
    expect(wh2Row.closing).toBe('27.000000');
    // the closing ties to the live balance projection for the full range
    const live = await request(app.getHttpServer()).get(`/api/inventory/balances?warehouseId=${wh1}&productId=${s}`).set(owner);
    expect(live.status).toBe(200);
    expect(live.body.items[0]!.quantityBase).toBe('71.000000');
  });

  it('single-day window [SD2, SD2] reports only that day on top of the opening', async () => {
    const rows = await stockRows(`from=${SD2}&to=${SD2}`);
    const wh1Row = rows.find((r) => r.warehouseId === wh1)!;
    expect(wh1Row.opening).toBe('100.000000');
    expect(wh1Row.transfersOut).toBe('30.000000');
    expect(wh1Row.salesIssues).toBe('5.000000');
    expect(wh1Row.returnsRestocked).toBe('0.000000'); // SD3 restock outside
    expect(wh1Row.closing).toBe('65.000000'); // 100 − 30 − 5
  });
});
