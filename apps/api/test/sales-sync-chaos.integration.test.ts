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
  let deviceA: string;
  let deviceB: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function salePayload(opts: {
    warehouseId: string;
    productId: string;
    quantity?: string;
    clientDocId?: string;
    docNumber?: string;
    simulateFailure?: boolean;
  }): Record<string, unknown> {
    return {
      warehouseId: opts.warehouseId,
      lines: [{ productId: opts.productId, quantityBase: opts.quantity ?? '1', unitPrice: '50.00' }],
      tenders: [{ method: 'cash', amount: '50.00' }],
      clientDocId: opts.clientDocId ?? randomUUID(),
      docNumber: opts.docNumber ?? null,
      occurredAt: new Date().toISOString(),
      ...(opts.simulateFailure ? { simulateFailureAfterWrites: true } : {}),
    };
  }

  function saleEvent(payload: Record<string, unknown>, eventId = randomUUID()): Record<string, unknown> {
    return {
      eventId,
      idempotencyKey: `offline-${eventId}`,
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

  beforeAll(async () => {
    fx = await createApiFixture();
    app = fx.app;
    owner = auth(fx.tenantA.users.owner!.token!);
    cashier = auth(fx.tenantA.users.cashier!.token!);

    whA = (await request(app.getHttpServer()).post('/api/warehouses').set(owner).send({ code: 'SYNC-WH', name: 'Sync WH' })).body.id;
    unitPc = (await request(app.getHttpServer()).post('/api/units').set(owner).send({ code: 'PCS', name: 'Pieces' })).body.id;
    productA = (await request(app.getHttpServer()).post('/api/products').set(owner).send({ code: 'SYNC-A', name: 'Sync Product A', baseUnitId: unitPc, sellingPrice: '50.00' })).body.id;
    deviceA = (await request(app.getHttpServer()).post('/api/auth/devices').set(cashier).send({ deviceCode: 'POS-TERMINAL-A', platform: 'web' })).body.id;
    deviceB = (await request(app.getHttpServer()).post('/api/auth/devices').set(cashier).send({ deviceCode: 'POS-TERMINAL-B', platform: 'web' })).body.id;
    expect(deviceA).toBeTruthy();
    expect(deviceB).toBeTruthy();

    const opening = await request(app.getHttpServer()).post('/api/inventory/opening-stock').set(owner).send({
      warehouseId: whA,
      authority: 'physical_count',
      lines: [{ productId: productA, quantityBase: '10' }],
    });
    expect(opening.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await fx.close();
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
    const second = await push(deviceA, [{ ...saleEvent(salePayload({ warehouseId: whA, productId: productA, quantity: '1', clientDocId: randomUUID() })), idempotencyKey: key }]);
    expect(second.body.outcomes[0].status).toBe('duplicate');
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
});
