'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import type { BankAccountWebDto, BankTransferWebDto } from '../../../../lib/types-phase4';

export default function BankTransfersPage() {
  const session = useSession();
  const [accounts, setAccounts] = useState<BankAccountWebDto[]>([]);
  const [transfers, setTransfers] = useState<BankTransferWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [reference, setReference] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const [acc, trf] = await Promise.all([
        apiFetch<BankAccountWebDto[]>('/banking/accounts', { token }),
        apiFetch<BankTransferWebDto[]>('/banking/transfers', { token }),
      ]);
      setAccounts(acc);
      setTransfers(trf);
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

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    if (fromId === '' || toId === '' || fromId === toId || amount === '') {
      setFormError('Two different accounts and an amount are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<BankTransferWebDto>('/banking/transfers', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          fromBankAccountId: fromId,
          toBankAccountId: toId,
          businessDate,
          amount,
          fee: fee || undefined,
          reference: reference || undefined,
        },
      });
      setOkMsg(`Transfer ${created.code} posted.`);
      setAmount('');
      setFee('');
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
        <h1>Bank Transfers</h1>
      </div>

      <section className="card">
        <h2>New transfer</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              From account
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.bankName} ({formatMoney(a.glBalance)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              To account
              <select value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.bankName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
            </label>
            <label>
              Fee
              <input value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00" />
            </label>
            <label>
              Reference
              <input value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post transfer'}
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
        <h2>Posted transfers</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : transfers.length === 0 ? (
          <p className="muted">No transfers yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="num">Amount</th>
                  <th className="num">Fee</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.code}</td>
                    <td>{t.businessDate}</td>
                    <td>{t.fromAccountCode ?? '—'}</td>
                    <td>{t.toAccountCode ?? '—'}</td>
                    <td className="num">{formatMoney(t.amount)}</td>
                    <td className="num">{formatMoney(t.fee)}</td>
                    <td>{t.reference ?? '—'}</td>
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
