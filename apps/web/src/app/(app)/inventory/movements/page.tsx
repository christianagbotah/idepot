'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatDateTime } from '../../../../lib/format';
import { formatDecimal } from '../../../../lib/decimal';
import { labelOf, useReferenceData } from '../../../../lib/use-reference';
import type { ListDto, StockMovementDto } from '../../../../lib/types';
import { StatusBadge } from '../../../../components/status-badge';

/** Append-only stock movement ledger with warehouse/product filters. */
export default function MovementsPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [warehouseId, setWarehouseId] = useState('');
  const [productId, setProductId] = useState('');
  const [items, setItems] = useState<StockMovementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));
  const productMap = new Map(products.map((p) => [p.id, p] as const));

  const load = useCallback(
    async (token: string, whId: string, prodId: string) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch<ListDto<StockMovementDto>>(
          `/inventory/movements${qs({ warehouseId: whId || undefined, productId: prodId || undefined, limit: 200 })}`,
          { token },
        );
        setItems(res.items);
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken, warehouseId, productId);
  }, [session, warehouseId, productId, load]);

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Stock movements</h1>
        <span className="muted">Latest 200 ledger entries (newest first).</span>
      </div>

      <section className="card">
        <div className="toolbar" style={{ marginBottom: 'var(--idp-space-4)' }}>
          <label>
            <span className="muted">Warehouse</span>
            <select
              className="input"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Product</span>
            <select
              className="input"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">All products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {refError ? (
          <p className="error-text" role="alert">
            Reference data: {refError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading movements…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No movements match these filters yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Warehouse</th>
                  <th>Product</th>
                  <th className="num">Qty (base)</th>
                  <th className="num">Transacted × factor</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.occurredAt)}</td>
                    <td>
                      <StatusBadge status={m.movementType} />
                    </td>
                    <td>{labelOf(warehouseMap, m.warehouseId)}</td>
                    <td>{labelOf(productMap, m.productId)}</td>
                    <td className="num">{formatDecimal(m.quantityBase)}</td>
                    <td className="num">
                      {m.quantityTransacted !== null
                        ? `${formatDecimal(m.quantityTransacted)} × ${formatDecimal(m.conversionFactor ?? '1')}`
                        : '—'}
                    </td>
                    <td>{m.reason ?? '—'}</td>
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
