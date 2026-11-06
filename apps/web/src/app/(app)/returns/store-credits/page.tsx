'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { formatMoney } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';

interface StoreCredit {
  id: string;
  code: string;
  customerName: string | null;
  amount: string;
  redeemedAmount: string;
  remainingAmount: string;
  businessDate: string;
  expiryDate: string | null;
  status: string;
  createdAt: string;
}
interface InvoiceSummary { id: string; code: string; amountDue: string }

export default function StoreCreditsPage() {
  const session = useSession();
  const [credits, setCredits] = useState<StoreCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [redeemFor, setRedeemFor] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemInvoice, setRedeemInvoice] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setCredits(await apiFetch<StoreCredit[]>(`/returns/store-credits${qs({ limit: 100 })}`, { token }));
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

  async function startRedeem(creditId: string) {
    if (!session) return;
    setRedeemFor(creditId);
    setRedeemAmount('');
    setRedeemInvoice('');
    try {
      const list = await apiFetch<InvoiceSummary[]>(`/sales/invoices?limit=30`, { token: session.accessToken });
      setInvoices(list.filter((i) => Number(i.amountDue) > 0));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function redeem(creditId: string) {
    if (!session || !redeemInvoice || Number(redeemAmount) <= 0) return;
    setBusy(creditId);
    try {
      await apiFetch('/returns/store-credits/redeem', {
        method: 'POST',
        body: { storeCreditId: creditId, invoiceId: redeemInvoice, amount: redeemAmount },
        token: session.accessToken,
      });
      setOkMsg('Store credit redeemed against the invoice.');
      setRedeemFor(null);
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
      <div className="page-head"><h1>Store Credits</h1></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}
      <section className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : credits.length === 0 ? (
          <p className="muted">No store credits yet — they are issued by credit notes with the store-credit disposition.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Customer</th><th>Status</th><th className="num">Issued</th>
                <th className="num">Redeemed</th><th className="num">Remaining</th><th>Expiry</th><th></th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.customerName ?? '—'}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="num">{formatMoney(c.amount)}</td>
                  <td className="num">{formatMoney(c.redeemedAmount)}</td>
                  <td className="num">{formatMoney(c.remainingAmount)}</td>
                  <td>{c.expiryDate ?? '—'}</td>
                  <td>
                    {c.status === 'active' && Number(c.remainingAmount) > 0 && (
                      <button className="btn-sm" onClick={() => void startRedeem(c.id)}>Redeem</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {redeemFor && (
        <section className="card">
          <h2>Redeem store credit</h2>
          <div className="form-row">
            <select className="input" value={redeemInvoice} onChange={(e) => setRedeemInvoice(e.target.value)}>
              <option value="">Select an invoice with an open balance…</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.code} — due {formatMoney(i.amountDue)}</option>
              ))}
            </select>
            <input
              className="input"
              type="number"
              min={0}
              step="any"
              placeholder="Amount to redeem"
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
            />
            <button className="btn btn-primary" disabled={busy === redeemFor || !redeemInvoice || Number(redeemAmount) <= 0} onClick={() => void redeem(redeemFor)}>
              {busy === redeemFor ? 'Redeeming…' : 'Redeem'}
            </button>
            <button className="btn" onClick={() => setRedeemFor(null)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}
