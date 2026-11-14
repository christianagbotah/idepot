'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';

interface AlertRow {
  id: string;
  rule_id: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  entity_type: string;
  entity_label: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AlertDetail {
  alert: AlertRow & {
    reason: string;
    evidence: Record<string, unknown>;
    resolution_note: string | null;
    total_feedback: number;
    useful_count: number;
  };
  feedback: Array<{ id: string; useful: boolean; reason: string | null; created_at: string }>;
}

interface RunRow {
  id: string;
  rule_id: string;
  rule_version: string;
  alerts_created: number;
  alerts_suppressed: number;
  status: 'completed' | 'failed';
  error: string | null;
  finished_at: string | null;
}

interface RuleEntry {
  ruleId: string;
  description: string;
  defaults: string;
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'sev-critical',
  warning: 'sev-warning',
  info: 'sev-info',
};

function canManage(roles: string[]): boolean {
  return roles.some((r) => r === 'owner' || r === 'admin' || r === 'manager');
}

export default function IntelligencePage() {
  const session = useSession();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [ruleId, setRuleId] = useState('');
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const params = qs({
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(ruleId ? { ruleId } : {}),
      });
      const [a, r, rn] = await Promise.all([
        apiFetch<AlertRow[]>(`/intelligence/alerts${params}`, { token }),
        apiFetch<RuleEntry[]>('/intelligence/rules', { token }),
        apiFetch<RunRow[]>('/intelligence/runs?limit=8', { token }),
      ]);
      setAlerts(a);
      setRules(r);
      setRuns(rn);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, severity, ruleId]);

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  async function scan() {
    if (!session) return;
    setBusy(true);
    setOkMsg('');
    try {
      const result = await apiFetch<{ runs: Array<{ ruleId: string; status: string; alertsCreated: number; alertsSuppressed: number }> }>(
        '/intelligence/scan',
        { method: 'POST', body: { windowDays: 30 }, token: session.accessToken },
      );
      const created = result.runs.reduce((s, r) => s + r.alertsCreated, 0);
      const failed = result.runs.filter((r) => r.status === 'failed');
      setOkMsg(
        `Scan complete: ${created} new alert(s)` +
          (failed.length > 0 ? ` — FAILED rules: ${failed.map((r) => r.ruleId).join(', ')}` : '.'),
      );
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: string) {
    if (!session) return;
    setNote('');
    try {
      setDetail(await apiFetch<AlertDetail>(`/intelligence/alerts/${id}`, { token: session.accessToken }));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function lifecycle(id: string, action: 'acknowledge' | 'resolve' | 'dismiss') {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/intelligence/alerts/${id}/${action}`, {
        method: 'POST',
        body: action === 'acknowledge' ? {} : { note: note || null },
        token: session.accessToken,
      });
      setDetail(null);
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function feedback(id: string, useful: boolean) {
    if (!session) return;
    setBusy(true);
    try {
      await apiFetch(`/intelligence/alerts/${id}/feedback`, {
        method: 'POST',
        body: { useful, reason: note || null },
        token: session.accessToken,
      });
      await openDetail(id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;
  const manage = canManage(session.user.roles);

  return (
    <div>
      <div className="page-head">
        <h1>Intelligence Alerts</h1>
        {manage && (
          <button className="btn btn-primary" disabled={busy} onClick={() => void scan()}>
            {busy ? 'Working…' : 'Run scan now'}
          </button>
        )}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}
      <p className="muted">
        Rules-based advisory alerts (Phase 7a): dead stock, stockout risk and operational anomalies.
        Alerts never change financial state — a human investigates, then acknowledges, resolves or
        dismisses with a note. Thresholds live in tenant settings (<code>intelligence.rules</code>).
      </p>

      <section className="card">
        <div className="form-row">
          <label>
            Status{' '}
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label>
            Severity{' '}
            <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label>
            Rule{' '}
            <select className="input" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
              <option value="">All</option>
              {rules.map((r) => (
                <option key={r.ruleId} value={r.ruleId}>{r.ruleId}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="muted">
            No alerts{status || severity || ruleId ? ' for this filter' : ' yet'} — run a scan or adjust the filters.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Rule</th>
                <th>Alert</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td><span className={`sev-badge ${SEVERITY_CLASS[a.severity]}`}>{a.severity}</span></td>
                  <td>{a.rule_id}</td>
                  <td>
                    <strong>{a.title}</strong>
                    <br />
                    <span className="muted">{a.entity_label}</span>
                  </td>
                  <td>{a.status}</td>
                  <td>{new Date(a.updated_at).toLocaleString()}</td>
                  <td>
                    <button className="btn-sm" onClick={() => void openDetail(a.id)}>Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail && (
        <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
          <h2>{detail.alert.title}</h2>
          <p><strong>{detail.alert.rule_id}</strong> · {detail.alert.entity_label} · {detail.alert.status}</p>
          <p>{detail.alert.reason}</p>
          <details>
            <summary>Evidence</summary>
            <pre style={{ overflowX: 'auto' }}>{JSON.stringify(detail.alert.evidence, null, 2)}</pre>
          </details>
          <p className="muted">
            Feedback: {detail.alert.useful_count}/{detail.alert.total_feedback} marked useful
            {detail.alert.resolution_note ? ` · resolution note: ${detail.alert.resolution_note}` : ''}
          </p>
          <div className="form-row">
            <input
              className="input"
              type="text"
              placeholder="Note (required to dismiss)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn" disabled={busy} onClick={() => void feedback(detail.alert.id, true)}>Useful</button>
            <button className="btn" disabled={busy} onClick={() => void feedback(detail.alert.id, false)}>Not useful</button>
            {manage && detail.alert.status !== 'resolved' && detail.alert.status !== 'dismissed' && (
              <>
                {detail.alert.status === 'open' && (
                  <button className="btn" disabled={busy} onClick={() => void lifecycle(detail.alert.id, 'acknowledge')}>Acknowledge</button>
                )}
                <button className="btn" disabled={busy} onClick={() => void lifecycle(detail.alert.id, 'resolve')}>Resolve</button>
                <button className="btn btn-danger" disabled={busy || !note} onClick={() => void lifecycle(detail.alert.id, 'dismiss')}>Dismiss</button>
              </>
            )}
            <button className="btn" onClick={() => setDetail(null)}>Close</button>
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
        <h2>Recent rule runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Rule</th><th>Version</th><th className="num">Created</th><th className="num">Suppressed</th><th>Status</th><th>Finished</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.rule_id}</td>
                  <td>{r.rule_version}</td>
                  <td className="num">{r.alerts_created}</td>
                  <td className="num">{r.alerts_suppressed}</td>
                  <td>{r.status === 'failed' ? <span className="error-text">failed</span> : r.status}</td>
                  <td>{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
