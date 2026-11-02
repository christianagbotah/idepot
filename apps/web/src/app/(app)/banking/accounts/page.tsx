'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type { BankAccountWebDto, GlAccountWebDto } from '../../../../lib/types-phase4';

export default function BankAccountsPage() {
  const session = useSession();
  const [accounts, setAccounts] = useState<BankAccountWebDto[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccountWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [glAccountCode, setGlAccountCode] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setAccounts(await apiFetch<BankAccountWebDto[]>('/banking/accounts', { token }));
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
    void apiFetch<GlAccountWebDto[]>('/accounting/accounts', { token: session.accessToken }).then(
      (res) => setGlAccounts(res.filter((a) => a.isActive && a.isPosting && a.accountClass === 'asset')),
      () => undefined,
    );
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    setBusy(true);
    try {
      await apiFetch('/banking/accounts', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          code,
          bankName,
          branch: branch || undefined,
          accountName,
          accountNumber,
          glAccountCode,
        },
      });
      setOkMsg(`Bank account ${code} created.`);
      setCode('');
      setAccountNumber('');
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
        <h1>Bank Accounts</h1>
      </div>

      <section className="card">
        <h2>New bank account</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Code
              <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. GCB-01" />
            </label>
            <label>
              Bank
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} required />
            </label>
            <label>
              Branch
              <input value={branch} onChange={(e) => setBranch(e.target.value)} />
            </label>
            <label>
              Account name
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
            </label>
            <label>
              Account number
              <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
            </label>
            <label>
              GL account (asset)
              <select value={glAccountCode} onChange={(e) => setGlAccountCode(e.target.value)} required>
                <option value="">Select GL account…</option>
                {glAccounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
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
        <h2>Accounts</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : accounts.length === 0 ? (
          <p className="muted">No bank accounts yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th>GL</th>
                  <th>Status</th>
                  <th className="num">GL balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>
                      {a.bankName}
                      {a.branch ? ` · ${a.branch}` : ''}
                    </td>
                    <td>
                      {a.accountName} ({a.accountNumber})
                    </td>
                    <td>{a.glAccountCode ?? '—'}</td>
                    <td>
                      <StatusBadge status={a.isActive ? 'active' : 'inactive'} />
                    </td>
                    <td className="num">{formatMoney(a.glBalance)}</td>
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
