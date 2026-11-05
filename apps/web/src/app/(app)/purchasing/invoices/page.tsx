'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useReferenceData } from '../../../../lib/use-reference';
import { formatMoney, formatQty } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type { ListDto } from '../../../../lib/types';
import type { GrnWebDto, PurchaseOrderWebDto, SupplierInvoiceWebDto } from '../../../../lib/types-phase4';

interface LineDraft {
  goodsReceiptLineId: string;
  productId: string;
  description: string;
  quantityBase: string;
  unitPrice: string;
}

const EMPTY: LineDraft = { goodsReceiptLineId: '', productId: '', description: '', quantityBase: '', unitPrice: '' };

export default function SupplierInvoicesPage() {
  const session = useSession();
  const [invoices, setInvoices] = useState<SupplierInvoiceWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY }]);

  const { suppliers } = useReferenceData(session, { suppliers: true });
  const [grns, setGrns] = useState<GrnWebDto[]>([]);
  const [openOrders, setOpenOrders] = useState<PurchaseOrderWebDto[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<ListDto<SupplierInvoiceWebDto>>(`/purchasing/supplier-invoices${qs({ limit: '100' })}`, {
        token,
      });
      setInvoices(res.items);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
    void apiFetch<ListDto<GrnWebDto>>(`/purchasing/grns${qs({ limit: '100' })}`, { token: session.accessToken }).then(
      (res) => setGrns(res.items),
      () => undefined,
    );
    void apiFetch<ListDto<PurchaseOrderWebDto>>(`/purchasing/purchase-orders${qs({ limit: '100' })}`, {
      token: session.accessToken,
    }).then(
      (res) => setOpenOrders(res.items.filter((o) => ['approved', 'issued', 'partially_received', 'received'].includes(o.status))),
      () => undefined,
    );
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  // uninvoiced GRN lines of the chosen supplier
  const supplierGrnLines = grns
    .filter((g) => g.supplierId === supplierId)
    .flatMap((g) =>
      g.lines.map((l) => ({
        grnId: g.id,
        grnCode: g.code,
        lineId: l.id,
        productId: l.productId,
        received: l.receivedQuantityBase,
        unitCost: l.unitCost,
        lineValue: l.lineValue,
      })),
    );

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    const valid = lines.filter((l) => l.goodsReceiptLineId !== '' && l.quantityBase !== '' && l.unitPrice !== '');
    if (supplierId === '' || invoiceNumber === '' || valid.length === 0) {
      setFormError('Supplier, supplier invoice number and at least one GRN-backed line are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<SupplierInvoiceWebDto>('/purchasing/supplier-invoices', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          supplierId,
          supplierInvoiceNumber: invoiceNumber,
          supplierInvoiceDate: invoiceDate,
          dueDate: dueDate || undefined,
          businessDate,
          purchaseOrderId: purchaseOrderId || null,
          post: true,
          lines: valid.map((l) => {
            const po = openOrders.find((o) => o.id === purchaseOrderId);
            const pol = po?.lines.find((x) => x.productId === l.productId);
            return {
              goodsReceiptLineId: l.goodsReceiptLineId,
              purchaseOrderLineId: pol?.id ?? null,
              productId: l.productId,
              description: l.description || 'per GRN',
              quantityBase: l.quantityBase,
              unitPrice: l.unitPrice,
            };
          }),
        },
      });
      setOkMsg(
        created.status === 'posted'
          ? `Supplier invoice ${created.code} posted — AP booked.`
          : `Supplier invoice ${created.code} recorded with pending match exceptions — approval required before posting.`,
      );
      setLines([{ ...EMPTY }]);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function postInvoice(id: string) {
    setFormError('');
    const reason = window.prompt('Approval reason (min 10 chars):');
    if (reason == null || reason.length < 10) {
      setFormError('An approval reason of at least 10 characters is required.');
      return;
    }
    const username = window.prompt('Approver email:');
    const password = username ? window.prompt('Approver password:') : null;
    if (username == null || password == null) return;
    try {
      await apiFetch(`/purchasing/supplier-invoices/${id}/post`, {
        method: 'POST',
        token: sess.accessToken,
        body: { username, password, reason },
      });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Supplier Invoices &amp; 3-Way Match</h1>
      </div>

      <section className="card">
        <h2>Record supplier invoice</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Supplier
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setLines([{ ...EMPTY }]);
                }}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supplier invoice no.
              <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required placeholder="SUP-INV-#" />
            </label>
            <label>
              Invoice date
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
            </label>
            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <label>
              Posting date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Purchase order (optional)
              <select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
                <option value="">No PO</option>
                {openOrders
                  .filter((o) => o.supplierId === supplierId || supplierId === '')
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          {lines.map((line, i) => (
            <div className="toolbar" key={i}>
              <select
                value={line.goodsReceiptLineId}
                onChange={(e) => {
                  const gl = supplierGrnLines.find((x) => x.lineId === e.target.value);
                  setLines(
                    lines.map((l, j) =>
                      j === i
                        ? {
                            ...l,
                            goodsReceiptLineId: e.target.value,
                            productId: gl?.productId ?? l.productId,
                            quantityBase: gl?.received ?? l.quantityBase,
                            unitPrice: gl ? gl.lineValue : l.unitPrice,
                          }
                        : l,
                    ),
                  );
                }}
                style={{ flex: 2 }}
              >
                <option value="">GRN line…</option>
                {supplierGrnLines.map((gl) => (
                  <option key={gl.lineId} value={gl.lineId}>
                    {gl.grnCode} · {gl.productId.slice(0, 8)} · received {formatQty(gl.received)} @ {formatMoney(gl.unitCost)}
                  </option>
                ))}
              </select>
              <input
                className="input-sm"
                placeholder="Description"
                value={line.description}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                style={{ flex: 1 }}
              />
              <input
                className="input-sm"
                placeholder="Qty base"
                value={line.quantityBase}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, quantityBase: e.target.value } : l)))}
                style={{ maxWidth: 90 }}
              />
              <input
                className="input-sm"
                placeholder="Unit price"
                value={line.unitPrice}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
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
              {busy ? 'Recording…' : 'Record & post (clean match)'}
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
        <h2>Invoices</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : invoices.length === 0 ? (
          <p className="muted">No supplier invoices yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Supplier inv #</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Match</th>
                  <th className="num">Total</th>
                  <th className="num">Open</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <>
                    <tr key={inv.id} data-clickable="true" onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}>
                      <td>{inv.code}</td>
                      <td>{inv.supplierInvoiceNumber}</td>
                      <td>{inv.supplierName ?? inv.supplierId.slice(0, 8)}</td>
                      <td>
                        <StatusBadge status={inv.status} />
                      </td>
                      <td>
                        <StatusBadge status={inv.matchState === 'within_tolerance' ? 'approved' : inv.matchState === 'exceptions_pending' ? 'counted' : 'posted'} />
                        <span className="muted" style={{ marginLeft: 6 }}>
                          {inv.matchState.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="num">{formatMoney(inv.total)}</td>
                      <td className="num">{formatMoney(inv.amountOpen)}</td>
                      <td>
                        {inv.status === 'pending_match' ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void postInvoice(inv.id);
                            }}
                          >
                            Approve &amp; post
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === inv.id ? (
                      <tr key={`${inv.id}-detail`}>
                        <td colSpan={8}>
                          <strong>Lines</strong>
                          <table>
                            <thead>
                              <tr>
                                <th>Description</th>
                                <th className="num">Qty</th>
                                <th className="num">Unit price</th>
                                <th className="num">Net</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inv.lines.map((l) => (
                                <tr key={l.id}>
                                  <td>{l.description}</td>
                                  <td className="num">{formatQty(l.quantityBase)}</td>
                                  <td className="num">{formatMoney(l.unitPrice)}</td>
                                  <td className="num">{formatMoney(l.lineNet)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {inv.matchItems.length > 0 ? (
                            <>
                              <strong>Match review</strong>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Dimension</th>
                                    <th>Severity</th>
                                    <th className="num">Expected</th>
                                    <th className="num">Actual</th>
                                    <th className="num">Variance</th>
                                    <th>Approval</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {inv.matchItems.map((m) => (
                                    <tr key={m.id}>
                                      <td>{m.matchDimension.replaceAll('_', ' ')}</td>
                                      <td>
                                        <StatusBadge status={m.severity === 'approval_required' ? 'counted' : 'approved'} />
                                      </td>
                                      <td className="num">{m.expectedValue ?? '—'}</td>
                                      <td className="num">{m.actualValue ?? '—'}</td>
                                      <td className="num">{m.variance ?? '—'}</td>
                                      <td>{m.approvedBy ? `${m.approvalReason ?? ''}` : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : (
                            <p className="muted">No match exceptions recorded.</p>
                          )}
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
