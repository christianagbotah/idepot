'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type {
  BankAccountWebDto,
  BankMatchSuggestionWebDto,
  BankReconciliationWebDto,
  BankStatementWebDto,
} from '../../../../lib/types-phase4';

const SAMPLE_CSV = `value_date,transaction_date,reference,description,direction,amount,balance
2026-11-01,,TRF-001,TRANSFER,debit,7.50,692.50
2026-11-01,,DEP-1,CASH DEPOSIT,credit,500.00,1192.50`;

export default function BankStatementsPage() {
  const session = useSession();
  const [accounts, setAccounts] = useState<BankAccountWebDto[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [statements, setStatements] = useState<BankStatementWebDto[]>([]);
  const [selected, setSelected] = useState<BankStatementWebDto | null>(null);
  const [recons, setRecons] = useState<BankReconciliationWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [suggestionsFor, setSuggestionsFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BankMatchSuggestionWebDto[]>([]);

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        setAccounts(await apiFetch<BankAccountWebDto[]>('/banking/accounts', { token }));
        const all = await apiFetch<BankStatementWebDto[]>(
          `/banking/statements${bankAccountId ? `?bankAccountId=${bankAccountId}` : ''}`,
          { token },
        );
        setStatements(all);
        setSelected(all[0] ?? null);
        setRecons(await apiFetch<BankReconciliationWebDto[]>('/banking/reconciliations', { token }));
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [bankAccountId],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  useEffect(() => {
    if (!session || suggestionsFor == null) return;
    void apiFetch<BankMatchSuggestionWebDto[]>(`/banking/match/suggestions/${suggestionsFor}`, {
      token: session.accessToken,
    }).then(
      (res) => setSuggestions(res),
      () => setSuggestions([]),
    );
  }, [session, suggestionsFor]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function importStatement(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    if (bankAccountId === '' || filename === '' || content.trim() === '') {
      setFormError('Account, filename and CSV content are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<BankStatementWebDto>('/banking/statements/import', {
        method: 'POST',
        token: sess.accessToken,
        body: { bankAccountId, filename, content, statementDate },
      });
      setOkMsg(`Imported ${created.rowCount} lines from ${filename}.`);
      setContent('');
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function match(lineId: string, journalLineId: string, amount: string) {
    setFormError('');
    try {
      await apiFetch('/banking/match', {
        method: 'POST',
        token: sess.accessToken,
        body: { statementLineId: lineId, journalLineId, amount },
      });
      setSuggestionsFor(null);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  async function unmatch(lineId: string, journalLineId: string) {
    setFormError('');
    try {
      await apiFetch('/banking/match/unmatch', {
        method: 'POST',
        token: sess.accessToken,
        body: { statementLineId: lineId, journalLineId },
      });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  async function finalize() {
    if (bankAccountId === '') {
      setFormError('Choose a bank account first.');
      return;
    }
    if (!window.confirm(`Finalize a reconciliation for this account as of ${statementDate}?`)) return;
    try {
      await apiFetch('/banking/reconciliations', {
        method: 'POST',
        token: sess.accessToken,
        body: { bankAccountId, asOf: statementDate },
      });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Bank Statements &amp; Matching</h1>
      </div>

      <section className="card">
        <h2>Import statement (CSV)</h2>
        <form onSubmit={importStatement}>
          <div className="form-grid">
            <label>
              Bank account
              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                <option value="">Select…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.bankName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Statement date
              <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} required />
            </label>
            <label>
              Filename
              <input value={filename} onChange={(e) => setFilename(e.target.value)} required placeholder="stmt-nov.csv" />
            </label>
          </div>
          <label>
            CSV content (header: value_date, transaction_date, reference, description, direction, amount, balance)
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder={SAMPLE_CSV}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </label>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Importing…' : 'Import'}
            </button>
            <button className="btn" type="button" onClick={() => void finalize()}>
              Finalize reconciliation
            </button>
          </div>
        </form>
        {formError ? (
          <p className="error-text" role="alert">
            {formError}
          </p>
        ) : null}
        {okMsg ? (
          <p className="ok-text" role="status">
            {okMsg}
          </p>
        ) : null}
        <p className="muted">
          The same file content and the same physical lines can never be imported twice (fingerprint dedupe). Imports
          are untrusted input: strict field validation, bounded size, parameterized SQL only.
        </p>
      </section>

      <section className="card">
        <h2>Statements</h2>
        <div className="toolbar">
          <select
            value={selected?.id ?? ''}
            onChange={(e) => setSelected(statements.find((s) => s.id === e.target.value) ?? null)}
          >
            {statements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.bankAccountCode ?? ''} · {s.statementDate} · {s.filename} ({s.rowCount} lines)
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : !selected ? (
          <p className="muted">No statements imported yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Direction</th>
                  <th className="num">Amount</th>
                  <th className="num">Balance</th>
                  <th>Match</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {selected.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.lineNo}</td>
                    <td>{l.valueDate}</td>
                    <td>{l.reference ?? '—'}</td>
                    <td>{l.description ?? '—'}</td>
                    <td>{l.direction}</td>
                    <td className="num">{formatMoney(l.amount)}</td>
                    <td className="num">{l.closingBalance != null ? formatMoney(l.closingBalance) : '—'}</td>
                    <td>
                      <StatusBadge status={l.matchStatus === 'matched' ? 'reconciled' : l.matchStatus} />
                      {Number(l.matchedAmount) > 0 ? <span className="muted"> {formatMoney(l.matchedAmount)}</span> : null}
                    </td>
                    <td>
                      {l.matchStatus === 'unmatched' ? (
                        <button className="btn btn-sm" type="button" onClick={() => setSuggestionsFor(l.id)}>
                          Suggest
                        </button>
                      ) : (
                        l.matches.map((m) => (
                          <button
                            key={m.journalLineId}
                            className="btn btn-sm"
                            type="button"
                            onClick={() => void unmatch(l.id, m.journalLineId)}
                            title={`Unmatch ${formatMoney(m.amount)}`}
                          >
                            Unmatch
                          </button>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {suggestionsFor != null ? (
          <div className="detail-grid">
            <strong>Suggestions (evidence only — never auto-posted)</strong>
            {suggestions.length === 0 ? (
              <p className="muted">No deterministic candidates found (exact amount, opposite direction, ±3 days).</p>
            ) : (
              suggestions.map((s) => (
                <div className="toolbar" key={s.journalLineId}>
                  <span style={{ flex: 2 }}>
                    {s.journalReference ?? 'journal line'} · {s.ruleName}
                  </span>
                  <span className="num">{formatMoney(s.amount)}</span>
                  <span className="muted">confidence {s.confidence}</span>
                  <button className="btn btn-sm" type="button" onClick={() => void match(suggestionsFor, s.journalLineId, s.amount)}>
                    Match
                  </button>
                </div>
              ))
            )}
            <button className="btn btn-sm" type="button" onClick={() => setSuggestionsFor(null)}>
              Close
            </button>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Reconciliations</h2>
        {recons.length === 0 ? (
          <p className="muted">No reconciliations finalized yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>As of</th>
                  <th className="num">Statement balance</th>
                  <th className="num">GL balance</th>
                  <th className="num">Difference</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recons.map((r) => (
                  <tr key={r.id}>
                    <td>{r.bankAccountCode ?? '—'}</td>
                    <td>{r.asOf}</td>
                    <td className="num">{r.statementClosingBalance != null ? formatMoney(r.statementClosingBalance) : '—'}</td>
                    <td className="num">{formatMoney(r.glClosingBalance)}</td>
                    <td className="num">{formatMoney(r.difference)}</td>
                    <td>
                      <StatusBadge status={r.status === 'finalized' ? 'reconciled' : r.status} />
                    </td>
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
