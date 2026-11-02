'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { StatusBadge } from '../../../../components/status-badge';
import type { AccountingPeriodWebDto } from '../../../../lib/types-phase4';

export default function PeriodsPage() {
  const session = useSession();
  const [periods, setPeriods] = useState<AccountingPeriodWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setPeriods(await apiFetch<AccountingPeriodWebDto[]>('/accounting/periods', { token }));
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

  async function createYear(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    setBusy(true);
    try {
      const created = await apiFetch<AccountingPeriodWebDto[]>('/accounting/periods', {
        method: 'POST',
        token: sess.accessToken,
        body: { fiscalYear },
      });
      setOkMsg(`Created ${created.length} period(s) for ${fiscalYear}.`);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function transition(period: AccountingPeriodWebDto, status: string) {
    let reason: string | null = null;
    if (status === 'open') {
      reason = window.prompt('Reopen reason (min 10 chars — audited):');
      if (reason == null || reason.length < 10) {
        setFormError('A reopen reason of at least 10 characters is required.');
        return;
      }
    } else if (!window.confirm(`Set ${period.periodName} to ${status.replaceAll('_', ' ')}? Posting into it will be blocked accordingly.`)) {
      return;
    }
    try {
      await apiFetch(`/accounting/periods/${period.id}/status`, {
        method: 'POST',
        token: sess.accessToken,
        body: { status, ...(reason != null ? { reason } : {}) },
      });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  async function runBackfill() {
    if (!window.confirm('Run the GL backfill? It posts journals for pre-Phase-4 documents that lack them (idempotent).')) return;
    try {
      const report = await apiFetch<{ nonSaleInventoryJournals: number; preHardeningSaleJournals: number; partyOpeningBalanceJournals: number }>(
        '/accounting/backfill',
        { method: 'POST', token: sess.accessToken, body: {} },
      );
      setOkMsg(
        `Backfill complete: ${report.nonSaleInventoryJournals} inventory, ${report.preHardeningSaleJournals} sales-cycle, ${report.partyOpeningBalanceJournals} opening-balance journals.`,
      );
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Accounting Periods &amp; Close</h1>
      </div>

      <section className="card">
        <h2>Fiscal year</h2>
        <form onSubmit={createYear} className="toolbar">
          <input
            className="input-sm"
            type="number"
            min={2000}
            max={2999}
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            style={{ maxWidth: 110 }}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create monthly periods'}
          </button>
          <button className="btn" type="button" onClick={() => void runBackfill()}>
            Run GL backfill
          </button>
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
        <p className="muted">
          open = posting allowed · soft-closed = corrections only (reversals, debit/credit notes, backfill) · closed =
          nothing posts. Reopening is audited with a mandatory reason.
        </p>
      </section>

      <section className="card">
        <h2>Periods</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : periods.length === 0 ? (
          <p className="muted">No periods configured — posting is unrestricted until a period covers a date.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Status</th>
                  <th>Reopen reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td>{p.periodName}</td>
                    <td>{p.startsOn}</td>
                    <td>{p.endsOn}</td>
                    <td>
                      <StatusBadge status={p.status === 'open' ? 'active' : p.status === 'soft_closed' ? 'counted' : 'closed'} />
                    </td>
                    <td>{p.reopenReason ?? '—'}</td>
                    <td>
                      {p.status === 'open' ? (
                        <>
                          <button className="btn btn-sm" type="button" onClick={() => void transition(p, 'soft_closed')}>
                            Soft-close
                          </button>{' '}
                          <button className="btn btn-sm" type="button" onClick={() => void transition(p, 'closed')}>
                            Close
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-sm" type="button" onClick={() => void transition(p, 'open')}>
                          Reopen
                        </button>
                      )}
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
