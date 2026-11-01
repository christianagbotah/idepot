/**
 * Phase 3 DEEP POSTING ATOMICITY (final-review blocker #4): prove that a
 * failure AFTER the deepest financial writes leaves NO partial state — not
 * merely "row counts are unchanged" but an EXACT before/after state
 * comparison over every projection of the posting set:
 *
 *   invoice, invoice_line, invoice_tax_component,
 *   stock_movement, stock_balance, stock_cost_state,
 *   payment, payment_tender, payment_allocation, credit_application,
 *   journal_entry, journal_line,
 *   audit_event, outbox_event, sync_applied_event
 *
 * The suite seeds LEGITIMATE pre-test state in every one of those tables
 * first (successful direct sale + successful offline-sync sale, with real
 * tax components, AVCO cost layers, a consumed deposit, GL journals, audit
 * and outbox rows), captures a full canonical snapshot, then fires three
 * doomed postings — each failing at a different depth:
 *
 *   A. direct /api/sales/commit with simulateFailureAfterWrites — throws
 *      AFTER invoice+lines+tax evidence+stock+AVCO+payment+allocations+
 *      credit waterfall+GL journal+audit+outbox, before loadInvoice
 *   B. offline sync push with simulateFailureAfterWrites — same depth,
 *      plus the registry INSERT already executed in the same transaction
 *   C. offline sync push with simulateCrashBeforeCommit — claim acquired,
 *      business writes done, registry row inserted, crash BEFORE commit
 *
 * After each failure the snapshot must be BYTE-FOR-BYTE identical to the
 * baseline (a projection with legitimate pre-state returns exactly to it).
 * A final clean retry proves the snapshots were not vacuous.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createApiFixture, type ApiFixture } from './helpers.js';

const TABLES = [
  'invoice',
  'invoice_line',
  'invoice_tax_component',
  'stock_movement',
  'stock_balance',
  'stock_cost_state',
  'payment',
  'payment_tender',
  'payment_allocation',
  'credit_application',
  'journal_entry',
  'journal_line',
  'audit_event',
  'outbox_event',
  'sync_applied_event',
] as const;

type Snapshot = Record<(typeof TABLES)[number], unknown[]>;

/** Full canonical dump of every table (rows as JSON, deterministic order —
 *  jsonb text form is canonical, so identical state ⇒ identical arrays). */
async function snapshot(fx: ApiFixture): Promise<Snapshot> {
  const out = {} as Snapshot;
  for (const t of TABLES) {
    const res = await fx.admin.query(
      `SELECT to_jsonb(t) AS row FROM ${t} t ORDER BY to_jsonb(t)::text`,
    );
    out[t] = res.rows.map((r: { row: unknown }) => r.row);
  }
  return out;
}

/** Exact equality per table, with a per-table diff report on failure. */
function expectIdentical(before: Snapshot, after: Snapshot): void {
  for (const t of TABLES) {
    const ok = JSON.stringify(before[t]) === JSON.stringify(after[t]);
    if (!ok) {
      const b = before[t].length;
      const a = after[t].length;
      throw new Error(
        `table ${t} did NOT return exactly to its baseline after a failed posting ` +
        `(baseline rows: ${b}, after-failure rows: ${a}) — partial state leaked:\n` +
        `before: ${JSON.stringify(before[t])}\nafter:  ${JSON.stringify(after[t])}`,
      );
    }
  }
}

describe('deep posting atomicity — failure AFTER the deepest financial writes leaves zero partial state', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let cashier: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let productB: string;
  let customerC: string;
  let depositId: string;
  let deviceId: string;
  let baseline: Snapshot;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  /** The richest sale shape: 2 lines with tax evidence, deposit credit +
   *  part cash, remainder in AR — touches every table under proof. */
  function deepSaleBody(opts: { simulateFailure?: boolean; simulateCrash?: boolean }): Record<string, unknown> {
    return {
      warehouseId: whA,
      customerId: customerC,
      lines: [
        { productId: productA, quantityBase: '2', unitPrice: '50.00' },
        { productId: productB, quantityBase: '1', unitPrice: '20.00' },
      ],
      tenders: [
        { method: 'credit', amount: '20.00', depositId },
        { method: 'cash', amount: '80.00' },
      ],
      clientDocId: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...(opts.simulateFailure ? { simulateFailureAfterWrites: true } : {}),
      ...(opts.simulateCrash ? { simulateCrashBeforeCommit: true } : {}),
    };
  }

  async function commitSale(body: Record<string, unknown>) {
    return api().post('/api/sales/commit').set(cashier).send(body);
  }

  async function pushSale(body: Record<string, unknown>) {
    return api().post('/api/sync/push').set(cashier).send({
      deviceId,
      events: [
        {
          eventId: randomUUID(),
          idempotencyKey: `atomicity-${randomUUID()}`,
          type: 'sale.create',
          payload: body,
          occurredAt: new Date().toISOString(),
        },
      ],
    });
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);

    whA = (await api().post('/api/warehouses').set(owner).send({ code: 'ATOMIC-WH', name: 'Atomicity WH' })).body.id;
    unitPc = (await api().post('/api/units').set(owner).send({ code: 'APC', name: 'Atomicity Pieces' })).body.id;
    productA = (await api().post('/api/products').set(owner).send({ code: 'ATOMIC-A', name: 'Atomicity A', baseUnitId: unitPc, sellingPrice: '50.00', purchasePrice: '30.00' })).body.id;
    productB = (await api().post('/api/products').set(owner).send({ code: 'ATOMIC-B', name: 'Atomicity B', baseUnitId: unitPc, sellingPrice: '20.00', purchasePrice: '12.00' })).body.id;
    customerC = (await api().post('/api/customers').set(owner).send({ name: 'Atomicity Customer', phone: '0244000055' })).body.id;
    deviceId = (await api().post('/api/auth/devices').set(cashier).send({ deviceCode: 'ATOMIC-DEV', platform: 'web' })).body.id;

    // cost-bearing opening stock → AVCO layers
    const opening = await api().post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '500', unitCost: '30.0000' },
        { productId: productB, quantityBase: '500', unitCost: '12.0000' },
      ],
    });
    expect(opening.status).toBe(201);

    // real tax components → per-line evidence rows on every sale
    const profile = await api().post('/api/tax/profiles').set(owner).send({ code: 'ATOMIC', name: 'Atomicity Profile', isDefault: true });
    expect(profile.status).toBe(201);
    const version = await api().post(`/api/tax/profiles/${profile.body.id}/versions`).set(owner).send({
      effectiveFrom: '2020-01-01',
      components: [
        { name: 'LEVY-A', rate: '0.075000', inclusive: false, seq: 1 },
        { name: 'CITY', rate: '0.025000', inclusive: true, seq: 2 },
      ],
    });
    expect(version.status).toBe(201);

    // deposit for the credit waterfall
    const deposit = await api().post('/api/deposits').set(cashier).send({
      customerId: customerC,
      amount: '500.00',
      tenders: [{ method: 'cash', amount: '500.00' }],
    });
    expect(deposit.status).toBe(201);
    depositId = deposit.body.id as string;

    // ---- LEGITIMATE PRE-STATE in every table under proof ----------------
    // one successful DIRECT sale (online path)
    const direct = await commitSale(deepSaleBody({}));
    expect(direct.status).toBe(201);
    expect(direct.body.invoice.taxComponents).toHaveLength(2);
    // one successful OFFLINE-SYNC sale (registry row + same full set)
    const synced = await pushSale(deepSaleBody({}));
    expect(synced.status).toBe(201);
    expect(synced.body.outcomes[0].status).toBe('applied');
    // a standalone payment against the direct sale's AR (payment_allocation
    // + journal + audit + outbox on the payment path too)
    const pay = await api().post('/api/payments').set(cashier).send({
      customerId: customerC,
      invoiceId: direct.body.invoice.id,
      amount: '10.00',
      tenders: [{ method: 'cash', amount: '10.00' }],
    });
    expect(pay.status).toBe(201);

    // sanity: the pre-state really spans every table (else the proof below
    // would be vacuous for that table)
    baseline = await snapshot(fx);
    for (const t of ['invoice', 'invoice_line', 'invoice_tax_component', 'stock_movement', 'stock_balance',
      'stock_cost_state', 'payment', 'payment_tender', 'payment_allocation', 'credit_application',
      'journal_entry', 'journal_line', 'audit_event', 'outbox_event', 'sync_applied_event'] as const) {
      expect(baseline[t].length, `pre-state must exist in ${t}`).toBeGreaterThan(0);
    }
  }, 180_000);

  afterAll(async () => {
    await fx?.close();
  });

  it('failure A — direct commit killed AFTER the deepest writes: every projection returns EXACTLY to the baseline', async () => {
    const doomed = await commitSale(deepSaleBody({ simulateFailure: true }));
    expect(doomed.status).toBe(500); // injected internal failure after the deepest writes

    const after = await snapshot(fx);
    expectIdentical(baseline, after);
  });

  it('failure B — sync push killed AFTER writes + registry insert (same transaction): exact baseline again', async () => {
    const doomed = await pushSale(deepSaleBody({ simulateFailure: true }));
    expect(doomed.status).toBe(201);
    expect(doomed.body.outcomes[0].status).toBe('rejected');

    const after = await snapshot(fx);
    expectIdentical(baseline, after);
  });

  it('failure C — crash AFTER claim + writes + registration but BEFORE COMMIT: exact baseline again', async () => {
    const doomed = await pushSale(deepSaleBody({ simulateCrash: true }));
    expect(doomed.status).toBe(201);
    expect(doomed.body.outcomes[0].status).toBe('rejected');

    const after = await snapshot(fx);
    expectIdentical(baseline, after);
  });

  it('the proof is not vacuous: a clean retry COMMITS and the state visibly changes', async () => {
    const clean = await pushSale(deepSaleBody({}));
    expect(clean.status).toBe(201);
    expect(clean.body.outcomes[0].status).toBe('applied');

    const after = await snapshot(fx);
    // state moved: one more invoice (+ its lines/tax/journal/audit rows)
    expect(after.invoice.length).toBe(baseline.invoice.length + 1);
    expect(after.sync_applied_event.length).toBe(baseline.sync_applied_event.length + 1);
    expect(after.journal_entry.length).toBe(baseline.journal_entry.length + 1);
    // ...and everything else either grew consistently or stayed put —
    // spot-check the financial core grew, proving the comparator sees real
    // state changes when they exist
    expect(after.invoice_line.length).toBeGreaterThan(baseline.invoice_line.length);
    expect(after.stock_movement.length).toBeGreaterThan(baseline.stock_movement.length);
    expect(after.audit_event.length).toBeGreaterThan(baseline.audit_event.length);
    expect(after.outbox_event.length).toBeGreaterThan(baseline.outbox_event.length);
  });
});
