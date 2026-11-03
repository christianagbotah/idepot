/**
 * Phase 4 E2E purchasing flows (ROADMAP exit criterion: E2E purchase→pay):
 *
 *   PO → GRN → supplier invoice → 3-way match → AP liability →
 *   supplier payment → explicit allocation → AP zero — with the actual
 *   database projections verified at every step (stock quantity + AVCO
 *   value, GR/IR accrual, AP control, balanced journals, audit, outbox).
 *
 * Plus: partial lifecycle (multiple GRNs + invoices on one PO), match
 * exceptions (over-billing, price variance, duplicate invoice),
 * over-receipt tolerance + supervisor approval, AP aging and the
 * supplier statement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Phase 4 purchasing E2E (PO → GRN → invoice → match → pay)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let productB: string;
  let supplierS1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** tenant_config rows are created lazily; ensure one exists, then set. */
  async function setConfig(setSql: string): Promise<void> {
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    await fx.admin.query(`UPDATE tenant_config SET ${setSql} WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
  }

  async function glRow(purpose: string): Promise<string> {
    const res = await fx.admin.query(
      `SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0)::text AS balance
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = $1 AND m.purpose = $2`,
      [fx.tenantA.tenantId, purpose],
    );
    return res.rows[0].balance;
  }

  async function journalCount(sourceKind: string, sourceId: string): Promise<number> {
    const res = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = $2 AND source_id = $3`,
      [fx.tenantA.tenantId, sourceKind, sourceId],
    );
    return res.rows[0].n;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'P4-WHA', name: 'P4 WH A' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'P4-PC', name: 'P4 Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'P4-A', name: 'P4 Product A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'P4-B', name: 'P4 Product B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    supplierS1 = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'P4 Supplier One', phone: '0201111111' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  let poId: string;
  let poLineA: string;
  let poLineB: string;
  let grnLineB: string;

  it('creates and approves a purchase order (no stock/AP effect)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/purchase-orders')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        expectedDate: TODAY,
        lines: [
          { productId: productA, orderedQuantity: '100', unitPrice: '30.00' },
          { productId: productB, orderedQuantity: '50', unitPrice: '12.00' },
        ],
        submit: true,
      });
    expect(res.status).toBe(201);
    poId = res.body.id;
    poLineA = res.body.lines.find((l: { productId: string }) => l.productId === productA).id;
    poLineB = res.body.lines.find((l: { productId: string }) => l.productId === productB).id;
    expect(res.body.status).toBe('submitted');
    expect(res.body.code).toMatch(/^PO\d+$/);

    // a PO is a commitment document: nothing else moves
    expect(await glRow('inventory')).toBe('0');
    expect(await glRow('accounts_payable')).toBe('0');
    const stock = await fx.admin.query(
      `SELECT count(*)::int AS n FROM stock_movement WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    expect(stock.rows[0].n).toBe(0);

    const approved = await request(app.getHttpServer())
      .post(`/api/purchasing/purchase-orders/${poId}/approve`)
      .set(manager)
      .send({});
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('approved');
  });

  let grnId: string;
  let grnLineA: string;

  it('posts a GRN: stock + AVCO value + Dr Inventory / Cr GR-IR in ONE transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        purchaseOrderId: poId,
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [
          { purchaseOrderLineId: poLineA, productId: productA, receivedQuantity: '60', unitCost: '30.00' },
          { purchaseOrderLineId: poLineB, productId: productB, receivedQuantity: '50', unitCost: '12.00' },
        ],
      });
    expect(res.status).toBe(201);
    grnId = res.body.id;
    grnLineA = res.body.lines.find((l: { productId: string }) => l.productId === productA).id;
    grnLineB = res.body.lines.find((l: { productId: string }) => l.productId === productB).id;
    expect(res.body.code).toMatch(/^GRN\d+$/);
    expect(res.body.totalValue).toBe('2400.0000'); // 60×30 + 50×12
    expect(res.body.status).toBe('posted');

    // stock + AVCO value landed
    const bal = await fx.admin.query(
      `SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productA],
    );
    expect(bal.rows[0].q).toBe('60.000000');
    expect(bal.rows[0].v).toBe('1800.0000');

    // journal: Dr Inventory 2400 / Cr GR-IR 2400
    expect(await glRow('inventory')).toBe('2400.0000');
    expect(await glRow('grni_clearing')).toBe('-2400.0000');
    expect(await journalCount('goods_receipt', grnId)).toBe(1);
    const entry = await fx.admin.query(
      `SELECT total_debit::text AS d, total_credit::text AS c, business_date::text AS bd, reference
       FROM journal_entry WHERE source_kind = 'goods_receipt' AND source_id = $1`,
      [grnId],
    );
    expect(entry.rows[0].d).toBe('2400.0000');
    expect(entry.rows[0].c).toBe('2400.0000');
    expect(entry.rows[0].bd).toBe(TODAY);
    expect(entry.rows[0].reference).toBe(res.body.code);

    // PO line counters + status
    const poRes = await request(app.getHttpServer()).get(`/api/purchasing/purchase-orders/${poId}`).set(owner);
    expect(poRes.body.status).toBe('partially_received');
    const poLineADto = poRes.body.lines.find((l: { productId: string }) => l.productId === productA);
    const poLineBDto = poRes.body.lines.find((l: { productId: string }) => l.productId === productB);
    expect(poLineADto.receivedQuantityBase).toBe('60.000000');
    expect(poLineBDto.receivedQuantityBase).toBe('50.000000');

    // audit + outbox in the same transaction
    const audit = await fx.admin.query(
      `SELECT count(*)::int AS n FROM audit_event WHERE entity_id = $1 AND action = 'goods_receipt.posted'`,
      [grnId],
    );
    expect(audit.rows[0].n).toBe(1);
    const outbox = await fx.admin.query(
      `SELECT count(*)::int AS n FROM outbox_event WHERE type = 'PurchaseReceived' AND payload->>'goodsReceiptId' = $1`,
      [grnId],
    );
    expect(outbox.rows[0].n).toBe(1);
  });

  it('RBAC: a cashier cannot post GRNs (server-enforced)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(cashier)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '1', unitCost: '30.00' }],
      });
    expect(res.status).toBe(403);
  });

  let invoiceId: string;

  it('records + posts the supplier invoice: 3-way match clean → AP booked, GR/IR cleared, PPV explicit', async () => {
    // configure a 5% price tolerance for this flow (tolerances are
    // tenant configuration — the zero default is strict-by-design)
    await setConfig(`match_price_tolerance_pct = 0.05`);
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0001',
        supplierInvoiceDate: TODAY,
        dueDate: TODAY,
        businessDate: TODAY,
        purchaseOrderId: poId,
        post: true,
        lines: [
          {
            goodsReceiptLineId: grnLineA,
            purchaseOrderLineId: poLineA,
            productId: productA,
            description: 'Product A per GRN',
            quantityBase: '60',
            unitPrice: '31.00', // +1.00 vs PO → PPV
          },
          {
            goodsReceiptLineId: grnLineB,
            purchaseOrderLineId: poLineB,
            productId: productB,
            description: 'Product B per GRN',
            quantityBase: '50',
            unitPrice: '12.00',
          },
        ],
      });
    expect(res.status).toBe(201);
    invoiceId = res.body.id;
    expect(res.body.status).toBe('posted');
    expect(res.body.matchState).toBe('within_tolerance');
    expect(res.body.subtotal).toBe('2460.0000'); // 60×31 + 50×12
    expect(res.body.total).toBe('2460.0000');
    expect(res.body.amountOpen).toBe('2460.0000');

  });

  it('AP journal verified: Dr GR/IR 2400 + Dr PPV 60 / Cr AP 2460', async () => {
    expect(await journalCount('supplier_invoice', invoiceId)).toBe(1);
    const lines = await fx.admin.query(
      `SELECT m.purpose, l.debit::text AS d, l.credit::text AS c
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND l.entry_id = (
         SELECT id FROM journal_entry WHERE source_kind = 'supplier_invoice' AND source_id = $2)`,
      [fx.tenantA.tenantId, invoiceId],
    );
    const byPurpose = new Map(lines.rows.map((r: { purpose: string; d: string; c: string }) => [r.purpose, r]));
    expect(byPurpose.get('grni_clearing')!.d).toBe('2400.0000');   // GR/IR cleared at receipt cost
    expect(byPurpose.get('purchase_price_variance')!.d).toBe('60.0000'); // 60 × (31−30)
    expect(byPurpose.get('accounts_payable')!.c).toBe('2460.0000');
    // GR/IR accrual is now fully cleared (2400 − 2400)
    expect(await glRow('grni_clearing')).toBe('0.0000');
    expect(await glRow('accounts_payable')).toBe('-2460.0000');
    // inventory value NOT double-posted at invoice time
    expect(await glRow('inventory')).toBe('2400.0000');
  });

  it('pays the supplier with an explicit allocation → AP zero, journals balanced', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({
        supplierId: supplierS1,
        businessDate: TODAY,
        amount: '2500.00',
        method: 'cash',
        allocations: [{ supplierInvoiceId: invoiceId, amount: '2460.0000' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.amountAllocated).toBe('2460.0000');
    expect(res.body.amountUnapplied).toBe('40.0000');
    expect(res.body.allocations[0].supplierInvoiceId).toBe(invoiceId);

    // invoice fully settled
    const inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${invoiceId}`)
      .set(owner);
    expect(inv.body.amountOpen).toBe('0.0000');
    expect(inv.body.status).toBe('paid');

    // journals: payment Dr AP 2460 + Dr advances 40 / Cr cash 2500
    const payLines = await fx.admin.query(
      `SELECT m.purpose, l.debit::text AS d, l.credit::text AS c
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND l.entry_id = (
         SELECT id FROM journal_entry WHERE source_kind = 'supplier_payment' AND source_id = $2)`,
      [fx.tenantA.tenantId, res.body.id],
    );
    const byP = new Map(payLines.rows.map((r: { purpose: string; d: string; c: string }) => [r.purpose, r]));
    expect(byP.get('accounts_payable')!.d).toBe('2460.0000');
    expect(byP.get('supplier_advance')!.d).toBe('40.0000');
    expect(byP.get('cash')!.c).toBe('2500.0000');
    expect(await glRow('accounts_payable')).toBe('0.0000');

    // applies the advance to a second invoice later in the suite
    advancePaymentId = res.body.id;
  });

  let advancePaymentId: string;

  it('over-billing past the received GRN quantity is rejected', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0002',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        lines: [{
          goodsReceiptLineId: grnLineA,
          productId: productA,
          description: 'over-bill attempt',
          quantityBase: '5', // 60 already fully invoiced by SUP-INV-0001
          unitPrice: '30.00',
        }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/over-billing/i);
  });

  it('invoice-before-receipt is structurally prevented (inventory line requires a GRN)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0003',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        lines: [{
          productId: productA,
          description: 'no receipt yet',
          quantityBase: '10',
          unitPrice: '30.00',
        }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/goods receipt line/i);
  });

  it('price variance beyond tolerance requires a verified approval before posting', async () => {
    // tighten tolerance to 1% via tenant_config (admin SQL — configuration)
    await setConfig(`match_price_tolerance_pct = 0.01, match_value_tolerance = 0`);
    // second GRN for product A (40 more units)
    const grn2 = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        purchaseOrderId: poId,
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ purchaseOrderLineId: poLineA, productId: productA, receivedQuantity: '40', unitCost: '30.00' }],
      });
    expect(grn2.status).toBe(201);

    // invoice at 35 (17% above PO 30) → approval_required
    const inv = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0004',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        lines: [{
          goodsReceiptLineId: grn2.body.lines[0].id,
          purchaseOrderLineId: poLineA,
          productId: productA,
          description: 'price variance test',
          quantityBase: '40',
          unitPrice: '35.00',
        }],
      });
    expect(inv.status).toBe(201);
    expect(inv.body.matchState).toBe('exceptions_pending');
    const exception = inv.body.matchItems.find((m: { severity: string }) => m.severity === 'approval_required');
    expect(exception).toBeDefined();
    expect(exception.matchDimension).toBe('price');

    // posting WITHOUT approval fails
    const noApproval = await request(app.getHttpServer())
      .post(`/api/purchasing/supplier-invoices/${inv.body.id}/post`)
      .set(manager)
      .send({});
    expect(noApproval.status).toBe(409);
    expect(noApproval.body.error).toMatch(/unapproved match exception/i);

    // posting WITH a verified approval (manager credentials) succeeds
    const approved = await request(app.getHttpServer())
      .post(`/api/purchasing/supplier-invoices/${inv.body.id}/post`)
      .set(manager)
      .send({
        username: fx.tenantA.users.manager!.email,
        password: fx.tenantA.users.manager!.password,
        reason: 'supplier price increase accepted by procurement',
      });
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('posted');
    expect(approved.body.matchState).toBe('exceptions_approved');

    // restore strict-zero tolerance for later tests
    await setConfig(`match_price_tolerance_pct = 0, match_value_tolerance = 0`);
  });

  let grnLineOverreceipt: string;

  it('over-receipt beyond the tolerance is a conflict; a verified approval allows it', async () => {
    await setConfig(`po_overreceipt_tolerance_pct = 0.05`);
    // product B ordered 50, received 50 — receiving 3 more exceeds 5% tolerance
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        purchaseOrderId: poId,
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ purchaseOrderLineId: poLineB, productId: productB, receivedQuantity: '3', unitCost: '12.00' }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/over-receipt beyond tolerance/i);

    // with the supervisor approval (verified server-side) it posts
    const approved = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        purchaseOrderId: poId,
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ purchaseOrderLineId: poLineB, productId: productB, receivedQuantity: '2', unitCost: '12.00' }],
        overreceiptApproval: {
          username: fx.tenantA.users.manager!.email,
          password: fx.tenantA.users.manager!.password,
          reason: 'supplier replaced damaged units verbally approved',
        },
      });
    expect(approved.status).toBe(201);
    grnLineOverreceipt = approved.body.lines[0].id;
    await setConfig(`po_overreceipt_tolerance_pct = 0`);
  });

  it('duplicate supplier invoice number is a conflict, never a second AP entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0001',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        lines: [{
          goodsReceiptLineId: grnLineOverreceipt,
          productId: productB,
          description: 'duplicate attempt (valid GRN line, same supplier number)',
          quantityBase: '1',
          unitPrice: '12.00',
        }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/duplicate supplier invoice/i);
  });

  it('applies the earlier advance to a new invoice (Dr AP / Cr advances)', async () => {
    // small direct GRN + invoice to consume the 40.00 advance
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productB, receivedQuantity: '2', unitCost: '12.00' }],
      });
    expect(grn.status).toBe(201);
    const inv = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0005',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        lines: [{
          goodsReceiptLineId: grn.body.lines[0].id,
          productId: productB,
          description: 'advance consumption test',
          quantityBase: '2',
          unitPrice: '12.00',
        }],
      });
    expect(inv.status).toBe(201);
    expect(inv.body.status).toBe('posted');
    expect(inv.body.amountOpen).toBe('24.0000');

    const apply = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments/apply-advance')
      .set(manager)
      .send({
        paymentId: advancePaymentId,
        allocations: [{ supplierInvoiceId: inv.body.id, amount: '24.0000' }],
      });
    expect(apply.status).toBe(201);
    expect(apply.body.amountUnapplied).toBe('16.0000');
    expect(apply.body.amountAllocated).toBe('2484.0000');

    const invAfter = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${inv.body.id}`)
      .set(owner);
    expect(invAfter.body.amountOpen).toBe('0.0000');
  });

  it('credit note with a stock return: AP reduced, stock returned at AVCO, journals balanced', async () => {
    // a fresh GRN + posted UNPAID invoice to credit against
    const grnCn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productB, receivedQuantity: '2', unitCost: '12.00' }],
      });
    expect(grnCn.status).toBe(201);
    const invCn = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'SUP-INV-0006',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        lines: [{
          goodsReceiptLineId: grnCn.body.lines[0].id,
          productId: productB,
          description: 'units to be returned',
          quantityBase: '2',
          unitPrice: '12.00',
        }],
      });
    expect(invCn.status).toBe(201);
    expect(invCn.body.amountOpen).toBe('24.0000');
    const before = await fx.admin.query(
      `SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productB],
    );
    const apBefore = await glRow('accounts_payable');
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-adjustments')
      .set(manager)
      .send({
        kind: 'credit_note',
        supplierId: supplierS1,
        supplierInvoiceId: invCn.body.id,
        businessDate: TODAY,
        reason: 'two units returned as damaged (credit note test)',
        adjustmentClass: 'returns',
        amount: '24.0000',
        stockReturn: [{ productId: productB, warehouseId: whA, quantityBase: '2' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe('credit_note');

    // stock returned at AVCO: 2 × 12 = 24 value out
    const after = await fx.admin.query(
      `SELECT quantity_base::text AS q, total_value::text AS v FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productB],
    );
    expect(after.rows[0].q).toBe(`${(Number(before.rows[0].q) - 2).toFixed(6)}`);
    expect(after.rows[0].v).toBe(`${(Number(before.rows[0].v) - 24).toFixed(4)}`);

    // AP control moved by exactly the credited amount (debit side)
    const apAfter = await glRow('accounts_payable');
    expect(apAfter).toBe(`${(Number(apBefore) + 24).toFixed(4)}`);

    // return movement is append-only evidence
    const movement = await fx.admin.query(
      `SELECT count(*)::int AS n FROM stock_movement
       WHERE source_document_type = 'supplier_adjustment' AND source_document_id = $1 AND movement_type = 'issue'`,
      [res.body.id],
    );
    expect(movement.rows[0].n).toBe(1);
  });

  it('AP aging buckets classify open items by due date', async () => {
    // aging as of far future → everything with a due date is 90_plus
    const res = await request(app.getHttpServer())
      .get(`/api/ap/aging?asOf=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    const row = res.body.find((r: { supplierId: string }) => r.supplierId === supplierS1);
    expect(row).toBeDefined();
    // SUP-INV-0004 (1400 open) is due TODAY → current bucket
    expect(row.current).toBe('1400.0000');
  });

  it('supplier statement regenerates from documents with a running balance', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/ap/statements/${supplierS1}?asOf=${TODAY}`)
      .set(owner);
    expect(res.status).toBe(200);
    expect(res.body.supplierId).toBe(supplierS1);
    const invoices = res.body.lines.filter((l: { documentType: string }) => l.documentType === 'supplier_invoice');
    expect(invoices.length).toBeGreaterThanOrEqual(3);
    // review round 2 (blocker 5): every document appears EXACTLY once —
    // closing = 2460 (inv1) + 1400 (inv4) + 24 (inv5) − 24 (credit note)
    //            − 2460 (payment) − 24 (advance apply) = 1400
    // (the previous statement folded the notes into the invoice row AND
    //  unioned them again — its 1376 double-counted the credit note)
    expect(res.body.closingBalance).toBe('1400.0000');
  });

  it('cross-tenant isolation: tenant B cannot see tenant A purchasing documents', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/purchasing/purchase-orders/${poId}`)
      .set(auth(fx.tenantB.users.owner!.token!));
    expect(res.status).toBe(404);
    const inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${invoiceId}`)
      .set(auth(fx.tenantB.users.owner!.token!));
    expect(inv.status).toBe(404);
  });
});
