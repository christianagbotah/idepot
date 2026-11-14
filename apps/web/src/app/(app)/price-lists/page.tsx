'use client';

/**
 * Price list management (Phase 6 parity — closes the legacy price-list UX
 * gap). The API is the authority on every rule this page surfaces:
 *  - effective-dated rows; a price row is IMMUTABLE once effective —
 *    corrections close the row (set effective_to) and add a NEW row
 *    (there is deliberately no price-edit endpoint);
 *  - overlap within (list, product, unit) is rejected by the DB exclusion
 *    constraint and shown as a conflict message;
 *  - resolve preview shows the exact precedence the POS uses:
 *    customer list → standard list → product default.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type {
  ListDto, PriceListDto, PriceListItemViewDto, ResolvedPriceDto,
} from '../../../lib/types';
import { cedi2dp, displayDate } from '@idepot/print-templates';

interface CustomerDtoLite { id: string; name: string; phone: string }
interface ProductDtoLite { id: string; code: string; name: string; sellingPrice: string; baseUnitId: string }
interface UnitDtoLite { id: string; code: string; name: string }

const today = () => new Date().toISOString().slice(0, 10);

export default function PriceListsPage() {
  const session = useSession();

  const [lists, setLists] = useState<PriceListDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);
  const [products, setProducts] = useState<ProductDtoLite[]>([]);
  const [units, setUnits] = useState<UnitDtoLite[]>([]);

  const [selected, setSelected] = useState<PriceListDto | null>(null);
  const [items, setItems] = useState<PriceListItemViewDto[]>([]);

  // create list
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'standard' | 'customer'>('standard');
  const [listCustomer, setListCustomer] = useState('');

  // add item
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [price, setPrice] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [effectiveTo, setEffectiveTo] = useState('');

  // close item
  const [closeDateFor, setCloseDateFor] = useState<Record<string, string>>({});

  // resolve preview
  const [resolveProductId, setResolveProductId] = useState('');
  const [resolveUnitId, setResolveUnitId] = useState('');
  const [resolveCustomerId, setResolveCustomerId] = useState('');
  const [resolved, setResolved] = useState<ResolvedPriceDto | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const loadLists = useCallback(async (token: string) => {
    const [l, c, p, u] = await Promise.all([
      apiFetch<ListDto<PriceListDto>>('/price-lists', { token }),
      apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }),
      apiFetch<ListDto<ProductDtoLite>>('/products', { token }),
      apiFetch<ListDto<UnitDtoLite>>('/units', { token }),
    ]);
    setLists(l.items);
    setCustomers(c.items as CustomerDtoLite[]);
    setProducts(p.items as ProductDtoLite[]);
    setUnits(u.items);
  }, []);

  const loadItems = useCallback(async (token: string, listId: string) => {
    const res = await apiFetch<ListDto<PriceListItemViewDto>>(`/price-lists/${listId}/items`, { token });
    setItems(res.items);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadLists(session.accessToken).catch((err) => setError(apiErrorMessage(err)));
  }, [session, loadLists]);

  function pick(list: PriceListDto) {
    if (!session) return;
    setSelected(list);
    setItems([]);
    setError('');
    setOkMsg('');
    void loadItems(session.accessToken, list.id).catch((err) => setError(apiErrorMessage(err)));
  }

  async function act(fn: () => Promise<void>) {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await fn();
      await loadLists(session.accessToken);
      if (selected) await loadItems(session.accessToken, selected.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  function itemIsCurrent(item: PriceListItemViewDto): boolean {
    const t = today();
    return item.effectiveFrom <= t && (item.effectiveTo == null || item.effectiveTo >= t);
  }

  return (
    <div>
      <div className="page-head"><h1>Price lists</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      <section className="card">
        <h2>New price list</h2>
        <div className="form-row">
          <input className="input input-sm" style={{ width: 120 }} placeholder="code" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" style={{ width: 240 }} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input input-sm" style={{ width: 140 }} value={kind} onChange={(e) => setKind(e.target.value as 'standard' | 'customer')}>
            <option value="standard">standard</option>
            <option value="customer">customer</option>
          </select>
          {kind === 'customer' && (
            <select className="input" value={listCustomer} onChange={(e) => setListCustomer(e.target.value)}>
              <option value="">— customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
            </select>
          )}
          <button className="btn btn-primary" type="button"
            disabled={busy || code.length < 2 || name.length < 2 || (kind === 'customer' && !listCustomer)}
            onClick={() => void act(async () => {
              const created = await apiFetch<PriceListDto>('/price-lists', {
                method: 'POST', token: session.accessToken,
                body: { code, name, kind, customerId: listCustomer || undefined },
              });
              setCode(''); setName(''); setListCustomer('');
              setOkMsg(`price list ${created.code} created`);
              pick(created);
            })}>Create</button>
        </div>
      </section>

      <section className="card">
        <h2>Lists</h2>
        <table className="table">
          <thead><tr><th>Code</th><th>Name</th><th>Kind</th><th>Customer</th><th>Active</th><th /></tr></thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id} data-selected={selected?.id === l.id}>
                <td>{l.code}</td>
                <td>{l.name}</td>
                <td>{l.kind}</td>
                <td>{customers.find((c) => c.id === l.customerId)?.name ?? (l.kind === 'customer' ? '—' : '')}</td>
                <td><span className="badge">{l.isActive ? 'active' : 'inactive'}</span></td>
                <td><button className="btn btn-sm" type="button" onClick={() => pick(l)}>manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {lists.length === 0 && <p className="muted">No price lists yet.</p>}
      </section>

      {selected && (
        <section className="card">
          <h2>{selected.code} · {selected.name} — items</h2>
          <p className="muted">
            Effective-dated: a row is immutable once effective. To change a price, close the current
            row (set an end date) and add a new one. Overlapping windows for the same product/unit
            are rejected by the database.
          </p>

          <div className="form-row">
            <select className="input" value={productId} onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              if (p) {
                setUnitId(p.baseUnitId);
                setPrice(Number(p.sellingPrice).toFixed(2));
              }
            }}>
              <option value="">— product —</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
            <select className="input input-sm" style={{ width: 120 }} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— unit —</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </select>
            <input className="input input-sm" style={{ width: 110 }} placeholder="price" value={price} onChange={(e) => setPrice(e.target.value)} />
            <input className="input input-sm" style={{ width: 150 }} type="date" title="effective from" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            <input className="input input-sm" style={{ width: 150 }} type="date" title="effective to (optional)" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            <button className="btn btn-primary" type="button"
              disabled={busy || !productId || !unitId || !price || !effectiveFrom}
              onClick={() => void act(async () => {
                await apiFetch(`/price-lists/${selected.id}/items`, {
                  method: 'POST', token: session.accessToken,
                  body: { productId, unitId, price, effectiveFrom, effectiveTo: effectiveTo || undefined },
                });
                setProductId(''); setUnitId(''); setPrice(''); setEffectiveTo('');
                setOkMsg('price row added');
              })}>+ price row</button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Product</th><th>Unit</th><th style={{ textAlign: 'right' }}>Price</th>
                <th>Effective from</th><th>Effective to</th><th>State</th><th>Close</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.productCode ?? item.productId.slice(0, 8)} · {item.productName}</td>
                  <td>{item.unitCode ? `${item.unitCode}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{cedi2dp(item.price)}</td>
                  <td>{displayDate(item.effectiveFrom)}</td>
                  <td>{item.effectiveTo ? displayDate(item.effectiveTo) : 'open'}</td>
                  <td>
                    <span className={`badge ${itemIsCurrent(item) ? 'badge-ok' : 'badge-mut'}`}>
                      {itemIsCurrent(item) ? 'current' : 'past'}
                    </span>
                  </td>
                  <td>
                    {item.effectiveTo == null && (
                      <div className="form-row">
                        <input className="input input-sm" style={{ width: 140 }} type="date"
                          value={closeDateFor[item.id] ?? ''} title="close on date"
                          onChange={(e) => setCloseDateFor((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                        <button className="btn btn-sm" type="button"
                          disabled={busy || !closeDateFor[item.id]}
                          onClick={() => void act(async () => {
                            await apiFetch(`/price-list-items/${item.id}/close`, {
                              method: 'POST', token: session.accessToken,
                              body: { effectiveTo: closeDateFor[item.id] },
                            });
                            setCloseDateFor((prev) => ({ ...prev, [item.id]: '' }));
                            setOkMsg('price row closed');
                          })}>close</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="muted">No price rows in this list yet.</p>}
        </section>
      )}

      <section className="card">
        <h2>Resolve preview (POS precedence)</h2>
        <p className="muted">Exactly the resolution the POS/sale poster performs: customer list → standard list → product default selling price.</p>
        <div className="form-row">
          <select className="input" value={resolveProductId} onChange={(e) => {
            setResolveProductId(e.target.value);
            const p = products.find((x) => x.id === e.target.value);
            if (p) setResolveUnitId(p.baseUnitId);
          }}>
            <option value="">— product —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 120 }} value={resolveUnitId} onChange={(e) => setResolveUnitId(e.target.value)}>
            <option value="">— unit —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </select>
          <select className="input" value={resolveCustomerId} onChange={(e) => setResolveCustomerId(e.target.value)}>
            <option value="">— customer (optional) —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn" type="button"
            disabled={!resolveProductId || !resolveUnitId}
            onClick={() => {
              if (!session) return;
              setError('');
              const qs = new URLSearchParams({ productId: resolveProductId, unitId: resolveUnitId });
              if (resolveCustomerId) qs.set('customerId', resolveCustomerId);
              void apiFetch<ResolvedPriceDto>(`/pricing/resolve?${qs.toString()}`, { token: session.accessToken })
                .then(setResolved, (err) => setError(apiErrorMessage(err)));
            }}>Resolve</button>
        </div>
        {resolved && (
          <p>
            <strong>{cedi2dp(resolved.price)}</strong>{' '}
            <span className="badge">{resolved.source}</span>{' '}
            {resolved.effectiveFrom ? <span className="muted">effective {displayDate(resolved.effectiveFrom)}</span> : null}
          </p>
        )}
      </section>
    </div>
  );
}
