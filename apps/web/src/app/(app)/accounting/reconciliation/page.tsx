'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import type { ReconciliationWebDto } from '../../../../lib/types-phase4';

export default function ReconciliationPage() {
  const session = useSession();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReconciliationWebDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        setReport(await apiFetch<ReconciliationWebDto>(`/accounting/reconciliation?asOf=${asOf}`, { token }));
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [asOf],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  return (
    <div>
      <div className="page-head">
        <h1>Control-Account Reconciliation</h1>
        <div className="toolbar">
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <button className="btn btn-sm" type="button" onClick={() => void load(sess.accessToken)}>
            Refresh
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Subledger ↔ GL control tie-outs</h2>
        <p className="muted">
          Differences are surfaced explicitly — never hidden with an automatic plug. All checks must pass before a
          period close.
        </p>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : report ? (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  <th className="num">GL control</th>
                  <th className="num">Subledger</th>
                  <th className="num">Difference</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {report.checks.map((c) => (
                  <tr key={c.check}>
                    <td>
                      {c.check.replaceAll('_', ' ')}
                      <div className="muted">{c.detail}</div>
                    </td>
                    <td className="num">{formatMoney(c.controlBalance)}</td>
                    <td className="num">{formatMoney(c.subledgerBalance)}</td>
                    <td className="num">{formatMoney(c.difference)}</td>
                    <td className={c.passed ? 'ok-text' : 'error-text'}>{c.passed ? 'PASS' : 'DIFFERENCE'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
