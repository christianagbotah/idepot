'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../../lib/session';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { formatDateTime } from '../../../../lib/format';

interface Setting {
  id: string;
  key: string;
  value: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const session = useSession();
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      setSettings(await apiFetch<Setting[]>('/reports/settings', { token }));
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

  async function upsert() {
    if (!session || !key) return;
    setBusy(true);
    setOkMsg('');
    try {
      let parsed: unknown = value;
      try {
        parsed = value === '' ? null : JSON.parse(value);
      } catch {
        parsed = value; // plain string
      }
      await apiFetch('/reports/settings', {
        method: 'POST',
        body: { key, value: parsed, note: note || null },
        token: session.accessToken,
      });
      setOkMsg(`Setting '${key}' saved as a new effective-dated version.`);
      setKey('');
      setValue('');
      setNote('');
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  return (
    <div>
      <div className="page-head"><h1>Settings</h1></div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {okMsg && <p className="ok-text">{okMsg}</p>}

      <section className="card">
        <h2>New setting version</h2>
        <p className="muted">
          Settings are effective-dated versions — creating a new value never rewrites history. Secrets are stored in
          environment configuration, never here.
        </p>
        <div className="form-row">
          <input className="input" placeholder="key (lower.snake_case, e.g. loyalty.enabled)" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className="input" placeholder='value (JSON or plain text, e.g. true)' value={value} onChange={(e) => setValue(e.target.value)} />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !key || !key.match(/^[a-z0-9_.]+$/)} onClick={() => void upsert()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: 'var(--idp-space-4)' }}>
        <h2>Setting versions</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : settings.length === 0 ? (
          <p className="muted">No settings configured yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Key</th><th>Value</th><th>Effective from</th><th>Effective to</th><th>Note</th><th>Created</th></tr>
            </thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.id}>
                  <td>{s.key}</td>
                  <td><code>{JSON.stringify(s.value)}</code></td>
                  <td>{s.effectiveFrom}</td>
                  <td>{s.effectiveTo ?? '—'}</td>
                  <td>{s.note ?? '—'}</td>
                  <td>{formatDateTime(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
