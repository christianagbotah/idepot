/**
 * Phase 5 operational report endpoints — direct API coverage (resolves the
 * parity open-gap #7: "all 12 report endpoints implemented and web-visible
 * but zero direct API test coverage").
 *
 * Scenario (single product, price 50 / cost 30, opening 100 units):
 *   - cash sale of 4 units (200.00 received)
 *   - return of 1 unit → credit note, store-credit disposition, restocked
 * Then every report endpoint is asserted with EXACT money/quantity math:
 *   - daily-sales: return-adjusted on the return's OWN business date
 *   - tender-totals / daily-stock / item-margin / returns-by-reason
 *   - stock-valuation (AVCO 97 × 30)
 *   - customer-statement (invoice + payment + credit note ledger, store credit)
 *   - sales-by-customer/product/user/warehouse, backlog, ar/ap aging,
 *     shift-variance: shape + status + emptiness semantics
 *   - RBAC: cashier has no reports:read; auditor does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('operational report endpoints (Phase 5 §10-12)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let wh: string;
  let product: string;
  let customer: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const today = new Date().toISOString().slice(0, 10);
  const range = `from=${today}&to=${today}`;

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);

    wh = (
      await request(app.getHttpServer()).post('/api/warehouses').set(manager).send({ code: 'RPT-WH', name: 'Reports WH' })
    ).body.id;
    const unit = (await request(app.getHttpServer()).post('/api/units').set(manager).send({ code: 'RPT-PC', name: 'Report Pieces' })).body.id;
    product = (
      await request(app.getHttpServer())
        .post('/api/products')
        .set(manager)
        .send({ code: 'RPT-P', name: 'Report Product', baseUnitId: unit, sellingPrice: '50.00', purchasePrice: '30.00' })
    ).body.id;
    customer = (
      await request(app.getHttpServer()).post('/api/customers').set(manager).send({ name: 'Report Customer', phone: '0244000888' })
    ).body.id;

    const reason = await request(app.getHttpServer()).post('/api/returns/reasons').set(manager).send({
      code: 'WRONG_ITEM_RPT',
      name: 'Wrong item (reports fixture)',
      requiresApproval: false,
      refundPermitted: true,
      replacementPermitted: true,
      storeCreditPermitted: true,
      restockPermitted: true,
    });
    expect(reason.status).toBe(201);

    // auto-approval threshold for requiresApproval=false reasons (§4.5)
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 100)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 100`,
      [fx.tenantA.tenantId],
    );

    // opening stock 100 units @ 30
    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(manager).send({
      warehouseId: wh,
      authority: 'physical_count',
      businessDate: today,
      lines: [{ productId: product, quantityBase: '100', unitCost: '30.00' }],
    });
    expect(opening.status).toBe(201);

    // cash sale: 4 × 50 = 200
    const sale = await request(app.getHttpServer()).post('/api/sales/commit').set(manager).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '4', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(sale.status).toBe(201);

    // return 1 unit → store credit, restock sellable (auto-approved reason)
    const ret = await request(app.getHttpServer()).post('/api/returns').set(manager).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'WRONG_ITEM_RPT',
      creditDisposition: 'store_credit',
      lines: [
        {
          invoiceLineId: sale.body.invoice.lines[0].id,
          quantity: '1',
          condition: 'good',
          disposition: 'restock_sellable',
        },
      ],
      submit: true,
    });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('approved'); // requiresApproval=false + credit 50 <= threshold 100
    const received = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/receive`).set(manager).send({});
    if (received.status !== 201) console.error('RECEIVE BODY', JSON.stringify(received.body), 'RET STATUS', ret.body.status);
    expect(received.status).toBe(201);
    const processed = await request(app.getHttpServer()).post(`/api/returns/${ret.body.id}/process`).set(manager).send({});
    if (processed.status !== 201) console.error('PROCESS BODY', JSON.stringify(processed.body));
    expect(processed.status).toBe(201);
    expect(processed.body.storeCreditAmount).toBe('50.0000');
  });

  afterAll(async () => {
    await fx?.close();
  });

  async function get(path: string, token: Record<string, string> = manager) {
    return request(app.getHttpServer()).get(`/api/reports/${path}`).set(token);
  }

  // ------------------------------------------------------------------ RBAC

  it('cashier has no reports:read (403); auditor does (200)', async () => {
    expect((await get(`daily-sales?${range}`, cashier)).status).toBe(403);
    expect((await get(`daily-sales?${range}`, auditor)).status).toBe(200);
  });

  // ------------------------------------------------------------- daily-sales

  it('daily-sales is return-adjusted with exact money math', async () => {
    const res = await get(`daily-sales?${range}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const row = (res.body as Array<Record<string, string | number>>).find((r) => r.businessDate === today);
    expect(row).toBeTruthy();
    expect(row!.salesCount).toBe(1);
    expect(row!.grossSales).toBe('200.0000');
    expect(row!.netSales).toBe('200.0000');
    expect(row!.cogsTotal).toBe('120.0000'); // 4 × 30 cost-at-sale
    expect(row!.returnsTotal).toBe('50.0000'); // credit note total on ITS OWN date
    expect(row!.netRevenue).toBe('150.0000'); // 200 − 50
    expect(row!.grossProfit).toBe('60.0000'); // 150 − (120 − 30 cogs reversal)
    expect(row!.cashSales).toBe('200.0000');
    expect(row!.refundsTotal).toBe('0.0000'); // store credit, not a cash refund
  });

  // ------------------------------------------------------------ tender totals

  it('tender-totals nets refunds per method', async () => {
    const res = await get(`tender-totals?${range}`);
    expect(res.status).toBe(200);
    const cash = (res.body as Array<Record<string, string>>).find((r) => r.method === 'cash');
    expect(cash).toBeTruthy();
    expect(cash!.received).toBe('200.0000');
    expect(cash!.refunded).toBe('0.0000');
    expect(cash!.net).toBe('200.0000');
  });

  // -------------------------------------------------------------- daily-stock

  it('daily-stock derives the ledger closing (legacy defect: closing only when sale+transfer both existed)', async () => {
    const res = await get(`daily-stock?${range}&warehouseId=${wh}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<Record<string, string>>).find((r) => r.productId === product);
    expect(row).toBeTruthy();
    expect(row!.receipts).toBe('100.000000'); // opening count dated today
    expect(row!.salesIssues).toBe('4.000000'); // magnitude — issues are SIGNED negative in the ledger
    expect(row!.returnsRestocked).toBe('1.000000');
    expect(row!.transfersIn).toBe('0.000000');
    expect(row!.transfersOut).toBe('0.000000');
    // THE RETURNED closing, asserted directly (review 5834590343: never
    // re-derive it from the row's own components): 0 + 100 + 1 − 4 = 97
    expect(row!.opening).toBe('0.000000');
    expect(row!.closing).toBe('97.000000');
  });

  // -------------------------------------------------------------- item-margin

  it('item-margin uses the canonical cost-at-sale AVCO basis (legacy defect: three inconsistent tabs)', async () => {
    const res = await get(`item-margin?${range}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<Record<string, string>>).find((r) => r.productId === product);
    expect(row).toBeTruthy();
    expect(row!.quantitySold).toBe('4.000000');
    expect(row!.quantityReturned).toBe('1.000000');
    expect(row!.grossRevenue).toBe('200.0000');
    expect(row!.returns).toBe('50.0000');
    expect(row!.netRevenue).toBe('150.0000');
    expect(row!.cogs).toBe('120.0000');
    expect(row!.cogsReversal).toBe('30.0000'); // 1 × 30 ORIGINAL cost
    expect(row!.netCogs).toBe('90.0000');
    expect(row!.grossProfit).toBe('60.0000');
  });

  // --------------------------------------------------------- returns-by-reason

  it('returns-by-reason reports quantity, credit and store-credit issued', async () => {
    const res = await get(`returns-by-reason?${range}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<Record<string, string>>).find((r) => String(r.reasonCode).includes('WRONG_ITEM_RPT'));
    expect(row).toBeTruthy();
    expect(String(row!.quantityReturned)).toBe('1.000000');
    expect(String(row!.grossCredit)).toBe('50.0000');
    expect(Number(row!.refunded)).toBe(0);
    expect(String(row!.storeCreditIssued)).toBe('50.0000');
  });

  // ----------------------------------------------------------- stock-valuation

  it('stock-valuation values the AVCO quantity at cost', async () => {
    const res = await get(`stock-valuation?${range}`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<Record<string, string>>).find((r) => r.productId === product);
    expect(row).toBeTruthy();
    expect(row!.quantityBase).toBe('97.000000');
    expect(row!.totalValue).toBe('2910.0000'); // 97 × 30
  });

  // -------------------------------------------------------- customer statement

  it('customer statement runs one ledger over invoice + payment + credit note with store credit', async () => {
    const res = await get(`customer-statement?customerId=${customer}&asOf=${today}`);
    expect(res.status).toBe(200);
    const st = res.body as {
      lines: Array<{ documentType: string; debit: string; credit: string; balance: string }>;
      closingBalance: string;
      receivable: string;
      storeCredit: string;
    };
    const invoice = st.lines.find((l) => l.documentType === 'invoice');
    const payment = st.lines.find((l) => l.documentType === 'payment');
    const creditNote = st.lines.find((l) => l.documentType === 'credit_note');
    expect(invoice).toBeTruthy();
    expect(invoice!.debit).toBe('200.0000');
    expect(payment).toBeTruthy();
    expect(payment!.credit).toBe('200.0000');
    expect(creditNote).toBeTruthy(); // ar_amount 0 — present with credit 0.0000
    expect(st.closingBalance).toBe('0.0000');
    expect(st.receivable).toBe('0.0000');
    expect(st.storeCredit).toBe('50.0000');
  });

  // ------------------------------------------------------ sales-by dimensions

  it('sales-by-customer/product/user/warehouse agree on the same math', async () => {
    for (const dim of ['sales-by-customer', 'sales-by-product', 'sales-by-user', 'sales-by-warehouse']) {
      const res = await get(`${dim}?${range}`);
      expect(res.status).toBe(200);
      const rows = res.body as Array<Record<string, string>>;
      expect(rows.length).toBeGreaterThan(0);
      const total = rows.reduce((acc, r) => acc + Number(r.netRevenue), 0);
      expect(total).toBe(150); // 200 − 50 return
      const profit = rows.reduce((acc, r) => acc + Number(r.grossProfit), 0);
      expect(profit).toBe(60);
    }
  });

  // ------------------------------------------------- shape + emptiness reports

  it('backlog, ar-aging, ap-aging and shift-variance respond with bounded arrays', async () => {
    const backlog = await get(`backlog?${range}`);
    expect(backlog.status).toBe(200);
    expect(Array.isArray(backlog.body)).toBe(true);
    expect((backlog.body as unknown[]).length).toBe(0); // no sales orders

    const ar = await get(`ar-aging?to=${today}`);
    expect(ar.status).toBe(200);
    expect(Array.isArray(ar.body)).toBe(true);
    // the only invoice is fully paid — no outstanding bucket
    for (const row of ar.body as Array<Record<string, string>>) {
      expect(row.total).toBe('0.0000');
    }

    const ap = await get(`ap-aging?to=${today}`);
    expect(ap.status).toBe(200);
    expect(Array.isArray(ap.body)).toBe(true);
    expect((ap.body as unknown[]).length).toBe(0); // no supplier activity

    const shifts = await get(`shift-variance?${range}`);
    expect(shifts.status).toBe(200);
    expect(Array.isArray(shifts.body)).toBe(true);
  });
});
