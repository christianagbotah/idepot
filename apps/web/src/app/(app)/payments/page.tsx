'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import type { ListDto } from '../../../lib/types';
import type { InvoiceDto } from '../sales/page';

interface PaymentDto {
  id: string; code: string; customerId: string | null; customerName: string | null;
  amount: string; changeGiven: string; unapplied: string; source: string;
  tenders: Array<{ id: string; method: string; amount: string; momoProvider: string | null; reference: string | null }>;
  allocations: Array<{ id: string; invoiceId: string; invoiceCode: string | null; amount: string }>;
  createdAt: string;
}
interface CustomerDtoLite { id: string; name: string; phone: string }

/** Receive payment: typed tenders + explicit allocations (C-6/C-17 corrected). */
export default function PaymentsPage() {
  const session = useSession();

  const [customers, setCustomers] = useState<CustomerDtoLite[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [payments, setPayments] = useState<PaymentDto[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'momo' | 'cheque' | 'bank_transfer'>('cash');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const load = useCallback(async (token: string) => {
    const [c, inv, pay] = await Promise.all([
      apiFetch<ListDto<CustomerDtoLite>>('/customers', { token }),
      apiFetch<ListDto<InvoiceDto>>('/sales/invoices', { token }),
      apiFetch<ListDto<PaymentDto>>('/payments', { token }),
    ]);
    setCustomers(c.items as CustomerDtoLite[]);
    setInvoices(inv.items.filter((i) => i.status === 'posted' && i.amountDue !== '0.0000'));
    setPayments(pay.items);
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken).catch((err) => setError(apiErrorMessage(err)));
  }, [session, load]);

  async function receive() {
    if (!session) return;
    setBusy(true);
    setError('');
    setOkMsg('');
    try {
      const res = await apiFetch<PaymentDto>('/payments', {
        method: 'POST',
        token: session.accessToken,
        body: {
          customerId,
          invoiceId: invoiceId || null,
          amount,
          tenders: [
            {
              method,
              amount,
              ...(method === 'momo' ? { momoProvider: 'MTN', momoPhone: detail || '0240000000' } : {}),
              ...(method === 'cheque' ? { chequeBank: detail || 'Bank', chequeNumber: detail || '0001' } : {}),
              ...(method === 'bank_transfer' ? { reference: detail || 'transfer' } : {}),
            },
          ],
        },
      });
      setOkMsg(`receipt ${res.code} recorded (${Number(res.amount).toFixed(2)})`);
      setAmount('');
      setDetail('');
      await load(session.accessToken);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="muted">Sign in first.</p>;

  const selected = invoices.find((i) => i.id === invoiceId);

  return (
    <div>
      <div className="page-head"><h1>Payments</h1></div>
      {error && <p className="error">{error}</p>}
      {okMsg && <p className="muted">{okMsg}</p>}

      <section className="card">
        <h2>Receive payment</h2>
        <div className="form-row">
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(''); }}>
            <option value="">— customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>
            ))}
          </select>
          <select className="input" value={invoiceId} onChange={(e) => {
            setInvoiceId(e.target.value);
            const inv = invoices.find((i) => i.id === e.target.value);
            if (inv) setAmount(Number(inv.amountDue).toFixed(2));
          }}>
            <option value="">— on account (FIFO allocation optional) —</option>
            {invoices.filter((i) => i.customerId === customerId).map((i) => (
              <option key={i.id} value={i.id}>{i.code} · due {Number(i.amountDue).toFixed(2)}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <input className="input" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            <option value="cash">Cash</option>
            <option value="momo">MoMo (MTN)</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
          <input className="input" placeholder="detail (phone / cheque / reference)" value={detail} onChange={(e) => setDetail(e.target.value)} />
          <button className="btn btn-primary" type="button" disabled={busy || !customerId || !amount} onClick={() => void receive()}>
            {busy ? 'Posting…' : 'Receive'}
          </button>
        </div>
        {selected && (
          <p className="muted">Allocating {amount || '0.00'} of {Number(selected.amountDue).toFixed(2)} due on {selected.code}.</p>
        )}
      </section>

      <section className="card">
        <h2>Recent receipts</h2>
        <table className="table">
          <thead>
            <tr><th>Receipt</th><th>When</th><th>Customer</th><th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>Unapplied</th><th>Tenders</th><th>Allocations</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td>{p.customerName ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{Number(p.amount).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(p.unapplied).toFixed(2)}</td>
                <td className="muted">{p.tenders.map((t) => `${t.method} ${Number(t.amount).toFixed(2)}`).join(', ')}</td>
                <td className="muted">{p.allocations.map((a) => `${a.invoiceCode ?? '?'} ${Number(a.amount).toFixed(2)}`).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="muted">No receipts yet.</p>}
      </section>
    </div>
  );
}
