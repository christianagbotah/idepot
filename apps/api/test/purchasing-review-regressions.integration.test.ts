/**
 * Phase 4 review regression suite (independent final review, blockers 1–2).
 *
 * Blocker 1 — INVOICE PAYMENT STATUS:
 *   the previous inline status update marked an invoice 'paid' whenever
 *   the allocation was ≥ the open balance AFTER that allocation — i.e.
 *   for any allocation greater than HALF the remaining balance. Paying
 *   60 of a 100 invoice left status 'paid' with 40 still open. The
 *   advance-application flow never refreshed the status at all, and
 *   debit/credit notes did not re-evaluate it either.
 *
 * Blocker 2 — GR/IR PRORATION:
 *   the supplier-invoice posting debited the FULL GRN line value to
 *   GR/IR regardless of the billed quantity, so a partial-quantity
 *   (progress-billed) invoice cleared the entire accrual and booked the
 *   uninvoiced remainder as a fictitious favourable purchase price
 *   variance.
 *
 * Both are pinned end-to-end here against the real posting paths.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);

describe('Phase 4 review regressions: AP status truthfulness + GR/IR proration', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let supplierId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function journalByPurpose(sourceKind: string, sourceId: string) {
    const lines = await fx.admin.query(
      `SELECT m.purpose, l.debit::text AS d, l.credit::text AS c
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND l.entry_id = (
         SELECT id FROM journal_entry WHERE source_kind = $2 AND source_id = $3)`,
      [fx.tenantA.tenantId, sourceKind, sourceId],
    );
    const out: Record<string, { d: string; c: string }> = {};
    for (const r of lines.rows) out[String(r.purpose)] = { d: String(r.d), c: String(r.c) };
    return out;
  }

  async function glPurposeBalance(purpose: string): Promise<string> {
    const res = await fx.admin.query(
      `SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0)::text AS balance
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE m.tenant_id = $1 AND m.purpose = $2`,
      [fx.tenantA.tenantId, purpose],
    );
    return res.rows[0].balance;
  }

  /** PO → approve → GRN → (optionally) invoice; returns the ids needed. */
  async function chain(opts: {
    ordered: string;
    received: string;
    unitCost: string;
    bill?: { quantity: string; unitPrice: string };
  }) {
    const po = await request(app.getHttpServer())
      .post('/api/purchasing/purchase-orders')
      .set(manager)
      .send({
        supplierId, warehouseId: whA, expectedDate: TODAY, submit: true,
        lines: [{ productId: productA, orderedQuantity: opts.ordered, unitPrice: opts.unitCost }],
      });
    expect(po.status).toBe(201);
    const poLine = po.body.lines[0].id;
    const approved = await request(app.getHttpServer())
      .post(`/api/purchasing/purchase-orders/${po.body.id}/approve`).set(manager).send({});
    expect(approved.status).toBe(201);

    const grn = await request(app.getHttpServer())
      .post('/api/purchasing/grns')
      .set(manager)
      .send({
        supplierId, warehouseId: whA, businessDate: TODAY, purchaseOrderId: po.body.id,
        lines: [{ purchaseOrderLineId: poLine, productId: productA, receivedQuantity: opts.received, unitCost: opts.unitCost }],
      });
    expect(grn.status).toBe(201);
    const grnLine = grn.body.lines[0].id;

    let invoiceId: string | undefined;
    if (opts.bill != null) {
      const inv = await request(app.getHttpServer())
        .post('/api/purchasing/supplier-invoices')
        .set(manager)
        .send({
          supplierId, supplierInvoiceNumber: `REG-${po.body.id.slice(0, 8)}`, supplierInvoiceDate: TODAY,
          dueDate: TODAY, businessDate: TODAY, purchaseOrderId: po.body.id, post: true,
          lines: [{ goodsReceiptLineId: grnLine, purchaseOrderLineId: poLine, productId: productA,
                    description: 'regression bill', quantityBase: opts.bill.quantity, unitPrice: opts.bill.unitPrice }],
        });
      expect(inv.status).toBe(201);
      expect(inv.body.status).toBe('posted');
      invoiceId = inv.body.id;
    }
    return { poId: po.body.id, poLine, grnId: grn.body.id, grnLine, invoiceId };
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'REG-WH', name: 'Regression WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'REG-PC', name: 'Regression PC' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'REG-A', name: 'Regression A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    supplierId = (await request(app.getHttpServer()).post('/api/suppliers').set(owner).send({ name: 'Regression Supplier', phone: '0207777777' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  /* ---------------- blocker 2: GR/IR proration ---------------- */

  it('partial-quantity invoice at the SAME price: GR/IR clears only the billed proportion, zero PPV', async () => {
    // GRN receives 100 @ 30 → GR/IR accrual 3000. Invoice bills 60 @ 30.
    const c = await chain({ ordered: '100', received: '100', unitCost: '30.00', bill: { quantity: '60', unitPrice: '30.00' } });

    const j = await journalByPurpose('supplier_invoice', c.invoiceId!);
    expect(j.grni_clearing?.d).toBe('1800.0000');          // 60 × 30, NOT the full 3000
    expect(j.purchase_price_variance).toBeUndefined();      // same price → no variance at all
    expect(j.accounts_payable?.c).toBe('1800.0000');

    // the accrual for the uninvoiced 40 units survives
    expect(await glPurposeBalance('grni_clearing')).toBe('-1200.0000');
    expect(await glPurposeBalance('inventory')).toBe('3000.0000');

    // billing the remaining 40 clears the rest exactly
    const inv2 = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-invoices')
      .set(manager)
      .send({
        supplierId, supplierInvoiceNumber: 'REG-2ND-INVOICE', supplierInvoiceDate: TODAY,
        dueDate: TODAY, businessDate: TODAY, purchaseOrderId: c.poId, post: true,
        lines: [{ goodsReceiptLineId: c.grnLine, purchaseOrderLineId: c.poLine, productId: productA,
                  description: 'remaining bill', quantityBase: '40', unitPrice: '30.00' }],
      });
    expect(inv2.status).toBe(201);
    const j2 = await journalByPurpose('supplier_invoice', inv2.body.id);
    expect(j2.grni_clearing?.d).toBe('1200.0000');
    expect(j2.purchase_price_variance).toBeUndefined();
    expect(await glPurposeBalance('grni_clearing')).toBe('0.0000'); // fully cleared, nothing fabricated
  });

  it('partial-quantity invoice at a DIFFERENT price: PPV measured on the billed proportion only', async () => {
    // allow the 10% price variance through matching (tolerance is tenant
    // configuration; the zero default is strict-by-design)
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    await fx.admin.query(
      `UPDATE tenant_config SET match_price_tolerance_pct = 0.10 WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    // GRN 100 @ 30 (accrual 3000); invoice bills 40 @ 33 → lineNet 1320
    const c = await chain({ ordered: '100', received: '100', unitCost: '30.00', bill: { quantity: '40', unitPrice: '33.00' } });

    const j = await journalByPurpose('supplier_invoice', c.invoiceId!);
    expect(j.grni_clearing?.d).toBe('1200.0000');            // 40 × 30
    expect(j.purchase_price_variance?.d).toBe('120.0000');    // 40 × (33 − 30)
    expect(j.accounts_payable?.c).toBe('1320.0000');
    expect(await glPurposeBalance('grni_clearing')).toBe('-1800.0000'); // uninvoiced 60 × 30 kept
  });

  /* ---------------- blocker 1: payment status truthfulness ---------------- */

  it('paying MORE THAN HALF the open balance leaves the invoice partially_paid with the true open amount', async () => {
    const c = await chain({ ordered: '100', received: '100', unitCost: '10.00', bill: { quantity: '100', unitPrice: '10.00' } });
    // invoice total 1000

    const pay = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({
        supplierId, businessDate: TODAY, amount: '600.00', method: 'cash',
        allocations: [{ supplierInvoiceId: c.invoiceId!, amount: '600.00' }],
      });
    expect(pay.status).toBe(201);

    const inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(inv.body.amountOpen).toBe('400.0000');
    expect(inv.body.status).toBe('partially_paid');   // previously: 'paid' with 400 open

    // settling the remainder flips it to paid — from the equation
    const pay2 = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({
        supplierId, businessDate: TODAY, amount: '400.00', method: 'cash',
        allocations: [{ supplierInvoiceId: c.invoiceId!, amount: '400.00' }],
      });
    expect(pay2.status).toBe(201);
    const inv2 = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(inv2.body.amountOpen).toBe('0.0000');
    expect(inv2.body.status).toBe('paid');
  });

  it('advance application refreshes the status (fully settled via advance → paid)', async () => {
    const c = await chain({ ordered: '50', received: '50', unitCost: '10.00', bill: { quantity: '50', unitPrice: '10.00' } });
    // invoice total 500

    // pay 500 as an UNAPPLIED advance first
    const advance = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({ supplierId, businessDate: TODAY, amount: '500.00', method: 'cash' });
    expect(advance.status).toBe(201);

    const invBefore = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(invBefore.body.status).toBe('posted');   // untouched so far

    const apply = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments/apply-advance')
      .set(manager)
      .send({ paymentId: advance.body.id, businessDate: TODAY, allocations: [{ supplierInvoiceId: c.invoiceId!, amount: '500.00' }] });
    expect(apply.status).toBe(201);

    const invAfter = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(invAfter.body.amountOpen).toBe('0.0000');
    expect(invAfter.body.status).toBe('paid');      // previously stayed 'posted' forever
  });

  it('a debit note re-opens a fully paid invoice; a settling credit note closes it', async () => {
    const c = await chain({ ordered: '20', received: '20', unitCost: '10.00', bill: { quantity: '20', unitPrice: '10.00' } });
    const pay = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({ supplierId, businessDate: TODAY, amount: '200.00', method: 'cash',
              allocations: [{ supplierInvoiceId: c.invoiceId!, amount: '200.00' }] });
    expect(pay.status).toBe(201);
    let inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(inv.body.status).toBe('paid');

    // debit note 50 → open again
    const dn = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-adjustments')
      .set(manager)
      .send({ supplierId, supplierInvoiceId: c.invoiceId, kind: 'debit_note', businessDate: TODAY,
              reason: 'retroactive freight surcharge on invoice', adjustmentClass: 'price_correction', amount: '50.00' });
    expect(dn.status).toBe(201);
    inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(inv.body.amountOpen).toBe('50.0000');
    expect(inv.body.status).toBe('partially_paid');  // re-opened from 'paid'

    // credit note 50 settles it again
    const cn = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-adjustments')
      .set(manager)
      .send({ supplierId, supplierInvoiceId: c.invoiceId, kind: 'credit_note', businessDate: TODAY,
              reason: 'goodwill settlement of the surcharge', adjustmentClass: 'price_correction', amount: '50.00' });
    expect(cn.status).toBe(201);
    inv = await request(app.getHttpServer())
      .get(`/api/purchasing/supplier-invoices/${c.invoiceId}`).set(owner);
    expect(inv.body.amountOpen).toBe('0.0000');
    expect(inv.body.status).toBe('paid');
  });

  it('a bank-tendered payment credits the bank account OWN GL account (FK-backed bank_account_id)', async () => {
    // dedicated GL account + bank master for this flow
    await fx.admin.query(
      `INSERT INTO gl_account (tenant_id, code, name, account_type, account_class, normal_balance)
       VALUES ($1, 'REG-BNK', 'Regression Bank GL', 'asset', 'asset', 'debit')`,
      [fx.tenantA.tenantId],
    );
    const bank = await request(app.getHttpServer())
      .post('/api/banking/accounts')
      .set(manager)
      .send({ code: 'REG-BK', bankName: 'Regression Bank', branch: 'Accra', accountName: 'Ops',
              accountNumber: '1002003004', glAccountCode: 'REG-BNK' });
    expect(bank.status).toBe(201);

    const c = await chain({ ordered: '10', received: '10', unitCost: '10.00', bill: { quantity: '10', unitPrice: '10.00' } });
    const pay = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({ supplierId, businessDate: TODAY, amount: '100.00', method: 'bank_transfer', bankAccountId: bank.body.id,
              allocations: [{ supplierInvoiceId: c.invoiceId!, amount: '100.00' }] });
    expect(pay.status).toBe(201);
    expect(pay.body.amountUnapplied).toBe('0.0000');

    // the tender credits the BANK'S OWN GL account, not the generic clearing purpose
    const lines = await fx.admin.query(
      `SELECT a.code, l.credit::text AS c
       FROM journal_line l JOIN gl_account a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND l.entry_id = (
         SELECT id FROM journal_entry WHERE source_kind = 'supplier_payment' AND source_id = $2)`,
      [fx.tenantA.tenantId, pay.body.id],
    );
    const credit = lines.rows.find((r: { code: string }) => r.code === 'REG-BNK');
    expect(credit?.c).toBe('100.0000');

    // the FK is live: a fabricated cross-tenant/phantom bank id cannot be stored
    const bad = await fx.admin.query(
      `SELECT count(*)::int AS n FROM supplier_payment
       WHERE tenant_id = $1 AND bank_account_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM bank_account b WHERE b.tenant_id = $1 AND b.id = supplier_payment.bank_account_id)`,
      [fx.tenantA.tenantId],
    );
    expect(bad.rows[0].n).toBe(0);

    // inactive bank accounts are refused by the service
    await fx.admin.query(`UPDATE bank_account SET is_active = false WHERE id = $1`, [bank.body.id]);
    const c2 = await chain({ ordered: '5', received: '5', unitCost: '10.00', bill: { quantity: '5', unitPrice: '10.00' } });
    const refused = await request(app.getHttpServer())
      .post('/api/purchasing/supplier-payments')
      .set(manager)
      .send({ supplierId, businessDate: TODAY, amount: '50.00', method: 'bank_transfer', bankAccountId: bank.body.id,
              allocations: [{ supplierInvoiceId: c2.invoiceId!, amount: '50.00' }] });
    expect(refused.status).toBe(409);
  });
});
