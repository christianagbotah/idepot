'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatDateTime } from '../../../../lib/format';
import {
  formatDecimal,
  isValidQty,
  mulDecimal,
} from '../../../../lib/decimal';
import { labelOf, useReferenceData } from '../../../../lib/use-reference';
import type { ListDto, StockAdjustmentDto, UnitDto } from '../../../../lib/types';
import { StatusBadge } from '../../../../components/status-badge';

interface CreateLine {
  productId: string;
  unitId: string; // '' = base unit
  qtyBase: string;
  qtyTransacted: string;
  factor: string;
}

const EMPTY_LINE: CreateLine = { productId: '', unitId: '', qtyBase: '', qtyTransacted: '', factor: '' };

/** Base quantity a line will post, given its unit mode. */
function effectiveBase(line: CreateLine): string | null {
  if (line.unitId) {
    if (!isValidQty(line.qtyTransacted) || !isValidQty(line.factor)) return null;
    return mulDecimal(line.qtyTransacted, line.factor);
  }
  return isValidQty(line.qtyBase) ? line.qtyBase : null;
}

/** Stock adjustments: signed corrections to the ledger, with reversal. */
export default function AdjustmentsPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [units, setUnits] = useState<UnitDto[]>([]);
  const [items, setItems] = useState<StockAdjustmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // create form
  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<CreateLine[]>([{ ...EMPTY_LINE }]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));
  const productMap = new Map(products.map((p) => [p.id, p] as const));

  const load = useCallback(async (token: string) => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiFetch<StockAdjustmentDto[]>('/stock-adjustments', { token });
      setItems(res);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
    void apiFetch<ListDto<UnitDto>>('/units', { token: session.accessToken }).then(
      (r) => setUnits(r.items),
      () => setUnits([]),
    );
  }, [session, load]);

  function patchLine(idx: number, patch: Partial<CreateLine>) {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function createAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError('');
    setOkMsg('');
    if (!warehouseId) {
      setFormError('Pick a warehouse.');
      return;
    }
    if (reason.trim().length < 3) {
      setFormError('Reason is required (at least 3 characters).');
      return;
    }
    const payloadLines: Array<{
      productId: string;
      quantityBase: string;
      unitId?: string;
      quantityTransacted?: string;
      conversionFactor?: string;
    }> = [];
    for (const line of lines) {
      if (!line.productId) {
        setFormError('Every line needs a product.');
        return;
      }
      const base = effectiveBase(line);
      if (base === null) {
        setFormError(
          line.unitId
            ? 'For non-base units fill transacted qty and factor (decimals) — the base quantity is computed.'
            : 'Quantities must be signed decimals like 12, -3.5 or 2.25.',
        );
        return;
      }
      payloadLines.push(
        line.unitId
          ? {
              productId: line.productId,
              quantityBase: base,
              unitId: line.unitId,
              quantityTransacted: line.qtyTransacted,
              conversionFactor: line.factor,
            }
          : { productId: line.productId, quantityBase: base },
      );
    }
    if (payloadLines.length === 0) {
      setFormError('Add at least one line.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch<StockAdjustmentDto>('/stock-adjustments', {
        method: 'POST',
        token: session.accessToken,
        body: {
          warehouseId,
          reason: reason.trim(),
          note: note.trim() || undefined,
          lines: payloadLines,
        },
      });
      setWarehouseId('');
      setReason('');
      setNote('');
      setLines([{ ...EMPTY_LINE }]);
      setOkMsg('Adjustment posted.');
      await load(session.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reverse(a: StockAdjustmentDto) {
    if (!session) return;
    if (!window.confirm(`Reverse adjustment ${a.code}? This posts compensating movements.`)) return;
    setRowBusy(a.id);
    setOkMsg('');
    try {
      await apiFetch<StockAdjustmentDto>(`/stock-adjustments/${a.id}/reverse`, {
        method: 'POST',
        token: session.accessToken,
      });
      setOkMsg(`Adjustment ${a.code} reversed.`);
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
        <h1>Stock adjustments</h1>
        <span className="muted">Signed corrections posted straight to the ledger.</span>
      </div>

      <section className="card">
        <h2>New adjustment</h2>
        <form onSubmit={(e) => void createAdjustment(e)}>
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
              <span className="muted">Reason * </span>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. damaged goods written off"
                required
                minLength={3}
              />
            </label>
            <label className="span-2">
              <span className="muted">Note (optional)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>

          <h3>Lines</h3>
          {lines.map((line, idx) => {
            const base = effectiveBase(line);
            return (
              <div key={idx} className="toolbar" style={{ marginBottom: 'var(--idp-space-2)', alignItems: 'flex-end' }}>
                <label style={{ flex: 2, minWidth: 200 }}>
                  <span className="muted">Product</span>
                  <select
                    className="input"
                    value={line.productId}
                    onChange={(e) => patchLine(idx, { productId: e.target.value })}
                  >
                    <option value="">— pick a product —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: 1, minWidth: 150 }}>
                  <span className="muted">Unit</span>
                  <select
                    className="input"
                    value={line.unitId}
                    onChange={(e) => patchLine(idx, { unitId: e.target.value })}
                  >
                    <option value="">base (enter base qty)</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.code} · {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                {line.unitId ? (
                  <>
                    <label style={{ flex: 1, minWidth: 120 }}>
                      <span className="muted">Qty (transacted)</span>
                      <input
                        className="input"
                        value={line.qtyTransacted}
                        inputMode="decimal"
                        onChange={(e) => patchLine(idx, { qtyTransacted: e.target.value })}
                      />
                    </label>
                    <label style={{ flex: 1, minWidth: 110 }}>
                      <span className="muted">× Factor</span>
                      <input
                        className="input"
                        value={line.factor}
                        inputMode="decimal"
                        onChange={(e) => patchLine(idx, { factor: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <label style={{ flex: 1, minWidth: 130 }}>
                    <span className="muted">Qty (base, signed)</span>
                    <input
                      className="input"
                      value={line.qtyBase}
                      inputMode="decimal"
                      placeholder="e.g. -3.5"
                      onChange={(e) => patchLine(idx, { qtyBase: e.target.value })}
                    />
                  </label>
                )}
                <div style={{ paddingBottom: 6, minWidth: 90 }}>
                  <span className="muted">Base qty</span>
                  <div className="num" style={{ fontWeight: 600 }}>
                    {base !== null ? formatDecimal(base) : '—'}
                  </div>
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            );
          })}
          <button
            className="btn"
            type="button"
            onClick={() => setLines([...lines, { ...EMPTY_LINE }])}
          >
            Add line
          </button>

          <div style={{ marginTop: 'var(--idp-space-4)' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post adjustment'}
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
        <h2>All adjustments</h2>
        {refError ? (
          <p className="error-text" role="alert">
            Reference data: {refError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading adjustments…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No adjustments yet — post the first one above.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Warehouse</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Posted by</th>
                  <th>Posted at</th>
                  <th className="num">Lines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>{labelOf(warehouseMap, a.warehouseId)}</td>
                    <td>
                      {a.reason}
                      {a.lines.length > 0 ? (
                        <div className="muted">
                          {a.lines
                            .map(
                              (l) =>
                                `${labelOf(productMap, l.productId)}: ${formatDecimal(l.quantityBase)}`,
                            )
                            .join(', ')}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>{a.postedBy ?? '—'}</td>
                    <td>{formatDateTime(a.postedAt)}</td>
                    <td className="num">{a.lines.length}</td>
                    <td>
                      {a.status === 'posted' ? (
                        <button
                          className="btn"
                          type="button"
                          disabled={rowBusy === a.id}
                          onClick={() => void reverse(a)}
                        >
                          {rowBusy === a.id ? 'Reversing…' : 'Reverse'}
                        </button>
                      ) : (
                        '—'
                      )}
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
