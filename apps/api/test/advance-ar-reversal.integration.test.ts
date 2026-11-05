/**
 * Review round 3 — supplier advance lifecycle (blocker 1) and
 * reversal-aware AR reconciliation (blocker 2).
 *
 * BLOCKER 1 proves the canonical scenario: an advance is paid BEFORE the
 * goods and invoice exist (Oct 1: ₵100 advance → Oct 20: ₵60 invoice →
 * Oct 21: apply ₵40 → Oct 25: apply ₵20). Every application is its own
 * append-only document with its own journal identity, booked on the
 * APPLICATION's business date; AP, supplier statement, aging and the
 * supplier-advance reconciliation apply each application from its own
 * date only.
 *
 * BLOCKER 2 proves the AR subledger is reversal-aware AND as-of correct:
 * the append-only invoice_reversal record cancels the outstanding
 * exposure from the reversal's effective date onward — historical
 * reports dated before the reversal still show the original exposure,
 * no fake payment rows are inserted, and the customer's settled value
 * is restored as a real deposit.
 *
 * Every assertion is an exact expected value derived from the posting
 * rules (never merely "the endpoint responded").
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TODAY = new Date().toISOString().slice(0, 10);
const YEAR = TODAY.slice(0, 4);
const YESTERDAY = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function listenFixture(fx: ApiFixture): Promise<string> {
  const server = await fx.app.listen(0);
  const addr = server.address() as { port: number };
  return `http://127.0.0.1:${addr.port}`;
}

/* ================================================================== */
/* BLOCKER 1 — the supplier advance application lifecycle              */
/* ================================================================== */
describe('Blocker 1: supplier advance applications are dated documents', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let tenantB: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productT: string;
  let supplierS1: string;

  const OCT1 = `${YEAR}-10-01`; // advance ₵100 paid
  const OCT2 = `${YEAR}-10-02`;
  const OCT5 = `${YEAR}-10-05`; // historical check 1
  const OCT6 = `${YEAR}-10-06`;
  const OCT10 = `${YEAR}-10-10`;
  const OCT15 = `${YEAR}-10-15`;
  const OCT20 = `${YEAR}-10-20`; // invoice ₵60 recorded
  const OCT21 = `${YEAR}-10-21`; // apply ₵40
  const OCT22 = `${YEAR}-10-22`; // historical check 2
  const OCT25 = `${YEAR}-10-25`; // apply ₵20
  const OCT26 = `${YEAR}-10-26`; // historical check 3

  async function recon(asOf: string) {
    const res = await request(base)
      .get(`/api/accounting/reconciliation?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return new Map<string, { check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean }>(
      (res.body.checks as Array<{ check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean }>)
        .map((c) => [c.check, c]),
    );
  }
  async function aging(asOf: string) {
    const res = await request(base).get(`/api/ap/aging?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return res.body as Array<{ supplierId: string; total: string }>;
  }
  async function statement(supplierId: string, asOf: string) {
    const res = await request(base).get(`/api/ap/statements/${supplierId}?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return res.body as {
      lines: Array<{ businessDate: string; documentCode: string; documentType: string; debit: string; credit: string; runningOpen: string }>;
      closingBalance: string;
      advanceBalance: string;
    };
  }
  /** GRN + POSTED supplier invoice in one call */
  async function invoice(businessDate: string, qty: string, unitPrice: string, supplierInvoiceNumber: string, supplierId = supplierS1) {
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId, warehouseId: whA, businessDate,
      lines: [{ productId: productT, receivedQuantity: qty, unitCost: unitPrice }],
    });
    expect(grn.status).toBe(201);
    const inv = await request(base).post('/api/purchasing/supplier-invoices').set(manager).send({
      supplierId, supplierInvoiceNumber, supplierInvoiceDate: businessDate,
      businessDate, post: true,
      lines: [{ goodsReceiptLineId: grn.body.lines[0].id, productId: productT, description: 'advance scenario purchase', quantityBase: qty, unitPrice }],
    });
    expect(inv.status).toBe(201);
    return inv.body as { id: string; code: string; total: string };
  }
  async function advancePayment(businessDate: string, amount: string, supplierId = supplierS1) {
    const adv = await request(base).post('/api/purchasing/supplier-payments').set(manager).send({
      supplierId, businessDate, amount, method: 'cash', allocations: [],
    });
    expect(adv.status).toBe(201);
    return adv.body as { id: string; code: string };
  }
  /** a fresh supplier per scenario — supplier statements (and their
   *  advanceBalance) are per-supplier, so absolute assertions stay exact
   *  even though the reconciliation check aggregates the whole tenant */
  async function newSupplier(name: string) {
    const res = await request(base).post('/api/suppliers').set(owner).send({ name, phone: '0203333333' });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    tenantB = auth(fx.tenantB.users.owner!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'AA-WH', name: 'AA WH' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'AA-PC', name: 'Pieces' })).body.id;
    productT = (
      await request(base).post('/api/products').set(owner).send({
        code: 'AA-P', name: 'AA P', baseUnitId: unitPc, sellingPrice: '40.00', purchasePrice: '20.00',
      })
    ).body.id;
    supplierS1 = (await request(base).post('/api/suppliers').set(owner).send({ name: 'AA Supplier', phone: '0201111111' })).body.id;
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('October scenario end-to-end: Oct 1 advance ₵100 → Oct 20 invoice ₵60 → Oct 21 apply ₵40 → Oct 25 apply ₵20', async () => {
    // Oct 1: the advance is paid BEFORE any goods or invoice exist
    const adv = await advancePayment(OCT1, '100.00');

    // Oct 5 (historical): AP 0, the advance is a full ₵100 asset
    let r = await recon(OCT5);
    expect(r.get('accounts_payable')!.controlBalance).toBe('0.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('0.0000');
    expect(r.get('supplier_advance')!.controlBalance).toBe('100.0000');
    expect(r.get('supplier_advance')!.subledgerBalance).toBe('100.0000');
    expect(r.get('supplier_advance')!.passed).toBe(true);
    expect((await aging(OCT5)).find((a) => a.supplierId === supplierS1)).toBeUndefined();

    // Oct 20: the invoice arrives
    const inv = await invoice(OCT20, '3', '20.00', 'AA-INV-60');
    expect(inv.total).toBe('60.0000');
    r = await recon(`${YEAR}-10-20`); // Oct 20 evening: invoice visible, advance untouched
    expect(r.get('supplier_advance')!.controlBalance).toBe('100.0000');

    // Oct 21: apply ₵40 of the advance — booked ON ITS OWN DATE
    const apply1 = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT21,
      allocations: [{ supplierInvoiceId: inv.id, amount: '40.0000' }],
      clientDocId: 'aa-apply-oct21-0001',
      notes: 'first application of the Oct 1 advance',
    });
    expect(apply1.status).toBe(201);
    expect(String(apply1.body.code)).toMatch(/^SAA/);
    expect(apply1.body.businessDate).toBe(OCT21);
    expect(apply1.body.amount).toBe('40.0000');
    expect(apply1.body.journalEntryId).toBeTruthy();
    expect(apply1.body.createdBy).toBeTruthy();
    expect(apply1.body.approvedBy).toBeTruthy();
    expect(apply1.body.paymentUnapplied).toBe('60.0000');

    // Oct 22 (historical): AP 20, advance 60 — BOTH sides, exactly
    r = await recon(OCT22);
    expect(r.get('accounts_payable')!.controlBalance).toBe('20.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('20.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    expect(r.get('supplier_advance')!.controlBalance).toBe('60.0000');
    expect(r.get('supplier_advance')!.subledgerBalance).toBe('60.0000');
    expect(r.get('supplier_advance')!.passed).toBe(true);
    expect((await aging(OCT22)).find((a) => a.supplierId === supplierS1)!.total).toBe('20.0000');

    // Oct 25: apply another ₵20 — the SECOND application of the SAME
    // advance carries a DISTINCT journal identity
    const apply2 = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT25,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
      clientDocId: 'aa-apply-oct25-0002',
    });
    expect(apply2.status).toBe(201);
    expect(apply2.body.journalEntryId).toBeTruthy();
    expect(apply2.body.journalEntryId).not.toBe(apply1.body.journalEntryId);
    expect(apply2.body.code).not.toBe(apply1.body.code);
    expect(apply2.body.paymentUnapplied).toBe('40.0000');

    // Oct 26 (historical): AP 0 (fully settled via advances), advance 40
    r = await recon(OCT26);
    expect(r.get('accounts_payable')!.controlBalance).toBe('0.0000');
    expect(r.get('accounts_payable')!.subledgerBalance).toBe('0.0000');
    expect(r.get('accounts_payable')!.passed).toBe(true);
    expect(r.get('supplier_advance')!.controlBalance).toBe('40.0000');
    expect(r.get('supplier_advance')!.subledgerBalance).toBe('40.0000');
    expect(r.get('supplier_advance')!.passed).toBe(true);
    expect((await aging(OCT26)).find((a) => a.supplierId === supplierS1)).toBeUndefined();

    // the invoice is fully settled and its status reflects it
    const invAfter = await request(base).get(`/api/purchasing/supplier-invoices/${inv.id}`).set(owner);
    expect(invAfter.body.amountOpen).toBe('0.0000');
    expect(invAfter.body.status).toBe('paid');

    // the two applications do not leak before their own dates
    r = await recon(OCT20);
    expect(r.get('accounts_payable')!.controlBalance).toBe('60.0000');
    expect(r.get('supplier_advance')!.controlBalance).toBe('100.0000');
    r = await recon(OCT22);
    expect(r.get('supplier_advance')!.controlBalance).toBe('60.0000'); // the Oct-25 application invisible

    // supplier statement: each application ONCE on its own date
    const s26 = await statement(supplierS1, OCT26);
    const appRows = s26.lines.filter((l) => l.documentType === 'supplier_advance_application');
    expect(appRows).toHaveLength(2);
    expect(appRows[0]).toMatchObject({ businessDate: OCT21, credit: '40.0000' });
    expect(appRows[1]).toMatchObject({ businessDate: OCT25, credit: '20.0000' });
    expect(s26.closingBalance).toBe('0.0000');
    expect(s26.advanceBalance).toBe('40.0000');
    const s22 = await statement(supplierS1, OCT22);
    expect(s22.lines.filter((l) => l.documentType === 'supplier_advance_application')).toHaveLength(1);
    expect(s22.advanceBalance).toBe('60.0000');

    // application documents are queryable with full evidence
    const list = await request(base).get(`/api/purchasing/advance-applications?paymentId=${adv.id}`).set(owner);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
    const codes = new Set<string>(list.body.map((a: { code: string }) => a.code));
    expect(codes.size).toBe(2);
    const doc1 = await request(base).get(`/api/purchasing/advance-applications/${apply1.body.id}`).set(owner);
    expect(doc1.status).toBe(200);
    expect(doc1.body.businessDate).toBe(OCT21);
    expect(doc1.body.journalEntryId).toBe(apply1.body.journalEntryId);
    expect(doc1.body.clientDocId).toBe('aa-apply-oct21-0001');

    // the application journals carry the application dates + exact legs
    const journals = await fx.admin.query<{ business_date: string; source_id: string; total_debit: string; total_credit: string }>(
      `SELECT business_date::text AS business_date, source_id, total_debit::text AS total_debit, total_credit::text AS total_credit
       FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_advance_application' ORDER BY business_date`,
      [fx.tenantA.tenantId],
    );
    expect(journals.rows).toHaveLength(2);
    expect(journals.rows[0]!.business_date).toBe(OCT21);
    expect(journals.rows[0]!.total_debit).toBe('40.0000');
    expect(journals.rows[0]!.total_credit).toBe('40.0000');
    expect(journals.rows[1]!.business_date).toBe(OCT25);
    expect(new Set(journals.rows.map((j) => j.source_id))).toEqual(new Set([apply1.body.id, apply2.body.id]));
  });

  it('insufficient available advance: payment-time + application legs together are capped', async () => {
    const sup = await newSupplier('AA Insufficient');
    const adv = await advancePayment(OCT1, '50.00', sup);
    const invA = await invoice(OCT5, '3', '20.00', 'AA-INV-A60', sup);
    const invB = await invoice(OCT5, '2', '20.00', 'AA-INV-B40', sup);

    const apply40 = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: invA.id, amount: '40.0000' }],
    });
    expect(apply40.status).toBe(201);

    // 40 applied + 20 requested > 50 advance → deterministic conflict
    const refused = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: invB.id, amount: '20.0000' }],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/exceeds the available advance/i);

    // state is unchanged: the advance still has exactly 10 unapplied
    const list = await request(base).get(`/api/purchasing/advance-applications?paymentId=${adv.id}`).set(owner);
    expect(list.body).toHaveLength(1);
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('10.0000');
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('duplicate idempotency key: the replay returns the ORIGINAL document exactly once', async () => {
    const sup = await newSupplier('AA Idempotent');
    const adv = await advancePayment(OCT1, '30.00', sup);
    const inv = await invoice(OCT5, '2', '20.00', 'AA-INV-ID40', sup);

    const first = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
      clientDocId: 'aa-idem-key-000001',
    });
    expect(first.status).toBe(201);

    const replay = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
      clientDocId: 'aa-idem-key-000001',
    });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.code).toBe(first.body.code);
    expect(replay.body.journalEntryId).toBe(first.body.journalEntryId);

    const rows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application WHERE tenant_id = $1 AND client_doc_id = 'aa-idem-key-000001'`,
      [fx.tenantA.tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    const journals = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_advance_application' AND source_id = $2`,
      [fx.tenantA.tenantId, first.body.id],
    );
    expect(Number(journals.rows[0]!.n)).toBe(1);
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('10.0000'); // 30 − 20 — applied exactly once
  });

  it('same key + DIFFERENT amount → controlled 409 idempotency_key_reuse, the original is untouched', async () => {
    const sup = await newSupplier('AA Reuse Key');
    const adv = await advancePayment(OCT1, '80.00', sup);
    const inv = await invoice(OCT5, '2', '20.00', 'AA-INV-REUSE40', sup);

    const first = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '40.0000' }],
      clientDocId: 'aa-reuse-key-000001',
    });
    expect(first.status).toBe(201);
    expect(first.body.amount).toBe('40.0000');

    // same key, different amount (80): a REUSED KEY carrying different
    // business facts is a conflict — never a replay of the original ₵40
    // document for a ₵80 request, never a silent second application
    const hijack = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '80.0000' }],
      clientDocId: 'aa-reuse-key-000001',
    });
    expect(hijack.status).toBe(409);
    expect(hijack.body.code).toBe('idempotency_key_reuse');
    expect(hijack.body.error).toMatch(/DIFFERENT apply-advance request|idempotency/i);

    // the fingerprint is persisted with the application document
    const fp = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application
       WHERE tenant_id = $1 AND client_doc_id = 'aa-reuse-key-000001'
         AND request_fingerprint IS NOT NULL`,
      [fx.tenantA.tenantId],
    );
    expect(Number(fp.rows[0]!.n)).toBe(1);

    // exactly ONE application, ₵40 — the requested 80 was NOT applied
    const applied = await fx.admin.query<{ total: string }>(
      `SELECT COALESCE(SUM(saal.amount), 0)::text AS total
       FROM supplier_advance_application_line saal
       JOIN supplier_advance_application saa ON saa.id = saal.application_id
       WHERE saa.tenant_id = $1 AND saa.client_doc_id = $2`,
      [fx.tenantA.tenantId, 'aa-reuse-key-000001'],
    );
    expect(applied.rows[0]!.total).toBe('40.0000');
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('40.0000'); // 80 − 40, not 0
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('same key + different invoice / payment / business date each → 409 idempotency_key_reuse', async () => {
    // ── different INVOICE leg ─────────────────────────────────────────
    const supA = await newSupplier('AA Reuse Invoice');
    const advA = await advancePayment(OCT1, '60.00', supA);
    const invA1 = await invoice(OCT5, '1', '20.00', 'AA-INV-RUI-1', supA);
    const invA2 = await invoice(OCT10, '1', '20.00', 'AA-INV-RUI-2', supA);
    const okA = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advA.id, businessDate: OCT10,
      allocations: [{ supplierInvoiceId: invA1.id, amount: '20.0000' }],
      clientDocId: 'aa-reuse-inv-000001',
    });
    expect(okA.status).toBe(201);
    const otherInvoice = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advA.id, businessDate: OCT10,
      allocations: [{ supplierInvoiceId: invA2.id, amount: '20.0000' }], // inv1 → inv2
      clientDocId: 'aa-reuse-inv-000001',
    });
    expect(otherInvoice.status).toBe(409);
    expect(otherInvoice.body.code).toBe('idempotency_key_reuse');

    // ── different PAYMENT (advance) ───────────────────────────────────
    const supB = await newSupplier('AA Reuse Payment');
    const advB1 = await advancePayment(OCT1, '30.00', supB);
    const advB2 = await advancePayment(OCT2, '30.00', supB);
    const invB = await invoice(OCT5, '1', '20.00', 'AA-INV-RUP-1', supB);
    const okB = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advB1.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: invB.id, amount: '20.0000' }],
      clientDocId: 'aa-reuse-pay-000001',
    });
    expect(okB.status).toBe(201);
    const otherPayment = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advB2.id, // adv1 → adv2
      businessDate: OCT5,
      allocations: [{ supplierInvoiceId: invB.id, amount: '20.0000' }],
      clientDocId: 'aa-reuse-pay-000001',
    });
    expect(otherPayment.status).toBe(409);
    expect(otherPayment.body.code).toBe('idempotency_key_reuse');
    // the key still resolves to the ORIGINAL advance only
    const payRows = await fx.admin.query<{ payment_id: string; n: string }>(
      `SELECT payment_id::text, COUNT(*)::text AS n FROM supplier_advance_application
       WHERE tenant_id = $1 AND client_doc_id = 'aa-reuse-pay-000001' GROUP BY payment_id`,
      [fx.tenantA.tenantId],
    );
    expect(payRows.rows).toHaveLength(1);
    expect(payRows.rows[0]!.payment_id).toBe(advB1.id);

    // ── different business DATE ──────────────────────────────────────
    const supC = await newSupplier('AA Reuse Date');
    const advC = await advancePayment(OCT1, '30.00', supC);
    const invC = await invoice(OCT5, '1', '20.00', 'AA-INV-RUD-1', supC);
    const okC = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advC.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: invC.id, amount: '20.0000' }],
      clientDocId: 'aa-reuse-date-00001',
    });
    expect(okC.status).toBe(201);
    const otherDate = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: advC.id,
      businessDate: OCT6, // Oct 5 → Oct 6
      allocations: [{ supplierInvoiceId: invC.id, amount: '20.0000' }],
      clientDocId: 'aa-reuse-date-00001',
    });
    expect(otherDate.status).toBe(409);
    expect(otherDate.body.code).toBe('idempotency_key_reuse');

    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('normalized replay: same key with reordered legs, respelled amounts and different notes replays the ORIGINAL', async () => {
    const sup = await newSupplier('AA Replay Norm');
    const adv = await advancePayment(OCT1, '60.00', sup);
    const inv1 = await invoice(OCT5, '1', '20.00', 'AA-INV-RN-1', sup);
    const inv2 = await invoice(OCT6, '1', '20.00', 'AA-INV-RN-2', sup);

    const first = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT6,
      allocations: [
        { supplierInvoiceId: inv1.id, amount: '20.0000' },
        { supplierInvoiceId: inv2.id, amount: '15.5' },
      ],
      clientDocId: 'aa-replay-norm-0001',
      notes: 'original note',
    });
    expect(first.status).toBe(201);
    expect(first.body.amount).toBe('35.5000');

    // the SAME command re-sent: legs reversed, "15.5" respelled "15.5000",
    // notes reworded — none of that is materially relevant, so this is a
    // replay, not a conflict
    const replay = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT6,
      allocations: [
        { supplierInvoiceId: inv2.id, amount: '15.5000' },
        { supplierInvoiceId: inv1.id, amount: '20' },
      ],
      clientDocId: 'aa-replay-norm-0001',
      notes: 'reworded note changes nothing',
    });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.code).toBe(first.body.code);
    expect(replay.body.journalEntryId).toBe(first.body.journalEntryId);
    expect(replay.body.amount).toBe('35.5000');

    const rows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application
       WHERE tenant_id = $1 AND client_doc_id = 'aa-replay-norm-0001'`,
      [fx.tenantA.tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('24.5000'); // 60 − 35.50 applied exactly once
  });

  it('concurrent same-key/same-payload retries: one effect, both receive the same logical response (no 500)', async () => {
    const sup = await newSupplier('AA Conc Same Key');
    const adv = await advancePayment(OCT1, '40.00', sup);
    const inv = await invoice(OCT5, '1', '20.00', 'AA-INV-CSK-1', sup);

    const payload = {
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
      clientDocId: 'aa-conc-same-000001',
    };
    const [r1, r2] = await Promise.all([
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send(payload),
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send(payload),
    ]);

    // both serialize on the idempotency claim: the loser re-reads UNDER
    // the lock and replays — never a raw 23505/25P02 surfacing as 500
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.id).toBe(r2.body.id);
    expect(r1.body.code).toBe(r2.body.code);
    expect(r1.body.journalEntryId).toBe(r2.body.journalEntryId);
    expect(r1.body.journalEntryId).toBeTruthy();

    const rows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application
       WHERE tenant_id = $1 AND client_doc_id = 'aa-conc-same-000001'`,
      [fx.tenantA.tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    const journals = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_advance_application' AND source_id = $2`,
      [fx.tenantA.tenantId, r1.body.id],
    );
    expect(Number(journals.rows[0]!.n)).toBe(1);
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('20.0000'); // 40 − 20 applied exactly once
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('concurrent same-key/DIFFERENT-payload: exactly one winner + one controlled 409 (never 500, never both applied)', async () => {
    const sup = await newSupplier('AA Conc Diff Key');
    const adv = await advancePayment(OCT1, '80.00', sup);
    const inv = await invoice(OCT5, '2', '20.00', 'AA-INV-CDK-1', sup); // open 40

    const [r1, r2] = await Promise.all([
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv.id, amount: '40.0000' }],
        clientDocId: 'aa-conc-diff-000001',
      }),
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv.id, amount: '30.0000' }], // DIFFERENT payload, same key
        clientDocId: 'aa-conc-diff-000001',
      }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = r1.status === 201 ? r1 : r2;
    const loser = r1.status === 201 ? r2 : r1;
    expect(loser.body.code).toBe('idempotency_key_reuse');
    expect(['40.0000', '30.0000']).toContain(winner.body.amount);

    // exactly ONE application under the key — the winner's, never both
    const rows = await fx.admin.query<{ n: string; amount: string }>(
      `SELECT COUNT(*)::text AS n, MIN(amount)::text AS amount FROM supplier_advance_application
       WHERE tenant_id = $1 AND client_doc_id = 'aa-conc-diff-000001'`,
      [fx.tenantA.tenantId],
    );
    expect(Number(rows.rows[0]!.n)).toBe(1);
    expect(rows.rows[0]!.amount).toBe(winner.body.amount);
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe(winner.body.amount === '40.0000' ? '40.0000' : '50.0000');
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('DB conservation invariant: a forged/incomplete application header is rejected at commit, a well-formed one is not', async () => {
    const sup = await newSupplier('AA Forge Header');
    const adv = await advancePayment(OCT1, '40.00', sup);

    const baseRow = {
      tenant: fx.tenantA.tenantId,
      payment: adv.id,
      user: fx.tenantA.users.owner!.id,
    };

    // (a) header amount 30 but a single 20 leg → the deferred
    //     header↔lines conservation trigger aborts the COMMIT itself
    //     (NOT awaited: the rejection is asserted below)
    const forged = fx.admin.query('BEGIN').then(() =>
      fx.admin.query(
        `INSERT INTO supplier_advance_application
           (id, tenant_id, code, payment_id, amount, business_date, client_doc_id, created_by)
         VALUES ($1,$2,'SAA-FORGE-A',$3,30,$4,'aa-forge-header-a',$5)`,
        [randomUUID(), baseRow.tenant, baseRow.payment, OCT5, baseRow.user],
      ),
    ).then(() =>
      fx.admin.query(
        `INSERT INTO supplier_advance_application_line (tenant_id, application_id, supplier_invoice_id, amount)
         SELECT $1, id, (SELECT id FROM supplier_invoice WHERE tenant_id = $1 LIMIT 1), 20
         FROM supplier_advance_application WHERE code = 'SAA-FORGE-A'`,
        [baseRow.tenant],
      ),
    ).then(() => fx.admin.query('COMMIT'));

    await expect(forged).rejects.toThrow(/conservation violated/i);
    // nothing persisted — the whole transaction rolled back
    const goneA = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application WHERE tenant_id = $1 AND code = 'SAA-FORGE-A'`,
      [baseRow.tenant],
    );
    expect(Number(goneA.rows[0]!.n)).toBe(0);

    // (b) header with NO legs at all → same commit-time rejection
    const incomplete = fx.admin.query('BEGIN').then(() =>
      fx.admin.query(
        `INSERT INTO supplier_advance_application
           (id, tenant_id, code, payment_id, amount, business_date, client_doc_id, created_by)
         VALUES ($1,$2,'SAA-FORGE-B',$3,20,$4,'aa-forge-header-b',$5)`,
        [randomUUID(), baseRow.tenant, baseRow.payment, OCT5, baseRow.user],
      ),
    ).then(() => fx.admin.query('COMMIT'));
    await expect(incomplete).rejects.toThrow(/conservation violated/i);
    const goneB = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM supplier_advance_application WHERE tenant_id = $1 AND code = 'SAA-FORGE-B'`,
      [baseRow.tenant],
    );
    expect(Number(goneB.rows[0]!.n)).toBe(0);

    // (c) control — header amount == Σ legs: the invariant is satisfied
    //     (SET CONSTRAINTS ... IMMEDIATE forces the deferred check HERE,
    //     proving it would pass at commit; then ROLLBACK keeps the shared
    //     fixture clean — the API tests above already prove the real
    //     commit path constructs header+lines exactly this way)
    const inv1 = await invoice(OCT5, '1', '20.00', 'AA-INV-FORGE-1', sup);
    const wellFormed = fx.admin.query('BEGIN').then(() =>
      fx.admin.query(
        `INSERT INTO supplier_advance_application
           (id, tenant_id, code, payment_id, amount, business_date, client_doc_id, created_by)
         VALUES ($1,$2,'SAA-FORGE-C',$3,20,$4,'aa-forge-header-c',$5)`,
        [randomUUID(), baseRow.tenant, baseRow.payment, OCT5, baseRow.user],
      ),
    ).then(() =>
      fx.admin.query(
        `INSERT INTO supplier_advance_application_line (tenant_id, application_id, supplier_invoice_id, amount)
         SELECT $1, id, $2, 20 FROM supplier_advance_application WHERE code = 'SAA-FORGE-C'`,
        [baseRow.tenant, inv1.id],
      ),
    ).then(() => fx.admin.query(`SET CONSTRAINTS saa_header_lines_conservation, saal_header_lines_conservation IMMEDIATE`))
      .then(() => fx.admin.query('ROLLBACK'));
    await expect(wellFormed).resolves.toBeDefined();

    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('chronology: the application date may not predate the invoice nor the advance', async () => {
    const sup = await newSupplier('AA Chronology');
    // invoice Oct 5, advance Oct 10, invoice Oct 15
    const earlyInv = await invoice(OCT5, '1', '20.00', 'AA-INV-CHRON-E', sup);
    const adv = await advancePayment(OCT10, '40.00', sup);
    const inv = await invoice(OCT15, '1', '20.00', 'AA-INV-CHRON20', sup);

    // before the invoice (Oct 15) — refused even though the advance is older
    const beforeInvoice = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT10,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
    });
    expect(beforeInvoice.status).toBe(400);
    expect(beforeInvoice.body.error).toMatch(/predates invoice/i);

    // before the advance (Oct 10) — with an invoice that the date WOULD
    // satisfy (Oct 5), the advance chronology is what fires
    const beforeAdvance = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: `${YEAR}-10-07`,
      allocations: [{ supplierInvoiceId: earlyInv.id, amount: '20.0000' }],
    });
    expect(beforeAdvance.status).toBe(400);
    expect(beforeAdvance.body.error).toMatch(/predates the advance/i);

    // on/after both dates works
    const ok = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT15,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
    });
    expect(ok.status).toBe(201);
  });

  it('accounting-period lock: an application into a closed period is blocked', async () => {
    // create + close the current month's period
    const month = TODAY.slice(0, 7);
    const created = await request(base)
      .post('/api/accounting/periods')
      .set(owner)
      .send({ fiscalYear: Number(YEAR), months: [Number(month.slice(5, 7))] });
    expect(created.status).toBe(201);
    const periodId = created.body[0].id;
    const closed = await request(base).post(`/api/accounting/periods/${periodId}/status`).set(owner).send({ status: 'closed' });
    expect(closed.status).toBe(201);

    const adv = await advancePayment(OCT1, '20.00');
    const inv = await invoice(OCT5, '1', '20.00', 'AA-INV-PERIOD20');

    const blocked = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: TODAY, // today = closed period
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/period covering .* is closed/i);

    // reopen — the same application now succeeds
    const reopened = await request(base)
      .post(`/api/accounting/periods/${periodId}/status`)
      .set(owner)
      .send({ status: 'open', reason: 'advance application must be booked' });
    expect(reopened.status).toBe(201);
    const ok = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: TODAY,
      allocations: [{ supplierInvoiceId: inv.id, amount: '20.0000' }],
    });
    expect(ok.status).toBe(201);
  });

  it('cross-tenant references: tenant B can neither see nor apply tenant A\u2019s advance', async () => {
    const sup = await newSupplier('AA Cross Tenant');
    const adv = await advancePayment(OCT1, '15.00', sup);
    const inv = await invoice(OCT5, '1', '20.00', 'AA-INV-XTEN15', sup);

    const attempted = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(tenantB).send({
      paymentId: adv.id, businessDate: TODAY,
      allocations: [{ supplierInvoiceId: inv.id, amount: '10.0000' }],
    });
    expect(attempted.status).toBe(404);

    const listAttempt = await request(base).get(`/api/purchasing/advance-applications/${adv.id}`).set(tenantB);
    expect(listAttempt.status).toBe(404);

    // tenant A is unaffected
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('15.0000');
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
  });

  it('concurrent applications: serialized by the invoice-domain lock, never over-applied', async () => {
    // case A: two concurrent applications of 50 against an 80 advance —
    // exactly one wins, the loser receives a deterministic conflict
    const supA = await newSupplier('AA Conc A');
    const adv80 = await advancePayment(OCT1, '80.00', supA);
    const inv80 = await invoice(OCT5, '4', '20.00', 'AA-INV-CONC80', supA);
    const [a1, a2] = await Promise.all([
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv80.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv80.id, amount: '50.0000' }],
        clientDocId: 'aa-conc-a-00000001',
      }),
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv80.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv80.id, amount: '50.0000' }],
        clientDocId: 'aa-conc-a-00000002',
      }),
    ]);
    const statuses = [a1.status, a2.status].sort();
    expect(statuses).toEqual([201, 409]);
    if (a1.status === 409) expect(a1.body.error).toMatch(/exceeds the available advance|over-allocation/i);
    if (a2.status === 409) expect(a2.body.error).toMatch(/exceeds the available advance|over-allocation/i);

    const stA = await statement(supA, OCT26);
    expect(stA.advanceBalance).toBe('30.0000'); // 80 − 50, never negative
    let r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);

    // case B: two concurrent applications of 40 each against 80 — BOTH
    // succeed (serialized), the advance ends exactly at zero
    const supB = await newSupplier('AA Conc B');
    const adv80b = await advancePayment(OCT1, '80.00', supB);
    const inv80b = await invoice(OCT5, '4', '20.00', 'AA-INV-CONC80B', supB);
    const [b1, b2] = await Promise.all([
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv80b.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv80b.id, amount: '40.0000' }],
        clientDocId: 'aa-conc-b-00000001',
      }),
      request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
        paymentId: adv80b.id, businessDate: OCT5,
        allocations: [{ supplierInvoiceId: inv80b.id, amount: '40.0000' }],
        clientDocId: 'aa-conc-b-00000002',
      }),
    ]);
    expect([b1.status, b2.status]).toEqual([201, 201]);
    expect(b1.body.journalEntryId).not.toBe(b2.body.journalEntryId);
    const stB = await statement(supB, OCT26);
    expect(stB.advanceBalance).toBe('0.0000');
    r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
    const invB = await request(base).get(`/api/purchasing/supplier-invoices/${inv80b.id}`).set(owner);
    expect(invB.body.status).toBe('paid');
  });

  it('deep transaction rollback: failure after the journal leaves ZERO partial effects', async () => {
    const sup = await newSupplier('AA Rollback');
    const adv = await advancePayment(OCT1, '70.00', sup);
    const inv = await invoice(OCT5, '2', '20.00', 'AA-INV-ROLL40', sup);

    const countsBefore = await fx.admin.query<{ saa: string; journals: string; outbox: string; audit: string }>(
      `SELECT
         (SELECT COUNT(*) FROM supplier_advance_application WHERE tenant_id = $1)::text AS saa,
         (SELECT COUNT(*) FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_advance_application')::text AS journals,
         (SELECT COUNT(*) FROM outbox_event WHERE tenant_id = $1 AND type = 'SupplierAdvanceApplied')::text AS outbox,
         (SELECT COUNT(*) FROM audit_event WHERE tenant_id = $1 AND action = 'supplier_advance_application.posted')::text AS audit`,
      [fx.tenantA.tenantId],
    );
    const before = countsBefore.rows[0]!;

    const failed = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '40.0000' }],
      simulateFailure: 'after_journal',
    });
    expect(failed.status).toBe(500);

    const countsAfter = await fx.admin.query<{ saa: string; journals: string; outbox: string; audit: string }>(
      `SELECT
         (SELECT COUNT(*) FROM supplier_advance_application WHERE tenant_id = $1)::text AS saa,
         (SELECT COUNT(*) FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'supplier_advance_application')::text AS journals,
         (SELECT COUNT(*) FROM outbox_event WHERE tenant_id = $1 AND type = 'SupplierAdvanceApplied')::text AS outbox,
         (SELECT COUNT(*) FROM audit_event WHERE tenant_id = $1 AND action = 'supplier_advance_application.posted')::text AS audit`,
      [fx.tenantA.tenantId],
    );
    expect(countsAfter.rows[0]!.saa).toBe(before.saa);
    expect(countsAfter.rows[0]!.journals).toBe(before.journals);
    expect(countsAfter.rows[0]!.outbox).toBe(before.outbox);
    expect(countsAfter.rows[0]!.audit).toBe(before.audit);

    // the advance is fully intact and the invoice still carries its AP
    const st = await statement(sup, OCT26);
    expect(st.advanceBalance).toBe('70.0000');
    expect(st.closingBalance).toBe('40.0000');
    const r = await recon(OCT26);
    expect(r.get('supplier_advance')!.passed).toBe(true);
    expect(r.get('accounts_payable')!.passed).toBe(true);
    const invAfter = await request(base).get(`/api/purchasing/supplier-invoices/${inv.id}`).set(owner);
    expect(invAfter.body.status).toBe('posted');

    // after the failed attempt the advance still works normally
    const ok = await request(base).post('/api/purchasing/supplier-payments/apply-advance').set(manager).send({
      paymentId: adv.id, businessDate: OCT5,
      allocations: [{ supplierInvoiceId: inv.id, amount: '40.0000' }],
    });
    expect(ok.status).toBe(201);
    const stAfter = await statement(sup, OCT26);
    expect(stAfter.advanceBalance).toBe('30.0000');
    expect(stAfter.closingBalance).toBe('0.0000');
  });
});

/* ================================================================== */
/* BLOCKER 2 — reversal-aware, as-of-correct AR reconciliation         */
/* ================================================================== */
describe('Blocker 2: AR reconciliation is reversal-aware and as-of correct', () => {
  let fx: ApiFixture;
  let base: string;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let tenantB: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productT: string;
  let customerC1: string;

  async function recon(asOf: string) {
    const res = await request(base)
      .get(`/api/accounting/reconciliation?asOf=${asOf}`).set(owner);
    expect(res.status).toBe(200);
    return new Map<string, { check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean }>(
      (res.body.checks as Array<{ check: string; controlBalance: string; subledgerBalance: string; difference: string; passed: boolean }>)
        .map((c) => [c.check, c]),
    );
  }
  /** credit sale of `total` (line price × 1), all documents backdated to
   *  `businessDate` as one consistent piece of evidence */
  async function creditSale(businessDate: string, unitPrice: string, opts: { depositTender?: { depositId: string; amount: string } } = {}) {
    const sale = await request(base).post('/api/sales/commit').set(manager).send({
      warehouseId: whA, customerId: customerC1,
      lines: [{ productId: productT, quantityBase: '1', unitPrice }],
      tenders: opts.depositTender
        ? [{ method: 'credit', depositId: opts.depositTender.depositId, amount: opts.depositTender.amount }]
        : [],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    await fx.admin.query(`UPDATE invoice SET business_date = $2 WHERE id = $1`, [invoiceId, businessDate]);
    await fx.admin.query(
      `UPDATE journal_entry SET business_date = $2
       WHERE tenant_id = $3 AND source_kind = 'invoice' AND source_id = $1`,
      [invoiceId, businessDate, fx.tenantA.tenantId],
    );
    await fx.admin.query(
      `UPDATE stock_movement SET occurred_at = $2::timestamptz
       WHERE tenant_id = $3 AND source_document_type = 'invoice' AND source_document_id = $1`,
      [invoiceId, `${businessDate} 10:00:00`, fx.tenantA.tenantId],
    );
    return { invoiceId, code: sale.body.invoice.code as string };
  }
  /** numeric balance snapshot for DELTA assertions — the describe shares
   *  one fixture, so every scenario asserts its own effect as a delta */
  async function balances(asOf: string) {
    const r = await recon(asOf);
    return {
      ar: Number(r.get('accounts_receivable')!.controlBalance),
      arSub: Number(r.get('accounts_receivable')!.subledgerBalance),
      dep: Number(r.get('customer_deposit_liability')!.controlBalance),
      depSub: Number(r.get('customer_deposit_liability')!.subledgerBalance),
      arPassed: r.get('accounts_receivable')!.passed,
      depPassed: r.get('customer_deposit_liability')!.passed,
    };
  }
  async function reverse(invoiceId: string, body: Record<string, unknown>) {
    const res = await request(base).post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager).send({
      reason: 'reversal-aware AR reconciliation scenario', ...body,
    });
    return res;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    base = await listenFixture(fx);
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    tenantB = auth(fx.tenantB.users.owner!.token!);
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [fx.tenantA.tenantId],
    );
    whA = (await request(base).post('/api/warehouses').set(owner).send({ code: 'BB-WH', name: 'BB WH' })).body.id;
    unitPc = (await request(base).post('/api/units').set(owner).send({ code: 'BB-PC', name: 'Pieces' })).body.id;
    productT = (
      await request(base).post('/api/products').set(owner).send({
        code: 'BB-P', name: 'BB P', baseUnitId: unitPc, sellingPrice: '100.00', purchasePrice: '20.00',
      })
    ).body.id;
    customerC1 = (await request(base).post('/api/customers').set(owner).send({ name: 'BB Customer', phone: '0241111111' })).body.id;

    // stock for every sale in this describe (backdated GRN)
    const grn = await request(base).post('/api/purchasing/grns').set(manager).send({
      supplierId: (await request(base).post('/api/suppliers').set(owner).send({ name: 'BB Supplier', phone: '0202222222' })).body.id,
      warehouseId: whA, businessDate: YESTERDAY,
      lines: [{ productId: productT, receivedQuantity: '20', unitCost: '20.00' }],
    });
    expect(grn.status).toBe(201);
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('1+2+3: unpaid ₵100 invoice → AR ₵100; reversed → AR ₵0; BEFORE the reversal date AR is still ₵100', async () => {
    // the sale is dated YESTERDAY; the reversal happens TODAY
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');

    // (1) unpaid credit invoice: AR ₵100 on BOTH sides
    let r = await recon(TOMORROW);
    expect(r.get('accounts_receivable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.passed).toBe(true);

    // (3) as of YESTERDAY (before the reversal): AR ₵100, both sides
    r = await recon(YESTERDAY);
    expect(r.get('accounts_receivable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.passed).toBe(true);

    // (2) reverse: the reversal journal books TODAY
    const rev = await reverse(invoiceId, {});
    expect(rev.status).toBe(201);

    // GL receivable returns to zero AND the subledger follows — the
    // unpaid reversed invoice no longer counts as outstanding
    r = await recon(TOMORROW);
    expect(r.get('accounts_receivable')!.controlBalance).toBe('0.0000');
    expect(r.get('accounts_receivable')!.subledgerBalance).toBe('0.0000');
    expect(r.get('accounts_receivable')!.passed).toBe(true);

    // (3) HISTORICAL: as of YESTERDAY the reversal (effective today) does
    // not exist yet — the original ₵100 exposure is still reported
    r = await recon(YESTERDAY);
    expect(r.get('accounts_receivable')!.controlBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.subledgerBalance).toBe('100.0000');
    expect(r.get('accounts_receivable')!.passed).toBe(true);

    // customer-deposit reconciliation is unaffected by the reversal
    expect(r.get('customer_deposit_liability')!.controlBalance).toBe('0.0000');
    expect(r.get('customer_deposit_liability')!.passed).toBe(true);
  });

  it('4: part payment ₵40 then reversal → AR ₵0, restored deposit ₵40, deposit recon +₵40', async () => {
    // baselines BEFORE this scenario's documents exist (the fixture is
    // shared across the describe — every assertion below is a DELTA)
    const baseY = await balances(YESTERDAY);
    const baseT = await balances(TOMORROW);
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');

    // the customer pays ₵40 today (standalone receipt on the invoice)
    const receipt = await request(base).post('/api/payments').set(manager).send({
      customerId: customerC1, invoiceId, amount: '40.00',
      tenders: [{ method: 'cash', amount: '40.00' }],
      allocations: [{ invoiceId, amount: '40.0000' }],
    });
    expect(receipt.status).toBe(201);

    let b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar + 60); // 100 − 40 receipt
    expect(b.arSub).toBe(baseT.arSub + 60);
    expect(b.arPassed).toBe(true);
    b = await balances(YESTERDAY);
    expect(b.ar).toBe(baseY.ar + 100); // the receipt (today) invisible
    expect(b.arSub).toBe(baseY.arSub + 100);

    // reversal: the ₵40 the customer settled is restored as a DEPOSIT
    const rev = await reverse(invoiceId, {});
    expect(rev.status).toBe(201);
    expect(rev.body.restoredDepositId).toBeTruthy();

    b = await balances(TOMORROW);
    // GL AR: +100 (sale) − 40 (receipt) − 100 (reversal) + 40 (clearing) = 0
    expect(b.ar).toBe(baseT.ar);
    expect(b.arSub).toBe(baseT.arSub);
    expect(b.arPassed).toBe(true);
    // the customer's settled value lives on as a deposit liability
    expect(b.dep).toBe(baseT.dep + 40);
    expect(b.depSub).toBe(baseT.depSub + 40);
    expect(b.depPassed).toBe(true);

    // HISTORICAL: as of YESTERDAY the reversal (effective today) does not
    // exist — the original exposure is still there, receipt invisible
    b = await balances(YESTERDAY);
    expect(b.ar).toBe(baseY.ar + 100);
    expect(b.arSub).toBe(baseY.arSub + 100);
    expect(b.arPassed).toBe(true);

    // the restored deposit is a REAL append-only document of exactly ₵40
    const depRow = await fx.admin.query<{ amount: string; note: string }>(
      `SELECT amount::text AS amount, note FROM customer_deposit WHERE id = $1`,
      [rev.body.restoredDepositId],
    );
    expect(depRow.rows[0]!.amount).toBe('40.0000');
    expect(depRow.rows[0]!.note).toMatch(/restored by invoice reversal/);
    // NO fake payment rows were inserted to make reconciliation balance
    const fakeAlloc = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payment_allocation WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(Number(fakeAlloc.rows[0]!.n)).toBe(1); // only the customer's real receipt
  });

  it('5: reversal of a sale that consumed a customer deposit restores the deposit and reconciles', async () => {
    const baseT = await balances(TOMORROW);

    // deposit 30 today, sale 100 backdated to YESTERDAY consuming 30 at sale time
    const dep = await request(base).post('/api/deposits').set(manager).send({
      customerId: customerC1, amount: '30.00', tenders: [{ method: 'cash', amount: '30.00' }],
    });
    expect(dep.status).toBe(201);
    const { invoiceId } = await creditSale(YESTERDAY, '100.00', {
      depositTender: { depositId: dep.body.id, amount: '30.0000' },
    });

    let b = await balances(TOMORROW);
    // AR = 100 − 30 (deposit applied) = 70; deposits = 30 − 30 (applied) = 0
    expect(b.ar).toBe(baseT.ar + 70);
    expect(b.arSub).toBe(baseT.arSub + 70);
    expect(b.arPassed).toBe(true);
    expect(b.dep).toBe(baseT.dep);
    expect(b.depSub).toBe(baseT.depSub);
    expect(b.depPassed).toBe(true);

    const rev = await reverse(invoiceId, {});
    expect(rev.status).toBe(201);
    expect(rev.body.restoredDepositId).toBeTruthy();

    b = await balances(TOMORROW);
    // the reversal journal inverts the sale (Cr AR 70, Cr deposits 30):
    // AR returns to the baseline and the deposit liability is restored
    expect(b.ar).toBe(baseT.ar);
    expect(b.arSub).toBe(baseT.arSub);
    expect(b.arPassed).toBe(true);
    expect(b.dep).toBe(baseT.dep + 30);
    expect(b.depSub).toBe(baseT.depSub + 30);
    expect(b.depPassed).toBe(true);

    // the restored deposit document carries exactly the sale-time credit
    const depRow = await fx.admin.query<{ amount: string }>(
      `SELECT amount::text AS amount FROM customer_deposit WHERE id = $1`,
      [rev.body.restoredDepositId],
    );
    expect(depRow.rows[0]!.amount).toBe('30.0000');
  });

  it('6: the reversal journal is balanced and inverts the sale line by line', async () => {
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');
    const rev = await reverse(invoiceId, {});
    expect(rev.status).toBe(201);
    expect(rev.body.journalEntryId).toBeTruthy();

    const reversal = await fx.admin.query<{ total_debit: string; total_credit: string }>(
      `SELECT total_debit::text AS total_debit, total_credit::text AS total_credit
       FROM journal_entry WHERE id = $1`,
      [rev.body.journalEntryId],
    );
    expect(reversal.rows[0]!.total_debit).toBe(reversal.rows[0]!.total_credit);
    // the linkage evidence lives on the reversal document (one reversal per
    // invoice) — the journal is its financial inverse
    const link = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM invoice_reversal
       WHERE invoice_id = $1 AND journal_entry_id = $2`,
      [invoiceId, rev.body.journalEntryId],
    );
    expect(link.rows[0]!.n).toBe('1');

    // the AR leg of the reversal exactly inverts the sale's AR leg
    const legs = await fx.admin.query<{ debit: string; credit: string }>(
      `SELECT l.debit::text AS debit, l.credit::text AS credit
       FROM journal_line l
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.entry_id = $1 AND m.purpose = 'accounts_receivable'`,
      [rev.body.journalEntryId],
    );
    expect(legs.rows).toHaveLength(1);
    expect(legs.rows[0]!.credit).toBe('100.0000');
    expect(legs.rows[0]!.debit).toBe('0.0000');
  });

  it('7: cross-tenant reversal attempt is refused and leaves no trace', async () => {
    const baseT = await balances(TOMORROW);
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');
    const attempted = await request(base).post(`/api/sales/invoices/${invoiceId}/reverse`).set(tenantB).send({
      reason: 'cross-tenant reversal attempt must be refused',
    });
    expect(attempted.status).toBe(404);

    let b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar + 100);
    expect(b.arPassed).toBe(true);
    const rows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM invoice_reversal WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(rows.rows[0]!.n).toBe('0');

    // cleanup for the shared fixture: tenant A reverses it normally
    const cleanup = await reverse(invoiceId, {});
    expect(cleanup.status).toBe(201);
    b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar);
    expect(b.depPassed).toBe(true);
  });

  it('8+9: concurrent reversals — exactly one wins without a clientDocId; identical replays share one document', async () => {
    const baseT = await balances(TOMORROW);

    // (8) two concurrent reversals WITHOUT clientDocId
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');
    const [r1, r2] = await Promise.all([
      reverse(invoiceId, {}),
      reverse(invoiceId, {}),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
    if (r1.status === 409) expect(r1.body.error).toMatch(/reversed/i);
    if (r2.status === 409) expect(r2.body.error).toMatch(/reversed/i);
    const revCount = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM invoice_reversal WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(revCount.rows[0]!.n).toBe('1');
    let b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar); // created and fully reversed — zero net
    expect(b.arSub).toBe(baseT.arSub);
    expect(b.depPassed).toBe(true);

    // (9) duplicate idempotency: the same clientDocId replays ONE document
    const { invoiceId: id2 } = await creditSale(YESTERDAY, '100.00');
    const key = randomUUID(); // the replayed command identity — both concurrent requests share it
    const [p1, p2] = await Promise.all([
      reverse(id2, { clientDocId: key }),
      reverse(id2, { clientDocId: key }),
    ]);
    expect([p1.status, p2.status]).toEqual([201, 201]);
    expect(p1.body.id).toBe(p2.body.id);
    expect(p1.body.journalEntryId).toBe(p2.body.journalEntryId);
    const revCount2 = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM invoice_reversal WHERE invoice_id = $1`,
      [id2],
    );
    expect(revCount2.rows[0]!.n).toBe('1');
    const journalCount = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'invoice_reversal' AND source_id = $2`,
      [fx.tenantA.tenantId, id2],
    );
    expect(journalCount.rows[0]!.n).toBe('1');
    b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar);
    expect(b.arPassed).toBe(true);
  });

  it('10: failure AFTER every financial write rolls back to zero partial effects', async () => {
    const baseT = await balances(TOMORROW);
    const { invoiceId } = await creditSale(YESTERDAY, '100.00');
    const stockBefore = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM stock_movement WHERE tenant_id = $1 AND source_document_type = 'invoice_reversal'`,
      [fx.tenantA.tenantId],
    );
    const depositsBefore = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM customer_deposit WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );

    const failed = await reverse(invoiceId, { simulateFailure: 'after_financial_writes' });
    expect(failed.status).toBe(500);

    // NOTHING persisted: no reversal document, no journal, no status flip,
    // no restored deposit, no stock inverse
    const reversalRows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM invoice_reversal WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(reversalRows.rows[0]!.n).toBe('0');
    const journalRows = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM journal_entry WHERE tenant_id = $1 AND source_kind = 'invoice_reversal' AND source_id = $2`,
      [fx.tenantA.tenantId, invoiceId],
    );
    expect(journalRows.rows[0]!.n).toBe('0');
    const invoiceStatus = await fx.admin.query<{ status: string }>(
      `SELECT status FROM invoice WHERE id = $1`,
      [invoiceId],
    );
    expect(invoiceStatus.rows[0]!.status).toBe('posted');
    const stockAfter = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM stock_movement WHERE tenant_id = $1 AND source_document_type = 'invoice_reversal'`,
      [fx.tenantA.tenantId],
    );
    expect(stockAfter.rows[0]!.n).toBe(stockBefore.rows[0]!.n);
    const depositsAfter = await fx.admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM customer_deposit WHERE tenant_id = $1`,
      [fx.tenantA.tenantId],
    );
    expect(depositsAfter.rows[0]!.n).toBe(depositsBefore.rows[0]!.n);

    // reconciliation is exactly where it was before the failed attempt,
    // with the invoice's full exposure still outstanding
    let b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar + 100);
    expect(b.arSub).toBe(baseT.arSub + 100);
    expect(b.arPassed).toBe(true);
    expect(b.depPassed).toBe(true);

    // the reversal still works normally afterwards
    const ok = await reverse(invoiceId, {});
    expect(ok.status).toBe(201);
    b = await balances(TOMORROW);
    expect(b.ar).toBe(baseT.ar);
    expect(b.arPassed).toBe(true);
  });
});
