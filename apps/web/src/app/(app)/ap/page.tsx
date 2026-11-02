'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useReferenceData } from '../../../lib/use-reference';
import { formatMoney } from '../../../lib/format';
import type { ApAgingWebDto, SupplierStatementWebDto } from '../../../lib/types-phase4';

export default function ApPage() {
  const session = useSession();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [aging, setAging] = useState<ApAgingWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [statement, setStatement] = useState<SupplierStatementWebDto | null>(null);

  const { suppliers } = useReferenceData(session, { suppliers: true });

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        setAging(await apiFetch<ApAgingWebDto[]>(`/ap/aging?asOf=${asOf}`, { token }));
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [asOf],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  useEffect(() => {
    if (!session || supplierId === '') {
      setStatement(null);
      return;
    }
    void apiFetch<SupplierStatementWebDto>(`/ap/statements/${supplierId}?asOf=${asOf}`, {
      token: session.accessToken,
    }).then(
      (res) => setStatement(res),
      () => setStatement(null),
    );
  }, [session, supplierId, asOf]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  const totals = aging.reduce(
    (acc, r) => ({
      current: acc.current + Number(r.current),
      b1: acc.b1 + Number(r.bucket_1_30),
      b2: acc.b2 + Number(r.bucket_31_60),
      b3: acc.b3 + Number(r.bucket_61_90),
      b4: acc.b4 + Number(r.bucket_90_plus),
      total: acc.total + Number(r.total),
    }),
    { current: 0, b1: 0, b2: 0, b3: 0, b4: 0, total: 0 },
  );

  return (
    <div>
      <div className="page-head">
        <h1>AP Aging &amp; Supplier Statements</h1>
        <div className="toolbar">
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <button className="btn btn-sm" type="button" onClick={() => void load(sess.accessToken)}>
            Refresh
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Aging by supplier</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : aging.length === 0 ? (
          <p className="muted">No open payables as of {asOf}.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th className="num">Current</th>
                  <th className="num">1–30</th>
                  <th className="num">31–60</th>
                  <th className="num">61–90</th>
                  <th className="num">90+</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {aging.map((r) => (
                  <tr key={r.supplierId}>
                    <td>{r.supplierName ?? r.supplierId.slice(0, 8)}</td>
                    <td className="num">{formatMoney(r.current)}</td>
                    <td className="num">{formatMoney(r.bucket_1_30)}</td>
                    <td className="num">{formatMoney(r.bucket_31_60)}</td>
                    <td className="num">{formatMoney(r.bucket_61_90)}</td>
                    <td className="num">{formatMoney(r.bucket_90_plus)}</td>
                    <td className="num">
                      <strong>{formatMoney(r.total)}</strong>
                    </td>
                    <td>
                      <button className="btn btn-sm" type="button" onClick={() => setSupplierId(r.supplierId)}>
                        Statement
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="num">{formatMoney(totals.current.toFixed(4))}</td>
                  <td className="num">{formatMoney(totals.b1.toFixed(4))}</td>
                  <td className="num">{formatMoney(totals.b2.toFixed(4))}</td>
                  <td className="num">{formatMoney(totals.b3.toFixed(4))}</td>
                  <td className="num">{formatMoney(totals.b4.toFixed(4))}</td>
                  <td className="num">
                    <strong>{formatMoney(totals.total.toFixed(4))}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Supplier statement</h2>
        <div className="toolbar">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {statement ? (
          <>
            <p className="muted">
              Closing balance as of {statement.asOf}:{' '}
              <strong>{formatMoney(statement.closingBalance)}</strong> (regenerated from documents — never a snapshot column).
            </p>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Detail</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Running open</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((l, i) => (
                    <tr key={`${l.documentCode}-${i}`}>
                      <td>{l.businessDate}</td>
                      <td>{l.documentCode}</td>
                      <td>{l.documentType.replaceAll('_', ' ')}</td>
                      <td>{l.detail ?? '—'}</td>
                      <td className="num">{Number(l.debit) !== 0 ? formatMoney(l.debit) : '—'}</td>
                      <td className="num">{Number(l.credit) !== 0 ? formatMoney(l.credit) : '—'}</td>
                      <td className="num">{formatMoney(l.runningOpen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="muted">Choose a supplier to regenerate their statement.</p>
        )}
      </section>
    </div>
  );
}
