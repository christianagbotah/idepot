'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useReferenceData } from '../../../../lib/use-reference';
import { formatMoney, formatQty } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type { GrnWebDto, PurchaseOrderWebDto } from '../../../../lib/types-phase4';

interface LineDraft {
  purchaseOrderLineId: string;
  productId: string;
  receivedQuantity: string;
  unitCost: string;
}

const EMPTY: LineDraft = { purchaseOrderLineId: '', productId: '', receivedQuantity: '', unitCost: '' };

export default function GrnsPage() {
  const session = useSession();
  const [grns, setGrns] = useState<GrnWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryRef, setDeliveryRef] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY }]);

  const { warehouses, products, suppliers } = useReferenceData(session, { suppliers: true });
  const [warehouseId, setWarehouseId] = useState('');
  const [openOrders, setOpenOrders] = useState<PurchaseOrderWebDto[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');

  useEffect(() => {
    if (warehouses.length > 0 && warehouseId === '') setWarehouseId(warehouses[0]!.id);
  }, [warehouses, warehouseId]);

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<GrnWebDto[]>(`/purchasing/grns${qs({ limit: '100' })}`, { token });
      setGrns(res);
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

  // load the open POs for the picker (approved/issued/partially received)
  useEffect(() => {
    if (!session) return;
    void apiFetch<PurchaseOrderWebDto[]>(`/purchasing/purchase-orders${qs({ limit: '100' })}`, {
      token: session.accessToken,
    }).then(
      (res) => setOpenOrders(res.filter((o) => ['approved', 'issued', 'partially_received'].includes(o.status))),
      () => undefined,
    );
  }, [session]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  const selectedPo = openOrders.find((o) => o.id === purchaseOrderId);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    const valid = lines.filter((l) => l.productId !== '' && l.receivedQuantity !== '' && l.unitCost !== '');
    if (supplierId === '' || warehouseId === '' || valid.length === 0) {
      setFormError('Supplier, warehouse and at least one complete line are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<GrnWebDto>('/purchasing/grns', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          purchaseOrderId: purchaseOrderId || null,
          supplierId: selectedPo ? selectedPo.supplierId : supplierId,
          warehouseId: selectedPo ? selectedPo.warehouseId : warehouseId,
          businessDate,
          supplierDeliveryRef: deliveryRef || undefined,
          lines: valid.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId || null,
            productId: l.productId,
            receivedQuantity: l.receivedQuantity,
            unitCost: l.unitCost,
          })),
        },
      });
      setOkMsg(`Goods receipt ${created.code} posted — stock and GR/IR journal committed.`);
      setLines([{ ...EMPTY }]);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Goods Receipts (GRN)</h1>
      </div>

      <section className="card">
        <h2>Receive goods</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Against purchase order
              <select
                value={purchaseOrderId}
                onChange={(e) => {
                  setPurchaseOrderId(e.target.value);
                  setLines([{ ...EMPTY }]);
                }}
              >
                <option value="">Direct receipt (no PO)</option>
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {o.supplierName ?? ''} · {o.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            {selectedPo ? (
              <label>
                Supplier (from PO)
                <input value={selectedPo.supplierName ?? ''} readOnly />
              </label>
            ) : (
              <label>
                Supplier
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedPo ? (
              <label>
                Warehouse (from PO)
                <input value={selectedPo.warehouseId} readOnly />
              </label>
            ) : (
              <label>
                Warehouse
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Business date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Supplier delivery ref
              <input value={deliveryRef} onChange={(e) => setDeliveryRef(e.target.value)} placeholder="Waybill / dispatch no." />
            </label>
          </div>
          {lines.map((line, i) => (
            <div className="toolbar" key={i}>
              <select
                value={line.purchaseOrderLineId}
                onChange={(e) => {
                  const polId = e.target.value;
                  const pol = selectedPo?.lines.find((l) => l.id === polId);
                  setLines(
                    lines.map((l, j) =>
                      j === i
                        ? {
                            ...l,
                            purchaseOrderLineId: polId,
                            productId: pol?.productId ?? l.productId,
                            unitCost: pol ? pol.unitPrice : l.unitCost,
                          }
                        : l,
                    ),
                  );
                }}
                style={{ flex: 2 }}
                disabled={selectedPo == null}
              >
                <option value="">PO line…</option>
                {selectedPo?.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.productName ?? l.productId.slice(0, 8)} · ordered {formatQty(l.orderedQuantityBase)} @ {formatMoney(l.unitPrice)}
                  </option>
                ))}
              </select>
              <select
                value={line.productId}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, productId: e.target.value } : l)))}
                style={{ flex: 2 }}
              >
                <option value="">Select product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name}
                  </option>
                ))}
              </select>
              <input
                className="input-sm"
                placeholder="Qty"
                value={line.receivedQuantity}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, receivedQuantity: e.target.value } : l)))}
                style={{ maxWidth: 90 }}
              />
              <input
                className="input-sm"
                placeholder="Unit cost"
                value={line.unitCost}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, unitCost: e.target.value } : l)))}
                style={{ maxWidth: 120 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setLines(lines.length === 1 ? [{ ...EMPTY }] : lines.filter((_, j) => j !== i))}
              >
                {lines.length === 1 ? 'Clear' : 'Remove'}
              </button>
            </div>
          ))}
          <div className="toolbar">
            <button type="button" className="btn btn-sm" onClick={() => setLines([...lines, { ...EMPTY }])}>
              Add line
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post receipt'}
            </button>
          </div>
        </form>
        {formError ? (
          <p className="error-text" role="alert">
            {formError}
          </p>
        ) : null}
        {okMsg ? (
          <p className="ok-text" role="status">
            {okMsg}
          </p>
        ) : null}
      </section>

      <section className="card">
        <h2>Posted receipts</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : grns.length === 0 ? (
          <p className="muted">No goods receipts yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>PO</th>
                  <th>Status</th>
                  <th className="num">Lines</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.id} title={g.lines.map((l) => `${formatQty(l.receivedQuantityBase)} × ${formatMoney(l.unitCost)}`).join('\n')}>
                    <td>{g.code}</td>
                    <td>{g.businessDate}</td>
                    <td>{g.supplierName ?? g.supplierId.slice(0, 8)}</td>
                    <td>{g.purchaseOrderCode ?? '—'}</td>
                    <td>
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="num">{g.lines.length}</td>
                    <td className="num">{formatMoney(g.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
