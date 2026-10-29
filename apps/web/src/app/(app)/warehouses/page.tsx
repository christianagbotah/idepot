'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { formatDateTime } from '../../../lib/format';
import type { ListDto, WarehouseDto } from '../../../lib/types';
import { StatusBadge } from '../../../components/status-badge';

/** Warehouses: list, create, activate/deactivate. */
export default function WarehousesPage() {
  const session = useSession();

  const [items, setItems] = useState<WarehouseDto[]>([]);
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
      const res = await apiFetch<ListDto<WarehouseDto>>('/warehouses', { token });
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

  async function createWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (code.trim().length < 2) {
      setFormError('Code must be at least 2 characters.');
      return;
    }
    if (name.trim().length < 2) {
      setFormError('Name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<WarehouseDto>('/warehouses', {
        method: 'POST',
        token: session.accessToken,
        body: { code: code.trim(), name: name.trim() },
      });
      setCode('');
      setName('');
      setOkMsg('Warehouse created.');
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(w: WarehouseDto) {
    if (!session) return;
    setRowBusy(w.id);
    setOkMsg('');
    try {
      await apiFetch<WarehouseDto>(`/warehouses/${w.id}`, {
        method: 'PATCH',
        token: session.accessToken,
        body: { isActive: !w.isActive },
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
        <h1>Warehouses</h1>
        <span className="muted">Stock locations for receiving, issuing and transfers.</span>
      </div>

      <section className="card">
        <h2>New warehouse</h2>
        <form className="form-grid" onSubmit={(e) => void createWarehouse(e)}>
          <label>
            <span className="muted">Code</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. WH-MAIN"
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
              placeholder="e.g. Main depot"
              required
              minLength={2}
            />
          </label>
          <div className="span-2">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create warehouse'}
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
        <h2>All warehouses</h2>
        {loading ? (
          <p className="muted">Loading warehouses…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No warehouses yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id}>
                    <td>{w.code}</td>
                    <td>{w.name}</td>
                    <td>
                      <StatusBadge status={w.isActive ? 'active' : 'inactive'} />
                    </td>
                    <td>{formatDateTime(w.createdAt)}</td>
                    <td>
                      <button
                        className="btn"
                        type="button"
                        disabled={rowBusy === w.id}
                        onClick={() => void toggleActive(w)}
                      >
                        {w.isActive ? 'Deactivate' : 'Activate'}
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
