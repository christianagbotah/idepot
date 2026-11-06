/**
 * Phase 5 returns flows (ROADMAP Phase 5 exit criteria):
 *  - full return → credit note → refund → completed, with EXACT GL, stock
 *    and settlement decomposition assertions;
 *  - partial returns + multiple returns against one invoice;
 *  - AR-first settlement decomposition on part-paid invoices;
 *  - damaged/quarantine + scrap dispositions (original-cost evidence);
 *  - store credit issue / partial redemption / over-redemption refusal;
 *  - exchange with additional payment and with residual credit;
 *  - over-return + over-refund + tax-cap protections;
 *  - idempotent replay vs same-key-different-payload 409;
 *  - RBAC (cashier cannot approve/refund) + cross-tenant isolation;
 *  - posting atomicity (failure injection after the deepest writes);
 *  - invoice-reversal refusal once returns exist.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('returns, credit notes, refunds, store credit & exchanges', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let tenantBOwner: Record<string, string>;
  let whA: string;
  let whDamaged: string;
  let unitPc: string;
  let productA: string; // sells 50.00, cost 30.00
  let productB: string; // sells 20.00, cost 12.00
  let customerC1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function commitSale(token: Record<string, string>, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/sales/commit').set(token).send(body);
  }

  async function createReturn(token: Record<string, string>, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/returns').set(token).send(body);
  }

  async function getReturn(token: Record<string, string>, id: string) {
    const res = await request(app.getHttpServer()).get(`/api/returns/${id}`).set(token);
    expect(res.status).toBe(200);
    return res.body as Record<string, unknown> & {
      id: string; code: string; status: string;
      grossCredit: string | null; arAmount: string | null; refundAmount: string | null;
      storeCreditAmount: string | null; cogsReversal: string | null; creditNoteId: string | null;
      lines: Array<{ invoiceLineId: string; quantity: string }>;
    };
  }

  async function transition(
    token: Record<string, string>,
    id: string,
    action: string,
    body?: Record<string, unknown>,
  ) {
    return request(app.getHttpServer()).post(`/api/returns/${id}/${action}`).set(token).send(body ?? {});
  }

  async function balance(productId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/balances?warehouseId=${whA}&productId=${productId}`)
      .set(owner);
    expect(res.status).toBe(200);
    const row = res.body.items.find((b: { productId: string }) => b.productId === productId);
    return row ? row.quantityBase : '0.000000';
  }

  async function damagedBalance(productId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/balances?warehouseId=${whDamaged}&productId=${productId}`)
      .set(owner);
    expect(res.status).toBe(200);
    const row = res.body.items.find((b: { productId: string }) => b.productId === productId);
    return row ? row.quantityBase : '0.000000';
  }

  /** Journal lines of a source document, aggregated per account. */
  async function journalLines(sourceKind: string, sourceId: string) {
    const res = await fx.admin.query(
      `SELECT a.code AS account, jl.debit::text AS debit, jl.credit::text AS credit
         FROM journal_entry je
         JOIN journal_line jl ON jl.entry_id = je.id
         JOIN gl_account a ON a.id = jl.account_id
        WHERE je.source_kind = $1 AND je.source_id = $2
        ORDER BY a.code`,
      [sourceKind, sourceId],
    );
    return res.rows as Array<{ account: string; debit: string; credit: string }>;
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    tenantBOwner = auth(fx.tenantB.users.owner!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'RTN-WHA', name: 'Returns WH A' })).body.id;
    whDamaged = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'RTN-DMG', name: 'Damaged Goods' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'PCS', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'RTN-A', name: 'Returns Product A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'RTN-B', name: 'Returns Product B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    customerC1 = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Return Customer One', phone: '0244000999' })).body.id;

    // return reasons: one requiring approval, one not
    await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'DEFECTIVE', name: 'Defective product',
      requiresApproval: true, refundPermitted: true, replacementPermitted: true,
      storeCreditPermitted: true, restockPermitted: true,
      inspectionRequired: true, evidenceRequired: false,
    });
    await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'WRONG_ITEM', name: 'Wrong product supplied',
      requiresApproval: false, refundPermitted: true, replacementPermitted: true,
      storeCreditPermitted: true, restockPermitted: true,
    });
    await request(app.getHttpServer()).post('/api/returns/reasons').set(owner).send({
      code: 'GOODWILL', name: 'Management goodwill (no physical return)',
      requiresApproval: true, refundPermitted: true, replacementPermitted: true,
      storeCreditPermitted: true, restockPermitted: false,
    });

    // refund auto-approval threshold: reasons flagged requiresApproval=false
    // auto-approve up to this credit amount (Phase 5 §4.5)
    await fx.admin.query(
      `INSERT INTO tenant_config (tenant_id, refund_approval_threshold) VALUES ($1, 100)
       ON CONFLICT (tenant_id) DO UPDATE SET refund_approval_threshold = 100`,
      [fx.tenantA.tenantId],
    );

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '1000', unitCost: '30.0000' },
        { productId: productB, quantityBase: '1000', unitCost: '12.0000' },
      ],
    });
    expect(opening.status).toBe(201);
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('full return on a paid invoice: credit note + refund + completion, exact GL', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '4', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;
    expect(await balance(productA)).toBe('996.000000');

    const created = await createReturn(manager, {
      invoiceId,
      reasonCode: 'DEFECTIVE',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '4', condition: 'defective', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('submitted'); // DEFECTIVE requires approval

    // cashier cannot approve (RBAC)
    const denied = await transition(cashier, created.body.id, 'approve');
    expect(denied.status).toBe(403);

    // approve → receive → process
    expect((await transition(manager, created.body.id, 'approve')).status).toBe(201);
    expect((await transition(manager, created.body.id, 'receive', { inspectionNote: 'all four units verified defective' })).status).toBe(201);
    const processed = await transition(manager, created.body.id, 'process');
    expect(processed.status).toBe(201);
    expect(processed.body.status).toBe('processed'); // refund outstanding → not completed yet
    expect(processed.body.grossCredit).toBe('200.0000');
    expect(processed.body.arAmount).toBe('0.0000'); // invoice was paid
    expect(processed.body.refundAmount).toBe('200.0000');
    expect(processed.body.storeCreditAmount).toBe('0.0000');
    expect(processed.body.cogsReversal).toBe('120.0000'); // 4 × 30 original cost

    // stock restored at ORIGINAL cost — AVCO evidence preserved
    expect(await balance(productA)).toBe('1000.000000');

    // credit-note journal: Dr revenue 200, Dr inventory 120 / Cr cogs 120, Cr refunds_payable 200
    const cnId = processed.body.creditNoteId as string;
    const lines = await journalLines('credit_note', cnId);
    const byAccount = new Map(lines.map((l) => [l.account, l]));
    expect(byAccount.get('4000')!.debit).toBe('200.0000'); // sales revenue
    expect(byAccount.get('1200')!.debit).toBe('120.0000'); // inventory
    expect(byAccount.get('5000')!.credit).toBe('120.0000'); // cogs
    expect(byAccount.get('2150')!.credit).toBe('200.0000'); // refunds payable
    // balanced by construction — assert explicitly
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBe(cr);

    // refund: request + approve + post in one command (cash settles at post)
    const refund = await request(app.getHttpServer()).post('/api/returns/refunds').set(manager).send({
      creditNoteId: cnId, amount: '200.00', method: 'cash', approveAndPost: true,
    });
    expect(refund.status).toBe(201);
    expect(refund.body.status).toBe('settled'); // cash refunds settle at posting

    // refund journal: Dr refunds_payable 200 / Cr cash 200
    const rLines = await journalLines('refund', refund.body.id);
    expect(rLines.find((l) => l.account === '2150')!.debit).toBe('200.0000');
    expect(rLines.find((l) => l.account === '1000')!.credit).toBe('200.0000');

    // the return completes once the entitlement is fully settled
    const after = await getReturn(manager, created.body.id);
    expect(after.status).toBe('completed');

    // over-refund is refused (the entitlement is consumed)
    const over = await request(app.getHttpServer()).post('/api/returns/refunds').set(manager).send({
      creditNoteId: cnId, amount: '1.00', method: 'cash', approveAndPost: true,
    });
    expect(over.status).toBe(409);

    // invoice reversal is refused — returns own the correction path now
    const reversal = await request(app.getHttpServer())
      .post(`/api/sales/invoices/${invoiceId}/reverse`).set(manager)
      .send({ reason: 'attempted double correction via reversal' });
    expect(reversal.status).toBe(409);
  });

  it('part-paid invoice: AR settles first, remainder becomes refund payable', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '10', unitPrice: '20.00' }],
      tenders: [],
    });
    expect(sale.status).toBe(201);
    const invoiceId = sale.body.invoice.id as string;

    // part payment 80 of 200
    const pay = await request(app.getHttpServer()).post('/api/payments').set(manager).send({
      customerId: customerC1,
      amount: '80.00',
      tenders: [{ method: 'cash', amount: '80.00' }],
      allocations: [{ invoiceId, amount: '80.00' }],
    });
    expect(pay.status).toBe(201);

    // return 5 × B = 100: AR outstanding is 120 → ar_amount 100, refund 0
    const ret1 = await createReturn(manager, {
      invoiceId, reasonCode: 'WRONG_ITEM', creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '5', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret1.status).toBe(201);
    expect(ret1.body.status).toBe('approved'); // WRONG_ITEM auto-approves under the default threshold
    expect((await transition(manager, ret1.body.id, 'receive')).status).toBe(201);
    const p1 = await transition(manager, ret1.body.id, 'process');
    expect(p1.body.arAmount).toBe('100.0000');
    expect(p1.body.refundAmount).toBe('0.0000');
    expect(p1.body.cogsReversal).toBe('60.0000'); // 5 × 12
    expect(p1.body.status).toBe('completed'); // nothing further owed

    // invoice due is now 20
    const inv = await request(app.getHttpServer()).get(`/api/sales/invoices/${invoiceId}`).set(manager);
    expect(inv.body.amountDue).toBe('20.0000');

    // second return 2 × B = 40: AR outstanding is 20 → ar 20 + refund payable 20
    const ret2 = await createReturn(manager, {
      invoiceId, reasonCode: 'WRONG_ITEM', creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '2', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret2.status).toBe(201);
    expect((await transition(manager, ret2.body.id, 'receive')).status).toBe(201);
    const p2 = await transition(manager, ret2.body.id, 'process');
    expect(p2.body.arAmount).toBe('20.0000');
    expect(p2.body.refundAmount).toBe('20.0000');

    // over-return refused: 4 remaining, try 5
    const overReturn = await createReturn(manager, {
      invoiceId, reasonCode: 'WRONG_ITEM', creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '5', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(overReturn.status).toBe(409);
  });

  it('damaged disposition restocks into the damaged warehouse at original cost', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '100.00' }],
    });
    expect(sale.status).toBe(201);

    const ret = await createReturn(manager, {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'DEFECTIVE',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '2', condition: 'damaged', disposition: 'restock_damaged', restockWarehouseId: whDamaged }],
      submit: true,
    });
    expect(ret.status).toBe(201);
    await transition(manager, ret.body.id, 'approve');
    await transition(manager, ret.body.id, 'receive');
    const processed = await transition(manager, ret.body.id, 'process');
    expect(processed.body.cogsReversal).toBe('60.0000');

    // sellable warehouse lost the 2 sold units permanently; damaged gained them
    expect(await balance(productA)).toBe('998.000000');
    expect(await damagedBalance(productA)).toBe('2.000000');
  });

  it('scrap disposition: no stock movement, cost stays in COGS', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '3', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '60.00' }],
    });
    expect(sale.status).toBe(201);
    const before = await balance(productB);

    const ret = await createReturn(manager, {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'DEFECTIVE',
      creditDisposition: 'store_credit',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '3', condition: 'unsellable', disposition: 'scrap' }],
      submit: true,
    });
    expect(ret.status).toBe(201);
    await transition(manager, ret.body.id, 'approve');
    await transition(manager, ret.body.id, 'receive');
    const processed = await transition(manager, ret.body.id, 'process');
    expect(processed.body.cogsReversal).toBe('0.0000'); // scrapped: no COGS reversal
    expect(processed.body.storeCreditAmount).toBe('60.0000'); // customer still credited
    expect(processed.body.status).toBe('completed');

    // stock unchanged (goods not restocked), damaged unchanged
    expect(await balance(productB)).toBe(before);
    expect(await damagedBalance(productB)).toBe('0.000000');

    // scrapped store credit exists and is active
    const credits = await request(app.getHttpServer())
      .get(`/api/returns/store-credits?customerId=${customerC1}&status=active`).set(manager);
    expect(credits.status).toBe(200);
    const mine = credits.body.find((c: { creditNoteId: string }) => c.creditNoteId === processed.body.creditNoteId);
    expect(mine.amount).toBe('60.0000');
    expect(mine.remainingAmount).toBe('60.0000');
    const scId = mine.id as string;

    // full redemption against a NEW credit sale of exactly 60
    const sale2 = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '3', unitPrice: '20.00' }],
      tenders: [],
    });
    expect(sale2.status).toBe(201);
    const redeem = await request(app.getHttpServer()).post('/api/returns/store-credits/redeem').set(manager).send({
      storeCreditId: scId, invoiceId: sale2.body.invoice.id, amount: '60.00',
    });
    expect(redeem.status).toBe(201);

    // invoice fully settled by the redemption
    const inv = await request(app.getHttpServer()).get(`/api/sales/invoices/${sale2.body.invoice.id}`).set(manager);
    expect(inv.body.amountDue).toBe('0.0000');
    expect(inv.body.paymentStatus).toBe('paid');

    // over-redemption refused
    const over = await request(app.getHttpServer()).post('/api/returns/store-credits/redeem').set(manager).send({
      storeCreditId: scId, invoiceId: sale2.body.invoice.id, amount: '1.00',
    });
    expect(over.status).toBe(409);
  });

  it('exchange: return + replacement + additional payment in ONE transaction', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '4', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '80.00' }],
    });
    expect(sale.status).toBe(201);

    const exchangeRes = await request(app.getHttpServer()).post('/api/returns/exchanges').set(manager).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'WRONG_ITEM',
      returnLines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '4', condition: 'good', disposition: 'restock_sellable' }],
      replacement: {
        warehouseId: whA,
        lines: [{ productId: productA, quantity: '3', unitPrice: '50.00' }],
      },
      tenders: [{ method: 'cash', amount: '70.00' }], // 150 − 80 credit
    });
    const exchange = exchangeRes;
    expect(exchange.status).toBe(201);
    expect(exchange.body.settlement).toBe('additional_payment');
    expect(exchange.body.returnCredit).toBe('80.0000');
    expect(exchange.body.replacementTotal).toBe('150.0000');
    expect(exchange.body.priceDifference).toBe('70.0000');
    expect(exchange.body.consumedRefundAmount).toBe('80.0000');

    // the replacement invoice is fully settled (tenders 70 + entitlement 80 = 150)
    const inv = await request(app.getHttpServer()).get(`/api/sales/invoices/${exchange.body.replacementInvoiceId}`).set(manager);
    expect(inv.body.amountDue).toBe('0.0000');
  });

  it('exchange with residual credit: cheaper replacement leaves refundable entitlement', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '100.00' }],
    });
    expect(sale.status).toBe(201);

    const exchange = await request(app.getHttpServer()).post('/api/returns/exchanges').set(manager).send({
      invoiceId: sale.body.invoice.id,
      reasonCode: 'WRONG_ITEM',
      returnLines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '2', condition: 'good', disposition: 'restock_sellable' }],
      replacement: {
        warehouseId: whA,
        lines: [{ productId: productB, quantity: '2', unitPrice: '20.00' }], // 40 vs 100 credit
      },
      tenders: [],
    });
    expect(exchange.status).toBe(201);
    expect(exchange.body.settlement).toBe('residual_credit');
    expect(exchange.body.consumedRefundAmount).toBe('40.0000');

    // the residual 60 is refundable through a normal refund document
    const creditNoteId = await fx.admin
      .query(`SELECT credit_note_id FROM return_order WHERE id = $1`, [exchange.body.returnOrderId])
      .then((r) => r.rows[0]!.credit_note_id as string);
    const refund = await request(app.getHttpServer()).post('/api/returns/refunds').set(manager).send({
      creditNoteId, amount: '60.00', method: 'cash', approveAndPost: true,
    });
    expect(refund.status).toBe(201);
    expect(refund.body.status).toBe('settled');
  });

  it('idempotent return replay vs same-key-different-payload conflict', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '2', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '40.00' }],
    });
    expect(sale.status).toBe(201);
    const clientDocId = '01936aaa-return-idem-0001';
    const body = {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'WRONG_ITEM',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
      clientDocId,
    };
    const first = await createReturn(manager, body);
    expect(first.status).toBe(201);
    const replay = await createReturn(manager, body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id); // deterministic replay
    expect(replay.body.code).toBe(first.body.code);

    // same key, different payload → controlled 409
    const conflict = await createReturn(manager, { ...body, lines: [{ ...body.lines[0], quantity: '2' }] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('idempotency_key_reuse');
  });

  it('cashier can capture but not process; auditor is read-only', async () => {
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '20.00' }],
    });
    expect(sale.status).toBe(201);
    const ret = await createReturn(cashier, {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'WRONG_ITEM',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('approved');

    // cashier cannot process (financial posting)
    const denied = await transition(cashier, ret.body.id, 'process');
    expect(denied.status).toBe(403);

    // cashier cannot refund
    await transition(manager, ret.body.id, 'receive');
    const processed = await transition(manager, ret.body.id, 'process');
    const refundDenied = await request(app.getHttpServer()).post('/api/returns/refunds').set(cashier).send({
      creditNoteId: processed.body.creditNoteId, amount: '20.00', method: 'cash', approveAndPost: true,
    });
    expect(refundDenied.status).toBe(403);

    // auditor reads the return list but cannot write
    const list = await request(app.getHttpServer()).get('/api/returns').set(auth(fx.tenantA.users.auditor!.token!));
    expect(list.status).toBe(200);
    const write = await createReturn(auth(fx.tenantA.users.auditor!.token!), {
      invoiceId: sale.body.invoice.id, reasonCode: 'WRONG_ITEM', creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '1', condition: 'good', disposition: 'restock_sellable' }],
    });
    expect(write.status).toBe(403);
  });

  it('cross-tenant isolation: tenant B cannot see tenant A returns', async () => {
    const list = await request(app.getHttpServer()).get('/api/returns').set(tenantBOwner);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const listB = await request(app.getHttpServer()).get('/api/returns/credit-notes').set(tenantBOwner);
    expect(listB.status).toBe(200);
    expect(listB.body).toEqual([]);
  });

  it('atomicity: a failure after the deepest writes rolls back everything', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '2', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '100.00' }],
    });
    expect(sale.status).toBe(201);
    const stockBefore = await balance(productA);
    const journalCountBefore = Number(
      (await fx.admin.query(`SELECT COUNT(*)::int AS n FROM journal_entry`)).rows[0]!.n,
    );

    const ret = await createReturn(manager, {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'DEFECTIVE',
      creditDisposition: 'refund',
      lines: [{ invoiceLineId: sale.body.invoice.lines[0].id, quantity: '2', condition: 'defective', disposition: 'restock_sellable' }],
      submit: true,
    });
    expect(ret.status).toBe(201);
    await transition(manager, ret.body.id, 'approve');
    await transition(manager, ret.body.id, 'receive');

    // failure injection AFTER the deepest writes (journal + credit note +
    // store credit + stock + return row): the whole transaction rolls back
    const processed = await transition(manager, ret.body.id, 'process', { simulateFailure: 'after_writes' });
    expect(processed.status).toBe(400); // controlled validation failure

    expect(await balance(productA)).toBe(stockBefore); // stock untouched
    const journalCountAfter = Number(
      (await fx.admin.query(`SELECT COUNT(*)::int AS n FROM journal_entry`)).rows[0]!.n,
    );
    expect(journalCountAfter).toBe(journalCountBefore); // no journal survived
    // the return order itself survives in 'received' (its own earlier
    // transaction committed); the PROCESSING transaction — credit note,
    // journal, stock restock, store credit — left ZERO partial rows
    const survived = await getReturn(manager, ret.body.id);
    expect(survived.status).toBe('received');
    expect(survived.creditNoteId).toBeNull();
    expect(survived.grossCredit).toBeNull();
    const notes = await fx.admin.query(
      `SELECT COUNT(*)::int AS n FROM credit_note WHERE return_order_id = $1`, [ret.body.id]);
    expect(Number(notes.rows[0]!.n)).toBe(0);
    // and processing again succeeds (safe retry after a failure)
    const retried = await transition(manager, ret.body.id, 'process');
    expect(retried.status).toBe(201);
    expect(retried.body.creditNoteId).not.toBeNull();
  });

  it('no-stock goodwill adjustment return credits without touching stock', async () => {
    const sale = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '5', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '100.00' }],
    });
    expect(sale.status).toBe(201);
    const before = await balance(productB);

    const ret = await createReturn(manager, {
      invoiceId: sale.body.invoice.id,
      reasonCode: 'GOODWILL',
      creditDisposition: 'refund',
      lines: [],
      adjustmentAmount: '15.00',
      customerNote: 'pricing complaint resolved as goodwill',
      submit: true,
    });
    expect(ret.status).toBe(201);
    // GOODWILL requires approval; approved → processed directly (no lines)
    expect((await transition(manager, ret.body.id, 'approve')).status).toBe(201);
    const processed = await transition(manager, ret.body.id, 'process');
    expect(processed.status).toBe(201);
    expect(processed.body.grossCredit).toBe('15.0000');
    expect(processed.body.cogsReversal).toBe('0.0000');
    expect(await balance(productB)).toBe(before);
  });
});
