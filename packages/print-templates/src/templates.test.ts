/**
 * Print-template golden tests (Phase 6 B5): exact 2dp display with
 * thousands separators, cedi rendering, QR/barcode evidence payloads, and
 * template HTML that carries API figures VERBATIM (templates never compute).
 */
import { describe, it, expect } from 'vitest';
import type {
  ReceiptPayloadDto,
  QuotationDto,
  CreditNoteDto,
  CustomerStatementDto,
  FulfillmentDto,
} from '@idepot/contracts';
import {
  display2dp,
  displayQty,
  displayDate,
  cedi2dp,
  receiptThermal,
  quotationHtml,
  creditNoteThermal,
  statementHtml,
  waybillHtml,
  invoiceA4Html,
} from './index.js';

describe('money display (B5: 2dp + thousands separators in UI, 4dp internal untouched)', () => {
  it('renders exact 2dp with separators (half-even at the cent, like the domain)', () => {
    expect(display2dp('1234567.8900')).toBe('1,234,567.89');
    expect(display2dp('230.0000')).toBe('230.00');
    expect(display2dp('0.0050')).toBe('0.00'); // half-even: exactly .005 rounds to the even cent
    expect(display2dp('0.0150')).toBe('0.02'); // .015 rounds up to even
    expect(display2dp('123456.7890')).toBe('123,456.79'); // .789 rounds up
    expect(display2dp('-1450.5000')).toBe('-1,450.50');
    expect(display2dp('0.0000')).toBe('0.00');
    expect(display2dp('999.9950')).toBe('1,000.00');
  });

  it('never mutates the source string (4dp evidence preserved)', () => {
    const src = '1234567.8900';
    display2dp(src);
    expect(src).toBe('1234567.8900');
  });

  it('cedi prefix and quantity trimming', () => {
    expect(cedi2dp('1234.5600')).toBe('GH¢ 1,234.56');
    expect(displayQty('4.000000')).toBe('4');
    expect(displayQty('2.500000')).toBe('2.5');
  });

  it('dd/mm/yyyy display dates', () => {
    expect(displayDate('2026-11-12')).toBe('12/11/2026');
    expect(displayDate('2026-11-12T09:30:00Z')).toBe('12/11/2026');
  });
});

const receipt: ReceiptPayloadDto = {
  kind: 'receipt',
  businessName: 'Lightworld Demo Depot',
  businessPhone: '030 200 0000',
  businessAddress: 'Accra Road, Kumasi',
  code: 'RCT-000042',
  occurredAt: '2026-11-12T09:30:00Z',
  customerName: 'Ama Mensah',
  customerPhone: '024 400 0111',
  cashierName: 'Kofi',
  lines: [{ name: 'Cement Bag', quantity: '4.000000', unitCode: 'BAG', unitPrice: '95.0000', lineNet: '380.0000' }],
  subtotal: '380.0000',
  orderDiscount: '0.0000',
  total: '437.0000',
  taxComponents: [{ name: 'VAT', rate: '0.1500', amount: '57.0000' }],
  taxAdded: '57.0000',
  tenders: [{ method: 'cash', amount: '500.0000', detail: null }],
  changeGiven: '63.0000',
  amountDue: '0.0000',
  balanceOwedThisInvoice: '0.0000',
  note: null,
};

describe('receipt thermal template', () => {
  it('renders rows from the payload verbatim with 2dp display and cedi', () => {
    const doc = receiptThermal(receipt);
    const total = doc.rows.find((r) => r.label === 'TOTAL')!;
    expect(total.value).toBe('GH¢ 437.00');
    expect(total.strong).toBe(true);
    const line = doc.rows.find((r) => r.label.startsWith('Cement Bag'))!;
    expect(line.label).toBe('Cement Bag x4 BAG');
    expect(line.value).toBe('380.00');
    const vat = doc.rows.find((r) => r.label.startsWith('VAT'))!;
    expect(vat.value).toBe('57.00');
    const change = doc.rows.find((r) => r.label === 'CHANGE')!;
    expect(change.value).toBe('63.00');
    // this-invoice scope only: no whole-customer balance on the receipt
    expect(doc.rows.find((r) => r.label.includes('THIS INVOICE'))).toBeUndefined();
    expect(doc.barcode).toEqual({ data: 'RCT-000042', symbology: 'code128' });
    expect(doc.qrPayload).toBe('idepot:receipt:RCT-000042');
    expect(doc.cut).toBe(true);
  });
});

describe('quotation A4 (legacy parity gap closed)', () => {
  const quotation: QuotationDto = {
    id: '3f2b8c2a-1111-4bbb-8ccc-000000000001',
    code: 'QTN-000017',
    warehouseId: 'w1',
    customerId: 'c1',
    customerName: 'Ama Mensah',
    status: 'issued',
    subtotal: '1234567.8900',
    total: '1234567.8900',
    validUntil: '2026-12-31',
    convertedOrderId: null,
    note: 'Delivery within 14 days',
    issuedAt: '2026-11-12T08:00:00Z',
    acceptedAt: null,
    statusReason: null,
    lines: [
      {
        id: 'l1',
        productId: '3f2b8c2a-2222-4bbb-8ccc-000000000002',
        unitId: null,
        quantity: '10.000000',
        quantityBase: '10.000000',
        unitPrice: '123456.7890',
        lineNet: '1234567.8900',
      },
    ],
    createdBy: null,
    createdAt: '2026-11-12T08:00:00Z',
  };

  it('renders the enrichment name, 2dp+separators everywhere, and the quotation disclaimer', () => {
    const html = quotationHtml({
      businessName: 'Lightworld Demo Depot',
      quotation,
      productNames: { '3f2b8c2a-2222-4bbb-8ccc-000000000002': 'Roofing Sheet' },
    });
    expect(html).toContain('QUOTATION');
    expect(html).toContain('QTN-000017');
    expect(html).toContain('Roofing Sheet');
    expect(html).toContain('123,456.79'); // unit price 2dp display
    expect(html).toContain('1,234,567.89'); // line + subtotal + total
    expect(html).toContain('GH¢ 1,234,567.89');
    expect(html).toContain('not a tax invoice');
    expect(html).toContain('Valid Until:</strong> 31/12/2026');
    // XSS safety: raw angle brackets from user data are escaped
    const hostile = quotationHtml({
      businessName: '<b>&</b>',
      quotation,
    });
    expect(hostile).not.toContain('<b>&</b>');
  });
});

describe('credit note thermal template', () => {
  it('renders the decomposition (AR / refund / store credit) exactly', () => {
    const cn: CreditNoteDto = {
      id: 'cn1', code: 'CRN-000009', returnOrderId: 'r1', returnOrderCode: 'RTN-000005',
      invoiceId: 'i1', invoiceCode: 'INV-000123', customerId: 'c1', customerName: 'Ama Mensah',
      businessDate: '2026-11-12', total: '57.5000', netRevenueReversal: '50.0000',
      taxReversalTotal: '7.5000', arAmount: '57.5000', refundAmount: '0.0000',
      storeCreditAmount: '0.0000', cogsReversal: '30.0000', journalEntryId: null,
      refundedAmount: '0.0000', outstandingRefundAmount: '0.0000', note: null,
      createdAt: '2026-11-12T10:00:00Z', taxComponents: [],
    };
    const doc = creditNoteThermal(cn);
    expect(doc.rows.find((r) => r.label === 'Credit TOTAL')!.value).toBe('GH¢ 57.50');
    expect(doc.rows.find((r) => r.label === 'settles AR')!.value).toBe('57.50');
    expect(doc.title).toBe('CREDIT NOTE');
    expect(doc.qrPayload).toBe('idepot:credit_note:CRN-000009');
  });
});

describe('customer statement A4', () => {
  it('renders ledger rows and the point-in-time store-credit columns', () => {
    const stmt: CustomerStatementDto = {
      customerId: 'c1', customerName: 'Ama Mensah', asOf: '2026-11-12',
      openingBalance: '0.0000', closingBalance: '65.0000', receivable: '65.0000',
      storeCredit: '57.5000', storeCreditIssued: '57.5000',
      lines: [
        { businessDate: '2026-11-12', documentType: 'invoice', documentCode: 'INV-000123', description: 'Invoice INV-000123', debit: '115.0000', credit: '0.0000', balance: '115.0000' },
        { businessDate: '2026-11-12', documentType: 'payment', documentCode: 'RCP-000007', description: 'Receipt RCP-000007', debit: '0.0000', credit: '50.0000', balance: '65.0000' },
      ],
    };
    const html = statementHtml({ businessName: 'Lightworld Demo Depot', statement: stmt });
    expect(html).toContain('CUSTOMER STATEMENT');
    expect(html).toContain('12/11/2026');
    expect(html).toContain('115.00');
    expect(html).toContain('65.00');
    expect(html).toContain('Store credit usable (as of date)');
    expect(html).toContain('57.50');
    expect(html).toContain('GH¢ 65.00');
  });
});

describe('waybill + invoice A4', () => {
  const waybill: FulfillmentDto = {
    id: 'f1', code: 'WBN-000031', salesOrderId: 'so1', salesOrderCode: 'SO-000018',
    warehouseId: 'w1', status: 'dispatched', dispatchedBy: 'u1', dispatchedAt: '2026-11-12T11:00:00Z',
    deliveredBy: null, deliveredAt: null, note: null,
    lines: [{ id: 'l1', orderLineId: 'ol1', productId: 'p1', quantityBase: '10.000000' }],
    createdBy: null, createdAt: '2026-11-12T10:45:00Z',
  };

  it('waybill renders code, destination, enriched lines and signature blocks', () => {
    const html = waybillHtml({
      businessName: 'Lightworld Demo Depot',
      waybill,
      destination: 'Ama Mensah, Kumasi',
      lines: [{ productName: 'Cement Bag', quantity: '10.000000' }],
    });
    expect(html).toContain('WAYBILL');
    expect(html).toContain('WBN-000031');
    expect(html).toContain('SO-000018');
    expect(html).toContain('Ama Mensah, Kumasi');
    expect(html).toContain('Cement Bag');
    expect(html).toContain('Received by: ______________');
  });

  it('invoice A4 renders the tax evidence and balance scope', () => {
    const html = invoiceA4Html({ ...receipt, kind: 'invoice_a4', code: 'INV-000123', balanceOwedThisInvoice: '65.0000' });
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('INV-000123');
    expect(html).toContain('VAT');
    expect(html).toContain('57.00');
    expect(html).toContain('Balance due (this invoice)');
    expect(html).toContain('65.00');
  });
});
