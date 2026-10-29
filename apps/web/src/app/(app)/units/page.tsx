'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { ListDto, UnitDto } from '../../../lib/types';
import { StatusBadge } from '../../../components/status-badge';

/** Units reference data: list, create, toggle active. */
export default function UnitsPage() {
  const session = useSession();

  const [items, setItems] = useState<UnitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<ListDto<UnitDto>>('/units', { token });
      setItems(res.items);
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

  async function createUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (code.trim().length < 2) {
      setFormError('Code must be at least 2 characters.');
      return;
    }
    if (name.trim().length < 1) {
      setFormError('Name is required.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<UnitDto>('/units', {
        method: 'POST',
        token: session.accessToken,
        body: { code: code.trim(), name: name.trim() },
      });
      setCode('');
      setName('');
      setOkMsg('Unit created.');
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(unit: UnitDto) {
    if (!session) return;
    setRowBusy(unit.id);
    setOkMsg('');
    try {
      await apiFetch<UnitDto>(`/units/${unit.id}`, {
        method: 'PATCH',
        token: session.accessToken,
        body: { isActive: !unit.isActive },
      });
      await load(session.accessToken);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setRowBusy(null);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Units</h1>
        <span className="muted">Base units of measure for the catalog.</span>
      </div>

      <section className="card">
        <h2>New unit</h2>
        <form className="form-grid" onSubmit={(e) => void createUnit(e)}>
          <label>
            <span className="muted">Code</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. PCS"
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pieces"
              required
            />
          </label>
          <div className="span-2">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create unit'}
            </button>
            {formError ? (
              <p className="error-text" role="alert">
                {formError}
              </p>
            ) : null}
            {okMsg ? <p className="ok-text" role="status">{okMsg}</p> : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>All units</h2>
        {loading ? (
          <p className="muted">Loading units…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No units yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>{u.code}</td>
                    <td>{u.name}</td>
                    <td>
                      <StatusBadge status={u.isActive ? 'active' : 'inactive'} />
                    </td>
                    <td>
                      <button
                        className="btn"
                        type="button"
                        disabled={rowBusy === u.id}
                        onClick={() => void toggleActive(u)}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
