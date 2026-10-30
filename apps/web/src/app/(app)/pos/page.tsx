'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useReferenceData } from '../../../lib/use-reference';
import { enqueueSale, listQueuedSales, randomUuid, removeQueuedSale, updateQueuedSale, type QueuedSale } from '../../../lib/offline-outbox';
import { ensureDeviceId } from '../../../lib/device';
import type { ListDto } from '../../../lib/types';

/**
 * POS (keyboard-first, offline-first). Master prompt §9 UX + offline-sync §9:
 * product search by name/SKU/barcode without the mouse, quantity/price fast
 * edit, split tenders, change due prominent.
 *
 * Offline: when the commit cannot reach the API, the sale is captured into
 * the IndexedDB outbox (locally committed identity: clientDocId) and drained
 * on reconnect. The status indicator is unmistakable but non-disruptive.
 * Global correctness (stock availability etc.) is only established at sync —
 * a conflicted offline sale comes back as an explicit review outcome.
 */

interface CartLine {
  key: string;
  productId: string;
  code: string;
  name: string;
  quantity: string;
  unitPrice: string;
}

interface TenderRow {
  method: 'cash' | 'momo' | 'cheque' | 'bank_transfer';
  amount: string;
  detail: string;
}

interface CustomerDtoLite {
  id: string;
  name: string;
  phone: string;
}

function money(n: number): string {
  return n.toFixed(2);
}

export default function PosPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [warehouseId, setWarehouseId] = useState('');
  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('0.00');
  const [tenders, setTenders] = useState<TenderRow[]>([{ method: 'cash', amount: '', detail: '' }]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ invoiceId: string; code: string } | null>(null);

  // offline state
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState<QueuedSale[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);
  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c] as const)), [customers]);

  const subtotal = cart.reduce((acc, l) => acc + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
  const total = Math.max(subtotal - Number(orderDiscount || 0), 0);
  const paid = tenders.reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const change = Math.max(paid - total, 0);
  const due = Math.max(total - paid, 0);

  const refreshQueued = useCallback(() => {
    void listQueuedSales().then(setQueued);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setWarehouseId((w) => w || warehouses[0]?.id || '');
    const token = session.accessToken;
    void apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }).then(
      (r) => setCustomers(r.items as CustomerDtoLite[]),
      () => undefined,
    );
    void ensureDeviceId(session).then(setDeviceId).catch(() => undefined);
    refreshQueued();
  }, [session, warehouses, refreshQueued]);

  /** Drain the outbox: one POST per queued event; the outcome decides removal.
   *  Applied/duplicate → removed; conflict/rejected → kept with the reason
   *  surfaced (financial conflicts are never silently resolved). */
  const drainOutbox = useCallback(async () => {
    if (!session || !deviceId) return;
    const items = await listQueuedSales();
    for (const item of items) {
      try {
        const res = await apiFetch<{ outcomes: Array<{ eventId: string; status: string; message?: string }> }>('/sync/push', {
          method: 'POST',
          token: session.accessToken,
          body: {
            deviceId,
            events: [
              {
                eventId: item.eventId,
                idempotencyKey: item.idempotencyKey,
                type: 'sale.create',
                payload: item.payload,
                occurredAt: item.capturedAt,
              },
            ],
          },
        });
        const outcome = res.outcomes[0];
        if (outcome && (outcome.status === 'applied' || outcome.status === 'duplicate')) {
          await removeQueuedSale(item.eventId);
          setSyncMsg(`synced offline sale (${outcome.status})`);
        } else if (outcome && outcome.status === 'conflict') {
          await updateQueuedSale({
            ...item,
            lastError: `${outcome.status}: ${outcome.message ?? 'review required'}`,
            attempts: item.attempts + 1,
          });
          setSyncMsg(`offline sale needs review: ${outcome.message ?? outcome.status}`);
        } else {
          await updateQueuedSale({ ...item, lastError: outcome?.message ?? 'rejected', attempts: item.attempts + 1 });
          setSyncMsg(`offline sale rejected: ${outcome?.message ?? ''}`);
        }
      } catch (err) {
        // still offline or server unreachable — keep queued and stop draining
        await updateQueuedSale({ ...item, lastError: apiErrorMessage(err), attempts: item.attempts + 1 });
        break;
      }
    }
    refreshQueued();
  }, [session, deviceId, refreshQueued]);

  useEffect(() => {
    if (online && session && deviceId && queued.length > 0) void drainOutbox();
    // drain on (re)connect; queued.length intentionally not a trigger
  }, [online, deviceId]);

  function addProduct(productId: string) {
    const p = productMap.get(productId);
    if (!p) return;
    setError('');
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: String(Number(l.quantity) + 1) } : l,
        );
      }
      return [
        ...prev,
        {
          key: randomUuid(),
          productId,
          code: p.code,
          name: p.name,
          quantity: '1',
          unitPrice: Number(p.sellingPrice).toFixed(2),
        },
      ];
    });
    setSearch('');
    searchRef.current?.focus();
  }

  function filteredProducts() {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }

  /** keyboard-first: Enter in the search box adds an exact code match or the
   *  first filtered result — a scanner wedge behaves like typed input. */
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((p) => p.code.toLowerCase() === q);
    const first = (exact ? [exact] : filteredProducts())[0];
    if (first) addProduct(first.id);
  }

  function buildCommitPayload(clientDocId: string) {
    return {
      warehouseId,
      customerId: customerId || null,
      orderDiscount: orderDiscount || '0.00',
      note: note || null,
      lines: cart.map((l) => ({ productId: l.productId, quantityBase: l.quantity, unitPrice: l.unitPrice })),
      tenders: paid > 0
        ? tenders
            .filter((t) => Number(t.amount) > 0)
            .map((t) => ({
              method: t.method,
              amount: t.amount,
              ...(t.method === 'momo' && t.detail ? { momoProvider: 'MTN', momoPhone: t.detail } : {}),
              ...(t.method === 'cheque' && t.detail ? { chequeBank: t.detail, chequeNumber: t.detail } : {}),
              ...(t.method === 'bank_transfer' && t.detail ? { reference: t.detail } : {}),
            }))
        : [],
      clientDocId,
      ...(!online ? { occurredAt: new Date().toISOString() } : {}),
    };
  }

  function validate(): string {
    if (!warehouseId) return 'choose a warehouse';
    if (cart.length === 0) return 'the cart is empty';
    if (due > 0.0049 && !customerId) return 'a credit sale (unpaid part) requires a customer';
    return '';
  }

  function clearCart() {
    setCart([]);
    setTenders([{ method: 'cash', amount: '', detail: '' }]);
    setOrderDiscount('0.00');
    setNote('');
  }

  async function commit() {
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    setError('');
    setReceipt(null);
    const clientDocId = randomUuid();
    const payload = buildCommitPayload(clientDocId);
    try {
      const inv = await apiFetch<{ invoice: { id: string; code: string } }>('/sales/commit', {
        method: 'POST',
        token: session!.accessToken,
        body: payload,
      });
      setReceipt({ invoiceId: inv.invoice.id, code: inv.invoice.code });
      clearCart();
    } catch (err) {
      const apiErr = err as { status: number };
      if (apiErr.status === 0) {
        // OFFLINE CAPTURE: local commit with the same payload identity
        const eventId = randomUuid();
        await enqueueSale({
          eventId,
          idempotencyKey: `offline-${eventId}`,
          payload,
          capturedAt: new Date().toISOString(),
        });
        refreshQueued();
        clearCart();
        setSyncMsg('sale captured offline — will sync when the connection returns');
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const statusLabel = !online
    ? `Offline — ${queued.length} queued`
    : queued.length > 0
      ? `Syncing… ${queued.length} pending`
      : 'Online';

  return (
    <div>
      <div className="page-head">
        <h1>POS</h1>
        <div className="toolbar">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </select>
          <span className={`pos-status ${!online || queued.length > 0 ? 'pos-status-warn' : ''}`}>{statusLabel}</span>
          {queued.length > 0 && online && (
            <button className="btn" type="button" onClick={() => void drainOutbox()}>Sync now</button>
          )}
        </div>
      </div>
      {syncMsg && <p className="muted">{syncMsg}</p>}
      {refError && <p className="error">{refError}</p>}
      {error && <p className="error">{error}</p>}
      {receipt && (
        <p className="muted">
          Sale committed <strong>{receipt.code}</strong> —{' '}
          <a href={`/print/receipt/${receipt.invoiceId}`} target="_blank" rel="noreferrer">print receipt</a>
        </p>
      )}

      <div className="pos-grid">
        <section className="card">
          <h2>Items</h2>
          <input
            ref={searchRef}
            className="input"
            placeholder="Scan barcode or search name/SKU — Enter adds"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            autoFocus
          />
          <div className="pos-tiles">
            {filteredProducts().map((p) => (
              <button key={p.id} type="button" className="pos-tile" onClick={() => addProduct(p.id)}>
                <div className="pos-tile-code">{p.code}</div>
                <div>{p.name}</div>
                <div className="muted">{Number(p.sellingPrice).toFixed(2)}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Cart</h2>
          {cart.length === 0 && <p className="muted">No lines. Scan or pick an item.</p>}
          {cart.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th><th /></tr>
              </thead>
              <tbody>
                {cart.map((l) => (
                  <tr key={l.key}>
                    <td>{l.code} · {l.name}</td>
                    <td>
                      <input
                        className="input input-sm" value={l.quantity}
                        onChange={(e) => setCart((prev) => prev.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <input
                        className="input input-sm" value={l.unitPrice}
                        onChange={(e) => setCart((prev) => prev.map((x) => (x.key === l.key ? { ...x, unitPrice: e.target.value } : x)))}
                      />
                    </td>
                    <td>{(Number(l.quantity || 0) * Number(l.unitPrice || 0)).toFixed(2)}</td>
                    <td>
                      <button className="btn btn-sm" type="button" onClick={() => setCart((prev) => prev.filter((x) => x.key !== l.key))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="pos-totals">
            <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
            <div>
              <span>Order discount</span>
              <input className="input input-sm" style={{ width: 110, textAlign: 'right' }} value={orderDiscount}
                onChange={(e) => setOrderDiscount(e.target.value)} />
            </div>
            <div><span>Total</span><strong className="pos-total">{money(total)}</strong></div>
          </div>

          <div className="pos-tenders">
            <h3>Tenders</h3>
            {tenders.map((t, i) => (
              <div className="pos-tender-row" key={i}>
                <select
                  className="input input-sm"
                  value={t.method}
                  onChange={(e) => setTenders((prev) => prev.map((x, j) => (j === i ? { ...x, method: e.target.value as TenderRow['method'] } : x)))}
                >
                  <option value="cash">Cash</option>
                  <option value="momo">MoMo</option>
                  <option value="cheque">Cheque</option>
                  <option value="bank_transfer">Bank transfer</option>
                </select>
                <input
                  className="input input-sm" placeholder="amount" value={t.amount}
                  onChange={(e) => setTenders((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
                <input
                  className="input input-sm" placeholder={t.method === 'momo' ? 'phone / ref' : t.method === 'cheque' ? 'bank / cheque no' : 'reference'}
                  value={t.detail}
                  onChange={(e) => setTenders((prev) => prev.map((x, j) => (j === i ? { ...x, detail: e.target.value } : x)))}
                />
                {tenders.length > 1 && (
                  <button className="btn btn-sm" type="button" onClick={() => setTenders((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                )}
              </div>
            ))}
            <button className="btn btn-sm" type="button" onClick={() => setTenders((prev) => [...prev, { method: 'cash', amount: '', detail: '' }])}>
              + split tender
            </button>
          </div>

          <div className="pos-totals">
            <div><span>Paid</span><strong>{money(paid)}</strong></div>
            <div><span>Change due</span><strong>{money(change)}</strong></div>
            <div><span>Still due (credit)</span><strong>{money(due)}</strong></div>
          </div>

          <div className="form-row">
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in (no customer)</option>
              {[...customerMap.values()].map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
              ))}
            </select>
            <input className="input" placeholder="note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="toolbar">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void commit()}>
              {busy ? 'Committing…' : `Charge ${money(total)}${!online ? ' (offline capture)' : ''}`}
            </button>
          </div>
        </section>
      </div>

      {queued.length > 0 && (
        <section className="card">
          <h2>Offline outbox ({queued.length})</h2>
          <table className="table">
            <thead><tr><th>Captured</th><th>Lines</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {queued.map((q) => {
                const lines = (q.payload as { lines?: Array<{ quantity: string; unitPrice: string }> }).lines ?? [];
                const qTotal = lines.reduce((a, l) => a + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
                return (
                  <tr key={q.eventId}>
                    <td>{new Date(q.capturedAt).toLocaleString()}</td>
                    <td>{lines.length}</td>
                    <td>{money(qTotal)}</td>
                    <td className={q.lastError ? 'error' : 'muted'}>{q.lastError ?? 'queued'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
