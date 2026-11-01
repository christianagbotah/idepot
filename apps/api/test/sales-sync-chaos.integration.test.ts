/**
 * Phase 3 offline-sync chaos suite (ROADMAP exit criteria: "offline
 * sale→sync (chaos suite)"; offline-sync §10 test matrix):
 *   - duplicate delivery → same result, ONE document (idempotency)
 *   - kill mid-push → nothing applied, registry clean, retry succeeds once
 *   - two offline terminals oversell the last stock → policy-driven outcome
 *     (reject: conflict; allow_backorder: negative + exception task)
 *   - offline document numbers must be covered by an unexpired lease
 *   - idempotencyKey dedupe across different eventIds
 *   - pull is resumable (cursor)
 *
 * FINAL-REVIEW BLOCKER #1 — true CONCURRENCY (Promise.all, real HTTP, real
 * PG transactions racing on the advisory-lock claim):
 *   - same idempotency key + same payload, simultaneously
 *   - same eventId + same payload, simultaneously
 *   - same key + different amount, simultaneously
 *   - same key + different product, simultaneously
 *   - same key + different event type, simultaneously
 *   - crash after key acquisition (writes + registration done) but before
 *     COMMIT → nothing durable
 *   - retry after the crashed transaction → applies exactly once
 * Required proof in every race: exactly ONE business effect commits, both
 * same-payload callers converge on the same logical result, a different
 * payload gets `idempotency_key_reuse`, and NO caller ever sees an
 * accidental raw 23505 / generic rejected-internal outcome.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createApiFixture, type ApiFixture } from './helpers.js';

describe('offline sync chaos (push idempotency, crash safety, oversell policy, leases)', () => {
  let fx: ApiFixture;
  let app: INestApplication;
  let owner: Record<string, string>;
  let cashier: Record<string, string>;
  let whA: string;
  let unitPc: string;
  let productA: string;
  let productB: string; // dedicated to the concurrency races (independent stock)
  let customerC: string; // customer for the event-type race
  let deviceA: string;
  let deviceB: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function salePayload(opts: {
    warehouseId: string;
    productId: string;
    quantity?: string;
    unitPrice?: string;
    clientDocId?: string;
    docNumber?: string;
    simulateFailure?: boolean;
    simulateCrashBeforeCommit?: boolean;
  }): Record<string, unknown> {
    return {
      warehouseId: opts.warehouseId,
      lines: [{ productId: opts.productId, quantityBase: opts.quantity ?? '1', unitPrice: opts.unitPrice ?? '50.00' }],
      tenders: [{ method: 'cash', amount: '50.00' }],
      clientDocId: opts.clientDocId ?? randomUUID(),
      docNumber: opts.docNumber ?? null,
      occurredAt: new Date().toISOString(),
      ...(opts.simulateFailure ? { simulateFailureAfterWrites: true } : {}),
      ...(opts.simulateCrashBeforeCommit ? { simulateCrashBeforeCommit: true } : {}),
    };
  }

  function saleEvent(payload: Record<string, unknown>, eventId = randomUUID(), idempotencyKey?: string): Record<string, unknown> {
    return {
      eventId,
      idempotencyKey: idempotencyKey ?? `offline-${eventId}`,
      type: 'sale.create',
      payload,
      occurredAt: new Date().toISOString(),
    };
  }

  async function push(deviceId: string, events: Array<Record<string, unknown>>) {
    return request(app.getHttpServer()).post('/api/sync/push').set(cashier).send({ deviceId, events });
  }

  async function invoiceCount(clientDocId: string): Promise<number> {
    const res = await fx.admin.query(`SELECT count(*)::int AS n FROM invoice WHERE client_doc_id = $1`, [clientDocId]);
    return res.rows[0].n as number;
  }

  async function registryCountByEvent(eventId: string): Promise<number> {
    const res = await fx.admin.query(`SELECT count(*)::int AS n FROM sync_applied_event WHERE event_id = $1`, [eventId]);
    return res.rows[0].n as number;
  }

  async function registryCountByKey(idempotencyKey: string): Promise<number> {
    const res = await fx.admin.query(`SELECT count(*)::int AS n FROM sync_applied_event WHERE idempotency_key = $1`, [idempotencyKey]);
    return res.rows[0].n as number;
  }

  /** Every racing caller must receive a DETERMINISTIC idempotency outcome —
   * never an HTTP 500, never a raw 23505/unique-violation leak, never a
   * generic `rejected`/internal result for a legitimate retry race. */
  function expectDeterministicOutcomes(responses: Array<{ status: number; body: { outcomes?: unknown[] } }>): void {
    for (const r of responses) {
      expect(r.status, `sync push must answer 201 per-event, got ${r.status}: ${JSON.stringify(r.body)}`).toBe(201);
      for (const o of (r.body.outcomes ?? []) as Array<Record<string, unknown>>) {
        expect(
          ['applied', 'duplicate', 'conflict'].includes(String(o.status)),
          `racing caller leaked an unclassified outcome: ${JSON.stringify(o)}`,
        ).toBe(true);
        expect(JSON.stringify(o)).not.toMatch(/23505|unique constraint|duplicate key/i);
      }
    }
  }

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'SYNC-WH', name: 'Sync WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'PCS', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'SYNC-A', name: 'Sync Product A', baseUnitId: unitPc, sellingPrice: '50.00' })).body.id;
    // dedicated stock for the concurrency races — independent of the
    // oversell/bookkeeping arithmetic of the cases above
    productB = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'SYNC-B', name: 'Sync Product B', baseUnitId: unitPc, sellingPrice: '50.00' })).body.id;
    customerC = (await request(app.getHttpServer()).post('/api/customers').set(owner).send({ name: 'Sync Race Customer', phone: '0244000088' })).body.id;
    deviceA = (await request(app.getHttpServer()).post('/api/auth/devices').set(cashier).send({ deviceCode: 'POS-TERMINAL-A', platform: 'web' })).body.id;
    deviceB = (await request(app.getHttpServer()).post('/api/auth/devices').set(cashier).send({ deviceCode: 'POS-TERMINAL-B', platform: 'web' })).body.id;
    expect(deviceA).toBeTruthy();
    expect(deviceB).toBeTruthy();

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [
        { productId: productA, quantityBase: '10' },
        { productId: productB, quantityBase: '200' },
      ],
    });
    expect(opening.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    // beforeAll may have failed before assigning fx (e.g. embedded PG boot);
    // teardown must not turn a failed setup into a crash on undefined.
    await fx?.close();
  });

  it('duplicate delivery: the same event pushed twice applies ONCE and replays the original result', async () => {
    const clientDocId = randomUUID();
    const payload = salePayload({ warehouseId: whA, productId: productA, clientDocId });
    const event = saleEvent(payload);

    const first = await push(deviceA, [event]);
    expect(first.status).toBe(201);
    expect(first.body.outcomes[0].status).toBe('applied');
    const applied = first.body.outcomes[0];
    expect(await invoiceCount(clientDocId)).toBe(1);

    // device retry after a lost response: same event, same idempotency
    const replay = await push(deviceA, [{ ...event, idempotencyKey: event.idempotencyKey }]);
    expect(replay.status).toBe(201);
    expect(replay.body.outcomes[0].status).toBe('duplicate');
    expect(replay.body.outcomes[0].result).toEqual(applied.result);
    expect(await invoiceCount(clientDocId)).toBe(1); // ONE document, ever
  });

  it('kill mid-push: registry row rolls back WITH the documents — the retry applies exactly once', async () => {
    const clientDocId = randomUUID();
    const eventId = randomUUID();
    const bad = await push(deviceA, [saleEvent(salePayload({ warehouseId: whA, productId: productA, clientDocId, simulateFailure: true }), eventId)]);
    expect(bad.status).toBe(201);
    expect(bad.body.outcomes[0].status).toBe('rejected');
    expect(await invoiceCount(clientDocId)).toBe(0);
    const reg = await fx.admin.query(`SELECT count(*)::int AS n FROM sync_applied_event WHERE event_id = $1`, [eventId]);
    expect(reg.rows[0].n).toBe(0); // the "applied" marker rolled back too

    // the device retries the SAME event after reconnect — now without the fault
    const retry = await push(deviceA, [saleEvent(salePayload({ warehouseId: whA, productId: productA, clientDocId }), eventId)]);
    expect(retry.body.outcomes[0].status).toBe('applied');
    expect(await invoiceCount(clientDocId)).toBe(1);
  });

  it('two offline terminals oversell the last stock: policy reject → conflict (review), never a silent rewrite', async () => {
    // policy default reject; stock is now 10 − 2 (earlier tests) = 8
    const clientDocA = randomUUID();
    const clientDocB = randomUUID();
    const evA = saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '8', clientDocId: clientDocA }));
    const evB = saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '8', clientDocId: clientDocB }));

    const [rA, rB] = await Promise.all([push(deviceA, [evA]), push(deviceB, [evB])]);
    const statuses = [rA.body.outcomes[0].status, rB.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'conflict']);
    const conflicted = rA.body.outcomes[0].status === 'conflict' ? rA.body.outcomes[0] : rB.body.outcomes[0];
    expect(conflicted.code).toBe('stock_oversold');

    // exactly one sale committed; on-hand never negative
    expect(await invoiceCount(clientDocA) + await invoiceCount(clientDocB)).toBe(1);
    const bal = await request(app.getHttpServer())
      .get(`/api/inventory/balances?warehouseId=${whA}&productId=${productA}`).set(owner);
    const onHand = Number(bal.body.items[0]?.quantityBase ?? '0');
    expect(onHand).toBeGreaterThanOrEqual(0);

    // the conflicted event is recorded — a naive device retry gets `duplicate`,
    // never a second (delayed) application of a business-conflicting sale
    const retry = await push(deviceA, [evB]);
    expect(retry.body.outcomes[0].status).toBe('duplicate');
  });

  it('policy allow_backorder: the ledger applies and a prominent exception task is raised', async () => {
    // ops decision path: tenant flips the oversell policy (admin connection)
    await fx.admin.query(`INSERT INTO tenant_config (tenant_id, oversell_policy) VALUES ($1,'allow_backorder')
                          ON CONFLICT (tenant_id) DO UPDATE SET oversell_policy = 'allow_backorder'`, [fx.tenantA.tenantId]);
    try {
      // relative arithmetic: whatever on-hand is now, a sale of 3 goes 3 lower
      const balBefore = await request(app.getHttpServer())
        .get(`/api/inventory/balances?warehouseId=${whA}&productId=${productA}`).set(owner);
      const before = Number(balBefore.body.items[0]?.quantityBase ?? '0');

      const clientDocId = randomUUID();
      const res = await push(deviceA, [saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '3', clientDocId }))]);
      expect(res.status).toBe(201);
      expect(res.body.outcomes[0].status).toBe('applied');
      expect(res.body.outcomes[0].result.backorder).toBe(true);

      const bal = await request(app.getHttpServer())
        .get(`/api/inventory/balances?warehouseId=${whA}&productId=${productA}`).set(owner);
      expect(bal.body.items[0].quantityBase).toBe(`${before - 3}.000000`); // ledger arithmetic always applies
      expect(before - 3).toBeLessThan(0);

      // prominent exception: audit + outbox raised INSIDE the posting tx
      const invoiceId = res.body.outcomes[0].result.invoiceId as string;
      const audit = await fx.admin.query(`SELECT count(*)::int AS n FROM audit_event WHERE action = 'sale.backorder_exception' AND entity_id = $1`, [invoiceId]);
      expect(audit.rows[0].n).toBe(1);
      const outbox = await fx.admin.query(`SELECT count(*)::int AS n FROM outbox_event WHERE type = 'SaleBackorderException' AND payload->>'invoiceId' = $1`, [invoiceId]);
      expect(outbox.rows[0].n).toBe(1);
    } finally {
      await fx.admin.query(`UPDATE tenant_config SET oversell_policy = 'reject' WHERE tenant_id = $1`, [fx.tenantA.tenantId]);
    }
  });

  it('offline document numbers must be covered by an unexpired lease of the pushing device', async () => {
    // fresh stock: the number-lease semantics under test need available stock
    const topUp = await request(app.getHttpServer()).post('/api/stock-adjustments').set(owner).send({
      warehouseId: whA,
      reason: 'test stock top-up for lease case',
      lines: [{ productId: productA, quantityBase: '10' }],
    });
    expect(topUp.status).toBe(201);

    const lease = await request(app.getHttpServer()).post('/api/sequences/leases').set(owner).send({
      deviceId: deviceA, docType: 'INVOICE', size: 5,
    });
    expect(lease.status).toBe(201);
    const prefix = lease.body.prefix as string;
    const inLease = `${prefix}${lease.body.endValue}`; // highest leased number

    const ok = await push(deviceA, [saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '1', docNumber: inLease }))]);
    expect(ok.body.outcomes[0].status).toBe('applied');

    const outside = `${prefix}${lease.body.endValue + 1000}`;
    const rejected = await push(deviceB, [saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '1', docNumber: outside }))]);
    expect(rejected.body.outcomes[0].status).toBe('rejected');
    expect(JSON.stringify(rejected.body.outcomes[0])).toContain('lease');

    // a different device cannot use device A's lease either
    const stolen = await push(deviceB, [saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '1', docNumber: `${prefix}${lease.body.startValue}` }))]);
    expect(stolen.body.outcomes[0].status).toBe('rejected');
  });

  it('idempotencyKey dedupe: a different eventId with a retried idempotency key is a duplicate', async () => {
    // fresh stock: this test must not depend on the oversell bookkeeping above
    const topUp = await request(app.getHttpServer()).post('/api/stock-adjustments').set(owner).send({
      warehouseId: whA,
      reason: 'test stock top-up for dedupe case',
      lines: [{ productId: productA, quantityBase: '10' }],
    });
    expect(topUp.status).toBe(201);

    const clientDocId = randomUUID();
    const payload = salePayload({ warehouseId: whA, productId: productA, quantity: '1', clientDocId });
    const key = `dup-key-${randomUUID()}`;
    const first = await push(deviceA, [{ ...saleEvent(payload), idempotencyKey: key }]);
    expect(first.body.outcomes[0].status).toBe('applied');
    // a retried key with the SAME payload (new event id) replays the original
    // result — one document ever
    const second = await push(deviceA, [{ ...saleEvent(payload), idempotencyKey: key }]);
    expect(second.body.outcomes[0].status).toBe('duplicate');
    // Phase 3 hardening (finding #5): the same key carrying a DIFFERENT
    // payload is a reuse conflict — never a silent second application
    const third = await push(deviceA, [{ ...saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '1', clientDocId: randomUUID() })), idempotencyKey: key }]);
    expect(third.body.outcomes[0].status).toBe('conflict');
    expect(third.body.outcomes[0].code).toBe('idempotency_key_reuse');
    expect(await invoiceCount(clientDocId)).toBe(1);
  });

  it('pull is resumable: cursor advances, entries only move forward', async () => {
    const first = await request(app.getHttpServer()).get('/api/sync/pull?limit=3').set(cashier);
    expect(first.status).toBe(200);
    expect(first.body.entries.length).toBeLessThanOrEqual(3);
    expect(first.body.hasMore).toBe(true);

    const second = await request(app.getHttpServer())
      .get(`/api/sync/pull?limit=3&cursor=${first.body.cursor}`).set(cashier);
    expect(second.status).toBe(200);
    const seen = new Set(first.body.entries.map((e: { id: string }) => e.id));
    for (const e of second.body.entries as Array<{ id: string }>) {
      expect(seen.has(e.id)).toBe(false);
    }
  });

  /* ---- FINAL-REVIEW BLOCKER #1: true idempotency CONCURRENCY ------------
   *
   * Every race below fires GENUINE simultaneous HTTP pushes (Promise.all →
   * two real PG transactions contending for the same registry identity).
   * The advisory-lock claim must serialize them at the transaction boundary
   * so exactly one application wins and the loser gets the DETERMINISTIC
   * idempotency outcome — never a raw 23505, never a generic error. */

  it('CONCURRENT same idempotency key + same payload: ONE application, both callers converge on the same result', async () => {
    const clientDocId = randomUUID();
    const key = `race-same-payload-${randomUUID()}`;
    // ONE frozen payload object — a genuine device replay is byte-identical,
    // so the two deliveries' fingerprints must match EXACTLY (a fresh
    // occurredAt per call would make them differ and flip the expected
    // duplicate into a key-reuse conflict)
    const payload = salePayload({ warehouseId: whA, productId: productB, clientDocId });
    const evX = saleEvent(payload, randomUUID(), key);
    const evY = saleEvent(payload, randomUUID(), key);

    const [rX, rY] = await Promise.all([push(deviceA, [evX]), push(deviceB, [evY])]);
    expectDeterministicOutcomes([rX, rY]);

    const statuses = [rX.body.outcomes[0].status, rY.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'duplicate']);
    const applied = rX.body.outcomes[0].status === 'applied' ? rX.body.outcomes[0] : rY.body.outcomes[0];
    const duplicate = rX.body.outcomes[0].status === 'duplicate' ? rX.body.outcomes[0] : rY.body.outcomes[0];
    // both callers converge on the SAME logical result: the loser replays
    // the winner's stored response verbatim (same invoice, same code)
    expect(duplicate.result).toEqual(applied.result);
    expect(duplicate.result.invoiceId).toBe(applied.result.invoiceId);

    // exactly ONE financial effect ever commits
    expect(await invoiceCount(clientDocId)).toBe(1);
    expect(await registryCountByKey(key)).toBe(1);
  });

  it('CONCURRENT same eventId + same payload: one application, the replay converges on the original result', async () => {
    const clientDocId = randomUUID();
    const eventId = randomUUID();
    const key = `race-same-event-${randomUUID()}`;
    // the IDENTICAL event delivered twice simultaneously (both registry
    // identities collide: event id AND idempotency key); one frozen payload
    // keeps the fingerprints identical, as a real replay would be
    const payload = salePayload({ warehouseId: whA, productId: productB, clientDocId });
    const event = () => saleEvent(payload, eventId, key);

    const [rX, rY] = await Promise.all([push(deviceA, [event()]), push(deviceB, [event()])]);
    expectDeterministicOutcomes([rX, rY]);

    const statuses = [rX.body.outcomes[0].status, rY.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'duplicate']);
    const applied = rX.body.outcomes[0].status === 'applied' ? rX.body.outcomes[0] : rY.body.outcomes[0];
    const duplicate = rX.body.outcomes[0].status === 'duplicate' ? rX.body.outcomes[0] : rY.body.outcomes[0];
    expect(duplicate.result).toEqual(applied.result);

    expect(await invoiceCount(clientDocId)).toBe(1);
    expect(await registryCountByEvent(eventId)).toBe(1);
  });

  it('CONCURRENT same key + DIFFERENT amount: exactly one effect commits, the loser gets idempotency_key_reuse', async () => {
    const key = `race-diff-amount-${randomUUID()}`;
    const docSmall = randomUUID();
    const docLarge = randomUUID();
    // same key, different business amount (quantity 1 vs 3 → total 50 vs 150)
    const evSmall = saleEvent(salePayload({ warehouseId: whA, productId: productB, quantity: '1', clientDocId: docSmall }), randomUUID(), key);
    const evLarge = saleEvent(salePayload({ warehouseId: whA, productId: productB, quantity: '3', clientDocId: docLarge }), randomUUID(), key);

    const [rS, rL] = await Promise.all([push(deviceA, [evSmall]), push(deviceB, [evLarge])]);
    expectDeterministicOutcomes([rS, rL]);

    const statuses = [rS.body.outcomes[0].status, rL.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'conflict']);
    const reuse = rS.body.outcomes[0].status === 'conflict' ? rS.body.outcomes[0] : rL.body.outcomes[0];
    expect(reuse.code).toBe('idempotency_key_reuse');

    // exactly ONE invoice commits and it belongs to the WINNING payload
    expect((await invoiceCount(docSmall)) + (await invoiceCount(docLarge))).toBe(1);
    if ((await invoiceCount(docSmall)) === 1) {
      const inv = await fx.admin.query(`SELECT total FROM invoice WHERE client_doc_id = $1`, [docSmall]);
      expect(inv.rows[0].total).toBe('50.0000');
    } else {
      const inv = await fx.admin.query(`SELECT total FROM invoice WHERE client_doc_id = $1`, [docLarge]);
      expect(inv.rows[0].total).toBe('150.0000');
    }
    expect(await registryCountByKey(key)).toBe(1);
  });

  it('CONCURRENT same key + DIFFERENT product: exactly one effect commits, the loser gets idempotency_key_reuse', async () => {
    const key = `race-diff-product-${randomUUID()}`;
    const docA = randomUUID();
    const docB = randomUUID();
    const evA = saleEvent(salePayload({ warehouseId: whA, productId: productA, clientDocId: docA }), randomUUID(), key);
    const evB = saleEvent(salePayload({ warehouseId: whA, productId: productB, clientDocId: docB }), randomUUID(), key);

    const [rA, rB] = await Promise.all([push(deviceA, [evA]), push(deviceB, [evB])]);
    expectDeterministicOutcomes([rA, rB]);

    const statuses = [rA.body.outcomes[0].status, rB.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'conflict']);
    const reuse = rA.body.outcomes[0].status === 'conflict' ? rA.body.outcomes[0] : rB.body.outcomes[0];
    expect(reuse.code).toBe('idempotency_key_reuse');

    expect((await invoiceCount(docA)) + (await invoiceCount(docB))).toBe(1);
    expect(await registryCountByKey(key)).toBe(1);
  });

  it('CONCURRENT same key + DIFFERENT event type (sale.create vs payment.receive): exactly one effect commits, the loser gets idempotency_key_reuse', async () => {
    // a pre-existing UNPAID credit invoice the payment event can settle
    const preDoc = randomUUID();
    const pre = await request(app.getHttpServer()).post('/api/sales/commit').set(cashier).send({
      warehouseId: whA,
      customerId: customerC,
      lines: [{ productId: productB, quantityBase: '1', unitPrice: '50.00' }],
      tenders: [],
      clientDocId: preDoc,
    });
    expect(pre.status).toBe(201);
    const unpaidInvoiceId = pre.body.invoice.id as string;

    const key = `race-diff-type-${randomUUID()}`;
    const saleDoc = randomUUID();
    const saleEv = saleEvent(salePayload({ warehouseId: whA, productId: productB, clientDocId: saleDoc }), randomUUID(), key);
    const payEv = {
      eventId: randomUUID(),
      idempotencyKey: key,
      type: 'payment.receive',
      payload: {
        customerId: customerC,
        invoiceId: unpaidInvoiceId,
        amount: '50.00',
        tenders: [{ method: 'cash', amount: '50.00' }],
      },
      occurredAt: new Date().toISOString(),
    };

    const [rSale, rPay] = await Promise.all([push(deviceA, [saleEv]), push(deviceB, [payEv])]);
    expectDeterministicOutcomes([rSale, rPay]);

    const statuses = [rSale.body.outcomes[0].status, rPay.body.outcomes[0].status].sort();
    expect(statuses).toEqual(['applied', 'conflict']);
    const reuse = rSale.body.outcomes[0].status === 'conflict' ? rSale.body.outcomes[0] : rPay.body.outcomes[0];
    expect(reuse.code).toBe('idempotency_key_reuse');

    // exactly ONE business effect: EITHER the new sale invoice OR the
    // payment on the pre-existing invoice — never both, never neither
    const saleApplied = (await invoiceCount(saleDoc)) === 1;
    const payCount = await fx.admin.query(
      `SELECT count(*)::int AS n FROM payment_allocation WHERE invoice_id = $1`, [unpaidInvoiceId],
    );
    const payApplied = (payCount.rows[0].n as number) === 1;
    expect(saleApplied !== payApplied).toBe(true); // XOR
    expect(await registryCountByKey(key)).toBe(1);
  });

  it('crash AFTER claim, writes and registration but BEFORE COMMIT: nothing is durable', async () => {
    const clientDocId = randomUUID();
    const eventId = randomUUID();
    const key = `race-crash-${randomUUID()}`;
    const doomed = saleEvent(
      salePayload({ warehouseId: whA, productId: productB, clientDocId, simulateCrashBeforeCommit: true }),
      eventId,
      key,
    );

    const res = await push(deviceA, [doomed]);
    // a crash is an INTERNAL failure by contract: the HTTP push still
    // answers 201 with a retryable `rejected` outcome (crash-safety), and
    // crucially it is the INJECTED crash — not a raw 23505/unique leak
    expect(res.status).toBe(201);
    expect(res.body.outcomes[0].status).toBe('rejected');
    expect(JSON.stringify(res.body.outcomes[0])).not.toMatch(/23505|unique constraint|duplicate key/i);
    expect(res.body.outcomes[0].message).toContain('simulated crash');
    expect(await invoiceCount(clientDocId)).toBe(0);
    expect(await registryCountByEvent(eventId)).toBe(0);
    expect(await registryCountByKey(key)).toBe(0);
  });

  it('retry after the crashed transaction applies EXACTLY once (then replays as duplicate)', async () => {
    const clientDocId = randomUUID();
    const eventId = randomUUID();
    const key = `race-crash-retry-${randomUUID()}`;
    const crash = saleEvent(
      salePayload({ warehouseId: whA, productId: productB, clientDocId, simulateCrashBeforeCommit: true }),
      eventId,
      key,
    );
    expect((await push(deviceA, [crash])).body.outcomes[0].status).toBe('rejected');

    // the device retries the SAME event after the crash — clean payload
    const retry = saleEvent(salePayload({ warehouseId: whA, productId: productB, clientDocId }), eventId, key);
    const applied = await push(deviceA, [retry]);
    expectDeterministicOutcomes([applied]);
    expect(applied.body.outcomes[0].status).toBe('applied');
    expect(await invoiceCount(clientDocId)).toBe(1);
    expect(await registryCountByEvent(eventId)).toBe(1);

    // and a subsequent replay of the identical delivery converges
    const replay = await push(deviceA, [retry]);
    expectDeterministicOutcomes([replay]);
    expect(replay.body.outcomes[0].status).toBe('duplicate');
    expect(replay.body.outcomes[0].result).toEqual(applied.body.outcomes[0].result);
    expect(await invoiceCount(clientDocId)).toBe(1);
    expect(await registryCountByEvent(eventId)).toBe(1);
  });
});
