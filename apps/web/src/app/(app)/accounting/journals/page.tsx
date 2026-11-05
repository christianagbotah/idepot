'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { formatMoney } from '../../../../lib/format';
import type { GlAccountWebDto, JournalWebDto } from '../../../../lib/types-phase4';

interface ManualLine {
  accountCode: string;
  debit: string;
  credit: string;
  memo: string;
}

const EMPTY_LINE: ManualLine = { accountCode: '', debit: '', credit: '', memo: '' };

export default function JournalsPage() {
  const session = useSession();
  const [journals, setJournals] = useState<JournalWebDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // filters
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [sourceKind, setSourceKind] = useState('');
  const [reference, setReference] = useState('');

  // manual journal form
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [journalRef, setJournalRef] = useState('');
  const [lines, setLines] = useState<ManualLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE },
  ]);

  const [accounts, setAccounts] = useState<GlAccountWebDto[]>([]);

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      try {
        const res = await apiFetch<{ items: JournalWebDto[]; total: number }>(
          `/accounting/journals${qs({ from: from || undefined, to: to || undefined, accountCode: accountCode || undefined, sourceKind: sourceKind || undefined, reference: reference || undefined, limit: '100' })}`,
          { token },
        );
        setJournals(res.items);
        setTotal(res.total);
      } catch (err) {
        setLoadError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [from, to, accountCode, sourceKind, reference],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
    void apiFetch<GlAccountWebDto[]>('/accounting/accounts', { token: session.accessToken }).then(
      (res) => setAccounts(res.filter((a) => a.isActive && a.isPosting)),
      () => undefined,
    );
  }, [session, load]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  const sumOf = (side: 'debit' | 'credit') =>
    lines.reduce((s, l) => s + (l[side] === '' ? 0 : Number(l[side])), 0);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    const valid = lines.filter((l) => l.accountCode !== '' && (l.debit !== '' || l.credit !== ''));
    if (description.length < 3 || valid.length < 2) {
      setFormError('A description and at least two lines are required.');
      return;
    }
    if (Math.abs(sumOf('debit') - sumOf('credit')) > 0.00005) {
      setFormError(`Unbalanced entry: debits ${sumOf('debit').toFixed(2)} ≠ credits ${sumOf('credit').toFixed(2)}.`);
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/accounting/journals', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          businessDate,
          description,
          reference: journalRef || undefined,
          lines: valid.map((l) => ({ accountCode: l.accountCode, debit: l.debit || undefined, credit: l.credit || undefined, memo: l.memo || undefined })),
        },
      });
      setOkMsg('Manual journal posted.');
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reverse(id: string) {
    if (!window.confirm('Post a reversing entry for this manual journal?')) return;
    try {
      await apiFetch(`/accounting/journals/${id}/reverse`, { method: 'POST', token: sess.accessToken, body: {} });
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>General Ledger — Journal Inquiry</h1>
      </div>

      <section className="card">
        <h2>Filters</h2>
        <div className="form-grid">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            Account code
            <input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} placeholder="e.g. 1000" />
          </label>
          <label>
            Source
            <input value={sourceKind} onChange={(e) => setSourceKind(e.target.value)} placeholder="invoice, payment…" />
          </label>
          <label>
            Reference contains
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        <div className="toolbar">
          <button className="btn btn-sm" type="button" onClick={() => void load(sess.accessToken)}>
            Apply filters
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Manual journal</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Business date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Reference
              <input value={journalRef} onChange={(e) => setJournalRef(e.target.value)} />
            </label>
            <label className="span-2">
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} required />
            </label>
          </div>
          {lines.map((line, i) => (
            <div className="toolbar" key={i}>
              <select
                value={line.accountCode}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, accountCode: e.target.value } : l)))}
                style={{ flex: 2 }}
              >
                <option value="">Account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <input
                className="input-sm"
                placeholder="Debit"
                value={line.debit}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, debit: e.target.value, credit: '' } : l)))}
                style={{ maxWidth: 110 }}
              />
              <input
                className="input-sm"
                placeholder="Credit"
                value={line.credit}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, credit: e.target.value, debit: '' } : l)))}
                style={{ maxWidth: 110 }}
              />
              <input
                className="input-sm"
                placeholder="Memo"
                value={line.memo}
                onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, memo: e.target.value } : l)))}
                style={{ flex: 1 }}
              />
            </div>
          ))}
          <div className="toolbar">
            <button type="button" className="btn btn-sm" onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>
              Add line
            </button>
            <span className={Math.abs(sumOf('debit') - sumOf('credit')) < 0.00005 ? 'ok-text' : 'error-text'}>
              Dr {formatMoney(sumOf('debit').toFixed(4))} · Cr {formatMoney(sumOf('credit').toFixed(4))}
            </span>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post journal'}
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
      </section>

      <section className="card">
        <h2>Journals ({total})</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : journals.length === 0 ? (
          <p className="muted">No journal entries match the filters.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {journals.map((j) => (
                  <>
                    <tr key={j.id} data-clickable="true" onClick={() => setExpanded(expanded === j.id ? null : j.id)}>
                      <td>{j.occurredAt.slice(0, 10)}</td>
                      <td>
                        {j.sourceKind}
                        <span className="muted"> · {j.event.replaceAll('_', ' ')}</span>
                      </td>
                      <td>{j.reference ?? '—'}</td>
                      <td>{j.description ?? '—'}</td>
                      <td className="num">{formatMoney(j.totalDebit)}</td>
                      <td className="num">{formatMoney(j.totalCredit)}</td>
                      <td>
                        {j.sourceKind === 'manual_journal' && j.event === 'manual_posted' ? (
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void reverse(j.id);
                            }}
                          >
                            Reverse
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === j.id ? (
                      <tr key={`${j.id}-lines`}>
                        <td colSpan={7}>
                          <table>
                            <thead>
                              <tr>
                                <th>Account</th>
                                <th className="num">Debit</th>
                                <th className="num">Credit</th>
                                <th>Memo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {j.lines.map((l) => (
                                <tr key={l.id}>
                                  <td>
                                    {l.accountCode} · {l.accountName}
                                  </td>
                                  <td className="num">{Number(l.debit) !== 0 ? formatMoney(l.debit) : '—'}</td>
                                  <td className="num">{Number(l.credit) !== 0 ? formatMoney(l.credit) : '—'}</td>
                                  <td>{l.memo ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
