'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { StatusBadge } from '../../../../components/status-badge';
import type { GlAccountWebDto } from '../../../../lib/types-phase4';

const CLASSES = ['asset', 'liability', 'equity', 'revenue', 'cost_of_sales', 'operating_expense', 'other_income', 'other_expense'];
const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export default function ChartOfAccountsPage() {
  const session = useSession();
  const [accounts, setAccounts] = useState<GlAccountWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [classFilter, setClassFilter] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('expense');
  const [accountClass, setAccountClass] = useState('operating_expense');
  const [parentCode, setParentCode] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setAccounts(await apiFetch<GlAccountWebDto[]>('/accounting/accounts', { token }));
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
    setBusy(true);
    try {
      await apiFetch('/accounting/accounts', {
        method: 'POST',
        token: sess.accessToken,
        body: { code, name, accountType, accountClass, parentCode: parentCode || null },
      });
      setOkMsg(`Account ${code} created.`);
      setCode('');
      setName('');
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm('Deactivate this account? (Financial evidence is never deleted.)')) return;
    try {
      await apiFetch(`/accounting/accounts/${id}/deactivate`, { method: 'POST', token: sess.accessToken, body: {} });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  const filtered = classFilter === '' ? accounts : accounts.filter((a) => a.accountClass === classFilter);

  return (
    <div>
      <div className="page-head">
        <h1>Chart of Accounts</h1>
      </div>

      <section className="card">
        <h2>New account</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Code
              <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="e.g. 6100" />
            </label>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Broad type
              <select
                value={accountType}
                onChange={(e) => {
                  setAccountType(e.target.value);
                  if (e.target.value === 'asset') setAccountClass('asset');
                  if (e.target.value === 'liability') setAccountClass('liability');
                  if (e.target.value === 'equity') setAccountClass('equity');
                  if (e.target.value === 'revenue') setAccountClass('revenue');
                  if (e.target.value === 'expense') setAccountClass('operating_expense');
                }}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Statement class
              <select value={accountClass} onChange={(e) => setAccountClass(e.target.value)}>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Parent (grouping) account
              <select value={parentCode} onChange={(e) => setParentCode(e.target.value)}>
                <option value="">None</option>
                {accounts
                  .filter((a) => !a.isPosting)
                  .map((a) => (
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
        <div className="toolbar">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll('_', ' ')}
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
        ) : filtered.length === 0 ? (
          <p className="muted">No accounts.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Parent</th>
                  <th>Normal</th>
                  <th>Flags</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{a.name}</td>
                    <td>{a.accountClass.replaceAll('_', ' ')}</td>
                    <td>{a.parentCode ?? '—'}</td>
                    <td>{a.normalBalance}</td>
                    <td>
                      {a.isControl ? 'control ' : ''}
                      {a.isPosting ? '' : 'grouping'}
                    </td>
                    <td>
                      <StatusBadge status={a.isActive ? 'active' : 'inactive'} />
                    </td>
                    <td>
                      {a.isActive ? (
                        <button className="btn btn-sm" type="button" onClick={() => void deactivate(a.id)}>
                          Deactivate
                        </button>
                      ) : null}
                    </td>
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
