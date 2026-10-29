'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { formatDateTime } from '../../../lib/format';
import { formatDecimal } from '../../../lib/decimal';
import { labelOf, useReferenceData } from '../../../lib/use-reference';
import type {
  BalanceRebuildReportDto,
  ListDto,
  StockBalanceDto,
} from '../../../lib/types';

/** Stock overview: balances per warehouse + dry-run ledger verification. */
export default function InventoryPage() {
  const session = useSession();
  const { warehouses, products, refError } = useReferenceData(session);

  const [warehouseId, setWarehouseId] = useState('');
  const [balances, setBalances] = useState<StockBalanceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [report, setReport] = useState<BalanceRebuildReportDto | null>(null);
  const [rebuildError, setRebuildError] = useState('');

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));
  const productMap = new Map(products.map((p) => [p.id, p] as const));

  const load = useCallback(
    async (token: string, whId: string) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await apiFetch<ListDto<StockBalanceDto>>(
          `/inventory/balances${qs({ warehouseId: whId || undefined })}`,
          { token },
        );
        setBalances(res.items);
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
    void load(session.accessToken, warehouseId);
  }, [session, warehouseId, load]);

  async function verifyLedger() {
    if (!session) return;
    setRebuildBusy(true);
    setRebuildError('');
    setReport(null);
    try {
      const res = await apiFetch<BalanceRebuildReportDto>('/inventory/balances/rebuild', {
        method: 'POST',
        token: session.accessToken,
        body: { dryRun: true },
      });
      setReport(res);
    } catch (err) {
      setRebuildError(apiErrorMessage(err));
    } finally {
      setRebuildBusy(false);
    }
  }

  if (!session) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="page-head">
        <h1>Stock</h1>
        <span className="muted">On-hand balances per warehouse and product.</span>
      </div>

      <section className="card">
        <h2>Balances</h2>
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
        </div>
        {refError ? (
          <p className="error-text" role="alert">
            Reference data: {refError}
          </p>
        ) : null}
        {loading ? (
          <p className="muted">Loading balances…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : balances.length === 0 ? (
          <p className="muted">
            No stock balances{warehouseId ? ' for this warehouse' : ''} yet — post receipts,
            adjustments or an opening stock to see balances here.
          </p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Warehouse</th>
                  <th>Product</th>
                  <th className="num">Quantity (base)</th>
                  <th>Bin</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={`${b.warehouseId}:${b.productId}`}>
                    <td>{labelOf(warehouseMap, b.warehouseId)}</td>
                    <td>{labelOf(productMap, b.productId)}</td>
                    <td className="num">{formatDecimal(b.quantityBase)}</td>
                    <td>{b.bin ?? '—'}</td>
                    <td>{formatDateTime(b.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Verify ledger</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Recomputes every balance from the append-only movement ledger and compares it with the
          stored projection. Dry run — nothing is written.
        </p>
        <button className="btn" type="button" disabled={rebuildBusy} onClick={() => void verifyLedger()}>
          {rebuildBusy ? 'Verifying…' : 'Rebuild / verify ledger (dry run)'}
        </button>
        {rebuildError ? (
          <p className="error-text" role="alert">
            {rebuildError}
          </p>
        ) : null}
        {report ? (
          <div style={{ marginTop: 'var(--idp-space-4)' }}>
            <p className={report.mismatches.length === 0 ? 'ok-text' : 'error-text'}>
              Checked {report.checked} balance{report.checked === 1 ? '' : 's'} ·{' '}
              {report.mismatches.length === 0
                ? 'no mismatches — balances match the ledger.'
                : `${report.mismatches.length} mismatch${report.mismatches.length === 1 ? '' : 'es'} found.`}
            </p>
            {report.mismatches.length > 0 ? (
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      <th>Warehouse</th>
                      <th>Product</th>
                      <th className="num">Stored balance</th>
                      <th className="num">Ledger computed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mismatches.map((m) => (
                      <tr key={`${m.warehouseId}:${m.productId}`}>
                        <td>{labelOf(warehouseMap, m.warehouseId)}</td>
                        <td>{labelOf(productMap, m.productId)}</td>
                        <td className="num">{formatDecimal(m.balance)}</td>
                        <td className="num">{formatDecimal(m.computed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
