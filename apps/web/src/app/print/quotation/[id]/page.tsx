'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, apiErrorMessage } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import type { QuotationDto, ProductDto, ListDto } from '../../../../lib/types';
import { display2dp, displayDate, displayQty, cedi2dp } from '@idepot/print-templates';

/**
 * Quotation print view (Phase 6 B5 — closes the legacy parity gap:
 * quotation printing). A4 proforma layout driven by the quotation API
 * payload; every figure rendered verbatim via the shared print-template
 * display helpers (2dp + thousands separators; 4dp internals untouched).
 * Product names are resolved from the catalog (the DTO carries IDs).
 */
export default function PrintQuotationPage() {
  const session = useSession();
  const params = useParams<{ id: string }>();
  const [quotation, setQuotation] = useState<QuotationDto | null>(null);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session || !params?.id) return;
    void apiFetch<QuotationDto>(`/quotations/${params.id}`, { token: session.accessToken }).then(
      (q) => {
        setQuotation(q);
        // resolve product names from the catalog (API evidence)
        void apiFetch<ListDto<ProductDto>>('/products', { token: session.accessToken }).then(
          (res) => setProductNames(Object.fromEntries(res.items.map((p) => [p.id, p.name]))),
          () => undefined, // names are cosmetic — IDs still print
        );
      },
      (err) => setError(apiErrorMessage(err)),
    );
  }, [session, params?.id]);

  if (error) return <p className="error">{error}</p>;
  if (!quotation) return <p className="muted">Loading quotation…</p>;
  const name = (id: string) => productNames[id] ?? `Item ${id.slice(0, 8)}`;

  return (
    <div className="print-wrap print-a4">
      <div className="toolbar print-toolbar no-print">
        <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print</button>
      </div>

      <div className="receipt quotation">
        <div className="receipt-head">
          <div className="receipt-business">QUOTATION</div>
          <div>Quotation No: {quotation.code}</div>
          <div>Date: {displayDate(quotation.createdAt)}</div>
          {quotation.validUntil && <div>Valid Until: {displayDate(quotation.validUntil)}</div>}
          {quotation.customerName && <div>Customer: {quotation.customerName}</div>}
          <div>Status: {quotation.status}</div>
        </div>

        <table className="receipt-lines">
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Unit Price (GH¢)</th><th>Amount (GH¢)</th></tr>
          </thead>
          <tbody>
            {quotation.lines.map((l) => (
              <tr key={l.id}>
                <td>{name(l.productId)}</td>
                <td>{displayQty(l.quantity)}</td>
                <td>{display2dp(l.unitPrice)}</td>
                <td>{display2dp(l.lineNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="receipt-totals">
          <div>Subtotal {display2dp(quotation.subtotal)}</div>
          <div className="grand">TOTAL {cedi2dp(quotation.total)}</div>
        </div>

        {quotation.note && <p className="note">{quotation.note}</p>}
        <p className="fine">Prices quoted in Ghana Cedis. This quotation is not a tax invoice.</p>
      </div>
    </div>
  );
}
