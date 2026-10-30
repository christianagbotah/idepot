'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import type { ReceiptPayloadDto } from '../../../../lib/types';

/**
 * Receipt print view (pos-hardware §4/§5): ONE payload drives the thermal
 * (80mm) and A4 templates. Printing happens through the browser (web PWA);
 * the Tauri hardware bridge (Phase 6) renders the same payload to ESC/POS.
 * "Balance owed" is THIS invoice's remaining due — never the legacy
 * whole-customer balance.
 */
export default function PrintReceiptPage() {
  const session = useSession();
  const params = useParams<{ id: string }>();
  const [payload, setPayload] = useState<ReceiptPayloadDto | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'thermal' | 'a4'>('thermal');

  useEffect(() => {
    if (!session || !params?.id) return;
    void apiFetch<ReceiptPayloadDto>(`/sales/invoices/${params.id}/receipt`, { token: session.accessToken }).then(
      setPayload,
      (err) => setError(apiErrorMessage(err)),
    );
  }, [session, params?.id]);

  if (error) return <p className="error">{error}</p>;
  if (!payload) return <p className="muted">Loading receipt…</p>;

  return (
    <div className={`print-wrap ${kind === 'thermal' ? 'print-thermal' : 'print-a4'}`}>
      <div className="toolbar print-toolbar no-print">
        <button className="btn" type="button" onClick={() => setKind(kind === 'thermal' ? 'a4' : 'thermal')}>
          {kind === 'thermal' ? 'A4 invoice layout' : 'Thermal layout'}
        </button>
        <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print</button>
      </div>

      <div className="receipt">
        <div className="receipt-head">
          <div className="receipt-business">{payload.businessName}</div>
          {payload.businessPhone && <div>{payload.businessPhone}</div>}
          {payload.businessAddress && <div>{payload.businessAddress}</div>}
          <div>{kind === 'thermal' ? 'SALE RECEIPT' : 'TAX INVOICE'}</div>
          <div>{payload.code} · {new Date(payload.occurredAt).toLocaleString()}</div>
          {payload.customerName && <div>Customer: {payload.customerName}{payload.customerPhone ? ` · ${payload.customerPhone}` : ''}</div>}
          {payload.cashierName && <div>Cashier: {payload.cashierName}</div>}
        </div>

        <table className="receipt-lines">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {payload.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td>{l.quantity}{l.unitCode ? ` ${l.unitCode}` : ''}</td>
                <td>{Number(l.unitPrice).toFixed(2)}</td>
                <td>{Number(l.lineNet).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-totals">
          <div><span>Subtotal</span><span>{Number(payload.subtotal).toFixed(2)}</span></div>
          {Number(payload.orderDiscount) > 0 && (
            <div><span>Discount</span><span>-{Number(payload.orderDiscount).toFixed(2)}</span></div>
          )}
          <div className="receipt-total-row"><span>TOTAL</span><span>{Number(payload.total).toFixed(2)}</span></div>
          {payload.tenders.map((t, i) => (
            <div key={i}>
              <span>{t.method}{t.detail ? ` (${t.detail})` : ''}</span>
              <span>{Number(t.amount).toFixed(2)}</span>
            </div>
          ))}
          {Number(payload.changeGiven) > 0 && (
            <div><span>Change</span><span>{Number(payload.changeGiven).toFixed(2)}</span></div>
          )}
          {Number(payload.balanceOwedThisInvoice) > 0 && (
            <div className="receipt-total-row"><span>BALANCE OWED</span><span>{Number(payload.balanceOwedThisInvoice).toFixed(2)}</span></div>
          )}
        </div>
        {payload.note && <div className="receipt-note">{payload.note}</div>}
        <div className="receipt-foot">Thank you for your business.</div>
      </div>
    </div>
  );
}
