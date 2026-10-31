/**
 * Phase 3 REVIEW HARDENING integration proofs (second independent review,
 * blockers 1–4):
 *
 *  P0-1 TAX APPLICABILITY IS SERVER-AUTHORITATIVE — exemption resolves from
 *     server configuration (product.tax_exempt, customer.tax_exempt) or a
 *     separately permissioned + audited override; the client's taxExempt
 *     flag is a fail-closed EXPECTATION (409), never a posted exemption;
 *     every invoice line carries the exemption SOURCE evidence.
 *
 *  P0-2 INVOICE REVERSAL — append-only correction documents; ONE transaction
 *     inverses stock/AVCO (verbatim cost evidence), the GL (the reversal
 *     journal inverts the original sale journal per account), AR (later
 *     settlements clear into a restored deposit); idempotent by client_doc_id;
 *     one reversal per invoice.
 *
 *  P1-3 QUOTATION LIFECYCLE — draft → issued → accepted → converted with
 *     rejected | expired dead ends, manual cancel before conversion,
 *     issued_at/accepted_at evidence and status_reason on non-conversion
 *     outcomes; validity-window guards.
 *
 *  P1-4 TENANT-REFERENCE HARDENING — every Phase 3 financial entity
 *     references run through the composite (tenant_id, ref) FK pattern, so
 *     a tenant-A row cannot reference tenant-B financial rows even at the
 *     raw DB boundary (FK checks bypass RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('review hardening (tax authority / invoice reversal / quotation lifecycle / tenant FKs)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string; // sell 50.00, opening cost 30 — taxable
  let productE: string; // sell 10.00, opening cost 6 — product-configured tax-exempt
  let customerC1: string; // taxable customer
  let customerExempt: string; // tax_exempt = true (server configuration)

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  /** raw admin assertions bypass RLS (the migration/test role is superuser) */
  async function sql<T extends Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
    const res = await fx.admin.query(q, params);
    return res.rows as T[];
  }

  async function commitSale(token: Record<string, string>, body: Record<string, unknown>) {
    return api().post('/api/sales/commit').set(token).send(body);
  }

  /** money helper: parse "123.4500" → 1234500n (4dp scaled) */
  const m = (s: string) => BigInt(s.replace('.', '').padEnd(5, '0'));

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);

    whA = (await api().post('/api/warehouses').set(owner).send({ code: 'RVW-WHA', name: 'Review WH A' })).body.id;
    unitPc = (await api().post('/api/units').set(owner).send({ code: 'PCR', name: 'Pieces Review' })).body.id;
    productA = (await api().post('/api/products').set(owner).send({ code: 'RVW-A', name: 'Review Taxable', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productE = (await api().post('/api/products').set(owner).send({ code: 'RVW-E', name: 'Review Exempt', baseUnitId: unitPc, sellingPrice: '10.00', purchasePrice: '6.00', taxExempt: true })).body.id;
    customerC1 = (await api().post('/api/customers').set(owner).send({ name: 'Review Customer', phone: '0244000088' })).body.id;
    customerExempt = (await api().post('/api/customers').set(owner).send({ name: 'Review Exempt Org', phone: '0244000077' })).body.id;
    // server-side customer exemption configuration (raw config surface)
    await sql(`UPDATE customer SET tax_exempt = true WHERE id = $1`, [customerExempt]);

    // an effective-dated default tax profile with real components
    const profile = await api().post('/api/tax/profiles').set(owner).send({ code: 'RVW-STD', name: 'Review Standard', isDefault: true });
    expect(profile.status).toBe(201);
    const version = await api().post(`/api/tax/profiles/${profile.body.id}/versions`).set(owner).send({
      effectiveFrom: '2020-01-01',
      components: [
        { name: 'GETFL', rate: '0.050000', inclusive: false, seq: 1 },
        { name: 'NHIL', rate: '0.025000', inclusive: false, seq: 2 },
      ],
    });
    expect(version.status).toBe(201);

    const opening = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '100', unitCost: '30.0000' },
        { productId: productE, quantityBase: '100', unitCost: '6.0000' },
      ],
    });
    expect(opening.status).toBe(201);
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  /* ------------------ P0-1: tax applicability (server) ------------------- */

  it('records the exemption SOURCE evidence per line (product, customer, override)', async () => {
    // product-configured exemption: A taxable + E product-exempt
    const r1 = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '1', unitPrice: '50.00' },
        { productId: productE, quantityBase: '1', unitPrice: '10.00' },
      ],
      tenders: [{ method: 'cash', amount: '63.7500' }],
    });
    expect(r1.status).toBe(201);
    const inv1 = r1.body.invoice;
    expect(inv1.taxTotal).toBe('3.7500'); // 7.5% on the taxable 50 only
    const lineA1 = inv1.lines.find((l: { productId: string }) => l.productId === productA);
    const lineE1 = inv1.lines.find((l: { productId: string }) => l.productId === productE);
    expect(lineA1.taxExemptionSource).toBeNull();
    expect(lineE1.taxExemptionSource).toBe('product');

    // customer-configured exemption: every line of the exempt customer
    const r2 = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerExempt,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '50.0000' }],
    });
    expect(r2.status).toBe(201);
    expect(r2.body.invoice.taxTotal).toBe('0.0000');
    expect(r2.body.invoice.lines[0].taxExemptionSource).toBe('customer');

    // permissioned + audited override: manager, taxable product, reason recorded
    const r3 = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '50.00',
        taxExemptionOverride: { reason: 'diplomatic mission purchase — certificate D-221 filed' },
      }],
      tenders: [{ method: 'cash', amount: '50.0000' }],
    });
    expect(r3.status).toBe(201);
    expect(r3.body.invoice.taxTotal).toBe('0.0000');
    const lineO = r3.body.invoice.lines[0];
    expect(lineO.taxExemptionSource).toBe('override');
    expect(lineO.taxExemptionReason).toBe('diplomatic mission purchase — certificate D-221 filed');
  });

  it('a client exemption expectation without a server source is a fail-closed 409 (client cannot suppress tax)', async () => {
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00', taxExempt: true }],
      tenders: [{ method: 'cash', amount: '53.7500' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no server source applies/);

    // no silent taxation either when the server HAS an exempt source but the
    // client did not expect one: the exempt source simply applies (recorded)
    const ok = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productE, quantityBase: '1', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '10.0000' }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.invoice.lines[0].taxExemptionSource).toBe('product');
  });

  it('an exemption override without the permission is a 403 (cashier holds neither override power)', async () => {
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{
        productId: productA,
        quantityBase: '1',
        unitPrice: '50.00',
        taxExemptionOverride: { reason: 'should not pass without the permission' },
      }],
      tenders: [{ method: 'cash', amount: '50.0000' }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/sales:tax_exempt_override/);
  });

  /* ------------------ P0-2: invoice reversal ----------------------------- */

  it('reverses a paid cash sale in ONE transaction: status, stock+AVCO value, exact GL inversion', async () => {
    // stock/cost state BEFORE the sale — the reversal must land exactly here
    const pre = await sql<{ qty: string; value: string }>(
      `SELECT quantity_base::text AS qty, total_value::text AS value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productA],
    );

    // cash sale with change: 2×50 = 100, tax 7.50 → total 107.50; tenders 120 → change 12.50
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '120.0000' }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;

    const mid = await sql<{ qty: string; value: string }>(
      `SELECT quantity_base::text AS qty, total_value::text AS value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productA],
    );
    expect(mid[0]!.qty).toBe('95.000000'); // pre − 2 (this suite sold 3 before)

    const reversal = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'wrong product bundle sold — customer returned the goods immediately',
    });
    expect(reversal.status).toBe(201);
    const rev = reversal.body;
    expect(rev.invoiceId).toBe(invoiceId);
    expect(rev.code).toMatch(/^RVI/);
    expect(rev.journalEntryId).toBeTruthy();
    expect(rev.restoredDepositId).toBeNull(); // nothing was settled beyond the sale itself

    // invoice status + evidence
    const inv = await api().get(`/api/sales/invoices/${invoiceId}`).set(auditor).expect(200);
    expect(inv.body.status).toBe('reversed');
    expect(inv.body.reversedAt).toBeTruthy();
    const got = await api().get(`/api/sales/invoices/${invoiceId}/reversal`).set(auditor).expect(200);
    expect(got.body.id).toBe(rev.id);
    expect(got.body.reason).toMatch(/wrong product bundle/);

    // stock + AVCO value restored EXACTLY to the pre-sale state (reversal
    // movements copied the cost verbatim)
    const after = await sql<{ qty: string; value: string }>(
      `SELECT quantity_base::text AS qty, total_value::text AS value FROM stock_cost_state
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
      [fx.tenantA.tenantId, whA, productA],
    );
    expect(after[0]!.qty).toBe(pre[0]!.qty);
    expect(after[0]!.value).toBe(pre[0]!.value);

    const movements = await sql<{ movement_type: string; quantity_base: string; reversal_of: string; unit_cost: string; cost_value: string }>(
      `SELECT movement_type, quantity_base::text AS quantity_base, reversal_of::text AS reversal_of,
              unit_cost::text AS unit_cost, cost_value::text AS cost_value
       FROM stock_movement
       WHERE tenant_id = $1 AND source_document_type = 'invoice_reversal' AND source_document_id = $2`,
      [fx.tenantA.tenantId, invoiceId],
    );
    expect(movements).toHaveLength(1);
    expect(movements[0]!.movement_type).toBe('reversal');
    expect(movements[0]!.quantity_base).toBe('2.000000');
    expect(movements[0]!.reversal_of).toBeTruthy();
    expect(movements[0]!.unit_cost).toBe('30.0000'); // verbatim AVCO evidence
    expect(movements[0]!.cost_value).toBe('60.0000');

    // GL: the reversal journal is the exact per-account inverse of the sale journal
    const saleJournal = (await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'invoice', sourceId: invoiceId }).expect(200)).body[0];
    const revJournal = (await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'invoice_reversal', sourceId: invoiceId }).expect(200)).body[0];
    expect(saleJournal).toBeTruthy();
    expect(revJournal).toBeTruthy();

    const net = (lines: Array<{ accountCode: string; debit: string; credit: string }>) => {
      const map = new Map<string, bigint>();
      for (const l of lines) {
        const key = l.accountCode;
        const d = BigInt(l.debit.replace('.', '').padEnd(5, '0'));
        const c = BigInt(l.credit.replace('.', '').padEnd(5, '0'));
        map.set(key, (map.get(key) ?? 0n) + d - c);
      }
      return map;
    };
    const saleNet = net(saleJournal.lines);
    const revNet = net(revJournal.lines);
    const codes = new Set([...saleNet.keys(), ...revNet.keys()]);
    for (const code of codes) {
      expect(revNet.get(code) ?? 0n).toBe(-(saleNet.get(code) ?? 0n));
    }
    // the sale's own journal legs are recognisable (cash = tenders 120 − change 12.50)
    expect(saleNet.get('1000')).toBe(m('107.5000'));
    expect(saleNet.get('4000')).toBe(m('-100.0000'));
    expect(saleNet.get('2200')).toBe(m('-7.5000')); // tax on 100 @ 7.5%
  });

  it('reverses a credit sale with later receipts and later credit applications: AR clears, value restored as ONE deposit', async () => {
    // productE is product-exempt → zero tax keeps the arithmetic transparent
    // deposit D1: 15 cash
    const dep1 = await api().post('/api/deposits').set(cashier).send({
      customerId: customerC1,
      amount: '15.0000',
      tenders: [{ method: 'cash', amount: '15.0000' }],
    });
    expect(dep1.status).toBe(201);

    // credit sale: 2×10 = 20, cash 4 + credit 10 (D1) → AR 6
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productE, quantityBase: '2', unitPrice: '10.00' }],
      tenders: [
        { method: 'cash', amount: '4.0000' },
        { method: 'credit', amount: '10.0000', depositId: dep1.body.id },
      ],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    expect(sale.body.invoice.amountDue).toBe('6.0000');

    // later receipt T2 = 4 → AR 2
    const receipt = await api().post('/api/payments').set(cashier).send({
      customerId: customerC1,
      amount: '4.0000',
      tenders: [{ method: 'cash', amount: '4.0000' }],
      allocations: [{ invoiceId, amount: '4.0000' }],
    });
    expect(receipt.status).toBe(201);

    // second deposit D2: 3, then a later credit apply C2 = 2 → AR 0
    const dep2 = await api().post('/api/deposits').set(cashier).send({
      customerId: customerC1,
      amount: '3.0000',
      tenders: [{ method: 'cash', amount: '3.0000' }],
    });
    expect(dep2.status).toBe(201);
    const apply = await api().post('/api/credits/apply').set(cashier).send({
      depositId: dep2.body.id,
      invoiceId,
      amount: '2.0000',
    });
    expect(apply.status).toBe(201);

    const reversal = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'invoice posted against the wrong customer account after merge',
    });
    expect(reversal.status).toBe(201);
    const rev = reversal.body;

    // restored deposit = C(sale) 10 + T2 4 + C2 2 = 16
    expect(rev.restoredDepositId).toBeTruthy();
    const restored = await sql<{ amount: string; customer_id: string }>(
      `SELECT amount::text AS amount, customer_id::text AS customer_id FROM customer_deposit WHERE id = $1`,
      [rev.restoredDepositId],
    );
    expect(restored[0]!.amount).toBe('16.0000');
    expect(restored[0]!.customer_id).toBe(customerC1);

    // GL: per-account inversion + the AR-clearing pair on top
    const saleJournal = (await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'invoice', sourceId: invoiceId }).expect(200)).body[0];
    const revJournal = (await api().get('/api/gl/journals').set(auditor).query({ sourceKind: 'invoice_reversal', sourceId: invoiceId }).expect(200)).body[0];
    const net = (lines: Array<{ accountCode: string; debit: string; credit: string }>) => {
      const map = new Map<string, bigint>();
      for (const l of lines) {
        const d = BigInt(l.debit.replace('.', '').padEnd(5, '0'));
        const c = BigInt(l.credit.replace('.', '').padEnd(5, '0'));
        map.set(l.accountCode, (map.get(l.accountCode) ?? 0n) + d - c);
      }
      return map;
    };
    const saleNet = net(saleJournal.lines);
    const revNet = net(revJournal.lines);
    const clearing = m('6.0000'); // T2 4 + C2 2
    for (const [code, saleVal] of saleNet) {
      const expected = -saleVal + (code === '1100' ? clearing : code === '2100' ? -clearing : 0n);
      expect(revNet.get(code) ?? 0n).toBe(expected);
    }
    // AR fully cleared, deposits liability carries the restored value
    expect(revNet.get('1100') ?? 0n).toBe(0n);
    expect(revNet.get('2100')).toBe(m('-16.0000'));

    // the customer's usable deposits = D1 remaining 5 + D2 remaining 1 + D3 16 = 22
    // (Σ deposits 15+3+16 = 34 minus Σ applications 10+2 = 12)
    const usable = await sql<{ total: string }>(
      `SELECT (COALESCE(SUM(d.amount), 0) - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                                                          JOIN customer_deposit cd ON cd.id = ca.deposit_id
                                                          WHERE cd.tenant_id = $1 AND cd.customer_id = $2), 0))::text AS total
       FROM customer_deposit d WHERE d.tenant_id = $1 AND d.customer_id = $2`,
      [fx.tenantA.tenantId, customerC1],
    );
    expect(usable[0]!.total).toBe('22.0000');
  });

  it('reversal is idempotent by client_doc_id and unique per invoice', async () => {
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productE, quantityBase: '1', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '10.0000' }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    const clientDocId = '0f8e7d6c-5b4a-3210-9f8e-7d6c5b4a3210';

    const first = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'duplicate capture at the register — tender voided',
      clientDocId,
    });
    expect(first.status).toBe(201);

    // retry with the same client_doc_id replays the ORIGINAL document
    const retry = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'duplicate capture at the register — tender voided',
      clientDocId,
    });
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.code).toBe(first.body.code);

    // a second reversal without identity is refused (one per invoice)
    const second = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'a second attempt should never succeed here',
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/reversed/);
  });

  it('reversal authority and validation: cashier/auditor 403, short reason 400, missing journal 409', async () => {
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productE, quantityBase: '1', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '10.0000' }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    const reason = 'validation target invoice for the reversal guards';

    expect((await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(cashier).send({ reason })).status).toBe(403);
    expect((await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(auditor).send({ reason })).status).toBe(403);
    expect((await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({ reason: 'too short' })).status).toBe(400);

    // pre-hardening invoice: strip its sale journal → refused with the Phase 4 pointer
    await sql(`DELETE FROM journal_line WHERE entry_id IN (SELECT id FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $2)`, [fx.tenantA.tenantId, invoiceId]);
    await sql(`DELETE FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $2`, [fx.tenantA.tenantId, invoiceId]);
    const refused = await api().post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({ reason });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Phase 4 back-fill/);
  });

  /* ------------------ P1-3: quotation lifecycle --------------------------- */

  it('quotation lifecycle: draft → issued → accepted → converted with evidence columns', async () => {
    const created = await api().post('/api/quotations').set(manager).send({
      warehouseId: whA,
      customerId: customerC1,
      validUntil: '2099-12-31',
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.status).toBe('draft');
    expect(created.body.issuedAt).toBeNull();

    // a bare draft can no longer convert — acceptance is required first
    // (an illegal state transition is a 400 validation error, not a conflict)
    expect((await api().post(`/api/quotations/${id}/convert`).set(manager)).status).toBe(400);

    const issued = await api().post(`/api/quotations/${id}/issue`).set(manager).expect(201);
    expect(issued.body.status).toBe('issued');
    expect(issued.body.issuedAt).toBeTruthy();

    const accepted = await api().post(`/api/quotations/${id}/accept`).set(manager).expect(201);
    expect(accepted.body.status).toBe('accepted');
    expect(accepted.body.acceptedAt).toBeTruthy();
    expect(accepted.body.issuedAt).toBeTruthy();

    const order = await api().post(`/api/quotations/${id}/convert`).set(manager).expect(201);
    expect(order.body.quotationId).toBe(id);
    expect(order.body.status).toBe('draft');

    const final = await api().get(`/api/quotations/${id}`).set(manager).expect(200);
    expect(final.body.status).toBe('converted');
    expect(final.body.convertedOrderId).toBe(order.body.id);
  });

  it('quotation outcomes: reject records the reason; expired via validity guard; cancel before conversion', async () => {
    // reject with a reason (reason is mandatory — the endpoint 400s without one)
    const q1 = await api().post('/api/quotations').set(manager).send({
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    expect(q1.status).toBe(201);
    await api().post(`/api/quotations/${q1.body.id}/issue`).set(manager).expect(201);
    expect((await api().post(`/api/quotations/${q1.body.id}/reject`).set(manager).send({})).status).toBe(400);
    const rejected = await api().post(`/api/quotations/${q1.body.id}/reject`).set(manager).send({ reason: 'customer chose a competitor bundle' }).expect(201);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.statusReason).toBe('customer chose a competitor bundle');
    // terminal: no conversion after rejection
    expect((await api().post(`/api/quotations/${q1.body.id}/convert`).set(manager)).status).toBe(400);

    // validity window: an offer that already elapsed cannot be issued or accepted
    const q2 = await api().post('/api/quotations').set(manager).send({
      warehouseId: whA,
      customerId: customerC1,
      validUntil: '2020-01-01',
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    expect(q2.status).toBe(201);
    const expiredIssue = await api().post(`/api/quotations/${q2.body.id}/issue`).set(manager);
    expect(expiredIssue.status).toBe(409);
    expect(expiredIssue.body.error).toMatch(/validity elapsed/);
    // force the issued→expired path via a live offer
    const q3 = await api().post('/api/quotations').set(manager).send({
      warehouseId: whA,
      customerId: customerC1,
      validUntil: '2099-12-31',
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    await api().post(`/api/quotations/${q3.body.id}/issue`).set(manager).expect(201);
    await sql(`UPDATE quotation SET valid_until = '2020-01-01' WHERE id = $1`, [q3.body.id]);
    const expiredAccept = await api().post(`/api/quotations/${q3.body.id}/accept`).set(manager);
    expect(expiredAccept.status).toBe(409);
    expect(expiredAccept.body.error).toMatch(/validity elapsed/);
    const expired = await api().post(`/api/quotations/${q3.body.id}/expire`).set(manager).expect(201);
    expect(expired.body.status).toBe('expired');
    expect(expired.body.statusReason).toBe('validity period elapsed');

    // manual cancel with a reason from the issued state
    const q4 = await api().post('/api/quotations').set(manager).send({
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    await api().post(`/api/quotations/${q4.body.id}/issue`).set(manager).expect(201);
    const cancelled = await api().post(`/api/quotations/${q4.body.id}/cancel`).set(manager).send({ reason: 'customer withdrew the request' }).expect(201);
    expect(cancelled.body.status).toBe('cancelled');
    expect(cancelled.body.statusReason).toBe('customer withdrew the request');

    // cashier holds no sales:write — every lifecycle command is a 403
    expect((await api().post('/api/quotations').set(cashier).send({
      warehouseId: whA,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    })).status).toBe(403);
  });

  /* ------------------ P1-4: tenant-reference hardening -------------------- */

  it('composite (tenant_id, ref) foreign keys replaced every plain Phase 3 entity reference', async () => {
    // every swapped reference now carries the composite constraint…
    const composite = await sql<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE contype = 'f' AND conname LIKE 'fk_%_tenant' AND conrelid = 'payment_allocation'::regclass`,
    );
    expect(composite.map((r) => r.conname).sort()).toEqual([
      'fk_payment_allocation_invoice_id_tenant',
      'fk_payment_allocation_payment_id_tenant',
    ]);
    // …and the plain single-column twins are gone (spot the critical ones)
    const plain = await sql<{ tbl: string; col: string }>(
      `SELECT c.relname AS tbl, a.attname AS col
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = ANY(k.conkey)
       WHERE k.contype = 'f'
         AND c.relname IN ('invoice','invoice_line','payment','payment_tender','payment_allocation',
                            'customer_deposit','credit_application','sales_order','quotation',
                            'quotation_line','fulfillment','fulfillment_line','cashier_shift',
                            'shift_cash_movement','document_sequence','document_booklet_code',
                            'sequence_lease','sync_applied_event','tax_profile_version','tax_component',
                            'invoice_tax_component','journal_line','stock_cost_state','gl_mapping')
         AND k.conkey = ARRAY[a.attnum] AND a.attname IN
             ('sales_order_id','shift_id','invoice_id','payment_id','deposit_id','quotation_id',
              'order_id','fulfillment_id','order_line_id','branch_id','booklet_id','device_id',
              'sequence_id','profile_id','version_id','component_id','entry_id','account_id',
              'warehouse_id','customer_id','product_id','unit_id')
         AND k.confrelid IN ('invoice'::regclass,'payment'::regclass,'customer_deposit'::regclass,
              'sales_order'::regclass,'sales_order_line'::regclass,'quotation'::regclass,
              'fulfillment'::regclass,'cashier_shift'::regclass,'document_sequence'::regclass,
              'document_booklet'::regclass,'device'::regclass,'branch'::regclass,'warehouse'::regclass,
              'customer'::regclass,'product'::regclass,'unit'::regclass,'tax_profile'::regclass,
              'tax_profile_version'::regclass,'tax_component'::regclass,'journal_entry'::regclass,
              'gl_account'::regclass)`,
    );
    expect(plain).toEqual([]);
  });

  it('a tenant-A row cannot reference tenant-B financial rows even at the raw DB boundary (FK checks bypass RLS)', async () => {
    // tenant-B warehouse + product + a posted invoice, tenant-A payment
    const tb = { Authorization: `Bearer ${fx.tenantB.users.owner!.token}` };
    const whB = (await request(app.getHttpServer()).post('/api/warehouses').set(tb).send({ code: 'RVW-WHB', name: 'Tenant B WH' })).body.id;
    const unitB = (await request(app.getHttpServer()).post('/api/units').set(tb).send({ code: 'PCB', name: 'Pieces B' })).body.id;
    const prodB = (await request(app.getHttpServer()).post('/api/products').set(tb).send({ code: 'RVW-B', name: 'Review B', baseUnitId: unitB, sellingPrice: '10.00', purchasePrice: '5.00' })).body.id;
    await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(tb)
      .send({ warehouseId: whB, authority: 'physical_count', lines: [{ productId: prodB, quantityBase: '10', unitCost: '5.0000' }] });
    const saleB = await request(app.getHttpServer()).post('/api/sales/commit').set(tb)
      .send({ warehouseId: whB, lines: [{ productId: prodB, quantityBase: '1', unitPrice: '10.00' }], tenders: [{ method: 'cash', amount: '10.0000' }] });
    expect(saleB.status).toBe(201);
    const invoiceB = saleB.body.invoice.id as string;

    // tenant-A payment (from an earlier sale in this suite)
    const saleA = await commitSale(cashier, {
      warehouseId: whA,
      lines: [{ productId: productE, quantityBase: '1', unitPrice: '10.00' }],
      tenders: [{ method: 'cash', amount: '10.0000' }],
    });
    expect(saleA.status).toBe(201);
    const paymentA = saleA.body.payment.id as string;

    // cross-tenant payment_allocation insert: RLS does not apply to the
    // superuser admin connection, but the composite FK still rejects it
    await expect(
      sql(
        `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, amount)
         VALUES ($1, $2, $3, 1)`,
        [fx.tenantA.tenantId, paymentA, invoiceB],
      ),
    ).rejects.toThrow();
  });

  /* ------------------ arithmetic helper sanity ---------------------------- */

  it('money helper parses 4dp strings exactly', () => {
    expect(m('63.7500')).toBe(637500n);
    expect(m('0.0000')).toBe(0n);
    expect(m('120.0000')).toBe(1200000n);
  });
});
