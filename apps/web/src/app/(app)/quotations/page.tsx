'use client';

/**
 * Quotations workbench (Phase 6 parity — closes the legacy gap: the quotation
 * LIST/management UI; printing already existed at /print/quotation/[id]).
 *
 * The state machine mirrors packages/domain/src/sales.ts exactly:
 *   draft → issued | cancelled
 *   issued → accepted | rejected | expired | cancelled
 *   accepted → converted | cancelled
 * The API enforces every transition anyway — the UI only OFFERS legal
 * actions so users are not invited into 400s.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { ListDto, QuotationDto } from '../../../lib/types';
import { cedi2dp } from '@idepot/print-templates';

interface CustomerDtoLite { id: string; name: string; phone: string }
interface ProductDtoLite { id: string; code: string; name: string; sellingPrice: string }
interface WarehouseDtoLite { id: string; code: string; name: string }

/** Actions each status offers (domain transition table). */
const ACTIONS: Record<QuotationDto['status'], string[]> = {
  draft: ['issue', 'cancel'],
  issued: ['accept', 'reject', 'expire', 'cancel'],
  accepted: ['convert', 'cancel'],
  rejected: [],
  expired: [],
  converted: [],
  cancelled: [],
};

export default function QuotationsPage() {
  const session = useSession();

  const [quotations, setQuotations] = useState<QuotationDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);
  const [products, setProducts] = useState<ProductDtoLite[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDtoLite[]>([]);

  // create form
  const [warehouseId, setWarehouseId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [lineProductId, setLineProductId] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; quantityBase: string; unitPrice: string }>>([]);

  // per-row transition input (reason for reject/cancel)
  const [reasonFor, setReasonFor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    const [q, c, p, w] = await Promise.all([
      apiFetch<ListDto<QuotationDto>>('/quotations', { token }),
      apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }),
      apiFetch<ListDto<ProductDtoLite>>('/products', { token }),
      apiFetch<ListDto<WarehouseDtoLite>>('/warehouses', { token }),
    ]);
    setQuotations(q.items);
    setCustomers(c.items as CustomerDtoLite[]);
    setProducts(p.items as ProductDtoLite[]);
    setWarehouses(w.items);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken).catch((err) => setError(apiErrorMessage(err)));
  }, [session, load]);

  async function act(fn: () => Promise<void>) {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await fn();
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const productMap = new Map(products.map((p) => [p.id, p] as const));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));

  async function transition(q: QuotationDto, action: string) {
    if (!session) return;
    const reason = reasonFor[q.id]?.trim();
    if ((action === 'reject' || action === 'cancel') && !reason) {
      setError(`${action} requires a reason`);
      return;
    }
    await act(async () => {
      if (action === 'convert') {
        const order = await apiFetch<{ code: string }>(`/quotations/${q.id}/convert`, {
          method: 'POST', token: session.accessToken,
        });
        setOkMsg(`quotation ${q.code} converted to order ${order.code}`);
      } else if (action === 'issue' || action === 'accept') {
        await apiFetch(`/quotations/${q.id}/${action}`, { method: 'POST', token: session.accessToken });
        setOkMsg(`quotation ${q.code} ${action === 'issue' ? 'issued' : 'accepted'}`);
      } else {
        await apiFetch(`/quotations/${q.id}/${action}`, {
          method: 'POST', token: session.accessToken,
          body: { reason },
        });
        setOkMsg(`quotation ${q.code} ${action}ed`);
        setReasonFor((prev) => ({ ...prev, [q.id]: '' }));
      }
    });
  }

  return (
    <div>
      <div className="page-head"><h1>Quotations</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      <section className="card">
        <h2>New quotation</h2>
        <div className="form-row">
          <select className="input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">— warehouse —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— customer (optional) —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
          </select>
          <input className="input input-sm" style={{ width: 150 }} type="date" value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)} title="valid until" />
          <input className="input" style={{ width: 220 }} placeholder="note (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="form-row">
          <select className="input" value={lineProductId} onChange={(e) => {
            setLineProductId(e.target.value);
            const p = productMap.get(e.target.value);
            if (p) setLinePrice(Number(p.sellingPrice).toFixed(2));
          }}>
            <option value="">— product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <input className="input input-sm" style={{ width: 90 }} placeholder="qty" value={lineQty}
            onChange={(e) => setLineQty(e.target.value)} />
          <input className="input input-sm" style={{ width: 110 }} placeholder="price" value={linePrice}
            onChange={(e) => setLinePrice(e.target.value)} />
          <button className="btn" type="button" disabled={!lineProductId}
            onClick={() => {
              setLines((prev) => [...prev, { productId: lineProductId, quantityBase: lineQty, unitPrice: linePrice }]);
              setLineProductId('');
              setLineQty('1');
              setLinePrice('');
            }}>+ line</button>
        </div>
        {lines.length > 0 && (
          <table className="table">
            <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th><th /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{productMap.get(l.productId)?.name ?? l.productId.slice(0, 8)}</td>
                  <td>{l.quantityBase}</td>
                  <td>{cedi2dp(l.unitPrice)}</td>
                  <td>{cedi2dp((Number(l.quantityBase) * Number(l.unitPrice)).toFixed(4))}</td>
                  <td><button className="btn btn-sm" type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="toolbar">
          <button className="btn btn-primary" type="button"
            disabled={busy || !warehouseId || lines.length === 0}
            onClick={() => void act(async () => {
              const res = await apiFetch<{ id: string; code: string }>('/quotations', {
                method: 'POST', token: session.accessToken,
                body: {
                  warehouseId,
                  customerId: customerId || undefined,
                  validUntil: validUntil || undefined,
                  note: note || undefined,
                  lines,
                },
              });
              setLines([]);
              setNote('');
              setValidUntil('');
              setOkMsg(`quotation ${res.code} created (draft)`);
            })}>Create quotation</button>
        </div>
      </section>

      <section className="card">
        <h2>All quotations</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Code</th><th>Customer</th><th style={{ textAlign: 'right' }}>Total</th>
              <th>Valid until</th><th>Status</th><th>Reason</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => {
              const actions = ACTIONS[q.status] ?? [];
              const needsReason = actions.includes('reject') || actions.includes('cancel');
              return (
                <tr key={q.id}>
                  <td>
                    <Link href={`/print/quotation/${q.id}`}>{q.code}</Link>
                    <div className="muted" style={{ fontSize: '0.85em' }}>
                      {warehouseMap.get(q.warehouseId)?.code ?? ''} · {q.createdAt.slice(0, 10)}
                    </div>
                  </td>
                  <td>{q.customerName ?? 'walk-in'}</td>
                  <td style={{ textAlign: 'right' }}>{cedi2dp(q.total)}</td>
                  <td>{q.validUntil ?? '—'}</td>
                  <td><span className={`badge badge-${q.status}`}>{q.status}</span></td>
                  <td className="muted" style={{ maxWidth: 180 }}>{q.statusReason ?? '—'}</td>
                  <td>
                    {needsReason && (
                      <input className="input input-sm" style={{ width: 160, marginBottom: 4 }}
                        placeholder="reason (required)" value={reasonFor[q.id] ?? ''}
                        onChange={(e) => setReasonFor((prev) => ({ ...prev, [q.id]: e.target.value }))} />
                    )}
                    <div className="toolbar">
                      {actions.map((action) => (
                        <button key={action} className="btn btn-sm" type="button" disabled={busy}
                          onClick={() => void transition(q, action)}>{action}</button>
                      ))}
                      <Link className="btn btn-sm" href={`/print/quotation/${q.id}`}>print</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {quotations.length === 0 && <p className="muted">No quotations yet.</p>}
      </section>
    </div>
  );
}
