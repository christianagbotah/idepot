'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { formatDateTime } from '../../../../lib/format';

interface AuditEvent {
  id: string;
  occurredAt: string;
  actorDisplay: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
}

export default function AuditPage() {
  const session = useSession();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: AuditEvent[]; total: number }>(
        `/reports/audit${qs({ q: q || undefined, action: action || undefined, entityType: entityType || undefined, from: from || undefined, to: to || undefined, limit: 100 })}`,
        { token },
      );
      setEvents(res.items);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [q, action, entityType, from, to]);

  useEffect(() => {
    if (session) void load(session.accessToken);
  }, [session, load]);

  if (!session) return <p className="muted">Sign in first.</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Audit Trail</h1>
        <a
          className="btn"
          href={`${
            process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001'
          }/api/reports/audit/export.csv${qs({ q: q || undefined, action: action || undefined, entityType: entityType || undefined, from: from || undefined, to: to || undefined })}`}
          target="_blank"
          rel="noreferrer"
        >
          Export CSV
        </a>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}

      <section className="card">
        <div className="form-row">
          <input className="input" placeholder="Search action, entity, actor, details…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input className="input" placeholder="Action (e.g. return_order.processed)" value={action} onChange={(e) => setAction(e.target.value)} />
          <input className="input" placeholder="Entity type" value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn btn-primary" disabled={loading} onClick={() => session && void load(session.accessToken)}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="muted">{total} event{total === 1 ? '' : 's'} (showing first 100)</p>

        {events.length === 0 ? (
          <p className="muted">No audit events match the filters.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.occurredAt)}</td>
                  <td>{e.actorDisplay}</td>
                  <td>{e.action}</td>
                  <td>{e.entityType}{e.entityId ? ` · ${e.entityId.slice(0, 8)}` : ''}</td>
                  <td className="muted" style={{ maxWidth: '28rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(e.details)}
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
