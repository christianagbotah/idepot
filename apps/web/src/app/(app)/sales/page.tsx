'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiErrorMessage, qs } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { labelOf, useReferenceData } from '../../../lib/use-reference';
import type { ListDto } from '../../../lib/types';

/** Phase 3 wire types for the sales pages (mirrors @idepot/contracts). */
export interface InvoiceLineDto {
  id: string; productId: string; unitId: string | null;
  quantity: string; quantityBase: string;
  unitPrice: string; lineNet: string;
  resolvedPrice: string | null; priceSource: string | null; priceOverridden: boolean;
  costAtSale: string | null; note: string | null;
}
export interface InvoiceDto {
  id: string; code: string; salesOrderId: string | null;
  customerId: string | null; customerName: string | null; warehouseId: string;
  status: 'posted' | 'voided';
  paymentStatus: 'unpaid' | 'part_paid' | 'paid' | 'over_paid';
  subtotal: string; orderDiscount: string; total: string;
  amountPaid: string; amountDue: string; costTotal: string | null;
  changeGiven: string; shiftId: string | null; source: string;
  clientDocId: string | null; note: string | null;
  lines: InvoiceLineDto[]; createdBy: string | null; createdAt: string;
}

export default function SalesPage() {
  const session = useSession();
  const { warehouses } = useReferenceData(session);

  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');

  const warehouseMap = new Map(warehouses.map((w) => [w.id, w] as const));

  const load = useCallback(
    async (token: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch<ListDto<InvoiceDto>>(`/sales/invoices${qs({ limit: '100' })}`, { token });
        setInvoices(res.items);
      } catch (err) {
        setError(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    void load(session.accessToken);
  }, [session, load]);

  if (!session) return <p className="muted">Sign in first.</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Sales / invoices</h1>
        <div className="toolbar">
          <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            <option value="">All payment states</option>
            <option value="unpaid">Unpaid</option>
            <option value="part_paid">Part paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Code</th><th>Date</th><th>Customer</th><th>Warehouse</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th style={{ textAlign: 'right' }}>Paid</th>
            <th style={{ textAlign: 'right' }}>Due</th>
            <th>State</th><th>Source</th><th />
          </tr>
        </thead>
        <tbody>
          {invoices
            .filter((i) => !paymentStatus || i.paymentStatus === paymentStatus)
            .map((i) => (
              <tr key={i.id}>
                <td>{i.code}</td>
                <td>{new Date(i.createdAt).toLocaleString()}</td>
                <td>{i.customerName ?? '—'}</td>
                <td>{labelOf(warehouseMap as unknown as Map<string, { code: string; name: string }>, i.warehouseId)}</td>
                <td style={{ textAlign: 'right' }}>{Number(i.total).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(i.amountPaid).toFixed(2)}</td>
                <td style={{ textAlign: 'right' }}>{Number(i.amountDue).toFixed(2)}</td>
                <td><span className={`badge badge-${i.paymentStatus}`}>{i.paymentStatus}</span></td>
                <td className="muted">{i.source}</td>
                <td><a href={`/print/receipt/${i.id}`} target="_blank" rel="noreferrer">print</a></td>
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && invoices.length === 0 && <p className="muted">No sales yet — the POS is at /pos.</p>}
    </div>
  );
}
