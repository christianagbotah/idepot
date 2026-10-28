'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { hasElevatedRole, useSession } from '../../../../lib/session';
import { formatDateTime } from '../../../../lib/format';
import { formatDecimal, isValidQty, subDecimal } from '../../../../lib/decimal';
import { labelOf, useReferenceData } from '../../../../lib/use-reference';
import type { StockCountDto } from '../../../../lib/types';
import { StatusBadge } from '../../../../components/status-badge';

interface CreateLine {
  productId: string;
  qty: string;
}

/** Stock counts: draft → counted → approved lifecycle with variance preview. */
export default function CountsPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [counts, setCounts] = useState<StockCountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // create form
  const [warehouseId, setWarehouseId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<CreateLine[]>([{ productId: '', qty: '' }]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  // detail
  const [detail, setDetail] = useState<StockCountDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));
  const productMap = new Map(products.map((p) => [p.id, p] as const));

  const loadCounts = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<StockCountDto[]>('/stock-counts', { token });
      setCounts(res);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadCounts(session.accessToken);
  }, [session, loadCounts]);

  const openDetail = useCallback(
    async (id: string) => {
      if (!session) return;
      setDetailLoading(true);
      setDetailError('');
      try {
        const res = await apiFetch<StockCountDto>(`/stock-counts/${id}`, {
          token: session.accessToken,
        });
        setDetail(res);
        const q: Record<string, string> = {};
        for (const l of res.lines) q[l.productId] = l.countedQuantityBase ?? '';
        setDraftQty(q);
      } catch (err) {
        setDetailError(apiErrorMessage(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [session],
  );

  async function refreshAll(id: string) {
    if (!session) return;
    await Promise.all([loadCounts(session.accessToken), openDetail(id)]);
  }

  async function createCount(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (!warehouseId) {
      setFormError('Pick a warehouse.');
      return;
    }
    const payloadLines: Array<{ productId: string; countedQuantityBase?: string }> = [];
    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.productId) {
        setFormError('Every line needs a product.');
        return;
      }
      if (seen.has(line.productId)) {
        setFormError('Duplicate product lines are not allowed — merge them into one line.');
        return;
      }
      seen.add(line.productId);
      const qty = line.qty.trim();
      if (qty) {
        if (!isValidQty(qty)) {
          setFormError('Counted quantities must be decimals like 24 or 24.5 (no minus sign).');
          return;
        }
        payloadLines.push({ productId: line.productId, countedQuantityBase: qty });
      } else {
        payloadLines.push({ productId: line.productId });
      }
    }
    if (payloadLines.length === 0) {
      setFormError('Add at least one line.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<StockCountDto>('/stock-counts', {
        method: 'POST',
        token: session.accessToken,
        body: {
          warehouseId,
          note: note.trim() || undefined,
          lines: payloadLines,
        },
      });
      setWarehouseId('');
      setNote('');
      setLines([{ productId: '', qty: '' }]);
      setOkMsg(`Count ${created.code} created.`);
      await refreshAll(created.id);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveLines() {
    if (!session || !detail) return;
    setDetailError('');
    const payloadLines: Array<{ productId: string; countedQuantityBase?: string }> = [];
    for (const l of detail.lines) {
      const qty = (draftQty[l.productId] ?? '').trim();
      if (qty && !isValidQty(qty)) {
        setDetailError('Counted quantities must be decimals like 24 or 24.5 (no minus sign).');
        return;
      }
      payloadLines.push({ productId: l.productId, countedQuantityBase: qty || undefined });
    }
    setActionBusy(true);
    try {
      const res = await apiFetch<StockCountDto>(`/stock-counts/${detail.id}/lines`, {
        method: 'PATCH',
        token: session.accessToken,
        body: { lines: payloadLines },
      });
      setDetail(res);
      await loadCounts(session.accessToken);
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitCount() {
    if (!session || !detail) return;
    setDetailError('');
    setActionBusy(true);
    try {
      const res = await apiFetch<StockCountDto>(`/stock-counts/${detail.id}/submit`, {
        method: 'POST',
        token: session.accessToken,
        body: { countedBy: session.user.displayName },
      });
      setDetail(res);
      await loadCounts(session.accessToken);
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function approveCount() {
    if (!session || !detail) return;
    setDetailError('');
    setActionBusy(true);
    try {
      const res = await apiFetch<StockCountDto>(`/stock-counts/${detail.id}/approve`, {
        method: 'POST',
        token: session.accessToken,
        body: {},
      });
      setDetail(res);
      await loadCounts(session.accessToken);
    } catch (err) {
      setDetailError(apiErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  const canApprove = hasElevatedRole(session);

  return (
    <>
      <div className="page-head">
        <h1>Stock counts</h1>
        <span className="muted">Draft → counted → approved; approval posts variances.</span>
      </div>

      <section className="card">
        <h2>New count</h2>
        <form onSubmit={(e) => void createCount(e)}>
          <div className="form-grid">
            <label>
              <span className="muted">Warehouse</span>
              <select
                className="input"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">— pick a warehouse —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="muted">Note (optional)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <h3>Lines</h3>
          {lines.map((line, idx) => (
            <div key={idx} className="toolbar" style={{ marginBottom: 'var(--idp-space-2)' }}>
              <label style={{ flex: 2, minWidth: 220 }}>
                <span className="muted">Product</span>
                <select
                  className="input"
                  value={line.productId}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, productId: e.target.value };
                    setLines(next);
                  }}
                >
                  <option value="">— pick a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: 140 }}>
                <span className="muted">Counted qty (base, optional)</span>
                <input
                  className="input"
                  value={line.qty}
                  inputMode="decimal"
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...line, qty: e.target.value };
                    setLines(next);
                  }}
                />
              </label>
              <button
                className="btn"
                type="button"
                style={{ alignSelf: 'flex-end' }}
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            onClick={() => setLines([...lines, { productId: '', qty: '' }])}
          >
            Add line
          </button>

          <div style={{ marginTop: 'var(--idp-space-4)' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create count'}
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
        <h2>All counts</h2>
        {refError ? (
          <p className="error-text" role="alert">
            Reference data: {refError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading counts…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : counts.length === 0 ? (
          <p className="muted">No stock counts yet — create the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Warehouse</th>
                  <th>Status</th>
                  <th>Counted by</th>
                  <th>Counted at</th>
                  <th className="num">Lines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.code}</td>
                    <td>{labelOf(warehouseMap, c.warehouseId)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{c.countedBy ?? '—'}</td>
                    <td>{formatDateTime(c.countedAt)}</td>
                    <td className="num">{c.lines.length}</td>
                    <td>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => void openDetail(c.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detailLoading ? <p className="muted">Loading count detail…</p> : null}
      {detailError && !detailLoading ? (
        <p className="error-text" role="alert">
          {detailError}
        </p>
      ) : null}

      {detail && !detailLoading ? (
        <section className="card">
          <div className="page-head">
            <h2>
              {detail.code} <StatusBadge status={detail.status} />
            </h2>
            <span className="muted">{labelOf(warehouseMap, detail.warehouseId)}</span>
          </div>
          <p className="muted">
            Counted by {detail.countedBy ?? '—'} at {formatDateTime(detail.countedAt)} · approved
            by {detail.approvedBy ?? '—'} at {formatDateTime(detail.approvedAt)}
            {detail.note ? ` · note: ${detail.note}` : ''}
          </p>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Counted</th>
                  <th className="num">System</th>
                  <th className="num">Variance</th>
                  {detail.status === 'draft' || detail.status === 'counted' ? (
                    <th>Counted qty (edit)</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((l) => {
                  const variance =
                    l.countedQuantityBase !== null
                      ? formatDecimal(subDecimal(l.countedQuantityBase, l.systemQuantityBase))
                      : '—';
                  return (
                    <tr key={l.id}>
                      <td>{labelOf(productMap, l.productId)}</td>
                      <td className="num">
                        {l.countedQuantityBase !== null ? formatDecimal(l.countedQuantityBase) : '—'}
                      </td>
                      <td className="num">{formatDecimal(l.systemQuantityBase)}</td>
                      <td className="num">{variance}</td>
                      {detail.status === 'draft' || detail.status === 'counted' ? (
                        <td>
                          <input
                            className="input"
                            value={draftQty[l.productId] ?? ''}
                            inputMode="decimal"
                            onChange={(e) =>
                              setDraftQty({ ...draftQty, [l.productId]: e.target.value })
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="toolbar" style={{ marginTop: 'var(--idp-space-4)' }}>
            {detail.status === 'draft' || detail.status === 'counted' ? (
              <button className="btn" type="button" disabled={actionBusy} onClick={() => void saveLines()}>
                {actionBusy ? 'Working…' : 'Save counted quantities'}
              </button>
            ) : null}
            {detail.status === 'draft' ? (
              <button className="btn" type="button" disabled={actionBusy} onClick={() => void submitCount()}>
                {actionBusy ? 'Working…' : 'Submit count'}
              </button>
            ) : null}
            {detail.status === 'counted' && canApprove ? (
              <button className="btn" type="button" disabled={actionBusy} onClick={() => void approveCount()}>
                {actionBusy ? 'Working…' : 'Approve & post variances'}
              </button>
            ) : null}
            {detail.status === 'counted' && !canApprove ? (
              <span className="muted">Approval requires a manager/admin/owner role.</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
