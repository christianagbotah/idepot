/**
 * Phase 3 E2E flows (ROADMAP Phase 3 exit criteria):
 *   - E2E cash sale, credit sale, part payment, deposit → allocation
 *   - posting-atomicity test (kill transaction mid-post → zero partial rows)
 *   - allocation invariants property-tested (API level, seeded sweep)
 *   - performance: sub-second sale commit locally
 * plus the corrected-model behaviours: numeric status ladder, structured
 * tenders, booklet-first numbering, shift variance, RBAC gates.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiFixture, type ApiFixture } from './helpers.js';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('sales & POS E2E (cash / credit / part payment / deposit→allocation)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let manager: Record<string, string>;
  let cashier: Record<string, string>;
  let auditor: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string; // 50.00
  let productB: string; // 20.00
  let customerC1: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function balance(productId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/api/inventory/balances?warehouseId=${whA}&productId=${productId}`)
      .set(owner);
    expect(res.status).toBe(200);
    const row = res.body.items.find((b: { productId: string }) => b.productId === productId);
    return row ? row.quantityBase : '0.000000';
  }

  async function commitSale(token: Record<string, string>, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/sales/commit').set(token).send(body);
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    manager = auth(fx.tenantA.users.manager!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);
    auditor = auth(fx.tenantA.users.auditor!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'POS-WHA', name: 'POS WH A' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'PCS', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'POS-A', name: 'POS Product A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'POS-B', name: 'POS Product B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    customerC1 = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Cash Customer One', phone: '0244000001' })).body.id;

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '1000', unitCost: '30.0000' },
        { productId: productB, quantityBase: '1000', unitCost: '12.0000' },
      ],
    });
    expect(opening.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    // beforeAll may have failed before assigning fx (e.g. embedded PG boot);
    // teardown must not turn a failed setup into a crash on undefined.
    await fx?.close();
  });

  it('cash sale: one transaction posts invoice + stock + COGS + tender + allocation + audit + outbox', async () => {
    // order discounts are manager territory since the hardening round: the
    // cashier charges the server price; a discount needs the permission +
    // recorded evidence (finding #4)
    const res = await commitSale(manager, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [
        { productId: productA, quantityBase: '3', unitPrice: '50.00' },
        { productId: productB, quantityBase: '2', unitPrice: '20.00' },
      ],
      orderDiscount: '10.00',
      discountOverride: { reason: 'loyalty discount for repeat customer' },
      tenders: [{ method: 'cash', amount: '200.00' }],
    });
    expect(res.status).toBe(201);
    const inv = res.body.invoice;
    // C-2 corrected totals: 3×50 + 2×20 = 190; − 10 discount = 180
    expect(inv.subtotal).toBe('190.0000');
    expect(inv.orderDiscount).toBe('10.0000');
    expect(inv.total).toBe('180.0000');
    expect(inv.paymentStatus).toBe('paid');
    expect(inv.amountDue).toBe('0.0000');
    expect(res.body.payment.amount).toBe('200.0000');
    expect(res.body.payment.changeGiven).toBe('20.0000'); // 200 cash − 180 total
    expect(res.body.payment.allocations).toHaveLength(1);
    expect(res.body.payment.allocations[0].amount).toBe('180.0000'); // min(200 cash, 180 total)
    expect(res.body.movements).toHaveLength(2);
    // stock issued in the same transaction
    expect(await balance(productA)).toBe('997.000000');
    expect(await balance(productB)).toBe('998.000000');
    // COGS snapshot (AVCO from the opening-stock cost layers — ADR-0004)
    expect(inv.costTotal).toBe('114.0000'); // 3×30 + 2×12
    expect(inv.lines[0].costMethod).toBe('avco');
    expect(inv.lines[0].cogs).toBe('90.0000');

    // audit + outbox committed in the same transaction
    const events = await fx.admin.query(
      `SELECT action FROM audit_event WHERE entity_id = $1 ORDER BY action`,
      [inv.id],
    );
    expect(events.rows.map((r: { action: string }) => r.action)).toContain('sale.completed');
    const outbox = await fx.admin.query(
      `SELECT type FROM outbox_event
       WHERE payload->>'invoiceId' = $1 OR payload->>'sourceDocumentId' = $1`,
      [inv.id],
    );
    const types = outbox.rows.map((r: { type: string }) => r.type);
    expect(types).toContain('InvoicePosted');
    expect(types).toContain('PaymentReceived');
    expect(types).toContain('StockMoved');
  });

  it('credit sale: no tenders → unpaid, customer receivable; RBAC: cashier cannot sell without sales:pos on other modules but CAN sell; auditor cannot', async () => {
    const res = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '4', unitPrice: '50.00' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.invoice.paymentStatus).toBe('unpaid');
    expect(res.body.invoice.amountDue).toBe('200.0000');
    expect(res.body.payment).toBeNull();

    // corrected C-16 balance query
    const bal = await request(app.getHttpServer()).get(`/api/customers/${customerC1}/balance`).set(owner);
    expect(bal.status).toBe(200);
    expect(bal.body.receivable).toBe('200.0000');

    // auditor (read-only) cannot commit a sale
    const denied = await commitSale(auditor, {
      warehouseId: whA,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
    });
    expect(denied.status).toBe(403);
  });

  it('part payment: explicit allocation rows; numeric ladder part_paid → paid', async () => {
    // find the credit invoice from the previous test
    const list = await request(app.getHttpServer())
      .get(`/api/sales/invoices?customerId=${customerC1}`)
      .set(owner);
    const credit = list.body.items.find((i: { paymentStatus: string }) => i.paymentStatus === 'unpaid');
    expect(credit).toBeDefined();

    const part = await request(app.getHttpServer()).post('/api/payments').set(cashier).send({
      customerId: customerC1,
      invoiceId: credit.id,
      amount: '150.00',
      tenders: [{ method: 'momo', amount: '150.00', momoProvider: 'MTN', momoPhone: '0244000001', momoTransactionId: 'TX-100' }],
    });
    expect(part.status).toBe(201);
    expect(part.body.allocations).toHaveLength(1);
    expect(part.body.allocations[0].amount).toBe('150.0000');
    expect(part.body.unapplied).toBe('0.0000');

    const afterPart = await request(app.getHttpServer()).get(`/api/sales/invoices/${credit.id}`).set(owner);
    expect(afterPart.body.paymentStatus).toBe('part_paid');
    expect(afterPart.body.amountDue).toBe('50.0000');

    // over-allocation beyond the outstanding due is rejected (C-17)
    const over = await request(app.getHttpServer()).post('/api/payments').set(cashier).send({
      customerId: customerC1,
      invoiceId: credit.id,
      amount: '60.00',
      tenders: [{ method: 'cash', amount: '60.00' }],
    });
    expect(over.status).toBe(400); // allocation validation error

    const settle = await request(app.getHttpServer()).post('/api/payments').set(cashier).send({
      customerId: customerC1,
      invoiceId: credit.id,
      amount: '50.00',
      tenders: [{ method: 'cash', amount: '50.00' }],
    });
    expect(settle.status).toBe(201);
    const afterPaid = await request(app.getHttpServer()).get(`/api/sales/invoices/${credit.id}`).set(owner);
    expect(afterPaid.body.paymentStatus).toBe('paid');
    expect(afterPaid.body.amountDue).toBe('0.0000');
  });

  it('deposit → allocation: deposit document + credit tender at sale consumes it (C-20 corrected waterfall)', async () => {
    // 1. take a deposit (money arrives as a payment doc, credit as liability)
    const dep = await request(app.getHttpServer()).post('/api/deposits').set(cashier).send({
      customerId: customerC1,
      amount: '100.00',
      tenders: [{ method: 'cash', amount: '100.00' }],
    });
    expect(dep.status).toBe(201);
    expect(dep.body.remainingAmount).toBe('100.0000');
    expect(dep.body.status).toBe('active');

    // 2. sale partially settled with the deposit as a credit tender
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '5', unitPrice: '20.00' }], // 100
      tenders: [
        { method: 'credit', amount: '40.00', depositId: dep.body.id },
        { method: 'cash', amount: '60.00' },
      ],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.creditApplications).toHaveLength(1);
    expect(sale.body.creditApplications[0].amount).toBe('40.0000');
    expect(sale.body.invoice.paymentStatus).toBe('paid');
    expect(sale.body.payment.amount).toBe('60.0000'); // money only; credit is NOT money

    // 3. deposit ledger reflects the consumption
    const depAfter = await request(app.getHttpServer()).get(`/api/deposits/${dep.body.id}`).set(owner);
    expect(depAfter.body.appliedAmount).toBe('40.0000');
    expect(depAfter.body.remainingAmount).toBe('60.0000');

    // 4. credit exceeding the remaining due is rejected
    const bad = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
      tenders: [{ method: 'credit', amount: '70.00', depositId: dep.body.id }],
    });
    expect(bad.status).toBe(400);
  });

  it('posting atomicity: kill mid-post → ZERO partial rows (invoice, stock, tender, audit, outbox all-or-nothing)', async () => {
    const before = {
      invoices: await fx.admin.query(`SELECT count(*)::int AS n FROM invoice`),
      movements: await fx.admin.query(`SELECT count(*)::int AS n FROM stock_movement`),
      payments: await fx.admin.query(`SELECT count(*)::int AS n FROM payment`),
      audit: await fx.admin.query(`SELECT count(*)::int AS n FROM audit_event`),
      outbox: await fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event`),
    };
    const res = await commitSale(cashier, {
      warehouseId: whA,
      lines: [{ productId: productA, quantityBase: '7', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '350.00' }],
      simulateFailureAfterWrites: true,
    });
    expect([409, 500].includes(res.status)).toBe(true);
    const after = {
      invoices: await fx.admin.query(`SELECT count(*)::int AS n FROM invoice`),
      movements: await fx.admin.query(`SELECT count(*)::int AS n FROM stock_movement`),
      payments: await fx.admin.query(`SELECT count(*)::int AS n FROM payment`),
      audit: await fx.admin.query(`SELECT count(*)::int AS n FROM audit_event`),
      outbox: await fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event`),
    };
    expect(after.invoices.rows[0].n).toBe(before.invoices.rows[0].n);
    expect(after.movements.rows[0].n).toBe(before.movements.rows[0].n);
    expect(after.payments.rows[0].n).toBe(before.payments.rows[0].n);
    expect(after.audit.rows[0].n).toBe(before.audit.rows[0].n);
    expect(after.outbox.rows[0].n).toBe(before.outbox.rows[0].n);
    expect(await balance(productA)).toBe('993.000000'); // unchanged: 997 − 4 (credit sale) — the failed 7 never landed
  });

  it('allocation invariants property sweep (API level): due ≡ total − Σallocations − Σcredits, Σtenders == amount', async () => {
    const rnd = lcg(20261031);
    for (let i = 0; i < 8; i++) {
      // a fresh customer per round keeps dues independent
      const cust = (
        await request(app.getHttpServer()).post('/api/customers').set(owner).send({
          name: `Inv Sweep ${i}`, phone: `024500000${i}`,
        })
      ).body.id;
      const sale = await commitSale(cashier, {
        warehouseId: whA,
        customerId: cust,
        lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
      });
      expect(sale.status).toBe(201);
      const invoiceId = sale.body.invoice.id as string;

      // pay a random part of the 20.00
      const part = Math.floor(rnd() * 200000) / 10000; // 0..20 in 4dp-ish
      const amount = (Math.round(part * 100) / 100).toFixed(2);
      if (Number(amount) > 0 && Number(amount) <= 20) {
        const pay = await request(app.getHttpServer()).post('/api/payments').set(cashier).send({
          customerId: cust,
          invoiceId,
          amount,
          tenders: [{ method: 'cash', amount }],
        });
        expect(pay.status).toBe(201);
        const inv = await request(app.getHttpServer()).get(`/api/sales/invoices/${invoiceId}`).set(owner);
        const total = 20;
        const due = Math.max(total - Number(amount), 0);
        expect(Number(inv.body.amountDue)).toBeCloseTo(due, 4);
        const expectedStatus = due === 0 ? 'paid' : Number(amount) === 0 ? 'unpaid' : 'part_paid';
        expect(inv.body.paymentStatus).toBe(expectedStatus);
        // invariant 8 on the payment row
        const allocSum = pay.body.allocations.reduce((a: number, x: { amount: string }) => a + Number(x.amount), 0);
        expect(allocSum + Number(pay.body.changeGiven) + Number(pay.body.unapplied)).toBeCloseTo(Number(pay.body.amount), 4);
      }
    }
  });

  it('booklet-first invoice numbering with concurrency: two simultaneous cashiers get two DIFFERENT booklet codes in order', async () => {
    // import a booklet of 3 codes
    const booklet = await request(app.getHttpServer()).post('/api/sequences/booklets').set(owner).send({
      docType: 'INVOICE',
      codes: ['BK-0000101', 'BK-0000102', 'BK-0000103'],
      codeRange: 'BK-0000101..BK-0000103',
    });
    expect(booklet.status).toBe(201);
    expect(booklet.body.codeCount).toBe(3);

    const sale = (line: string) =>
      commitSale(cashier, {
        warehouseId: whA,
        lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
        note: line,
      });
    const [r1, r2, r3] = await Promise.all([sale('bk1'), sale('bk2'), sale('bk3')]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
    const codes = [r1.body.invoice.code, r2.body.invoice.code, r3.body.invoice.code].sort();
    expect(codes).toEqual(['BK-0000101', 'BK-0000102', 'BK-0000103']);
    // booklet exhausted → next sale falls back to the counter sequence
    const r4 = await sale('counter');
    expect(r4.status).toBe(201);
    expect(r4.body.invoice.code).toMatch(/^INV\d{5}$/);
    // booklet codes are unique forever (23505 backstop + allocation lock)
    const dup = await request(app.getHttpServer()).post('/api/sequences/booklets').set(owner).send({
      docType: 'INVOICE',
      codes: ['BK-0000101'],
    });
    expect(dup.status).toBe(409);
  });

  it('shifts: open → cash movement → close with derived expected cash and variance review gate', async () => {
    const shift = await request(app.getHttpServer()).post('/api/shifts').set(cashier).send({
      warehouseId: whA,
      openingFloat: '50.00',
    });
    expect(shift.status).toBe(201);
    const shiftId = shift.body.id as string;

    // sale on shift: 20.00 cash (10.00 tender + change? keep simple: exact)
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      shiftId,
      lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
      tenders: [{ method: 'cash', amount: '25.00' }], // change 5
    });
    expect(sale.status).toBe(201);

    // paid-in 10
    const cashIn = await request(app.getHttpServer()).post(`/api/shifts/${shiftId}/cash`).set(cashier).send({
      direction: 'in', amount: '10.00', reason: 'float top-up',
    });
    expect(cashIn.status).toBe(201);

    // expected = 50 + 25 − 5 (change) + 10 = 80
    const close = await request(app.getHttpServer()).post(`/api/shifts/${shiftId}/close`).set(cashier).send({
      countedCash: '75.00', note: 'short 5',
    });
    expect(close.status).toBe(201);
    expect(close.body.expectedCash).toBe('80.0000');
    expect(close.body.variance).toBe('-5.0000');

    // second shift for the same cashier is refused while none is open —
    // but the first is closed now, so opening works; variance review:
    const review = await request(app.getHttpServer()).post(`/api/shifts/${shiftId}/review-variance`).set(cashier).send();
    expect(review.status).toBe(403); // cashier lacks shift:approve
    const managerReview = await request(app.getHttpServer()).post(`/api/shifts/${shiftId}/review-variance`).set(manager).send();
    expect(managerReview.status).toBe(201);
  });

  it('performance: sub-second sale commit locally (median of 5 well under 1000ms)', async () => {
    const durations: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const res = await commitSale(cashier, {
        warehouseId: whA,
        lines: [{ productId: productB, quantityBase: '1', unitPrice: '20.00' }],
        tenders: [{ method: 'cash', amount: '20.00' }],
      });
      expect(res.status).toBe(201);
      durations.push(Date.now() - t0);
    }
    durations.sort((a, b) => a - b);
    const median = durations[2]!;
    expect(median).toBeLessThan(1000);
  });

  it('receipt payload: thermal/A4 render source with structured tenders and THIS-invoice balance', async () => {
    const sale = await commitSale(cashier, {
      warehouseId: whA,
      customerId: customerC1,
      lines: [{ productId: productA, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '30.00' }], // part payment → due 20
    });
    expect(sale.status).toBe(201);
    const receipt = await request(app.getHttpServer())
      .get(`/api/sales/invoices/${sale.body.invoice.id}/receipt`)
      .set(cashier);
    expect(receipt.status).toBe(200);
    expect(receipt.body.kind).toBe('receipt');
    expect(receipt.body.total).toBe('50.0000');
    expect(receipt.body.balanceOwedThisInvoice).toBe('20.0000');
    console.log('RECEIPT-TENDERS', JSON.stringify(receipt.body.tenders));
    expect(receipt.body.tenders).toHaveLength(1);
    expect(receipt.body.tenders[0].method).toBe('cash');
    expect(receipt.body.lines[0].name).toBe('POS Product A');
  });
});
