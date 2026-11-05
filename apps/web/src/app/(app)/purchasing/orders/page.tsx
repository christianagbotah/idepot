'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useReferenceData } from '../../../../lib/use-reference';
import { formatMoney, formatQty } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type { ListDto } from '../../../../lib/types';
import type { PurchaseOrderWebDto } from '../../../../lib/types-phase4';

interface LineDraft {
  productId: string;
  orderedQuantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { productId: '', orderedQuantity: '', unitPrice: '' };

export default function PurchaseOrdersPage() {
  const session = useSession();
  const [orders, setOrders] = useState<PurchaseOrderWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);

  const { warehouses, products, suppliers } = useReferenceData(session, { suppliers: true });
  const [warehouseId, setWarehouseId] = useState('');

  useEffect(() => {
    if (warehouses.length > 0 && warehouseId === '') setWarehouseId(warehouses[0]!.id);
  }, [warehouses, warehouseId]);

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const res = await apiFetch<ListDto<PurchaseOrderWebDto>>(
          `/purchasing/purchase-orders${qs({ limit: '100', status: statusFilter || undefined })}`,
          { token },
        );
        setOrders(res.items);
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    if (supplierId === '' || warehouseId === '') {
      setFormError('Choose a supplier and a warehouse.');
      return;
    }
    const valid = lines.filter((l) => l.productId !== '' && l.orderedQuantity !== '' && l.unitPrice !== '');
    if (valid.length === 0) {
      setFormError('Add at least one complete line.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/purchasing/purchase-orders', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          supplierId,
          warehouseId,
          expectedDate: expectedDate || undefined,
          submit: true,
          lines: valid.map((l) => ({ productId: l.productId, orderedQuantity: l.orderedQuantity, unitPrice: l.unitPrice })),
        },
      });
      setOkMsg('Purchase order submitted.');
      setLines([{ ...EMPTY_LINE }]);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: string, action: string) {
    setFormError('');
    try {
      await apiFetch(`/purchasing/purchase-orders/${id}/${action}`, {
        method: 'POST',
        token: sess.accessToken,
        body: {},
      });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  const canApprove = session.user.roles.some((r) => ['owner', 'admin', 'manager', 'procurement'].includes(r));

  return (
    <div>
      <div className="page-head">
        <h1>Purchase Orders</h1>
      </div>

      <section className="card">
        <h2>New purchase order</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
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
            <label>
              Receiving warehouse
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Expected date
              <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </label>
          </div>
          {lines.map((line, i) => (
            <div className="toolbar" key={i}>
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
                value={line.orderedQuantity}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, orderedQuantity: e.target.value } : l)))}
                style={{ maxWidth: 100 }}
              />
              <input
                className="input-sm"
                placeholder="Unit price"
                value={line.unitPrice}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
                style={{ maxWidth: 130 }}
              />
              <span style={{ minWidth: 110 }} className="num">
                {line.orderedQuantity !== '' && line.unitPrice !== ''
                  ? formatMoney((Number(line.orderedQuantity) * Number(line.unitPrice)).toFixed(4))
                  : ''}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setLines(lines.length === 1 ? [{ ...EMPTY_LINE }] : lines.filter((_, j) => j !== i))}
              >
                {lines.length === 1 ? 'Clear' : 'Remove'}
              </button>
            </div>
          ))}
          <div className="toolbar">
            <button type="button" className="btn btn-sm" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
              Add line
            </button>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for approval'}
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
        <h2>Purchase orders</h2>
        <div className="toolbar">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['draft', 'submitted', 'approved', 'issued', 'partially_received', 'received', 'closed', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : orders.length === 0 ? (
          <p className="muted">No purchase orders yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Lines</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <>
                    <tr
                      key={o.id}
                      data-clickable="true"
                      onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                    >
                      <td>{o.code}</td>
                      <td>{o.supplierName ?? o.supplierId.slice(0, 8)}</td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="num">{o.lines.length}</td>
                      <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td>
                        {(o.status === 'submitted' || o.status === 'draft') && canApprove ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void transition(o.id, 'approve');
                            }}
                          >
                            Approve
                          </button>
                        ) : null}
                        {o.status === 'approved' && canApprove ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void transition(o.id, 'issue');
                            }}
                          >
                            Issue
                          </button>
                        ) : null}
                        {['received', 'partially_received'].includes(o.status) && canApprove ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void transition(o.id, 'close');
                            }}
                          >
                            Close
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === o.id ? (
                      <tr key={`${o.id}-detail`}>
                        <td colSpan={6}>
                          <table>
                            <thead>
                              <tr>
                                <th>Product</th>
                                <th className="num">Ordered</th>
                                <th className="num">Unit price</th>
                                <th className="num">Received</th>
                                <th className="num">Invoiced</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.lines.map((l) => (
                                <tr key={l.id}>
                                  <td>
                                    {l.productCode ?? ''} {l.productName ?? ''}
                                  </td>
                                  <td className="num">{formatQty(l.orderedQuantity)}</td>
                                  <td className="num">{formatMoney(l.unitPrice)}</td>
                                  <td className="num">{formatQty(l.receivedQuantityBase)}</td>
                                  <td className="num">{formatQty(l.invoicedQuantityBase)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
