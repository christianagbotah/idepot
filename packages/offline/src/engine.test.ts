/**
 * Offline engine core tests (Phase 6 B3): transactional outbox, idempotent
 * push with backoff, explicit conflict queue (never dropped), resumable
 * pull with cursor checkpointing, and crash-safety of local capture.
 *
 * These are ENGINE tests (in-memory storage + scripted transport). The
 * end-to-end device↔server suites live in apps/api/test/sales-sync-* and the
 * 50-terminal chaos benchmark (benchmarks/offline-chaos) drives the same
 * engine against real PostgreSQL.
 */
import { describe, it, expect } from 'vitest';
import { OfflineEngine, InMemoryOfflineStorage, type SyncTransport } from './engine.js';

/** Scripted transport: canned outcomes + call log. */
class FakeTransport implements SyncTransport {
  pushed: unknown[][] = [];
  pulls: Array<{ cursor: string | null }> = [];
  /** per-call outcome factories */
  nextOutcomes: Array<Array<{ eventId: string; status: string; code?: string; message?: string }>> = [];
  pages: Array<{ entries: Array<{ id: string; type: string; payload: Record<string, unknown>; occurredAt: string }>; cursor: string | null; hasMore: boolean }> = [];

  push(deviceId: string, events: Array<{ eventId: string }>) {
    this.pushed.push([deviceId, events]);
    const outcomes = this.nextOutcomes.shift() ?? events.map((e) => ({ eventId: e.eventId, status: 'applied' }));
    return Promise.resolve(outcomes);
  }

  pull(cursor: string | null) {
    this.pulls.push({ cursor });
    const page = this.pages.shift() ?? { entries: [], cursor, hasMore: false };
    return Promise.resolve(page);
  }
}

const engineOpts = (transport: SyncTransport, opts?: Partial<ConstructorParameters<typeof OfflineEngine>[0]>) => ({
  deviceId: 'device-1',
  storage: new InMemoryOfflineStorage(),
  transport,
  backoffBaseMs: 1,
  jitter: 0,
  sleep: async () => {},
  ...opts,
});

const sale = (n: number) => ({
  localId: `local-${n}`,
  eventId: `00000000-0000-4000-8000-00000000000${n}`,
  idempotencyKey: `sale-key-${n}`,
  docNumber: `INV-OFF-${n}`,
  draft: { warehouseId: 'w1', lines: [{ productId: 'p1', quantityBase: '1', unitPrice: '50.00' }], tenders: [{ method: 'cash', amount: '50.00' }] },
});

describe('local capture is transactional (offline-sync §4.1)', () => {
  it('captures the local sale AND its outbox event atomically', () => {
    const e = new OfflineEngine(engineOpts(new FakeTransport()));
    e.captureSale(sale(1));
    expect(e.listOutbox()).toHaveLength(1);
    expect(e.status().pending).toBe(1);
  });

  it('a capture failure rolls BOTH back (no orphan draft without outbox)', () => {
    const e = new OfflineEngine(engineOpts(new FakeTransport()));
    e.captureSale({ ...sale(1), eventId: '00000000-0000-4000-8000-0000000000aa', idempotencyKey: 'k-1' });
    const before = e.listOutbox().length;
    // same localId → the local_sales INSERT fails INSIDE the transaction →
    // the paired outbox row must roll back too
    expect(() =>
      e.captureSale({ ...sale(1), eventId: '00000000-0000-4000-8000-0000000000bb', idempotencyKey: 'k-2' }),
    ).toThrow();
    expect(e.listOutbox()).toHaveLength(before);
  });
});

describe('push: idempotent, ordered, conflict-queueing', () => {
  it('pushes pending events FIFO and clears them on applied', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine(engineOpts(t));
    e.captureSale(sale(1));
    e.captureSale(sale(2));
    const r = await e.pushAll();
    expect(r).toEqual({ pushed: 2, conflicts: 0, rejected: 0 });
    expect(e.status().pending).toBe(0);
    expect(t.pushed).toHaveLength(2);
    // dependency order: occurred_at ascending
    const order = (t.pushed[0]![1] as Array<{ eventId: string }>)[0]!.eventId;
    expect(order).toBe(sale(1).eventId);
  });

  it('duplicate outcomes are successes (idempotent redelivery after crash)', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine(engineOpts(t));
    e.captureSale(sale(1));
    t.nextOutcomes.push([{ eventId: sale(1).eventId, status: 'duplicate' }]);
    const r = await e.pushAll();
    expect(r.pushed).toBe(1);
    expect(e.status().pending).toBe(0);
  });

  it('conflicts land in the explicit review queue with full context — never dropped', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine(engineOpts(t));
    e.captureSale(sale(1));
    t.nextOutcomes.push([{ eventId: sale(1).eventId, status: 'conflict', code: 'stock_oversold', message: 'insufficient stock' }]);
    const r = await e.pushAll();
    expect(r.conflicts).toBe(1);
    const conflicts = e.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe('stock_oversold');
    expect(conflicts[0]!.payload).toEqual(sale(1).draft);
    // resolving = explicit discard; re-capture is a NEW document
    e.discardConflict(conflicts[0]!.eventId);
    expect(e.listConflicts()).toHaveLength(0);
  });

  it('rejected (validation) outcomes are terminal — no retry storm', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine(engineOpts(t));
    e.captureSale(sale(1));
    t.nextOutcomes.push([{ eventId: sale(1).eventId, status: 'rejected', code: 'stale_price', message: 'reload' }]);
    const r = await e.pushAll();
    expect(r.rejected).toBe(1);
    expect(t.pushed).toHaveLength(1); // NOT retried
  });

  it('transient network failures retry with backoff until applied', async () => {
    const t = new FakeTransport();
    const sleeps: number[] = [];
    const e = new OfflineEngine({
      ...engineOpts(t),
      backoffBaseMs: 4,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    e.captureSale(sale(1));
    // first two pushes throw (network down), third succeeds
    const origPush = t.push.bind(t);
    let calls = 0;
    t.push = (deviceId, events) => {
      calls++;
      if (calls <= 2) return Promise.reject(new Error('network unreachable'));
      return origPush(deviceId, events);
    };
    const r = await e.pushAll();
    expect(r.pushed).toBe(1);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([4, 8]); // exponential, jitter 0
    expect(e.status().pending).toBe(0);
  });

  it('exhausted retries mark the event rejected with the last error', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine({ ...engineOpts(t), maxAttempts: 3 });
    e.captureSale(sale(1));
    t.push = () => Promise.reject(new Error('network unreachable'));
    const r = await e.pushAll();
    expect(r.rejected).toBe(1);
    const [ev] = e.listOutbox();
    expect(ev!.status).toBe('rejected');
    expect(ev!.lastError).toBe('network unreachable');
    expect(ev!.attempts).toBe(3);
  });
});

describe('pull: resumable, checkpointed, projecting', () => {
  it('pages the change feed, checkpoints after EVERY page, projects entries', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine({
      ...engineOpts(t),
      projectors: {
        'product.updated': (payload, storage) => {
          storage.exec(
            `INSERT INTO replica_products (id, code, name, unit_id, selling_price, purchase_price, barcode, version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [payload.id, payload.code, payload.name, payload.unitId, payload.sellingPrice, payload.purchasePrice, payload.barcode, 'v1'],
          );
        },
      },
    });
    t.pages = [
      { entries: [{ id: 'e1', type: 'product.updated', payload: { id: 'p1', code: 'DEM-1', name: 'Cement', unitId: 'u1', sellingPrice: '95.0000', purchasePrice: '72.0000', barcode: null }, occurredAt: '2026-11-12T00:00:00Z' }], cursor: 'cursor-1', hasMore: true },
      { entries: [{ id: 'e2', type: 'product.updated', payload: { id: 'p2', code: 'DEM-2', name: 'Paint', unitId: 'u1', sellingPrice: '320.0000', purchasePrice: '240.0000', barcode: null }, occurredAt: '2026-11-12T00:01:00Z' }], cursor: 'cursor-2', hasMore: false },
    ];
    const r = await e.pullAll();
    expect(r.entries).toBe(2);
    expect(e.status().lastCursor).toBe('cursor-2');
    expect(t.pulls.map((p) => p.cursor)).toEqual([null, 'cursor-1']);
    const products = (e as unknown as { storage: { all: (s: string) => Array<Record<string, unknown>> } }).storage.all(`SELECT * FROM replica_products ORDER BY code`);
    expect(products.map((p) => p.name)).toEqual(['Cement', 'Paint']);
  });

  it('pull before push keeps the cursor independent of outbox state', async () => {
    const t = new FakeTransport();
    const e = new OfflineEngine(engineOpts(t));
    e.captureSale(sale(1));
    const r = await e.pullAll();
    expect(r.entries).toBe(0);
    expect(e.status()).toMatchObject({ pending: 1, conflicts: 0 });
  });
});

describe('crash safety', () => {
  it('a capture that throws mid-transaction leaves no partial state (rollback)', () => {
    const storage = new InMemoryOfflineStorage();
    // engine DDL applied
    const e = new OfflineEngine(engineOpts(new FakeTransport()));
    void e;
    storage.exec(`CREATE TABLE outbox (event_id TEXT, idempotency_key TEXT, type TEXT, payload TEXT, occurred_at TEXT, status TEXT, attempts INTEGER, last_error TEXT)`);
    expect(() =>
      storage.transaction(() => {
        storage.exec(`INSERT INTO outbox (event_id) VALUES (?)`, ['ev-1']);
        throw new Error('device killed mid-capture');
      }),
    ).toThrow('device killed mid-capture');
    expect(storage.all(`SELECT * FROM outbox`)).toHaveLength(0);
  });
});
