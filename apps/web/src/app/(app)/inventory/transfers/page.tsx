'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatDateTime } from '../../../../lib/format';
import { cmpDecimal, formatDecimal, isValidQty, subDecimal } from '../../../../lib/decimal';
import { labelOf, useReferenceData } from '../../../../lib/use-reference';
import type { TransferDto } from '../../../../lib/types';
import { StatusBadge } from '../../../../components/status-badge';

interface CreateLine {
  productId: string;
  qty: string;
}

/** Warehouse-to-house transfers: draft → in_transit → received. */
export default function TransfersPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [items, setItems] = useState<TransferDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // create form
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<CreateLine[]>([{ productId: '', qty: '' }]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // per-row actions
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveError, setReceiveError] = useState('');

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));
  const productMap = new Map(products.map((p) => [p.id, p] as const));

  const load = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<TransferDto[]>('/transfers', { token });
      setItems(res);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  function patchLine(idx: number, patch: Partial<CreateLine>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function createTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (!fromWarehouseId || !toWarehouseId) {
      setFormError('Pick both warehouses.');
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      setFormError('Source and destination warehouses must differ.');
      return;
    }
    const payloadLines: Array<{ productId: string; quantityBase: string }> = [];
    for (const line of lines) {
      if (!line.productId) {
        setFormError('Every line needs a product.');
        return;
      }
      const qty = line.qty.trim();
      if (!isValidQty(qty) || cmpDecimal(qty, '0') <= 0) {
        setFormError('Transfer quantities must be positive decimals like 24 or 24.5.');
        return;
      }
      payloadLines.push({ productId: line.productId, quantityBase: qty });
    }
    if (payloadLines.length === 0) {
      setFormError('Add at least one line.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<TransferDto>('/transfers', {
        method: 'POST',
        token: session.accessToken,
        body: {
          fromWarehouseId,
          toWarehouseId,
          note: note.trim() || undefined,
          lines: payloadLines,
        },
      });
      setFromWarehouseId('');
      setToWarehouseId('');
      setNote('');
      setLines([{ productId: '', qty: '' }]);
      setOkMsg(`Transfer ${created.code} created as draft.`);
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(t: TransferDto) {
    if (!session) return;
    if (!window.confirm(`Dispatch transfer ${t.code}? Stock leaves ${labelOf(warehouseMap, t.fromWarehouseId)}.`)) {
      return;
    }
    setRowBusy(t.id);
    setOkMsg('');
    try {
      await apiFetch<TransferDto>(`/transfers/${t.id}/dispatch`, {
        method: 'POST',
        token: session.accessToken,
      });
      setOkMsg(`Transfer ${t.code} dispatched.`);
      await load(session.accessToken);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setRowBusy(null);
    }
  }

  function openReceive(t: TransferDto) {
    setReceiveId(t.id === receiveId ? null : t.id);
    setReceiveError('');
    const q: Record<string, string> = {};
    for (const l of t.lines) {
      q[l.productId] = formatDecimal(subDecimal(l.quantityBase, l.receivedQuantityBase));
    }
    setReceiveQty(q);
  }

  async function submitReceive(t: TransferDto) {
    if (!session) return;
    setReceiveError('');
    const payloadLines: Array<{ productId: string; quantityBase: string }> = [];
    for (const l of t.lines) {
      const remaining = subDecimal(l.quantityBase, l.receivedQuantityBase);
      const qty = (receiveQty[l.productId] ?? '0').trim() || '0';
      if (!isValidQty(qty)) {
        setReceiveError('Receive quantities must be decimals like 24 or 24.5.');
        return;
      }
      if (cmpDecimal(qty, remaining) > 0) {
        setReceiveError('A receive quantity exceeds the remaining amount for its line.');
        return;
      }
      if (cmpDecimal(qty, '0') > 0) {
        payloadLines.push({ productId: l.productId, quantityBase: qty });
      }
    }
    if (payloadLines.length === 0) {
      setReceiveError('Enter at least one receive quantity above zero.');
      return;
    }
    setRowBusy(t.id);
    try {
      await apiFetch<TransferDto>(`/transfers/${t.id}/receive`, {
        method: 'POST',
        token: session.accessToken,
        body: { lines: payloadLines },
      });
      setReceiveId(null);
      setOkMsg(`Transfer ${t.code} receiving posted.`);
      await load(session.accessToken);
    } catch (err) {
      setReceiveError(apiErrorMessage(err));
    } finally {
      setRowBusy(null);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Transfers</h1>
        <span className="muted">Move stock between warehouses: dispatch, then receive.</span>
      </div>

      <section className="card">
        <h2>New transfer</h2>
        <form onSubmit={(e) => void createTransfer(e)}>
          <div className="form-grid">
            <label>
              <span className="muted">From warehouse</span>
              <select
                className="input"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
              >
                <option value="">— pick source —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">To warehouse</span>
              <select
                className="input"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
              >
                <option value="">— pick destination —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              <span className="muted">Note (optional)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <h3>Lines</h3>
          {lines.map((line, idx) => (
            <div key={idx} className="toolbar" style={{ marginBottom: 'var(--idp-space-2)' }}>
              <label style={{ flex: 2, minWidth: 220 }}>
                <span className="muted">Product</span>
                <select
                  className="input"
                  value={line.productId}
                  onChange={(e) => patchLine(idx, { productId: e.target.value })}
                >
                  <option value="">— pick a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: 140 }}>
                <span className="muted">Qty (base)</span>
                <input
                  className="input"
                  value={line.qty}
                  inputMode="decimal"
                  onChange={(e) => patchLine(idx, { qty: e.target.value })}
                />
              </label>
              <button
                className="btn"
                type="button"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            onClick={() => setLines([...lines, { productId: '', qty: '' }])}
          >
            Add line
          </button>

          <div style={{ marginTop: 'var(--idp-space-4)' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create transfer'}
            </button>
            {formError ? (
              <p className="error-text" role="alert">
                {formError}
              </p>
            ) : null}
            {okMsg ? <p className="ok-text" role="status">{okMsg}</p> : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>All transfers</h2>
        {refError ? (
          <p className="error-text" role="alert">
            Reference data: {refError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading transfers…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No transfers yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                  <th>Received</th>
                  <th className="num">Lines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <TransferRows
                    key={t.id}
                    transfer={t}
                    warehouseMap={warehouseMap}
                    productMap={productMap}
                    rowBusy={rowBusy === t.id}
                    receiving={receiveId === t.id}
                    receiveQty={receiveQty}
                    receiveError={receiveError}
                    onReceiveQty={(productId, qty) =>
                      setReceiveQty((prev) => ({ ...prev, [productId]: qty }))
                    }
                    onDispatch={() => void dispatch(t)}
                    onToggleReceive={() => openReceive(t)}
                    onSubmitReceive={() => void submitReceive(t)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function TransferRows(props: {
  transfer: TransferDto;
  warehouseMap: Map<string, { code: string; name: string }>;
  productMap: Map<string, { code: string; name: string }>;
  rowBusy: boolean;
  receiving: boolean;
  receiveQty: Record<string, string>;
  receiveError: string;
  onReceiveQty: (productId: string, qty: string) => void;
  onDispatch: () => void;
  onToggleReceive: () => void;
  onSubmitReceive: () => void;
}) {
  const t = props.transfer;
  const fullyReceived =
    t.status === 'received' ||
    (t.lines.length > 0 &&
      t.lines.every((l) => cmpDecimal(l.receivedQuantityBase, l.quantityBase) >= 0));

  return (
    <>
      <tr>
        <td>{t.code}</td>
        <td>
          {labelOf(props.warehouseMap, t.fromWarehouseId)} →{' '}
          {labelOf(props.warehouseMap, t.toWarehouseId)}
          {t.note ? <div className="muted">{t.note}</div> : null}
        </td>
        <td>
          <StatusBadge status={t.status} />
        </td>
        <td>{formatDateTime(t.dispatchedAt)}</td>
        <td>{formatDateTime(t.receivedAt)}</td>
        <td className="num">{t.lines.length}</td>
        <td>
          <div className="toolbar">
            {t.status === 'draft' ? (
              <button className="btn" type="button" disabled={props.rowBusy} onClick={props.onDispatch}>
                {props.rowBusy ? 'Working…' : 'Dispatch'}
              </button>
            ) : null}
            {t.status === 'in_transit' ? (
              <button className="btn" type="button" disabled={props.rowBusy} onClick={props.onToggleReceive}>
                {props.receiving ? 'Close receiving' : 'Receive'}
              </button>
            ) : null}
            {fullyReceived ? <span className="muted">complete</span> : null}
          </div>
        </td>
      </tr>
      {props.receiving ? (
        <tr>
          <td colSpan={7}>
            <h4 style={{ margin: '0 0 var(--idp-space-2)' }}>Receive transfer {t.code}</h4>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Dispatched</th>
                    <th className="num">Already received</th>
                    <th className="num">Remaining</th>
                    <th>Receive now</th>
                  </tr>
                </thead>
                <tbody>
                  {t.lines.map((l) => {
                    const remaining = subDecimal(l.quantityBase, l.receivedQuantityBase);
                    return (
                      <tr key={l.id}>
                        <td>{labelOf(props.productMap, l.productId)}</td>
                        <td className="num">{formatDecimal(l.quantityBase)}</td>
                        <td className="num">{formatDecimal(l.receivedQuantityBase)}</td>
                        <td className="num">{formatDecimal(remaining)}</td>
                        <td>
                          <input
                            className="input"
                            value={props.receiveQty[l.productId] ?? ''}
                            inputMode="decimal"
                            onChange={(e) => props.onReceiveQty(l.productId, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {props.receiveError ? (
              <p className="error-text" role="alert">
                {props.receiveError}
              </p>
            ) : null}
            <div style={{ marginTop: 'var(--idp-space-3)' }}>
              <button className="btn" type="button" disabled={props.rowBusy} onClick={props.onSubmitReceive}>
                {props.rowBusy ? 'Posting…' : 'Post receiving'}
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
