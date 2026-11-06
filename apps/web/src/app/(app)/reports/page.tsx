'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../../lib/session';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';
import { formatMoney } from '../../../lib/format';

type Tab =
  | 'daily-sales' | 'sales-by-product' | 'sales-by-customer' | 'sales-by-user'
  | 'tender-totals' | 'daily-stock' | 'backlog' | 'item-margin'
  | 'returns-by-reason' | 'shift-variance' | 'stock-valuation';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'daily-sales', label: 'Daily Sales' },
  { id: 'sales-by-product', label: 'Sales by Product' },
  { id: 'sales-by-customer', label: 'Sales by Customer' },
  { id: 'sales-by-user', label: 'Sales by User' },
  { id: 'tender-totals', label: 'Tenders' },
  { id: 'daily-stock', label: 'Daily Stock' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'item-margin', label: 'Item Margin' },
  { id: 'returns-by-reason', label: 'Returns' },
  { id: 'shift-variance', label: 'Shift Variance' },
  { id: 'stock-valuation', label: 'Stock Valuation' },
];

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface Row { [k: string]: string | number | null }

const NUM_COLUMNS: Partial<Record<Tab, string[]>> = {
  'daily-sales': ['grossSales', 'netSales', 'taxTotal', 'cogsTotal', 'grossProfit', 'cashSales', 'creditSales', 'returnsTotal', 'refundsTotal', 'netRevenue'],
  'sales-by-product': ['netSales', 'returns', 'netRevenue', 'cogs', 'grossProfit'],
  'sales-by-customer': ['netSales', 'returns', 'netRevenue', 'cogs', 'grossProfit'],
  'sales-by-user': ['netSales', 'returns', 'netRevenue', 'cogs', 'grossProfit'],
  'tender-totals': ['received', 'refunded', 'net'],
  'daily-stock': ['opening', 'receipts', 'transfersIn', 'returnsRestocked', 'positiveAdjustments', 'salesIssues', 'transfersOut', 'negativeAdjustments', 'closing'],
  backlog: ['orderedQty', 'deliveredQty', 'backlogQty', 'backlogValue'],
  'item-margin': ['grossRevenue', 'returns', 'netRevenue', 'cogs', 'cogsReversal', 'netCogs', 'grossProfit'],
  'returns-by-reason': ['quantityReturned', 'grossCredit', 'refunded', 'storeCreditIssued'],
  'shift-variance': ['expectedCash', 'countedCash', 'variance'],
  'stock-valuation': ['quantityBase', 'totalValue'],
};

const MONEY_COLUMNS = new Set([
  'grossSales', 'netSales', 'taxTotal', 'cogsTotal', 'grossProfit', 'cashSales', 'creditSales',
  'returnsTotal', 'refundsTotal', 'netRevenue', 'returns', 'cogs', 'received', 'refunded', 'net',
  'backlogValue', 'grossRevenue', 'cogsReversal', 'netCogs', 'grossCredit', 'refunded',
  'storeCreditIssued', 'expectedCash', 'countedCash', 'variance', 'totalValue', 'unitPrice',
]);

function humanize(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export default function ReportsPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>('daily-sales');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>(`/reports/${tab}${qs({ from, to, limit: 200 })}`, { token });
      setRows(data);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => {
    if (session) void run(session.accessToken);
  }, [session, run]);

  if (!session) return <p className="muted">Sign in first.</p>;

  const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const numCols = new Set(NUM_COLUMNS[tab] ?? []);

  return (
    <div>
      <div className="page-head"><h1>Operational Reports</h1></div>
      {error && <p className="error-text" role="alert">{error}</p>}

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 'var(--idp-space-2)' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`btn-sm ${tab === t.id ? 'btn-primary' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ marginTop: 'var(--idp-space-3)' }}>
        <div className="form-row">
          <label>
            From <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={loading} onClick={() => session && void run(session.accessToken)}>
            {loading ? 'Running…' : 'Run'}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="muted">{loading ? 'Running…' : 'No data for this period.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className={numCols.has(c) ? 'num' : ''}>{humanize(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => {
                      const v = r[c];
                      return (
                        <td key={c} className={numCols.has(c) ? 'num' : ''}>
                          {v == null
                            ? '—'
                            : MONEY_COLUMNS.has(c) && c !== 'quantityBase'
                              ? formatMoney(String(v))
                              : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
