'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { formatMoney, formatDateTime } from '../../../../lib/format';

interface CreditNote {
  id: string;
  code: string;
  returnOrderCode: string | null;
  invoiceCode: string | null;
  customerName: string | null;
  businessDate: string;
  total: string;
  netRevenueReversal: string;
  taxReversalTotal: string;
  arAmount: string;
  refundAmount: string;
  storeCreditAmount: string;
  cogsReversal: string;
  refundedAmount: string;
  outstandingRefundAmount: string;
  createdAt: string;
  taxComponents: Array<{ componentName: string; rate: string; taxAmount: string }>;
}

export default function CreditNotesPage() {
  const session = useSession();
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refundDraft, setRefundDraft] = useState<Record<string, { amount: string; method: string }>>({});

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setNotes(await apiFetch<CreditNote[]>(`/returns/credit-notes${qs({ limit: 100 })}`, { token }));
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  async function createRefund(creditNoteId: string) {
    if (!session) return;
    const draft = refundDraft[creditNoteId];
    if (!draft || Number(draft.amount) <= 0) return;
    setBusy(creditNoteId);
    setOkMsg('');
    try {
      await apiFetch('/returns/refunds', {
        method: 'POST',
        body: { creditNoteId, amount: draft.amount, method: draft.method, approveAndPost: true },
        token: session.accessToken,
      });
      setOkMsg('Refund posted.');
      setRefundDraft((prev) => ({ ...prev, [creditNoteId]: { amount: '', method: 'cash' } }));
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  return (
    <div>
      <div className="page-head"><h1>Credit Notes</h1></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}
      <section className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="muted">No credit notes yet — they are issued when a return is processed.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Return</th><th>Invoice</th><th>Customer</th><th>Date</th>
                <th className="num">Total credit</th><th className="num">AR settled</th><th className="num">Refund due</th>
                <th className="num">Store credit</th><th className="num">Refunded so far</th><th></th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => {
                const draft = refundDraft[n.id] ?? { amount: '', method: 'cash' };
                const outstanding = Number(n.outstandingRefundAmount);
                return (
                  <>
                    <tr key={n.id}>
                      <td><button className="btn-sm" onClick={() => setExpanded(expanded === n.id ? null : n.id)}>{n.code}</button></td>
                      <td>{n.returnOrderCode}</td>
                      <td>{n.invoiceCode}</td>
                      <td>{n.customerName ?? '—'}</td>
                      <td>{n.businessDate}</td>
                      <td className="num">{formatMoney(n.total)}</td>
                      <td className="num">{formatMoney(n.arAmount)}</td>
                      <td className="num">{formatMoney(n.refundAmount)}</td>
                      <td className="num">{formatMoney(n.storeCreditAmount)}</td>
                      <td className="num">{formatMoney(n.refundedAmount)}</td>
                      <td>
                        {outstanding > 0 && (
                          <>
                            <input
                              className="input-sm"
                              type="number"
                              min={0}
                              step="any"
                              placeholder={n.outstandingRefundAmount}
                              value={draft.amount}
                              style={{ width: '6.5rem' }}
                              onChange={(e) => setRefundDraft((p) => ({ ...p, [n.id]: { ...draft, amount: e.target.value } }))}
                            />{' '}
                            <select
                              className="input-sm"
                              value={draft.method}
                              onChange={(e) => setRefundDraft((p) => ({ ...p, [n.id]: { ...draft, method: e.target.value } }))}
                            >
                              <option value="cash">Cash</option>
                              <option value="momo">MoMo</option>
                              <option value="bank_transfer">Bank</option>
                              <option value="cheque">Cheque</option>
                            </select>{' '}
                            <button className="btn-sm" disabled={busy === n.id || Number(draft.amount) <= 0} onClick={() => void createRefund(n.id)}>
                              Refund
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expanded === n.id && (
                      <tr key={`${n.id}-detail`}>
                        <td colSpan={11}>
                          <p>Revenue reversal {formatMoney(n.netRevenueReversal)} · Tax reversal {formatMoney(n.taxReversalTotal)} · COGS reversal {formatMoney(n.cogsReversal)}</p>
                          {n.taxComponents.map((t) => (
                            <p key={t.componentName} className="muted">Tax component {t.componentName} ({Number(t.rate) * 100}%): {formatMoney(t.taxAmount)}</p>
                          ))}
                          <p className="muted">Issued {formatDateTime(n.createdAt)}</p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
