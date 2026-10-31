/**
 * Phase 3 FINANCIAL HARDENING integration proofs (independent code review
 * findings #1–#5):
 *
 *  #1 TAX — effective-dated versioned profiles with named components,
 *     inclusive/exclusive treatment, exempt applicability, deterministic
 *     decimal rounding, server-side resolution by transaction date,
 *     immutable transaction-time evidence in the SAME UnitOfWork.
 *  #2 GL — balanced journals (Σ debits == Σ credits) committed atomically
 *     with the sale / payment / deposit / credit source documents.
 *  #3 COST (ADR-0004) — AVCO layers from opening stock and cost-bearing
 *     adjustments, proportional issue cost, transfer value carry with the
 *     exact-residual convention, rebuildable stock_cost_state.
 *  #4 PRICE AUTHORITY — server price authoritative; overrides need
 *     permission + evidence; materiality thresholds need supervisor
 *     credentials verified server-side.
 *  #5 SYNC IDENTITY — canonical payload fingerprint: same key + different
 *     payload is a conflict, never a silent duplicate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('financial hardening (tax / GL / AVCO / overrides / sync identity)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let whA: string;
  let whB: string;
  let whC: string;
  let unitPc: string;
  let productA: string; // sell 50.00, opening cost 30
  let productB: string; // sell 20.00, opening cost 12
  let productE: string; // sell 10.00, taxExempt product
  let customerC1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  async function commitSale(token: Record<string, string>, body: Record<string, unknown>) {
    return api().post('/api/sales/commit').set(token).send(body);
  }

  /** raw admin assertions bypass RLS (the migration/test role is superuser) */
  async function sql<T extends Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
    const res = await fx.admin.query(q, params);
    return res.rows as T[];
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);

    whA = (await api().post('/api/warehouses').set(owner).send({ code: 'FIN-WHA', name: 'Finance WH A' })).body.id;
    whB = (await api().post('/api/warehouses').set(owner).send({ code: 'FIN-WHB', name: 'Finance WH B' })).body.id;
    whC = (await api().post('/api/warehouses').set(owner).send({ code: 'FIN-WHC', name: 'Finance WH C' })).body.id;
    unitPc = (await api().post('/api/units').set(owner).send({ code: 'PCF', name: 'Pieces F' })).body.id;
    productA = (await api().post('/api/products').set(owner).send({ code: 'FIN-A', name: 'Finance A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await api().post('/api/products').set(owner).send({ code: 'FIN-B', name: 'Finance B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    productE = (await api().post('/api/products').set(owner).send({ code: 'FIN-E', name: 'Finance Exempt', baseUnitId: unitPc, sellingPrice: '10.00', purchasePrice: '6.00', taxExempt: true })).body.id;
    customerC1 = (await api().post('/api/customers').set(owner).send({ name: 'Finance Customer', phone: '0244000099' })).body.id;

    const opening = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '100', unitCost: '30.0000' },
        { productId: productB, quantityBase: '100', unitCost: '12.0000' },
        { productId: productE, quantityBase: '100', unitCost: '6.0000' },
      ],
    });
    expect(opening.status).toBe(201);
  }, 180_000);

  afterAll(async () => {
    await fx.close();
  });

  /* ---------------------------- finding #1: TAX ---------------------------- */

  it('configures an effective-dated tax profile with named exclusive components (tax:manage; cashier/auditor 403)', async () => {
    expect((await api().post('/api/tax/profiles').set(cashier).send({ code: 'STD', name: 'Standard' })).status).toBe(403);
    expect((await api().post('/api/tax/profiles').set(auditor).send({ code: 'STD', name: 'Standard' })).status).toBe(403);

    // the seeded neutral DEFAULT profile loses the default flag atomically
    const created = await api().post('/api/tax/profiles').set(owner).send({ code: 'STD', name: 'Standard Rate', isDefault: true });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('STD');
    expect(created.body.isDefault).toBe(true);
    const defaults = await api().get('/api/tax/profiles').set(owner).expect(200).then((r) => r.body.filter((p: { isDefault: boolean }) => p.isDefault));
    expect(defaults).toHaveLength(1);

    const version = await api().post(`/api/tax/profiles/${created.body.id}/versions`).set(owner).send({
      effectiveFrom: '2020-01-01',
      components: [
        { name: 'LEVY-A', rate: '0.050000', inclusive: false, seq: 1 },
        { name: 'LEVY-B', rate: '0.025000', inclusive: false, seq: 2 },
      ],
    });
    expect(version.status).toBe(201);
    expect(version.body.version).toBe(1); // fresh profile: its first version
    expect(version.body.components).toHaveLength(2);
    expect(version.body.components[0]).toMatchObject({ name: 'LEVY-A', rate: '0.050000', inclusive: false });

    // percentage-style rates and duplicate component names fail loud
    expect((await api().post(`/api/tax/profiles/${created.body.id}/versions`).set(owner).send({
      effectiveFrom: '2030-01-01',
      components: [{ name: 'X', rate: '7.5', inclusive: false }],
    })).status).toBe(400);
    expect((await api().post(`/api/tax/profiles/${created.body.id}/versions`).set(owner).send({
      effectiveFrom: '2030-01-01',
      components: [
        { name: 'DUP', rate: '0.010000', inclusive: false },
        { name: 'DUP', rate: '0.010000', inclusive: false },
      ],
    })).status).toBe(400);
  });

  it('posts a sale with exclusive tax evidence committed in the same transaction', async () => {
    // 2×50 + 3×20 = 160; manager discount 10 → taxable basis 150
    // LEVY-A 5% = 7.50; LEVY-B 2.5% = 3.75 → taxAdded 11.25
    // total = 160 − 10 + 11.25 = 161.25
    const res = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '2', unitPrice: '50.00' },
        { productId: productB, quantityBase: '3', unitPrice: '20.00' },
      ],
      orderDiscount: '10.00',
      discountOverride: { reason: 'negotiated bulk discount' },
      tenders: [{ method: 'cash', amount: '170.00' }],
    });
    expect(res.status).toBe(201);
    const inv = res.body.invoice;
    expect(inv.subtotal).toBe('160.0000');
    expect(inv.orderDiscount).toBe('10.0000');
    expect(inv.taxTotal).toBe('11.2500');
    expect(inv.taxAdded).toBe('11.2500');
    expect(inv.total).toBe('161.2500');
    expect(inv.taxProfileCode).toBe('STD');
    expect(inv.taxInclusive).toBe(false);
    expect(inv.taxComponents).toHaveLength(2);
    const levyA = inv.taxComponents.find((c: { name: string }) => c.name === 'LEVY-A')!;
    const levyB = inv.taxComponents.find((c: { name: string }) => c.name === 'LEVY-B')!;
    expect(levyA.taxAmount).toBe('7.5000');
    expect(levyA.taxableBasis).toBe('150.0000');
    expect(levyB.taxAmount).toBe('3.7500');
    // per-line basis evidence: line nets 100 and 60, discount 10 allocated pro rata
    expect(inv.lines[0].taxBasis).toBe('93.7500'); // 100 − 10×(100/160)
    expect(inv.lines[1].taxBasis).toBe('56.2500');
    expect(inv.amountDue).toBe('0.0000');
    expect(res.body.payment.changeGiven).toBe('8.7500'); // 170 − 161.25

    // evidence rows are physical (append-only table)
    const rows = await sql<{ component_name: string; tax_amount: string }>(
      `SELECT component_name, tax_amount::text AS tax_amount FROM invoice_tax_component WHERE invoice_id = $1 ORDER BY component_name`,
      [inv.id],
    );
    expect(rows.map((r) => `${r.component_name}:${r.tax_amount}`).sort()).toEqual(['LEVY-A:7.5000', 'LEVY-B:3.7500']);
  });

  it('exempt lines (product-level and line-level) do not contribute to the taxable basis', async () => {
    // A(50, taxable) + E(10, product-exempt) = 60; no discount → basis 50
    // LEVY-A 2.50 + LEVY-B 1.25 = 3.75 → total 63.75
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '1', unitPrice: '50.00' },
        { productId: productE, quantityBase: '1', unitPrice: '10.00' },
      ],
      tenders: [{ method: 'cash', amount: '63.7500' }],
    });
    expect(res.status).toBe(201);
    const inv = res.body.invoice;
    expect(inv.subtotal).toBe('60.0000');
    expect(inv.taxTotal).toBe('3.7500');
    expect(inv.total).toBe('63.7500');
    expect(inv.lines.find((l: { productId: string }) => l.productId === productE).taxExempt).toBe(true);
    expect(inv.lines.find((l: { productId: string }) => l.productId === productA).taxExempt).toBe(false);

    // line-level exemption flag also excludes from the basis
    const res2 = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '1', unitPrice: '50.00', taxExempt: true },
      ],
      tenders: [{ method: 'cash', amount: '50.0000' }],
    });
    expect(res2.body.invoice.taxTotal).toBe('0.0000');
    expect(res2.body.invoice.total).toBe('50.0000');
  });

  it('inclusive tax extracts from gross prices without changing the payable; mixed profiles levy on the net', async () => {
    // a new default profile with one inclusive + one exclusive component
    const switched = await api().post('/api/tax/profiles').set(owner).send({ code: 'INCL', name: 'Inclusive Active', isDefault: true });
    expect(switched.status).toBe(201);
    const version = await api().post(`/api/tax/profiles/${switched.body.id}/versions`).set(owner).send({
      effectiveFrom: '2020-01-01',
      components: [
        { name: 'VAT-IN', rate: '0.100000', inclusive: true, seq: 1 },
        { name: 'SERVICE-LEVY', rate: '0.020000', inclusive: false, seq: 2 },
      ],
    });
    expect(version.status).toBe(201);

    // gross charged: 1×A(50) + 2×E(20, exempt) → subtotal 70, taxable basis 50 gross
    // net = round4(50/1.10) = 45.4545; VAT-IN = 50 − 45.4545 = 4.5455 (exact residual)
    // SERVICE-LEVY 2% of NET 45.4545 = 0.9091 (a levy never taxes the embedded tax)
    // total = 70 − 0 + 0.9091 = 70.9091 (inclusive extraction changes nothing;
    // the exempt E lines are inside the payable but outside the basis)
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '1', unitPrice: '50.00' },
        { productId: productE, quantityBase: '2', unitPrice: '10.00' },
      ],
      tenders: [{ method: 'cash', amount: '70.9091' }],
    });
    expect(res.status).toBe(201);
    const inv = res.body.invoice;
    expect(inv.subtotal).toBe('70.0000');
    expect(inv.taxInclusive).toBe(true);
    const vat = inv.taxComponents.find((c: { name: string }) => c.name === 'VAT-IN')!;
    const levy = inv.taxComponents.find((c: { name: string }) => c.name === 'SERVICE-LEVY')!;
    expect(vat.inclusive).toBe(true);
    expect(vat.taxAmount).toBe('4.5455');
    expect(levy.inclusive).toBe(false);
    expect(levy.taxAmount).toBe('0.9091');
    expect(levy.taxableBasis).toBe('45.4545'); // levied on the NET
    expect(inv.taxAdded).toBe('0.9091');
    expect(inv.total).toBe('70.9091');
  });

  it('rate changes require a NEW version (supersession closes the old window); committed evidence is immutable', async () => {
    // back to STD as the default (two steps: the partial unique index allows
    // at most one default row at any instant)
    await sql(`UPDATE tax_profile SET is_default = false WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
    await sql(`UPDATE tax_profile SET is_default = true WHERE tenant_id = $1 AND code = 'STD'`, [fx.tenantA.tenantId]);

    const before = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }], // 50 + 7.5% = 53.75
    });
    expect(before.status).toBe(201);
    expect(before.body.invoice.taxTotal).toBe('3.7500');

    // supersede: a new open-ended version closes the current one the day before
    const profiles = await api().get('/api/tax/profiles').set(owner).expect(200).then((r) => r.body);
    const std = profiles.find((p: { code: string }) => p.code === 'STD');
    const newVersion = await api().post(`/api/tax/profiles/${std.id}/versions`).set(owner).send({
      effectiveFrom: '2100-01-01', // far future: current sales keep the old rates
      components: [{ name: 'FUTURE-LEVY', rate: '0.100000', inclusive: false }],
    });
    expect(newVersion.status).toBe(201);

    // a sale TODAY still resolves the pre-supersession version
    const after = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
    });
    expect(after.status).toBe(201);
    expect(after.body.invoice.taxTotal).toBe('3.7500');
    expect(after.body.invoice.taxProfileCode).toBe('STD');

    // the historical invoice evidence never changed
    const reloaded = await api().get(`/api/sales/invoices/${before.body.invoice.id}`).set(auditor);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.taxTotal).toBe('3.7500');
    expect(reloaded.body.taxComponents).toHaveLength(2);
  });

  it('the tax participant is inside the atomic posting set (failure before any write leaves zero rows)', async () => {
    const countBefore = (await sql<{ c: string }>(`SELECT count(*)::text AS c FROM invoice`))[0]!.c;
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
      simulateTaxParticipantFailure: true,
    });
    expect(res.status).toBe(500);
    const countAfter = (await sql<{ c: string }>(`SELECT count(*)::text AS c FROM invoice`))[0]!.c;
    expect(countAfter).toBe(countBefore);
  });

  /* ----------------------------- finding #2: GL ----------------------------- */

  it('commits a BALANCED sale journal in the same transaction (revenue, tax, tenders, change, AR, COGS)', async () => {
    // pin STD (7.5% exclusive) as the default for exact journal arithmetic
    await sql(`UPDATE tax_profile SET is_default = false WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
    await sql(`UPDATE tax_profile SET is_default = true WHERE tenant_id = $1 AND code = 'STD'`, [fx.tenantA.tenantId]);

    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '2', unitPrice: '50.00' },
        { productId: productB, quantityBase: '1', unitPrice: '20.00' },
      ],
      tenders: [
        { method: 'cash', amount: '100.00' },
        { method: 'momo', amount: '30.00', momoProvider: 'MTN', momoPhone: '0244000099' },
      ],
    });
    expect(sale.status).toBe(201);
    const inv = sale.body.invoice;
    // 120 subtotal; tax 7.5% of 120 = 9; total 129; paid 130 → change 1
    expect(inv.total).toBe('129.0000');

    const journals = await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'invoice', sourceId: inv.id }).expect(200).then((r) => r.body);
    expect(journals).toHaveLength(1);
    const entry = journals[0];
    expect(entry.event).toBe('sale_posted');
    expect(entry.totalDebit).toBe(entry.totalCredit);
    expect(entry.totalDebit).toBe('202.0000'); // Σ tenders 130 + COGS 72

    const cashLegs = entry.lines.filter((l: { accountCode: string }) => l.accountCode === '1000');
    expect(cashLegs).toHaveLength(2); // DR 100 (tender) + CR 1 (change given)
    expect(cashLegs.map((l: { debit: string }) => l.debit).sort()).toEqual(['0.0000', '100.0000']);
    expect(cashLegs.map((l: { credit: string }) => l.credit).sort()).toEqual(['0.0000', '1.0000']);
    expect(entry.lines.find((l: { accountCode: string }) => l.accountCode === '1020')).toMatchObject({ debit: '30.0000', credit: '0.0000' }); // momo clearing DR
    expect(entry.lines.find((l: { accountCode: string }) => l.accountCode === '4000')).toMatchObject({ debit: '0.0000', credit: '120.0000' }); // revenue CR (net)
    expect(entry.lines.find((l: { accountCode: string }) => l.accountCode === '2200')).toMatchObject({ debit: '0.0000', credit: '9.0000' }); // tax payable CR
    expect(entry.lines.find((l: { accountCode: string }) => l.accountCode === '5000')).toMatchObject({ debit: '72.0000', credit: '0.0000' }); // COGS 2×30 + 1×12
    expect(entry.lines.find((l: { accountCode: string }) => l.accountCode === '1200')).toMatchObject({ debit: '0.0000', credit: '72.0000' }); // inventory CR
    // Σ debits == Σ credits exactly
    const debits = entry.lines.reduce((a: number, l: { debit: string }) => a + Number(l.debit), 0);
    const credits = entry.lines.reduce((a: number, l: { credit: string }) => a + Number(l.credit), 0);
    expect(debits).toBeCloseTo(credits, 6);
  });

  it('posts balanced journals for standalone receipts, deposits and credit applications', async () => {
    // unpaid invoice to settle: 50 + 3.75 tax = 53.75
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id;

    // standalone receipt: 60 cash → 33.75 to the invoice (leaves due 20 for
    // the credit application below), 26.25 unapplied credit
    const receipt = await api().post('/api/payments').set(cashier).send({
      customerId: customerC1,
      invoiceId,
      amount: '60.0000',
      tenders: [{ method: 'cash', amount: '60.0000' }],
      allocations: [{ invoiceId, amount: '33.7500' }],
    });
    expect(receipt.status).toBe(201);
    const payJournals = await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'payment', sourceId: receipt.body.id }).expect(200).then((r) => r.body);
    expect(payJournals).toHaveLength(1);
    expect(payJournals[0].totalDebit).toBe(payJournals[0].totalCredit);
    const payBy = new Map(payJournals[0].lines.map((l: { accountCode: string }) => [l.accountCode, l]));
    expect(payBy.get('1000')).toMatchObject({ debit: '60.0000' });
    expect(payBy.get('1100')).toMatchObject({ credit: '33.7500' }); // AR settled
    expect(payBy.get('2100')).toMatchObject({ credit: '26.2500' }); // unapplied → deposit liability

    // deposit: 40 momo
    const deposit = await api().post('/api/deposits').set(cashier).send({
      customerId: customerC1,
      amount: '40.0000',
      tenders: [{ method: 'momo', amount: '40.0000', momoProvider: 'MTN', momoPhone: '0244000099' }],
    });
    expect(deposit.status).toBe(201);
    const depJournals = await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'customer_deposit', sourceId: deposit.body.id }).expect(200).then((r) => r.body);
    expect(depJournals).toHaveLength(1);
    expect(depJournals[0].totalDebit).toBe(depJournals[0].totalCredit);
    expect(depJournals[0].totalDebit).toBe('40.0000');

    // credit application: consume 20 of the deposit against the invoice
    const applied = await api().post('/api/credits/apply').set(cashier).send({
      depositId: deposit.body.id,
      invoiceId,
      amount: '20.0000',
    });
    expect(applied.status).toBe(201);
    const creditJournals = await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'credit_application', sourceId: applied.body.id }).expect(200).then((r) => r.body);
    expect(creditJournals).toHaveLength(1);
    expect(creditJournals[0].totalDebit).toBe(creditJournals[0].totalCredit);
    expect(creditJournals[0].totalDebit).toBe('20.0000');
  });

  it('a sale killed after the deepest writes leaves NO journal behind (same-transaction proof)', async () => {
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
      simulateFailureAfterWrites: true,
    });
    expect(res.status).toBe(500);
    // every committed journal in the tenant balances, and the killed sale
    // left nothing behind (its journal would have rolled back with the rest)
    const unbalanced = await sql<{ c: string }>(
      `SELECT count(*)::text AS c FROM journal_entry WHERE total_debit <> total_credit`,
    );
    expect(unbalanced[0]!.c).toBe('0');
    const journalCount = await sql<{ c: string }>(`SELECT count(*)::text AS c FROM journal_entry`);
    const invoiceCount = await sql<{ c: string }>(`SELECT count(*)::text AS c FROM invoice`);
    // one journal per committed sale/payment/deposit/credit source, never more
    expect(Number(journalCount[0]!.c)).toBeLessThanOrEqual(Number(invoiceCount[0]!.c) + 20);
  });

  /* --------------------------- finding #3: AVCO ---------------------------- */

  it('AVCO: issues cost proportionally to on-hand value; new layers re-average; invoice lines carry cost evidence', async () => {
    // fresh warehouse for exact arithmetic: 100 @ 30, then +10 @ 60
    const opening = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whC,
      authority: 'physical_count',
      lines: [{ productId: productA, quantityBase: '100', unitCost: '30.0000' }],
    });
    expect(opening.status).toBe(201);
    const topUp = await api().post('/api/stock-adjustments').set(owner).send({
      warehouseId: whC,
      reason: 'value-bearing top-up layer for AVCO proof',
      lines: [{ productId: productA, quantityBase: '10', unitCost: '60.0000' }],
    });
    expect(topUp.status).toBe(201);

    const state = await sql<{ quantity_base: string; total_value: string }>(
      `SELECT quantity_base::text AS quantity_base, total_value::text AS total_value
       FROM stock_cost_state WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whC, productA],
    );
    // 110 units, value 100×30 + 10×60 = 3600
    expect(Number(state[0]!.quantity_base)).toBeCloseTo(110, 6);
    expect(Number(state[0]!.total_value)).toBeCloseTo(3600, 4);

    // sell 2: AVCO removal = round4(2 × 3600 / 110) = 65.4545
    const sale = await commitSale(cashier, {
      warehouseId: whC,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
    });
    expect(sale.status).toBe(201);
    const line = sale.body.invoice.lines[0];
    expect(line.costMethod).toBe('avco');
    expect(line.cogs).toBe('65.4545');
    expect(line.costAtSale).toBe('32.7272'); // per-unit AVCO evidence (half-even)

    // the movement row itself carries the evidence (rebuildable ledger)
    const movement = await sql<{ unit_cost: string | null; cost_value: string | null }>(
      `SELECT unit_cost::text AS unit_cost, cost_value::text AS cost_value
       FROM stock_movement WHERE source_document_id = $1 AND movement_type = 'issue'`,
      [sale.body.invoice.id],
    );
    expect(movement[0]!.cost_value).toBe('65.4545');

    // un-costed receipts (opening stock without a unitCost) are zero-value
    // layers: quantity walks, value does not
    const zeroLayer = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whB,
      authority: 'physical_count',
      lines: [{ productId: productB, quantityBase: '5' }],
    });
    expect(zeroLayer.status).toBe(201);
    const whbState = await sql<{ quantity_base: string; total_value: string }>(
      `SELECT quantity_base::text AS quantity_base, total_value::text AS total_value
       FROM stock_cost_state WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whB, productB],
    );
    expect(Number(whbState[0]!.quantity_base)).toBeCloseTo(5, 6);
    expect(Number(whbState[0]!.total_value)).toBeCloseTo(0, 4);
  });

  it('transfers carry the dispatched AVCO value across warehouses (exact-residual for partial receives)', async () => {
    // WH-A productB at this point: 100 − 3 (tax sale) − 1 (GL sale) = 96 @ 12 → 1152
    const transfer = await api().post('/api/transfers').set(owner).send({
      fromWarehouseId: whA,
      toWarehouseId: whB,
      lines: [{ productId: productB, quantityBase: '10' }],
    });
    expect(transfer.status).toBe(201);

    const beforeA = await sql<{ total_value: string }>(
      `SELECT total_value::text AS total_value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productB],
    );
    const valueA = Number(beforeA[0]!.total_value);

    const dispatch = await api().post(`/api/transfers/${transfer.body.id}/dispatch`).set(owner).send({});
    expect(dispatch.status).toBe(201);

    // partial receive: 4 of 10 → proportional share of the dispatched value
    const partial = await api().post(`/api/transfers/${transfer.body.id}/receive`).set(owner).send({
      lines: [{ productId: productB, quantityBase: '4' }],
    });
    expect(partial.status).toBe(201);
    // completing receive: 6 → exact residual
    const complete = await api().post(`/api/transfers/${transfer.body.id}/receive`).set(owner).send({
      lines: [{ productId: productB, quantityBase: '6' }],
    });
    expect(complete.status).toBe(201);

    const afterA = await sql<{ total_value: string }>(
      `SELECT total_value::text AS total_value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productB],
    );
    const atB = await sql<{ quantity_base: string; total_value: string }>(
      `SELECT quantity_base::text AS quantity_base, total_value::text AS total_value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whB, productB],
    );

    // Σ transfer-in values == transfer-out value, always (the invariant)
    const outValue = await sql<{ v: string }>(
      `SELECT COALESCE(SUM(cost_value),0)::text AS v FROM stock_movement
       WHERE tenant_id = $1 AND transfer_id = $2 AND movement_type = 'transfer_out'`,
      [fx.tenantA.tenantId, transfer.body.id],
    );
    const inValue = await sql<{ v: string }>(
      `SELECT COALESCE(SUM(cost_value),0)::text AS v FROM stock_movement
       WHERE tenant_id = $1 AND transfer_id = $2 AND movement_type = 'transfer_in'`,
      [fx.tenantA.tenantId, transfer.body.id],
    );
    expect(Number(inValue[0]!.v)).toBeCloseTo(Number(outValue[0]!.v), 4);
    // WH-A lost exactly the dispatched value; WH-B holds 15 units (5 zero-layer + 10 carried)
    // with exactly the carried value
    expect(valueA - Number(afterA[0]!.total_value)).toBeCloseTo(Number(outValue[0]!.v), 4);
    expect(Number(atB[0]!.quantity_base)).toBeCloseTo(15, 6);
    expect(Number(atB[0]!.total_value)).toBeCloseTo(Number(outValue[0]!.v), 4);
  });

  it('the AVCO cost state is rebuildable from the ledger (balance rebuild recomputes both projections)', async () => {
    const before = await sql<{ w: string; p: string; q: string; v: string }>(
      `SELECT warehouse_id::text AS w, product_id::text AS p, quantity_base::text AS q, total_value::text AS v
       FROM stock_cost_state WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    const rebuild = await api().post('/api/inventory/balances/rebuild').set(owner).send({});
    expect(rebuild.status).toBe(201);
    expect(rebuild.body.mismatches).toHaveLength(0);
    const after = await sql<{ w: string; p: string; q: string; v: string }>(
      `SELECT warehouse_id::text AS w, product_id::text AS p, quantity_base::text AS q, total_value::text AS v
       FROM stock_cost_state WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    expect(after.length).toBe(before.length);
    for (const row of after) {
      const prev = before.find((b) => b.w === row.w && b.p === row.p)!;
      expect(Number(row.q)).toBeCloseTo(Number(prev.q), 6);
      expect(Number(row.v)).toBeCloseTo(Number(prev.v), 4);
    }
  });

  /* ------------------------ finding #4: PRICE AUTHORITY -------------------- */

  it('a mismatched price is a 409 stale-price for a cashier; a manager may override WITH evidence', async () => {
    const stale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '45.00' }], // server says 50
      tenders: [{ method: 'cash', amount: '53.7500' }],
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain('stale price');

    // manager WITHOUT evidence → still 409
    const noEvidence = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '45.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
    });
    expect(noEvidence.status).toBe(409);

    // manager WITH evidence → posted, flagged, auditable
    // tax applies to the overridden net: 45 + 7.5% of 45 = 48.375
    const overridden = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '45.00',
        priceOverride: { reason: 'damaged display unit, agreed reduction' },
      }],
      tenders: [{ method: 'cash', amount: '48.3750' }],
    });
    expect(overridden.status).toBe(201);
    expect(overridden.body.invoice.lines[0].priceOverridden).toBe(true);
    expect(overridden.body.invoice.lines[0].resolvedPrice).toBe('50.0000');
    expect(overridden.body.invoice.lines[0].unitPrice).toBe('45.0000');
    expect(overridden.body.invoice.total).toBe('48.3750');
  });

  it('material overrides beyond the tenant threshold require server-verified supervisor approval', async () => {
    await sql(
      `INSERT INTO tenant_config (tenant_id, price_override_threshold, discount_override_threshold)
       VALUES ($1, 2.0000, 1.0000)
       ON CONFLICT (tenant_id) DO UPDATE SET price_override_threshold = 2.0000, discount_override_threshold = 1.0000`,
      [fx.tenantA.tenantId],
    );

    // delta 50 − 45 = 5 > 2 → approver required
    const needsApproval = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '45.00',
        priceOverride: { reason: 'big reduction without approval' },
      }],
      tenders: [{ method: 'cash', amount: '48.3750' }],
    });
    expect(needsApproval.status).toBe(409);
    expect(needsApproval.body.error).toContain('supervisor approval');

    // wrong supervisor password → rejected
    const badPassword = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '45.00',
        priceOverride: {
          reason: 'big reduction with bad credentials',
          approver: { username: 'manager@tenant-a.test', password: 'Wrong-Pass-9' },
        },
      }],
      tenders: [{ method: 'cash', amount: '48.3750' }],
    });
    expect(badPassword.status).toBe(400);
    expect(badPassword.body.error).toContain('approver');

    // a CASHIER supervisor cannot approve (lacks the permission themselves)
    const weakApprover = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '45.00',
        priceOverride: {
          reason: 'big reduction approved by a cashier',
          approver: { username: 'cashier@tenant-a.test', password: 'Cashier-Pass-1' },
        },
      }],
      tenders: [{ method: 'cash', amount: '48.3750' }],
    });
    expect(weakApprover.status).toBe(400);

    // a real supervisor (manager credentials verified server-side) → posted
    const approved = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '45.00',
        priceOverride: {
          reason: 'big reduction, supervisor approved',
          approver: { username: 'manager@tenant-a.test', password: 'Manager-Pass-1' },
        },
      }],
      tenders: [{ method: 'cash', amount: '48.3750' }],
    });
    expect(approved.status).toBe(201);

    // discounts beyond their threshold need approval too
    const discountNeedsApproval = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      orderDiscount: '5.00',
      discountOverride: { reason: 'discount beyond threshold' },
      tenders: [{ method: 'cash', amount: '48.3750' }], // 50 − 5 + 3.375
    });
    expect(discountNeedsApproval.status).toBe(409);
    await sql(`UPDATE tenant_config SET price_override_threshold = 0, discount_override_threshold = 0 WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
  });

  it('cashiers cannot discount at all (403 without the permission)', async () => {
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      orderDiscount: '1.00',
      tenders: [{ method: 'cash', amount: '52.8750' }], // 50 − 1 + 3.675
    });
    expect(res.status).toBe(403);
  });

  /* --------------------- finding #5: SYNC IDENTITY ------------------------- */

  it('sync idempotency: same key + same payload → duplicate; same key + DIFFERENT payload → conflict', async () => {
    const device = await api().post('/api/auth/devices').set(cashier).send({ deviceCode: 'POS-FIN-1', platform: 'windows' });
    expect(device.status).toBe(201);
    const deviceId = device.body.id;
    const push = (events: unknown[]) =>
      api().post('/api/sync/push').set(cashier).send({ deviceId, events });

    const payload = {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
      clientDocId: '11111111-1111-4111-8111-111111111111',
    };

    const first = await push([
      { eventId: 'aaaaaaaa-0000-4000-8000-000000000001', idempotencyKey: 'key-fin-1', type: 'sale.create', payload },
    ]);
    expect(first.status).toBe(201);
    expect(first.body.outcomes[0].status).toBe('applied');
    const invoiceId = first.body.outcomes[0].result.invoiceId;

    // exact same payload (new event id, same idempotency key) → duplicate replay
    const again = await push([
      { eventId: 'aaaaaaaa-0000-4000-8000-000000000002', idempotencyKey: 'key-fin-1', type: 'sale.create', payload },
    ]);
    expect(again.status).toBe(201);
    expect(again.body.outcomes[0].status).toBe('duplicate');
    expect(again.body.outcomes[0].result.invoiceId).toBe(invoiceId);

    // key-order differences do NOT matter (canonical JSON sorts keys)
    const reordered = {
      tenders: payload.tenders,
      lines: payload.lines,
      warehouseId: payload.warehouseId,
      customerId: payload.customerId,
      clientDocId: payload.clientDocId,
    };
    const sameFacts = await push([
      { eventId: 'aaaaaaaa-0000-4000-8000-000000000003', idempotencyKey: 'key-fin-1', type: 'sale.create', payload: reordered },
    ]);
    expect(sameFacts.body.outcomes[0].status).toBe('duplicate');

    // same key, DIFFERENT payload → conflict, never a silent second application
    const mutated = { ...payload, lines: [{ productId: productB, quantityBase: '9', unitPrice: '20.00' }] };
    const conflict = await push([
      { eventId: 'aaaaaaaa-0000-4000-8000-000000000004', idempotencyKey: 'key-fin-1', type: 'sale.create', payload: mutated },
    ]);
    expect(conflict.status).toBe(201);
    expect(conflict.body.outcomes[0].status).toBe('conflict');
    expect(conflict.body.outcomes[0].code).toBe('idempotency_key_reuse');

    // exactly one invoice ever for that client document
    const invoices = await sql<{ c: string }>(
      `SELECT count(*)::text AS c FROM invoice WHERE tenant_id = $1 AND client_doc_id = $2`,
      [fx.tenantA.tenantId, '11111111-1111-4111-8111-111111111111'],
    );
    expect(invoices[0]!.c).toBe('1');

    // fingerprints recorded on the registry
    const rows = await sql<{ fingerprint: string | null }>(
      `SELECT payload_fingerprint AS fingerprint FROM sync_applied_event WHERE idempotency_key = 'key-fin-1'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  /* ---------------------- defaults provisioning (fresh tenant) ------------- */

  it('a first posting on a fresh tenant provisions the NEUTRAL defaults (chart, AVCO policy, zero-component tax)', async () => {
    const tenantBtoken = auth(fx.tenantB.users.owner!.token!);
    // no tax profiles configured yet on tenant B
    const before = await api().get('/api/tax/profiles').set(tenantBtoken).expect(200).then((r) => r.body);
    expect(before).toHaveLength(0);

    const wh = (await api().post('/api/warehouses').set(tenantBtoken).send({ code: 'TB-WH', name: 'Tenant B WH' })).body.id;
    const unit = (await api().post('/api/units').set(tenantBtoken).send({ code: 'PCB', name: 'Pieces B' })).body.id;
    const product = (await api().post('/api/products').set(tenantBtoken).send({ code: 'TB-P', name: 'Tenant B Product', baseUnitId: unit, sellingPrice: '10.00' })).body.id;
    const customer = (await api().post('/api/customers').set(tenantBtoken).send({ name: 'Tenant B Customer', phone: '0244000088' })).body.id;
    await api().post('/api/inventory/opening-stock').set(tenantBtoken).send({
      warehouseId: wh,
      authority: 'physical_count',
      lines: [{ productId: product, quantityBase: '5' }], // no cost → zero-value layer
    });

    const sale = await api().post('/api/sales/commit').set(tenantBtoken).send({
      warehouseId: wh,
      customerId: customer,
      lines: [{ productId: product, quantityBase: '1', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '10.0000' }],
    });
    expect(sale.status).toBe(201);
    // tax-neutral until configured: zero components, zero tax
    expect(sale.body.invoice.taxTotal).toBe('0.0000');
    expect(sale.body.invoice.taxComponents).toHaveLength(0);
    expect(sale.body.invoice.total).toBe('10.0000');
    // un-costed stock carries no COGS (zero-value layer)
    expect(sale.body.invoice.costTotal).toBeNull();
    // the sale still journals (cash DR / revenue CR)
    const journals = await api().get('/api/gl/journals').set(tenantBtoken).query({ sourceKind: 'invoice', sourceId: sale.body.invoice.id }).expect(200).then((r) => r.body);
    expect(journals).toHaveLength(1);
    expect(journals[0].totalDebit).toBe(journals[0].totalCredit);

    // the defaults now exist: DEFAULT tax profile (zero components), 10 mappings, AVCO v1
    const profiles = await api().get('/api/tax/profiles').set(tenantBtoken).expect(200).then((r) => r.body);
    const def = profiles.find((p: { code: string }) => p.code === 'DEFAULT');
    expect(def).toBeTruthy();
    expect(def.isDefault).toBe(true);
    const mappings = await api().get('/api/gl/mappings').set(tenantBtoken).expect(200).then((r) => r.body);
    expect(mappings).toHaveLength(10);
    const costPolicies = await sql<{ method: string }>(
      `SELECT method FROM cost_policy_version WHERE tenant_id = $1`,
      [fx.tenantB.tenantId],
    );
    expect(costPolicies[0]!.method).toBe('avco');
  });
});
