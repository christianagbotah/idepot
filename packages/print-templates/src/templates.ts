/**
 * Canonical print templates (Phase 6 B5) — every figure comes from API
 * evidence (ReceiptPayloadDto / QuotationDto / CreditNoteDto /
 * CustomerStatementDto / FulfillmentDto); templates LAYOUT, they never
 * compute. Each template renders to:
 *   - a device-independent ThermalDocument (packages/hardware → ESC/POS)
 *   - print-ready A4/A5 HTML (browser preview + window.print / PDF)
 */
import type {
  ReceiptPayloadDto,
  QuotationDto,
  CreditNoteDto,
  CustomerStatementDto,
  FulfillmentDto,
} from '@idepot/contracts';
import type { ThermalDocument } from '@idepot/hardware';
import { display2dp, displayQty, displayDate, displayDateTime, cedi2dp } from './money.js';

const CEDI = 'GH¢';

/* --------------------------------- receipt --------------------------------- */

/** POS thermal receipt from the canonical payment-receipt payload. */
export function receiptThermal(p: ReceiptPayloadDto): ThermalDocument {
  return {
    title: 'RECEIPT',
    headerLines: [p.businessName, p.businessPhone ?? '', p.businessAddress ?? ''].filter(Boolean),
    rows: [
      { label: `Receipt ${p.code}`, value: displayDateTime(p.occurredAt) },
      ...(p.customerName ? [{ label: 'Customer', value: p.customerName }] : []),
      ...(p.cashierName ? [{ label: 'Cashier', value: p.cashierName }] : []),
      ...p.lines.map((l) => ({
        label: `${l.name} x${displayQty(l.quantity)}${l.unitCode ? ` ${l.unitCode}` : ''}`,
        value: display2dp(l.lineNet),
      })),
      { label: 'Subtotal', value: display2dp(p.subtotal) },
      ...(Number(p.orderDiscount) > 0
        ? [{ label: 'Discount', value: `-${display2dp(p.orderDiscount)}` }]
        : []),
      ...p.taxComponents.map((t) => ({
        label: `${t.name} (${display2dp(t.rate)}%)`,
        value: display2dp(t.amount),
      })),
      { label: 'TOTAL', value: cedi2dp(p.total, CEDI), strong: true },
      ...p.tenders.map((t) => ({ label: `PAID (${t.method.toUpperCase()})`, value: display2dp(t.amount) })),
      ...(Number(p.changeGiven) > 0 ? [{ label: 'CHANGE', value: display2dp(p.changeGiven) }] : []),
      // this receipt's scope only (legacy printed the whole-customer balance — pos-hardware.md §5)
      ...(Number(p.balanceOwedThisInvoice) > 0
        ? [{ label: 'BALANCE (THIS INVOICE)', value: display2dp(p.balanceOwedThisInvoice), strong: true }]
        : []),
    ],
    blocks: [],
    barcode: { data: p.code, symbology: 'code128' },
    qrPayload: `idepot:${p.kind}:${p.code}`,
    footerLines: [p.note ?? '', 'Thank you for your business!'].filter(Boolean),
    cut: true,
  };
}

/* -------------------------------- quotation -------------------------------- */

/** A4 proforma/quotation print model (legacy parity gap: quotation print).
 *  QuotationLineDto carries product IDs, not names — the caller enriches
 *  `productNames` from the product catalog (API evidence). */
export interface QuotationPrintModel {
  businessName: string;
  quotation: QuotationDto;
  productNames?: Record<string, string>;
}

export function quotationHtml(m: QuotationPrintModel): string {
  const q = m.quotation;
  const name = (productId: string) => m.productNames?.[productId] ?? `Item ${productId.slice(0, 8)}`;
  const rows = q.lines
    .map(
      (l) => `<tr><td>${escapeHtml(name(l.productId))}</td><td class="num">${displayQty(l.quantity)}</td>
      <td class="num">${display2dp(l.unitPrice)}</td><td class="num">${display2dp(l.lineNet)}</td></tr>`,
    )
    .join('');
  return a4Page(
    'QUOTATION',
    m.businessName,
    `
    <div class="meta">
      <div><strong>Quotation No:</strong> ${escapeHtml(q.code)}</div>
      <div><strong>Date:</strong> ${displayDate(q.createdAt)}</div>
      ${q.validUntil ? `<div><strong>Valid Until:</strong> ${displayDate(q.validUntil)}</div>` : ''}
      ${q.customerName ? `<div><strong>Customer:</strong> ${escapeHtml(q.customerName)}</div>` : ''}
      <div><strong>Status:</strong> ${escapeHtml(q.status)}</div>
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price (GH¢)</th><th class="num">Amount (GH¢)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${display2dp(q.subtotal)}</td></tr>
      <tr class="grand"><td>TOTAL</td><td class="num">${cedi2dp(q.total, CEDI)}</td></tr>
    </table>
    ${q.note ? `<p class="note">${escapeHtml(q.note)}</p>` : ''}
    <p class="fine">Prices quoted in Ghana Cedis. This quotation is not a tax invoice.</p>`,
  );
}

/* -------------------------------- credit note ------------------------------- */

export function creditNoteThermal(cn: CreditNoteDto): ThermalDocument {
  return {
    title: 'CREDIT NOTE',
    headerLines: [cn.code, `Date ${displayDate(cn.businessDate)}`],
    rows: [
      ...(cn.customerName ? [{ label: 'Customer', value: cn.customerName }] : []),
      ...(cn.invoiceCode ? [{ label: 'Against invoice', value: cn.invoiceCode }] : []),
      { label: 'Credit TOTAL', value: cedi2dp(cn.total, CEDI), strong: true },
      { label: 'settles AR', value: display2dp(cn.arAmount) },
      { label: 'refund payable', value: display2dp(cn.refundAmount) },
      { label: 'store credit', value: display2dp(cn.storeCreditAmount) },
      ...(Number(cn.refundedAmount) > 0
        ? [
            { label: 'already refunded', value: display2dp(cn.refundedAmount) },
            { label: 'outstanding refund', value: display2dp(cn.outstandingRefundAmount), strong: true },
          ]
        : []),
    ],
    blocks: [],
    barcode: { data: cn.code, symbology: 'code128' },
    qrPayload: `idepot:credit_note:${cn.code}`,
    footerLines: cn.note ? [cn.note] : [],
    cut: true,
  };
}

/* ------------------------------ customer statement -------------------------- */

export interface StatementPrintModel {
  businessName: string;
  statement: CustomerStatementDto;
}

export function statementHtml(m: StatementPrintModel): string {
  const s = m.statement;
  const rows = s.lines
    .map(
      (l) =>
        `<tr><td>${displayDate(l.businessDate)}</td><td>${escapeHtml(l.description)}</td>
         <td class="num">${display2dp(l.debit)}</td><td class="num">${display2dp(l.credit)}</td>
         <td class="num">${display2dp(l.balance)}</td></tr>`,
    )
    .join('');
  return a4Page(
    'CUSTOMER STATEMENT',
    m.businessName,
    `
    <div class="meta">
      <div><strong>Customer:</strong> ${escapeHtml(s.customerName ?? '')}</div>
      <div><strong>As of:</strong> ${displayDate(s.asOf)}</div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Description</th><th class="num">Debit (GH¢)</th><th class="num">Credit (GH¢)</th><th class="num">Balance (GH¢)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Opening balance</td><td class="num">${display2dp(s.openingBalance)}</td></tr>
      <tr><td>Closing balance</td><td class="num">${display2dp(s.closingBalance)}</td></tr>
      <tr class="grand"><td>Amount due (receivable)</td><td class="num">${cedi2dp(s.receivable, CEDI)}</td></tr>
      <tr><td>Store credit usable (as of date)</td><td class="num">${display2dp(s.storeCredit)}</td></tr>
      <tr><td>Store credit issued (gross)</td><td class="num">${display2dp(s.storeCreditIssued)}</td></tr>
    </table>`,
  );
}

/* ---------------------------------- waybill --------------------------------- */

/** FulfillmentLineDto carries product IDs only — the caller enriches with
 *  names from the catalog (API evidence) for the printed waybill. */
export interface WaybillPrintModel {
  businessName: string;
  waybill: FulfillmentDto;
  destination: string;
  lines: Array<{ productName: string; quantity: string; note?: string }>;
}

export function waybillHtml(m: WaybillPrintModel): string {
  const w = m.waybill;
  const rows = m.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.productName)}</td><td class="num">${displayQty(l.quantity)}</td><td>${escapeHtml(l.note ?? '')}</td></tr>`,
    )
    .join('');
  return a4Page(
    'WAYBILL',
    m.businessName,
    `
    <div class="meta">
      <div><strong>Waybill No:</strong> ${escapeHtml(w.code)}</div>
      ${w.salesOrderCode ? `<div><strong>Sales Order:</strong> ${escapeHtml(w.salesOrderCode)}</div>` : ''}
      <div><strong>Status:</strong> ${escapeHtml(w.status)}</div>
      <div><strong>Destination:</strong> ${escapeHtml(m.destination)}</div>
      ${w.dispatchedAt ? `<div><strong>Dispatched:</strong> ${displayDateTime(w.dispatchedAt)}</div>` : ''}
      ${w.deliveredAt ? `<div><strong>Delivered:</strong> ${displayDateTime(w.deliveredAt)}</div>` : ''}
    </div>
    <table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="signatures">
      <div>Dispatched by: ______________</div><div>Received by: ______________</div>
    </div>`,
  );
}

/* ----------------------------------- A4 shell ------------------------------- */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Shared print-ready A4 shell: same CSS for preview and paper. */
export function a4Page(title: string, businessName: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — ${escapeHtml(businessName)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Noto Sans', Arial, sans-serif; color: #111; font-size: 11pt; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 12px; }
  header .biz { font-size: 15pt; font-weight: 700; }
  header .doc { font-size: 13pt; letter-spacing: 2px; font-weight: 700; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f3f3f3; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.totals { width: 55%; margin-left: auto; }
  table.totals td { border: none; padding: 3px 6px; }
  tr.grand td { font-weight: 700; border-top: 2px solid #111; font-size: 12pt; }
  .note { font-style: italic; }
  .fine { font-size: 9pt; color: #555; }
  .signatures { display: flex; justify-content: space-between; margin-top: 28mm; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<header><span class="biz">${escapeHtml(businessName)}</span><span class="doc">${escapeHtml(title)}</span></header>
${bodyHtml}
</body>
</html>`;
}

/** The A4 tax invoice view of a receipt payload (kind='invoice_a4'). */
export function invoiceA4Html(p: ReceiptPayloadDto): string {
  const rows = p.lines
    .map(
      (l) => `<tr><td>${escapeHtml(l.name)}</td><td class="num">${displayQty(l.quantity)}</td>
      <td class="num">${display2dp(l.unitPrice)}</td><td class="num">${display2dp(l.lineNet)}</td></tr>`,
    )
    .join('');
  return a4Page(
    'TAX INVOICE',
    p.businessName,
    `
    <div class="meta">
      <div><strong>Invoice No:</strong> ${escapeHtml(p.code)}</div>
      <div><strong>Date:</strong> ${displayDateTime(p.occurredAt)}</div>
      ${p.customerName ? `<div><strong>Customer:</strong> ${escapeHtml(p.customerName)}</div>` : ''}
      ${p.cashierName ? `<div><strong>Served by:</strong> ${escapeHtml(p.cashierName)}</div>` : ''}
    </div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit Price (GH¢)</th><th class="num">Amount (GH¢)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${display2dp(p.subtotal)}</td></tr>
      ${Number(p.orderDiscount) > 0 ? `<tr><td>Discount</td><td class="num">-${display2dp(p.orderDiscount)}</td></tr>` : ''}
      ${p.taxComponents.map((t) => `<tr><td>${escapeHtml(t.name)}</td><td class="num">${display2dp(t.amount)}</td></tr>`).join('')}
      <tr class="grand"><td>TOTAL</td><td class="num">${cedi2dp(p.total, CEDI)}</td></tr>
      ${p.tenders.map((t) => `<tr><td>Paid (${escapeHtml(t.method)})</td><td class="num">${display2dp(t.amount)}</td></tr>`).join('')}
      ${Number(p.changeGiven) > 0 ? `<tr><td>Change</td><td class="num">${display2dp(p.changeGiven)}</td></tr>` : ''}
      ${Number(p.balanceOwedThisInvoice) > 0 ? `<tr><td>Balance due (this invoice)</td><td class="num">${display2dp(p.balanceOwedThisInvoice)}</td></tr>` : ''}
    </table>
    <p class="fine">Amounts in Ghana Cedis. Keep this invoice for your records.</p>`,
  );
}
