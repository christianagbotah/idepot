'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useReferenceData } from '../../../../lib/use-reference';
import { formatMoney } from '../../../../lib/format';
import { StatusBadge } from '../../../../components/status-badge';
import type { ListDto } from '../../../../lib/types';
import type { SupplierAdjustmentWebDto, SupplierInvoiceWebDto } from '../../../../lib/types-phase4';

export default function SupplierAdjustmentsPage() {
  const session = useSession();
  const [items, setItems] = useState<SupplierAdjustmentWebDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<'credit_note' | 'debit_note'>('credit_note');
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceId, setSupplierInvoiceId] = useState('');
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [adjustmentClass, setAdjustmentClass] = useState('price_correction');
  const [amount, setAmount] = useState('');

  const { suppliers } = useReferenceData(session, { suppliers: true });
  const [invoices, setInvoices] = useState<SupplierInvoiceWebDto[]>([]);

  const load = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await apiFetch<ListDto<SupplierAdjustmentWebDto>>(
        `/purchasing/supplier-adjustments${qs({ limit: '100' })}`,
        { token },
      );
      setItems(res.items);
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
      setInvoices([]);
      return;
    }
    void apiFetch<ListDto<SupplierInvoiceWebDto>>(
      `/purchasing/supplier-invoices${qs({ supplierId, limit: '100' })}`,
      { token: session.accessToken },
    ).then(
      (res) => setInvoices(res.items.filter((i) => i.status !== 'cancelled')),
      () => setInvoices([]),
    );
  }, [session, supplierId]);

  if (!session) return <p className="muted">Loading…</p>;
  const sess = session;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError('');
    setOkMsg('');
    if (supplierId === '' || amount === '' || reason.length < 10) {
      setFormError('Supplier, amount and a reason of at least 10 characters are required.');
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<SupplierAdjustmentWebDto>('/purchasing/supplier-adjustments', {
        method: 'POST',
        token: sess.accessToken,
        body: {
          kind,
          supplierId,
          supplierInvoiceId: supplierInvoiceId || null,
          businessDate,
          reason,
          adjustmentClass,
          amount,
        },
      });
      setOkMsg(`${kind === 'credit_note' ? 'Credit note' : 'Debit note'} ${created.code} posted.`);
      setAmount('');
      setReason('');
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
        <h1>Supplier Debit / Credit Notes</h1>
      </div>

      <section className="card">
        <h2>New correction (append-only — the source invoice is never edited)</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Kind
              <select value={kind} onChange={(e) => setKind(e.target.value as 'credit_note' | 'debit_note')}>
                <option value="credit_note">Credit note (reduce what we owe)</option>
                <option value="debit_note">Debit note (additional charge)</option>
              </select>
            </label>
            <label>
              Supplier
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setSupplierInvoiceId('');
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
              Target invoice
              <select value={supplierInvoiceId} onChange={(e) => setSupplierInvoiceId(e.target.value)}>
                <option value="">No specific invoice</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} · {i.supplierInvoiceNumber} · open {formatMoney(i.amountOpen)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} required />
            </label>
            <label>
              Class
              <select value={adjustmentClass} onChange={(e) => setAdjustmentClass(e.target.value)}>
                {['price_correction', 'quantity_correction', 'returns', 'other'].map((c) => (
                  <option key={c} value={c}>
                    {c.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
            </label>
            <label className="span-2">
              Reason (min 10 chars)
              <input value={reason} onChange={(e) => setReason(e.target.value)} required />
            </label>
          </div>
          <div className="toolbar">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Posting…' : 'Post correction'}
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
        <h2>Posted corrections</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : loadError ? (
          <p className="error-text" role="alert">
            {loadError}
          </p>
        ) : items.length === 0 ? (
          <p className="muted">No debit/credit notes yet.</p>
        ) : (
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Kind</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Invoice</th>
                  <th className="num">Amount</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>
                      <StatusBadge status={a.kind === 'credit_note' ? 'counted' : 'adjustment'} />
                    </td>
                    <td>{a.businessDate}</td>
                    <td>{a.supplierName ?? a.supplierId.slice(0, 8)}</td>
                    <td>{a.supplierInvoiceCode ?? '—'}</td>
                    <td className="num">{formatMoney(a.amount)}</td>
                    <td>{a.reason}</td>
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
