'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { ListDto } from '../../../lib/types';

interface OrderLineDto {
  id: string; productId: string; quantity: string; quantityBase: string;
  unitPrice: string; lineNet: string; fulfilledQuantityBase: string;
}
interface OrderDto {
  id: string; code: string; customerId: string | null; customerName: string | null;
  status: 'draft' | 'confirmed' | 'partially_fulfilled' | 'fulfilled' | 'closed' | 'cancelled';
  total: string; invoiceCode: string | null; lines: OrderLineDto[]; createdAt: string;
}
interface FulfillmentDto {
  id: string; code: string; salesOrderId: string; status: string; lines: Array<{ id: string; quantityBase: string }>;
}
interface CustomerDtoLite { id: string; name: string; phone: string }
interface ProductDtoLite { id: string; code: string; name: string; sellingPrice: string }

/** Quotations → sales orders → fulfillments (the delivery loop). Confirm
 *  posts the invoice (the financial step); waybills track the handover. */
export default function SalesOrdersPage() {
  const session = useSession();

  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [fulfillments, setFulfillments] = useState<FulfillmentDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);
  const [products, setProducts] = useState<ProductDtoLite[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [lineProductId, setLineProductId] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; quantityBase: string; unitPrice: string }>>([]);
  const [pickQty, setPickQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    const [o, c, p] = await Promise.all([
      apiFetch<ListDto<OrderDto>>('/sales-orders', { token }),
      apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }),
      apiFetch<ListDto<ProductDtoLite>>('/products', { token }),
    ]);
    setOrders(o.items);
    setCustomers(c.items as CustomerDtoLite[]);
    setProducts(p.items as ProductDtoLite[]);
    const f = await apiFetch<ListDto<FulfillmentDto>>('/fulfillments', { token });
    setFulfillments(f.items);
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

  return (
    <div>
      <div className="page-head"><h1>Sales orders & fulfillments</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      <section className="card">
        <h2>New sales order</h2>
        <div className="form-row">
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— customer —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
          </select>
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
          <input className="input input-sm" style={{ width: 90 }} placeholder="qty" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
          <input className="input input-sm" style={{ width: 110 }} placeholder="price" value={linePrice} onChange={(e) => setLinePrice(e.target.value)} />
          <button className="btn" type="button" disabled={!lineProductId}
            onClick={() => {
              if (!lineProductId) return;
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
                  <td>{l.unitPrice}</td>
                  <td>{(Number(l.quantityBase) * Number(l.unitPrice)).toFixed(2)}</td>
                  <td><button className="btn btn-sm" type="button" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="toolbar">
          <button className="btn btn-primary" type="button" disabled={busy || !customerId || lines.length === 0}
            onClick={() => void act(async () => {
              const res = await apiFetch<{ id: string; code: string }>('/sales-orders', {
                method: 'POST', token: session.accessToken,
                body: { customerId, lines },
              });
              setLines([]);
              setOkMsg(`order ${res.code} created (draft)`);
            })}>Create order</button>
        </div>
      </section>

      <section className="card">
        <h2>Orders</h2>
        <table className="table">
          <thead>
            <tr><th>Order</th><th>Customer</th><th style={{ textAlign: 'right' }}>Total</th>
              <th>Status</th><th>Invoice</th><th>Fulfillment</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const fulfillmentsForOrder = fulfillments.filter((f) => f.salesOrderId === o.id && f.status !== 'cancelled');
              return (
                <tr key={o.id}>
                  <td>{o.code}</td>
                  <td>{o.customerName ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{Number(o.total).toFixed(2)}</td>
                  <td><span className={`badge badge-${o.status}`}>{o.status}</span></td>
                  <td>{o.invoiceCode ?? '—'}</td>
                  <td>
                    {fulfillmentsForOrder.map((f) => <span key={f.id} className="muted" style={{ marginRight: 8 }}>{f.code}</span>)}
                    {o.status === 'confirmed' || o.status === 'partially_fulfilled' ? (
                      <div className="form-row" style={{ marginTop: 4 }}>
                        {o.lines.map((l) => {
                          const remaining = Number(l.quantityBase) - Number(l.fulfilledQuantityBase);
                          return remaining > 0 ? (
                            <input
                              key={l.id} className="input input-sm" style={{ width: 120 }}
                              placeholder={`${productMap.get(l.productId)?.code ?? '?'} ≤${remaining}`}
                              value={pickQty[l.id] ?? ''}
                              onChange={(e) => setPickQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                            />
                          ) : null;
                        })}
                        <button className="btn btn-sm" type="button" disabled={busy}
                          onClick={() => void act(async () => {
                            const flLines = o.lines
                              .map((l) => ({ orderLineId: l.id, quantityBase: pickQty[l.id] }))
                              .filter((l) => l.quantityBase && Number(l.quantityBase) > 0);
                            if (flLines.length === 0) throw { code: 'validation', message: 'enter at least one pick quantity' };
                            const f = await apiFetch<{ id: string; code: string }>('/fulfillments', {
                              method: 'POST', token: session.accessToken,
                              body: { salesOrderId: o.id, lines: flLines },
                            });
                            await apiFetch(`/fulfillments/${f.id}/dispatch`, { method: 'POST', token: session.accessToken });
                            await apiFetch(`/fulfillments/${f.id}/deliver`, { method: 'POST', token: session.accessToken });
                            setPickQty({});
                            setOkMsg(`waybill ${f.code} delivered`);
                          })}>Pick & deliver</button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && <p className="muted">No orders yet.</p>}
      </section>
    </div>
  );
}
