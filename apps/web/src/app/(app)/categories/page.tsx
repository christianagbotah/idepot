'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { CategoryDto, ListDto } from '../../../lib/types';
import { StatusBadge } from '../../../components/status-badge';

/** Category reference data: list, create (parent restricted to top-level), toggle active. */
export default function CategoriesPage() {
  const session = useSession();

  const [items, setItems] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<ListDto<CategoryDto>>('/categories', { token });
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

  const topLevel = items.filter((c) => c.parentId === null);
  const byId = new Map(items.map((c) => [c.id, c] as const));

  async function createCategory(e: React.FormEvent) {
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
      await apiFetch<CategoryDto>('/categories', {
        method: 'POST',
        token: session.accessToken,
        body: { code: code.trim(), name: name.trim(), parentId: parentId || undefined },
      });
      setCode('');
      setName('');
      setParentId('');
      setOkMsg('Category created.');
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(category: CategoryDto) {
    if (!session) return;
    setRowBusy(category.id);
    setOkMsg('');
    try {
      await apiFetch<CategoryDto>(`/categories/${category.id}`, {
        method: 'PATCH',
        token: session.accessToken,
        body: { isActive: !category.isActive },
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
        <h1>Categories</h1>
        <span className="muted">Two-level product taxonomy.</span>
      </div>

      <section className="card">
        <h2>New category</h2>
        <form className="form-grid" onSubmit={(e) => void createCategory(e)}>
          <label>
            <span className="muted">Code</span>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BEV"
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
              placeholder="e.g. Beverages"
              required
              minLength={2}
            />
          </label>
          <label>
            <span className="muted">Parent (top-level only)</span>
            <select
              className="input"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— none (top level) —</option>
              {topLevel.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="span-2">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create category'}
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
        <h2>All categories</h2>
        {loading ? (
          <p className="muted">Loading categories…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No categories yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Parent</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const parent = c.parentId ? byId.get(c.parentId) : undefined;
                  return (
                    <tr key={c.id}>
                      <td>{c.code}</td>
                      <td>{c.name}</td>
                      <td>{parent ? `${parent.code} · ${parent.name}` : '—'}</td>
                      <td>
                        <StatusBadge status={c.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td>
                        <button
                          className="btn"
                          type="button"
                          disabled={rowBusy === c.id}
                          onClick={() => void toggleActive(c)}
                        >
                          {c.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
