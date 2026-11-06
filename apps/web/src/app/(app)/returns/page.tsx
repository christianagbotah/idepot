'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';
import { formatMoney, formatDateTime } from '../../../lib/format';
import { StatusBadge } from '../../../components/status-badge';

interface ReturnLine {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  quantity: string;
  condition: string;
  disposition: string;
  effectiveNet: string;
}
interface ReturnOrder {
  id: string;
  code: string;
  invoiceCode: string | null;
  customerName: string | null;
  status: string;
  reasonCode: string | null;
  creditDisposition: string;
  grossCredit: string | null;
  arAmount: string | null;
  refundAmount: string | null;
  storeCreditAmount: string | null;
  cogsReversal: string | null;
  creditNoteCode: string | null;
  businessDate: string;
  createdAt: string;
  lines: ReturnLine[];
}
interface Refund {
  id: string;
  code: string;
  creditNoteCode: string | null;
  customerName: string | null;
  amount: string;
  method: string;
  status: string;
  businessDate: string;
}

export default function ReturnsPage() {
  const session = useSession();
  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const [r, f] = await Promise.all([
        apiFetch<ReturnOrder[]>(`/returns${qs({ status: statusFilter || undefined, limit: 100 })}`, { token }),
        apiFetch<Refund[]>(`/returns/refunds${qs({ limit: 50 })}`, { token }),
      ]);
      setReturns(r);
      setRefunds(f);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  async function act(id: string, action: string, body?: Record<string, unknown>) {
    if (!session) return;
    setBusy(`${id}:${action}`);
    setOkMsg('');
    try {
      await apiFetch(`/returns/${id}/${action}`, { method: 'POST', body: body ?? {}, token: session.accessToken });
      setOkMsg(`Return ${action} succeeded.`);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function refundAction(id: string, action: string, body?: Record<string, unknown>) {
    if (!session) return;
    setBusy(`${id}:${action}`);
    try {
      await apiFetch(`/returns/refunds/${id}/${action}`, { method: 'POST', body: body ?? {}, token: session.accessToken });
      setOkMsg(`Refund ${action} succeeded.`);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function settleRefund(id: string) {
    const settlementReference = window.prompt('External settlement reference (e.g. momo transaction id):');
    if (!settlementReference) return;
    await refundAction(id, 'settle', { settlementReference });
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const pending = returns.filter((r) => r.status === 'submitted');

  return (
    <div>
      <div className="page-head">
        <h1>Returns &amp; Refunds</h1>
        <a className="btn" href="/returns/new">New Return</a>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}

      <section className="card" style={{ marginBottom: 'var(--idp-space-4)' }}>
        <h2>Approval Queue ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">No returns awaiting approval.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Invoice</th><th>Customer</th><th>Reason</th><th className="num">Lines</th><th></th></tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.invoiceCode}</td>
                  <td>{r.customerName ?? '—'}</td>
                  <td>{r.reasonCode}</td>
                  <td className="num">{r.lines.length}</td>
                  <td>
                    <button className="btn-sm" disabled={busy === `${r.id}:approve`} onClick={() => act(r.id, 'approve')}>Approve</button>{' '}
                    <button className="btn-sm" disabled={busy === `${r.id}:reject`} onClick={() => {
                      const reason = window.prompt('Rejection reason (min 10 chars):');
                      if (reason && reason.length >= 10) void act(r.id, 'reject', { reason });
                    }}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="toolbar">
          <h2>All Returns</h2>
          <select className="input-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {['draft', 'submitted', 'approved', 'received', 'processed', 'completed', 'rejected', 'cancelled'].map((s) => (
              <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : returns.length === 0 ? (
          <p className="muted">No returns yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Invoice</th><th>Customer</th><th>Status</th><th>Disposition</th>
                <th className="num">Gross credit</th><th className="num">AR settled</th><th className="num">Refund due</th>
                <th className="num">Store credit</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <>
                  <tr key={r.id}>
                    <td><button className="btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.code}</button></td>
                    <td>{r.invoiceCode}</td>
                    <td>{r.customerName ?? '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.creditDisposition === 'refund' ? 'Refund' : 'Store credit'}</td>
                    <td className="num">{r.grossCredit ? formatMoney(r.grossCredit) : '—'}</td>
                    <td className="num">{r.arAmount ? formatMoney(r.arAmount) : '—'}</td>
                    <td className="num">{r.refundAmount ? formatMoney(r.refundAmount) : '—'}</td>
                    <td className="num">{r.storeCreditAmount ? formatMoney(r.storeCreditAmount) : '—'}</td>
                    <td>{r.businessDate}</td>
                    <td>
                      {r.status === 'draft' && <button className="btn-sm" disabled={busy === `${r.id}:submit`} onClick={() => act(r.id, 'submit', {})}>Submit</button>}
                      {r.status === 'approved' && <button className="btn-sm" disabled={busy === `${r.id}:receive`} onClick={() => act(r.id, 'receive', {})}>Receive</button>}
                      {r.status === 'received' && <button className="btn-sm" disabled={busy === `${r.id}:process`} onClick={() => act(r.id, 'process', {})}>Process</button>}
                      {(r.status === 'draft' || r.status === 'submitted' || r.status === 'approved') && (
                        <button className="btn-sm" disabled={busy === `${r.id}:cancel`} onClick={() => {
                          const reason = window.prompt('Cancellation reason (min 10 chars):');
                          if (reason && reason.length >= 10) void act(r.id, 'cancel', { reason });
                        }}>Cancel</button>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={11}>
                        <strong>Lines</strong>
                        <table className="table">
                          <thead><tr><th>Product</th><th className="num">Qty</th><th>Condition</th><th>Disposition</th><th className="num">Effective net</th></tr></thead>
                          <tbody>
                            {r.lines.map((l) => (
                              <tr key={l.id}>
                                <td>{l.productCode ?? l.productId.slice(0, 8)}</td>
                                <td className="num">{Number(l.quantity)}</td>
                                <td>{l.condition.replaceAll('_', ' ')}</td>
                                <td>{l.disposition.replaceAll('_', ' ')}</td>
                                <td className="num">{formatMoney(l.effectiveNet)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {r.creditNoteCode && <p>Credit note: <strong>{r.creditNoteCode}</strong></p>}
                        {r.cogsReversal && <p>COGS reversal: {formatMoney(r.cogsReversal)}</p>}
                        <p className="muted">Created {formatDateTime(r.createdAt)}</p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
        <h2>Refunds</h2>
        {refunds.length === 0 ? (
          <p className="muted">No refunds yet. Refunds are created from a processed return&rsquo;s credit note.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Credit note</th><th>Customer</th><th className="num">Amount</th><th>Method</th><th>Status</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  <td>{r.creditNoteCode}</td>
                  <td>{r.customerName ?? '—'}</td>
                  <td className="num">{formatMoney(r.amount)}</td>
                  <td>{r.method.replaceAll('_', ' ')}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.businessDate}</td>
                  <td>
                    {r.status === 'requested' && <button className="btn-sm" disabled={busy === `${r.id}:approve`} onClick={() => refundAction(r.id, 'approve', {})}>Approve</button>}
                    {r.status === 'approved' && <button className="btn-sm" disabled={busy === `${r.id}:post`} onClick={() => refundAction(r.id, 'post', {})}>Post</button>}
                    {r.status === 'posted' && r.method !== 'cash' && <button className="btn-sm" disabled={busy === `${r.id}:settle`} onClick={() => settleRefund(r.id)}>Settle</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
