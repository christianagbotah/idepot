'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { formatMoney } from '../../../../lib/format';

interface InvoiceSummary {
  id: string;
  code: string;
  customerName: string | null;
  businessDate: string;
  total: string;
  paymentStatus: string;
}
interface ReturnableLine {
  invoiceLineId: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  quantityBase: string;
  returnedQuantityBase: string;
  returnableQuantityBase: string;
  unitPrice: string;
  lineNet: string;
  effectiveNet: string;
}
interface ReturnableInvoice {
  invoiceId: string;
  code: string;
  customerName: string | null;
  businessDate: string;
  total: string;
  paymentStatus: string;
  amountPaid: string;
  amountDue: string;
  lines: ReturnableLine[];
}
interface Reason {
  code: string;
  name: string;
  requiresApproval: boolean;
}
interface LineDraft {
  invoiceLineId: string;
  quantity: string;
  condition: string;
  disposition: string;
}

const CONDITIONS = ['new_unopened', 'like_new', 'good', 'fair', 'damaged', 'defective', 'unsellable', 'quarantine_pending'];
const DISPOSITIONS = ['restock_sellable', 'restock_damaged', 'quarantine', 'scrap', 'reject', 'no_restock'];

export default function NewReturnPage() {
  const session = useSession();
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selected, setSelected] = useState<ReturnableInvoice | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [reasonCode, setReasonCode] = useState('');
  const [disposition, setDisposition] = useState<'refund' | 'store_credit'>('refund');
  const [customerNote, setCustomerNote] = useState('');
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const list = await apiFetch<InvoiceSummary[]>(`/sales/invoices?limit=30`, { token: session.accessToken });
        setInvoices(list);
        const r = await apiFetch<Reason[]>(`/returns/reasons`, { token: session.accessToken });
        setReasons(r.filter((x) => x.code));
        if (r.length > 0) setReasonCode(r[0]!.code);
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    })();
  }, [session]);

  const openInvoice = useCallback(async (invoiceId: string) => {
    if (!session) return;
    setSelected(null);
    setDrafts({});
    try {
      const inv = await apiFetch<ReturnableInvoice>(`/returns/returnable-invoice/${invoiceId}`, { token: session.accessToken });
      setSelected(inv);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [session]);

  const filtered = invoices.filter(
    (i) => !search || i.code.toLowerCase().includes(search.toLowerCase()) || (i.customerName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  async function submitReturn() {
    if (!session || !selected) return;
    setBusy(true);
    setOkMsg('');
    try {
      const lines = Object.values(drafts)
        .filter((d) => Number(d.quantity) > 0)
        .map((d) => ({
          invoiceLineId: d.invoiceLineId,
          quantity: d.quantity,
          condition: d.condition,
          disposition: d.disposition,
        }));
      const created = await apiFetch<{ code: string; status: string }>('/returns', {
        method: 'POST',
        body: {
          invoiceId: selected.invoiceId,
          reasonCode,
          creditDisposition: disposition,
          lines,
          customerNote: customerNote || null,
          submit: true,
        },
        token: session.accessToken,
      });
      setOkMsg(`Return ${created.code} created (${created.status}).`);
      setSelected(null);
      setDrafts({});
      setCustomerNote('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const draftCount = Object.values(drafts).filter((d) => Number(d.quantity) > 0).length;

  if (!session) return <p className="muted">Sign in first.</p>;

  return (
    <div>
      <div className="page-head">
        <h1>New Return</h1>
        <a className="btn" href="/returns">Back to Returns</a>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}

      {!selected && (
        <section className="card">
          <h2>Find the original invoice</h2>
          <div className="form-row">
            <input
              className="input"
              placeholder="Search invoice code or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="muted">No invoices found.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Invoice</th><th>Customer</th><th>Date</th><th className="num">Total</th><th>Payment</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id}>
                    <td>{i.code}</td>
                    <td>{i.customerName ?? 'Walk-in'}</td>
                    <td>{i.businessDate}</td>
                    <td className="num">{formatMoney(i.total)}</td>
                    <td>{i.paymentStatus.replaceAll('_', ' ')}</td>
                    <td><button className="btn-sm" onClick={() => void openInvoice(i.id)}>Select</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {selected && (
        <>
          <section className="card">
            <div className="toolbar">
              <h2>{selected.code} — {selected.customerName ?? 'Walk-in'}</h2>
              <button className="btn-sm" onClick={() => { setSelected(null); setDrafts({}); }}>Change invoice</button>
            </div>
            <p className="muted">
              {selected.businessDate} · paid {formatMoney(selected.amountPaid)} · due {formatMoney(selected.amountDue)}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th><th className="num">Sold</th><th className="num">Already returned</th><th className="num">Returnable</th>
                  <th className="num">Unit price</th><th className="num">Return qty</th><th>Condition</th><th>Disposition</th>
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((l) => {
                  const draft = drafts[l.invoiceLineId];
                  const returnable = Number(l.returnableQuantityBase);
                  return (
                    <tr key={l.invoiceLineId} style={returnable <= 0 ? { opacity: 0.5 } : undefined}>
                      <td>{l.productCode ?? l.productId.slice(0, 8)} · {l.productName}</td>
                      <td className="num">{Number(l.quantityBase)}</td>
                      <td className="num">{Number(l.returnedQuantityBase)}</td>
                      <td className="num">{returnable}</td>
                      <td className="num">{formatMoney(l.unitPrice)}</td>
                      <td>
                        <input
                          className="input-sm"
                          type="number"
                          min={0}
                          max={returnable}
                          step="any"
                          disabled={returnable <= 0}
                          value={draft?.quantity ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [l.invoiceLineId]: {
                                invoiceLineId: l.invoiceLineId,
                                quantity: e.target.value,
                                condition: prev[l.invoiceLineId]?.condition ?? 'good',
                                disposition: prev[l.invoiceLineId]?.disposition ?? 'restock_sellable',
                              },
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="input-sm"
                          value={draft?.condition ?? 'good'}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [l.invoiceLineId]: {
                                invoiceLineId: l.invoiceLineId,
                                quantity: prev[l.invoiceLineId]?.quantity ?? '0',
                                condition: e.target.value,
                                disposition: prev[l.invoiceLineId]?.disposition ?? 'restock_sellable',
                              },
                            }))
                          }
                        >
                          {CONDITIONS.map((c) => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input-sm"
                          value={draft?.disposition ?? 'restock_sellable'}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [l.invoiceLineId]: {
                                invoiceLineId: l.invoiceLineId,
                                quantity: prev[l.invoiceLineId]?.quantity ?? '0',
                                condition: prev[l.invoiceLineId]?.condition ?? 'good',
                                disposition: e.target.value,
                              },
                            }))
                          }
                        >
                          {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.replaceAll('_', ' ')}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Return details</h2>
            <div className="form-grid">
              <label>
                Reason
                <select className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  {reasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}{r.requiresApproval ? ' (needs approval)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Credit disposition
                <select className="input" value={disposition} onChange={(e) => setDisposition(e.target.value as 'refund' | 'store_credit')}>
                  <option value="refund">Refund money</option>
                  <option value="store_credit">Store credit</option>
                </select>
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Customer note
                <input className="input" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} placeholder="Optional" />
              </label>
            </div>
            <button className="btn btn-primary" disabled={busy || draftCount === 0 || !reasonCode} onClick={() => void submitReturn()}>
              {busy ? 'Creating…' : `Create & submit return (${draftCount} line${draftCount === 1 ? '' : 's'})`}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
