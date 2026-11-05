'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useReferenceData } from '../../../../lib/use-reference';
import { formatMoney } from '../../../../lib/format';
import type { SupplierInvoiceWebDto, SupplierPaymentWebDto } from '../../../../lib/types-phase4';

export default function SupplierPaymentsPage() {
  const session = useSession();
  const [payments, setPayments] = useState<SupplierPaymentWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [allocations, setAllocations] = useState<Array<{ supplierInvoiceId: string; amount: string }>>([]);

  const { suppliers } = useReferenceData(session, { suppliers: true });
  const [openInvoices, setOpenInvoices] = useState<SupplierInvoiceWebDto[]>([]);

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<SupplierPaymentWebDto[]>(`/purchasing/supplier-payments${qs({ limit: '100' })}`, {
        token,
      });
      setPayments(res);
    } catch (err) {
      setLoadError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  useEffect(() => {
    if (!session || supplierId === '') {
      setOpenInvoices([]);
      return;
    }
    void apiFetch<SupplierInvoiceWebDto[]>(
      `/purchasing/supplier-invoices${qs({ supplierId, limit: '100' })}`,
      { token: session.accessToken },
    ).then(
      (res) => setOpenInvoices(res.filter((i) => i.status !== 'cancelled' && Number(i.amountOpen) > 0)),
      () => setOpenInvoices([]),
    );
  }, [session, supplierId]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    if (supplierId === '' || amount === '') {
      setFormError('Supplier and amount are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<SupplierPaymentWebDto>('/purchasing/supplier-payments', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          supplierId,
          businessDate,
          amount,
          method,
          reference: reference || undefined,
          allocations: allocations.filter((a) => a.supplierInvoiceId !== '' && a.amount !== ''),
        },
      });
      setOkMsg(
        `Payment ${created.code} posted — allocated ${formatMoney(created.amountAllocated)}, advance ${formatMoney(created.amountUnapplied)}.`,
      );
      setAmount('');
      setAllocations([]);
      await load(sess.accessToken);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Supplier Payments</h1>
      </div>

      <section className="card">
        <h2>Pay supplier</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Supplier
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setAllocations([]);
                }}
                required
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </label>
            <label>
              Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {['cash', 'momo', 'cheque', 'bank_transfer', 'other'].map((m) => (
                  <option key={m} value={m}>
                    {m.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reference
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque / momo ref" />
            </label>
          </div>
          {openInvoices.length > 0 ? (
            <>
              <strong>Allocate to open invoices</strong>
              {openInvoices.map((inv) => (
                <div className="toolbar" key={inv.id}>
                  <span style={{ flex: 2 }}>
                    {inv.code} · {inv.supplierInvoiceNumber} · due {inv.dueDate ?? '—'}
                  </span>
                  <span className="num" style={{ minWidth: 120 }}>
                    open {formatMoney(inv.amountOpen)}
                  </span>
                  <input
                    className="input-sm"
                    placeholder="Allocate"
                    value={allocations.find((a) => a.supplierInvoiceId === inv.id)?.amount ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAllocations((prev) => {
                        const without = prev.filter((a) => a.supplierInvoiceId !== inv.id);
                        return value === '' ? without : [...without, { supplierInvoiceId: inv.id, amount: value }];
                      });
                    }}
                    style={{ maxWidth: 130 }}
                  />
                </div>
              ))}
              <p className="muted">
                Unallocated remainder is recorded as a supplier advance (Dr advances to suppliers).
              </p>
            </>
          ) : null}
          <div className="toolbar">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post payment'}
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
        <h2>Posted payments</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : payments.length === 0 ? (
          <p className="muted">No supplier payments yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Method</th>
                  <th className="num">Amount</th>
                  <th className="num">Allocated</th>
                  <th className="num">Unapplied</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} data-clickable="true" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                    <td>{p.code}</td>
                    <td>{p.businessDate}</td>
                    <td>{p.supplierName ?? p.supplierId.slice(0, 8)}</td>
                    <td>{p.method.replaceAll('_', ' ')}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td className="num">{formatMoney(p.amountAllocated)}</td>
                    <td className="num">{formatMoney(p.amountUnapplied)}</td>
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
