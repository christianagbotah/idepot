'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';

interface Snapshot {
  metric: string;
  periodStart: string;
  periodEnd: string;
  value: string;
  unit: string;
  calculatedAt: string;
}
interface Definition { metric: string; unit: string; definition: string }
interface Target {
  id: string;
  metric: string;
  periodStart: string;
  periodEnd: string;
  targetValue: string;
}
interface Achievement {
  metric: string;
  target: string;
  actual: string | null;
  achievementPct: string | null;
  gap: string | null;
  zeroTarget: boolean;
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function KpiPage() {
  const session = useSession();
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [newTarget, setNewTarget] = useState({ metric: 'net_sales', targetValue: '' });

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const [defs, snaps, targs, ach] = await Promise.all([
        apiFetch<Definition[]>('/reports/kpi/definitions', { token }),
        apiFetch<Snapshot[]>(`/reports/kpi/snapshots${qs({ from, to })}`, { token }),
        apiFetch<Target[]>('/reports/kpi/targets', { token }),
        apiFetch<Achievement[]>(`/reports/kpi/achievements${qs({ from, to })}`, { token }),
      ]);
      setDefinitions(defs);
      setSnapshots(snaps);
      setTargets(targs);
      setAchievements(ach);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  async function rebuild() {
    if (!session) return;
    setBusy(true);
    setOkMsg('');
    try {
      const result = await apiFetch<Snapshot[]>('/reports/kpi/snapshots/rebuild', {
        method: 'POST',
        body: { from, to },
        token: session.accessToken,
      });
      setOkMsg(`Rebuilt ${result.length} KPI snapshots for ${from}..${to}.`);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createTarget() {
    if (!session || Number(newTarget.targetValue) <= 0) return;
    setBusy(true);
    try {
      await apiFetch('/reports/kpi/targets', {
        method: 'POST',
        body: {
          metric: newTarget.metric,
          periodStart: from,
          periodEnd: to,
          targetValue: newTarget.targetValue,
        },
        token: session.accessToken,
      });
      setNewTarget({ metric: 'net_sales', targetValue: '' });
      setOkMsg('Target created.');
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTarget(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/reports/kpi/targets/${id}/delete`, { method: 'POST', body: {}, token: session.accessToken });
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const defByMetric = new Map(definitions.map((d) => [d.metric, d]));

  return (
    <div>
      <div className="page-head"><h1>KPI Dashboard</h1></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}

      <section className="card">
        <div className="form-row">
          <label>From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={busy} onClick={() => void rebuild()}>
            {busy ? 'Working…' : 'Rebuild snapshots'}
          </button>
        </div>
        <p className="muted">
          Snapshots are derived, reproducible values — never authoritative ledgers. Each carries its source watermark.
        </p>
      </section>

      <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
        <h2>Current Period Snapshots</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : snapshots.length === 0 ? (
          <p className="muted">No snapshots yet — run a rebuild for the period.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--idp-space-3)' }}>
            {snapshots.map((s) => {
              const def = defByMetric.get(s.metric);
              const isMoney = s.unit === 'money';
              return (
                <div key={`${s.metric}-${s.periodStart}`} className="card" style={{ margin: 0, padding: 'var(--idp-space-3)' }}>
                  <h3 style={{ fontSize: 'var(--idp-text-sm)' }}>{s.metric.replaceAll('_', ' ')}</h3>
                  <p style={{ fontSize: 'var(--idp-text-xl)', fontWeight: 600 }}>
                    {isMoney ? formatMoney(s.value) : Number(s.value).toFixed(s.unit === 'count' ? 0 : 4)}
                  </p>
                  <p className="muted" style={{ fontSize: 'var(--idp-text-xs)' }}>
                    {def?.definition ?? s.unit}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
        <h2>Targets &amp; Achievement</h2>
        <div className="form-row">
          <select className="input" value={newTarget.metric} onChange={(e) => setNewTarget((p) => ({ ...p, metric: e.target.value }))}>
            {definitions.map((d) => <option key={d.metric} value={d.metric}>{d.metric.replaceAll('_', ' ')}</option>)}
          </select>
          <input
            className="input"
            type="number"
            min={0}
            step="any"
            placeholder="Target value"
            value={newTarget.targetValue}
            onChange={(e) => setNewTarget((p) => ({ ...p, targetValue: e.target.value }))}
          />
          <button className="btn" disabled={busy || Number(newTarget.targetValue) <= 0} onClick={() => void createTarget()}>Set target for period</button>
        </div>
        {targets.length === 0 ? (
          <p className="muted">No targets configured.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Metric</th><th>Period</th><th className="num">Target</th><th className="num">Actual</th><th className="num">Achievement</th><th className="num">Gap</th><th></th></tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const ach = achievements.find((a) => a.metric === t.metric);
                return (
                  <tr key={t.id}>
                    <td>{t.metric.replaceAll('_', ' ')}</td>
                    <td>{t.periodStart} → {t.periodEnd}</td>
                    <td className="num">{formatMoney(t.targetValue)}</td>
                    <td className="num">{ach?.actual ? formatMoney(ach.actual) : '—'}</td>
                    <td className="num">{ach?.achievementPct ? `${Number(ach.achievementPct).toFixed(1)}%` : ach?.zeroTarget ? 'zero target' : '—'}</td>
                    <td className="num">{ach?.gap ? formatMoney(ach.gap) : '—'}</td>
                    <td><button className="btn-sm" disabled={busy} onClick={() => void deleteTarget(t.id)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
