'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { ListDto } from '../../../lib/types';

interface DepositDto {
  id: string; code: string; customerId: string; customerName: string | null;
  amount: string; appliedAmount: string; remainingAmount: string;
  status: 'active' | 'exhausted'; note: string | null; createdAt: string;
}
interface CreditApplicationDto {
  id: string; depositId: string; depositCode: string | null;
  invoiceId: string; invoiceCode: string | null; amount: string; createdAt: string;
}
interface CustomerDtoLite { id: string; name: string; phone: string }
interface DueInvoiceDto { id: string; code: string; amountDue: string }

/** Deposits are unapplied-cash documents (C-20 corrected): take money now,
 *  consume it later as explicit credit applications — never negative invoices. */
export default function DepositsPage() {
  const session = useSession();

  const [deposits, setDeposits] = useState<DepositDto[]>([]);
  const [applications, setApplications] = useState<CreditApplicationDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [applyDepositId, setApplyDepositId] = useState('');
  const [applyInvoiceId, setApplyInvoiceId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    const [d, c] = await Promise.all([
      apiFetch<ListDto<DepositDto>>('/deposits', { token }),
      apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }),
    ]);
    setDeposits(d.items);
    setCustomers(c.items as CustomerDtoLite[]);
    const a = await apiFetch<ListDto<CreditApplicationDto>>('/credits', { token });
    setApplications(a.items);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken).catch((err) => setError(apiErrorMessage(err)));
  }, [session, load]);

  async function takeDeposit() {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      const res = await apiFetch<DepositDto>('/deposits', {
        method: 'POST',
        token: session.accessToken,
        body: { customerId, amount, tenders: [{ method: 'cash', amount }] },
      });
      setOkMsg(`deposit ${res.code} taken (${Number(res.amount).toFixed(2)})`);
      setAmount('');
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyCredit() {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      await apiFetch('/credits/apply', {
        method: 'POST',
        token: session.accessToken,
        body: { depositId: applyDepositId, invoiceId: applyInvoiceId, amount: applyAmount },
      });
      setOkMsg('credit applied to the invoice');
      setApplyAmount('');
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const activeDeposits = deposits.filter((d) => d.status === 'active');

  return (
    <div>
      <div className="page-head"><h1>Customer deposits & credit</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      <section className="card">
        <h2>Take a deposit</h2>
        <div className="form-row">
          <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
            ))}
          </select>
          <input className="input" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn btn-primary" type="button" disabled={busy || !customerId || !amount} onClick={() => void takeDeposit()}>
            {busy ? 'Posting…' : 'Take deposit'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Apply credit to an invoice</h2>
        <div className="form-row">
          <select className="input" value={applyDepositId} onChange={(e) => {
            setApplyDepositId(e.target.value);
            setApplyInvoiceId('');
          }}>
            <option value="">— deposit —</option>
            {activeDeposits.map((d) => (
              <option key={d.id} value={d.id}>{d.code} · {d.customerName} · remaining {Number(d.remainingAmount).toFixed(2)}</option>
            ))}
          </select>
          <ApplyInvoicePicker
            token={session.accessToken}
            customerId={activeDeposits.find((d) => d.id === applyDepositId)?.customerId ?? ''}
            value={applyInvoiceId}
            onChange={(id, due) => {
              setApplyInvoiceId(id);
              if (due) setApplyAmount(Number(due).toFixed(2));
            }}
          />
          <input className="input" placeholder="amount" value={applyAmount} onChange={(e) => setApplyAmount(e.target.value)} />
          <button className="btn btn-primary" type="button" disabled={busy || !applyDepositId || !applyInvoiceId || !applyAmount} onClick={() => void applyCredit()}>
            {busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Deposits</h2>
        <table className="table">
          <thead><tr><th>Code</th><th>Customer</th><th style={{ textAlign: 'right' }}>Amount</th>
            <th style={{ textAlign: 'right' }}>Applied</th><th style={{ textAlign: 'right' }}>Remaining</th><th>Status</th></tr></thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d.id}>
                <td>{d.code}</td>
                <td>{d.customerName ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{Number(d.amount).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(d.appliedAmount).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(d.remainingAmount).toFixed(2)}</td>
                <td><span className={`badge badge-${d.status}`}>{d.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {deposits.length === 0 && <p className="muted">No deposits yet.</p>}
      </section>

      {applications.length > 0 && (
        <section className="card">
          <h2>Credit applications</h2>
          <table className="table">
            <thead><tr><th>Deposit</th><th>Invoice</th><th style={{ textAlign: 'right' }}>Amount</th><th>When</th></tr></thead>
            <tbody>
              {applications.map((a) => (
                <tr key={a.id}>
                  <td>{a.depositCode ?? a.depositId.slice(0, 8)}</td>
                  <td>{a.invoiceCode ?? a.invoiceId.slice(0, 8)}</td>
                  <td style={{ textAlign: 'right' }}>{Number(a.amount).toFixed(2)}</td>
                  <td className="muted">{new Date(a.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/** Loads the due invoices of the deposit's customer on demand. */
function ApplyInvoicePicker(props: {
  token: string;
  customerId: string;
  value: string;
  onChange: (invoiceId: string, due: string | null) => void;
}) {
  const [invoices, setInvoices] = useState<DueInvoiceDto[]>([]);
  useEffect(() => {
    if (!props.customerId) { setInvoices([]); return; }
    let cancelled = false;
    void apiFetch<ListDto<DueInvoiceDto>>(`/sales/invoices?customerId=${props.customerId}`, { token: props.token }).then(
      (r) => { if (!cancelled) setInvoices(r.items.filter((i) => Number(i.amountDue) > 0)); },
      () => undefined,
    );
    return () => { cancelled = true; };
  }, [props.customerId, props.token]);

  return (
    <select className="input" value={props.value} onChange={(e) => {
      const inv = invoices.find((i) => i.id === e.target.value);
      props.onChange(e.target.value, inv?.amountDue ?? null);
    }}>
      <option value="">— invoice —</option>
      {invoices.map((i) => (
        <option key={i.id} value={i.id}>{i.code} · due {Number(i.amountDue).toFixed(2)}</option>
      ))}
    </select>
  );
}
