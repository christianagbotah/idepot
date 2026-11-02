'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import type {
  BalanceSheetWebDto,
  CashFlowWebDto,
  ProfitAndLossWebDto,
  TrialBalanceWebDto,
} from '../../../../lib/types-phase4';

type Tab = 'pl' | 'bs' | 'tb' | 'cf';

export default function FinancialReportsPage() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>('pl');
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pl, setPl] = useState<ProfitAndLossWebDto | null>(null);
  const [bs, setBs] = useState<BalanceSheetWebDto | null>(null);
  const [tb, setTb] = useState<TrialBalanceWebDto | null>(null);
  const [cf, setCf] = useState<CashFlowWebDto | null>(null);

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      setLoadError('');
      try {
        if (tab === 'pl') setPl(await apiFetch<ProfitAndLossWebDto>(`/accounting/profit-and-loss${qs({ from, to })}`, { token }));
        if (tab === 'bs') setBs(await apiFetch<BalanceSheetWebDto>(`/accounting/balance-sheet${qs({ asOf: to })}`, { token }));
        if (tab === 'tb') setTb(await apiFetch<TrialBalanceWebDto>(`/accounting/trial-balance${qs({ asOf: to })}`, { token }));
        if (tab === 'cf') setCf(await apiFetch<CashFlowWebDto>(`/accounting/cash-flow${qs({ from, to })}`, { token }));
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [tab, from, to],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  function sectionRows(title: string, rows: Array<{ accountCode: string; accountName: string; amount: string }>) {
    if (rows.length === 0) return null;
    return (
      <>
        <tr>
          <td colSpan={2}>
            <strong>{title}</strong>
          </td>
        </tr>
        {rows.map((r) => (
          <tr key={r.accountCode}>
            <td>
              {r.accountCode} · {r.accountName}
            </td>
            <td className="num">{formatMoney(r.amount)}</td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1>Financial Reports</h1>
      </div>

      <div className="toolbar">
        {(
          [
            ['pl', 'Profit & Loss'],
            ['bs', 'Balance Sheet'],
            ['tb', 'Trial Balance'],
            ['cf', 'Cash Flow'],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'btn' : 'btn btn-sm'}
            type="button"
            onClick={() => setTab(key)}
            style={{ cursor: 'pointer' }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="card">
        <div className="toolbar">
          {tab !== 'bs' && tab !== 'tb' ? (
            <label>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
          ) : null}
          <label>
            {tab === 'bs' || tab === 'tb' ? 'As of' : 'To'}{' '}
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-sm" type="button" onClick={() => void load(sess.accessToken)}>
            Run
          </button>
        </div>
        {loading ? (
          <p className="muted">Running…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : null}
      </section>

      {tab === 'pl' && pl ? (
        <section className="card">
          <h2>Profit &amp; Loss (accrual, {pl.from} → {pl.to})</h2>
          <div className="table">
            <table>
              <tbody>
                {sectionRows('Revenue', pl.revenue)}
                <tr>
                  <td>
                    <strong>Total revenue</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(pl.totalRevenue)}</strong>
                  </td>
                </tr>
                {sectionRows('Cost of sales', pl.costOfSales)}
                <tr>
                  <td>
                    <strong>Gross profit</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(pl.grossProfit)}</strong>
                  </td>
                </tr>
                {sectionRows('Operating expenses', pl.operatingExpenses)}
                <tr>
                  <td>
                    <strong>Net profit</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(pl.netProfit)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted">COGS ties to the AVCO stock ledger by construction (cogs_vs_stock_ledger check).</p>
        </section>
      ) : null}

      {tab === 'bs' && bs ? (
        <section className="card">
          <h2>Balance Sheet (as of {bs.asOf})</h2>
          <div className="table">
            <table>
              <tbody>
                {sectionRows('Assets', bs.assets)}
                <tr>
                  <td>
                    <strong>Total assets</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(bs.totalAssets)}</strong>
                  </td>
                </tr>
                {sectionRows('Liabilities', bs.liabilities)}
                <tr>
                  <td>
                    <strong>Total liabilities</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(bs.totalLiabilities)}</strong>
                  </td>
                </tr>
                {sectionRows('Equity', bs.equity)}
                <tr>
                  <td>Current earnings (unclosed P&amp;L)</td>
                  <td className="num">{formatMoney(bs.currentEarnings)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Total equity</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(bs.totalEquity)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Assets − (Liabilities + Equity)</strong>
                  </td>
                  <td className={`num ${bs.balanced ? 'ok-text' : 'error-text'}`}>
                    <strong>{bs.balanced ? 'balanced ✓' : formatMoney(bs.difference)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'tb' && tb ? (
        <section className="card">
          <h2>Trial Balance (as of {tb.asOf})</h2>
          <p className={tb.balanced ? 'ok-text' : 'error-text'}>
            {tb.balanced ? 'Balanced ✓' : 'OUT OF BALANCE'} — closing Dr {formatMoney(tb.totalClosingDebit)} = Cr{' '}
            {formatMoney(tb.totalClosingCredit)}
          </p>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account</th>
                  <th className="num">Opening Dr</th>
                  <th className="num">Opening Cr</th>
                  <th className="num">Period Dr</th>
                  <th className="num">Period Cr</th>
                  <th className="num">Closing Dr</th>
                  <th className="num">Closing Cr</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r) => (
                  <tr key={r.code}>
                    <td>{r.code}</td>
                    <td>
                      {r.name} <span className="muted">({r.accountClass.replaceAll('_', ' ')})</span>
                    </td>
                    <td className="num">{Number(r.openingDebit) !== 0 ? formatMoney(r.openingDebit) : '—'}</td>
                    <td className="num">{Number(r.openingCredit) !== 0 ? formatMoney(r.openingCredit) : '—'}</td>
                    <td className="num">{Number(r.periodDebit) !== 0 ? formatMoney(r.periodDebit) : '—'}</td>
                    <td className="num">{Number(r.periodCredit) !== 0 ? formatMoney(r.periodCredit) : '—'}</td>
                    <td className="num">{Number(r.closingDebit) !== 0 ? formatMoney(r.closingDebit) : '—'}</td>
                    <td className="num">{Number(r.closingCredit) !== 0 ? formatMoney(r.closingCredit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'cf' && cf ? (
        <section className="card">
          <h2>Cash Flow — indirect method ({cf.from} → {cf.to})</h2>
          <div className="table">
            <table>
              <tbody>
                <tr>
                  <td>Net profit</td>
                  <td className="num">{formatMoney(cf.netProfit)}</td>
                </tr>
                {sectionRows('Changes in operating assets', cf.operatingAssetChanges)}
                {sectionRows('Changes in operating liabilities', cf.operatingLiabilityChanges)}
                {sectionRows('Equity financing', cf.equityFinancing)}
                <tr>
                  <td>
                    <strong>Net cash from operations</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(cf.netCashFromOperations)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Net cash movement (cash &amp; bank controls)</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(cf.netCashMovement)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Unexplained difference</td>
                  <td className={`num ${Number(cf.unexplained) === 0 ? 'ok-text' : 'error-text'}`}>
                    {formatMoney(cf.unexplained)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted">
            Method documented in docs/accounting/cash-flow-method.md; transfers between cash/bank accounts are net-zero.
          </p>
        </section>
      ) : null}
    </div>
  );
}
