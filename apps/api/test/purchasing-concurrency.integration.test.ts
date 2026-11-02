/**
 * Phase 4 purchasing concurrency + deep atomicity (ROADMAP Phase 4
 * exit criteria; concurrency test matrix from the Phase 4 scope):
 *
 * Real Promise.all races:
 *  - simultaneous GRNs against the same PO remaining quantity
 *  - duplicate supplier invoice submission (same payload)
 *  - simultaneous AP allocations against the same invoice (one loses
 *    with a deterministic over-allocation conflict — never a raw 23505)
 *  - duplicate bank transfer client_doc_id (idempotency)
 *
 * Deep atomicity (failure injected AFTER the deepest writes):
 *  - GRN: after stock movements + PO counters, before/after the journal
 *  - supplier invoice: after GRN/PO counter updates, before/after the
 *    journal
 *  - supplier payment: after allocation rows, before audit
 * Exact before/after snapshots across EVERY affected table prove zero
 * partial state (not row counts — canonical values).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);

/** Canonical snapshots of every table the purchasing posting set touches. */
async function snapshot(fx: ApiFixture, tenantId: string): Promise<Record<string, unknown>> {
  const tables = [
    'purchase_order', 'purchase_order_line',
    'goods_receipt', 'goods_receipt_line',
    'supplier_invoice', 'supplier_invoice_line', 'supplier_invoice_tax_component',
    'match_review_item',
    'supplier_payment', 'supplier_payment_allocation',
    'supplier_adjustment', 'supplier_adjustment_line',
    'stock_movement', 'stock_balance', 'stock_cost_state',
    'journal_entry', 'journal_line',
    'audit_event', 'outbox_event',
  ];
  const out: Record<string, unknown> = {};
  for (const t of tables) {
    const res = await fx.admin.query(
      `SELECT row_to_json(x) AS jr FROM (SELECT * FROM ${t} WHERE tenant_id = $1) x`,
      [tenantId],
    );
    out[t] = res.rows.map((r: { jr: unknown }) => JSON.stringify(r.jr)).sort();
  }
  return out;
}

function expectSnapshotsEqual(a: Record<string, unknown>, b: Record<string, unknown>): void {
  for (const table of Object.keys(a)) {
    expect(b[table], `table ${table} changed`).toEqual(a[table]);
  }
}

describe('Phase 4 purchasing concurrency', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let supplierS1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'CNC-WH', name: 'CNC WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'CNC-PC', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'CNC-A', name: 'CNC A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    supplierS1 = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'CNC Supplier', phone: '0202222222' })).body.id;
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    await fx.admin.query(
      `UPDATE tenant_config SET po_overreceipt_tolerance_pct = 0 WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('simultaneous GRNs against the same remaining PO quantity: exactly one commits', async () => {
    const po = await request(app.getHttpServer())
      .post('/api/purchasing/purchase-orders')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        lines: [{ productId: productA, orderedQuantity: '10', unitPrice: '30.00' }],
        submit: true,
      });
    expect(po.status).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/purchasing/purchase-orders/${po.body.id}/approve`)
      .set(manager)
      .send({});

    const body = () => ({
      purchaseOrderId: po.body.id,
      supplierId: supplierS1,
      warehouseId: whA,
      businessDate: TODAY,
      lines: [{ purchaseOrderLineId: po.body.lines[0].id, productId: productA, receivedQuantity: '8', unitCost: '30.00' }],
    });
    // two concurrent receipts of 8 against a remaining 10: at most one
    // can commit (8+8=16 > 10 with zero tolerance)
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post('/api/purchasing/grns').set(manager).send(body()),
      request(app.getHttpServer()).post('/api/purchasing/grns').set(manager).send(body()),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);
    expect((r1.status === 409 ? r1 : r2).body.error).toMatch(/over-receipt beyond tolerance/i);

    // exactly ONE receipt committed — stock and counters agree with it
    const balance = await fx.admin.query(
      `SELECT quantity_base::text AS q FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productA],
    );
    expect(balance.rows[0].q).toBe('8.000000');
    const pol = await fx.admin.query(
      `SELECT received_quantity_base::text AS r FROM purchase_order_line WHERE tenant_id = $1 AND purchase_order_id = $2`,
      [fx.tenantA.tenantId, po.body.id],
    );
    expect(pol.rows[0].r).toBe('8.000000');
    const grnCount = await fx.admin.query(
      `SELECT count(*)::int AS n FROM goods_receipt WHERE tenant_id = $1 AND purchase_order_id = $2`,
      [fx.tenantA.tenantId, po.body.id],
    );
    expect(grnCount.rows[0].n).toBe(1);
  });

  it('duplicate supplier invoice submission: one commits, the duplicate is a clean conflict', async () => {
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '20', unitCost: '30.00' }],
      });
    expect(grn.status).toBe(201);
    const grnLine = grn.body.lines[0].id;
    const body = () => ({
      supplierId: supplierS1,
      supplierInvoiceNumber: 'CNC-DUP-1',
      supplierInvoiceDate: TODAY,
      businessDate: TODAY,
      post: true,
      lines: [{ goodsReceiptLineId: grnLine, productId: productA, description: 'dup race', quantityBase: '10', unitPrice: '30.00' }],
    });
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post('/api/purchasing/supplier-invoices').set(manager).send(body()),
      request(app.getHttpServer()).post('/api/purchasing/supplier-invoices').set(manager).send(body()),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);
    // exactly one AP booking
    const count = await fx.admin.query(
      `SELECT count(*)::int AS n FROM supplier_invoice WHERE tenant_id = $1 AND supplier_invoice_number = 'CNC-DUP-1'`,
      [fx.tenantA.tenantId],
    );
    expect(count.rows[0].n).toBe(1);
    const journals = await fx.admin.query(
      `SELECT count(*)::int AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_invoice'`,
      [fx.tenantA.tenantId],
    );
    expect(journals.rows[0].n).toBe(1);
  });

  it('simultaneous AP allocations against one invoice: over-allocation is deterministic', async () => {
    // invoice of 100, two concurrent payments allocating 100 each
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '10', unitCost: '30.00' }],
      });
    const inv = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'CNC-RACE-2',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'race invoice', quantityBase: '10', unitPrice: '10.00' }],
      });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe('100.0000');

    const payment = () => ({
      supplierId: supplierS1,
      businessDate: TODAY,
      amount: '100.00',
      method: 'cash',
      allocations: [{ supplierInvoiceId: inv.body.id, amount: '100.0000' }],
    });
    const [p1, p2] = await Promise.all([
      request(app.getHttpServer()).post('/api/purchasing/supplier-payments').set(manager).send(payment()),
      request(app.getHttpServer()).post('/api/purchasing/supplier-payments').set(manager).send(payment()),
    ]);
    const statuses = [p1.status, p2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);
    expect((p1.status === 409 ? p1 : p2).body.error).toMatch(/over-allocation/i);

    // exactly one allocation row set; the invoice is fully paid
    const allocations = await fx.admin.query(
      `SELECT count(*)::int AS n, COALESCE(SUM(spa.amount), 0)::text AS total
       FROM supplier_payment_allocation spa
       JOIN supplier_payment sp ON sp.id = spa.payment_id
       WHERE spa.tenant_id = $1 AND spa.supplier_invoice_id = $2`,
      [fx.tenantA.tenantId, inv.body.id],
    );
    expect(allocations.rows[0].n).toBe(1);
    expect(allocations.rows[0].total).toBe('100.0000');
    const after = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${inv.body.id}`)
      .set(owner);
    expect(after.body.amountOpen).toBe('0.0000');
    expect(after.body.status).toBe('paid');
  });

  it('duplicate bank transfer client_doc_id: exactly one transfer posts', async () => {
    const gl1 = await fx.admin.query<{ id: string }>(
      `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
       VALUES ($1, 'CNC-BA1', 'CNC Bank One', 'asset', 'asset', 'debit') RETURNING id`,
      [fx.tenantA.tenantId],
    );
    const gl2 = await fx.admin.query<{ id: string }>(
      `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
       VALUES ($1, 'CNC-BA2', 'CNC Bank Two', 'asset', 'asset', 'debit') RETURNING id`,
      [fx.tenantA.tenantId],
    );
    const b1 = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'CNC-B1', bankName: 'CNC Bank', accountName: 'Ops', accountNumber: '111222333', glAccountCode: 'CNC-BA1' });
    const b2 = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'CNC-B2', bankName: 'CNC Bank', accountName: 'Payroll', accountNumber: '444555666', glAccountCode: 'CNC-BA2' });
    expect(b1.status).toBe(201);
    expect(b2.status).toBe(201);
    void gl1; void gl2;

    const body = () => ({
      fromBankAccountId: b1.body.id,
      toBankAccountId: b2.body.id,
      businessDate: TODAY,
      amount: '500.00',
      fee: '5.00',
      clientDocId: 'cnc-transfer-0001',
    });
    const [t1, t2] = await Promise.all([
      request(app.getHttpServer()).post('/api/banking/transfers').set(manager).send(body()),
      request(app.getHttpServer()).post('/api/banking/transfers').set(manager).send(body()),
    ]);
    const statuses = [t1.status, t2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);
    const count = await fx.admin.query(
      `SELECT count(*)::int AS n FROM bank_transfer WHERE tenant_id = $1 AND client_doc_id = 'cnc-transfer-0001'`,
      [fx.tenantA.tenantId],
    );
    expect(count.rows[0].n).toBe(1);
  });
});

describe('Phase 4 deep posting atomicity (failure injected after the deepest writes)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let supplierS1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'ATOM-WH', name: 'ATOM WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'ATOM-PC', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'ATOM-A', name: 'ATOM A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    supplierS1 = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'ATOM Supplier', phone: '0203333333' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('GRN failure after journal: ZERO partial state across every table', async () => {
    const before = await snapshot(fx, fx.tenantA.tenantId);
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        simulateFailure: 'after_journal',
        lines: [{ productId: productA, receivedQuantity: '5', unitCost: '30.00' }],
      });
    expect(res.status).toBe(500);
    const after = await snapshot(fx, fx.tenantA.tenantId);
    expectSnapshotsEqual(before, after);
  });

  it('supplier invoice failure after GRN/PO counters (before journal): ZERO partial state', async () => {
    // a healthy GRN first
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '10', unitCost: '30.00' }],
      });
    expect(grn.status).toBe(201);

    const before = await snapshot(fx, fx.tenantA.tenantId);
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'ATOM-FAIL-1',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        simulateFailure: 'after_writes',
        lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'atomicity', quantityBase: '10', unitPrice: '30.00' }],
      });
    expect(res.status).toBe(500);
    const after = await snapshot(fx, fx.tenantA.tenantId);
    expectSnapshotsEqual(before, after);
  });

  it('supplier invoice failure after journal (before status update): ZERO partial state', async () => {
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '6', unitCost: '30.00' }],
      });
    expect(grn.status).toBe(201);
    const before = await snapshot(fx, fx.tenantA.tenantId);
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'ATOM-FAIL-2',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        simulateFailure: 'after_journal',
        lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'atomicity', quantityBase: '6', unitPrice: '30.00' }],
      });
    expect(res.status).toBe(500);
    const after = await snapshot(fx, fx.tenantA.tenantId);
    expectSnapshotsEqual(before, after);
  });

  it('supplier payment failure after allocation rows: ZERO partial state', async () => {
    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId: supplierS1,
        warehouseId: whA,
        businessDate: TODAY,
        lines: [{ productId: productA, receivedQuantity: '4', unitCost: '30.00' }],
      });
    const inv = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId: supplierS1,
        supplierInvoiceNumber: 'ATOM-PAY-1',
        supplierInvoiceDate: TODAY,
        businessDate: TODAY,
        post: true,
        lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productA, description: 'pay atomicity', quantityBase: '4', unitPrice: '30.00' }],
      });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe('120.0000');

    const before = await snapshot(fx, fx.tenantA.tenantId);
    const res = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({
        supplierId: supplierS1,
        businessDate: TODAY,
        amount: '120.00',
        method: 'cash',
        simulateFailure: 'after_journal',
        allocations: [{ supplierInvoiceId: inv.body.id, amount: '120.0000' }],
      });
    expect(res.status).toBe(500);
    const after = await snapshot(fx, fx.tenantA.tenantId);
    expectSnapshotsEqual(before, after);
  });
});
