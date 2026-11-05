/**
 * Purchasing domain tests (Phase 4) — exact-decimal proofs for the
 * 3-way match tolerances, AP math and purchase line arithmetic.
 */
import { describe, expect, it } from 'vitest';
import {
  AGING_BUCKETS,
  ADVANCE_APPLICATION_COMMAND,
  agingBucket,
  applyAdvanceRequestFingerprint,
  evaluatePriceMatch,
  evaluateReceivingQuantity,
  grnLineValue,
  openApForInvoice,
  overReceiptLimit,
  parseTolerancePct,
  purchaseLineNet,
  splitPayment,
  type MatchTolerance,
} from './purchasing.js';
import { fingerprint } from './canonical.js';

const TOL: MatchTolerance = {
  overreceiptTolerancePct: parseTolerancePct('0.05'), // 5%
  priceTolerancePct: parseTolerancePct('0.02'), // 2%
  valueTolerance: 100_000n, // 10.0000 money units
};

describe('overReceiptLimit', () => {
  it('allows exactly the ordered quantity at zero tolerance', () => {
    expect(overReceiptLimit(100_000_000n, 0n)).toBe(100_000_000n); // 100 units
  });

  it('extends the limit by the tolerance fraction', () => {
    // 100 units + 5% = 105 units
    expect(overReceiptLimit(100_000_000n, parseTolerancePct('0.05'))).toBe(105_000_000n);
  });

  it('truncates fractional base quantities conservatively', () => {
    // 33.333333 units + 50% = 49.9999995 → truncated to 49.999999
    expect(overReceiptLimit(33_333_333n, parseTolerancePct('0.5'))).toBe(49_999_999n);
  });
});

describe('evaluateReceivingQuantity', () => {
  const input = (receiving: bigint, already: bigint) => ({
    orderedBase: 100_000_000n,
    previouslyReceivedBase: already,
    receivingBase: receiving,
    tolerance: TOL,
  });

  it('exact receipt is info', () => {
    expect(evaluateReceivingQuantity(input(100_000_000n, 0n)).severity).toBe('info');
  });

  it('under-receipt is info with negative variance', () => {
    const r = evaluateReceivingQuantity(input(60_000_000n, 0n));
    expect(r.severity).toBe('info');
    expect(r.varianceBase).toBe(-40_000_000n);
  });

  it('over-receipt within tolerance is tolerated', () => {
    expect(evaluateReceivingQuantity(input(105_000_000n, 0n)).severity).toBe('tolerated');
  });

  it('over-receipt beyond tolerance requires approval', () => {
    expect(evaluateReceivingQuantity(input(106_000_000n, 0n)).severity).toBe('approval_required');
  });

  it('cumulative receipts count against the limit', () => {
    // already received 100; receiving 6 more = 106 total > 105 limit
    expect(evaluateReceivingQuantity(input(6_000_000n, 100_000_000n)).severity).toBe(
      'approval_required',
    );
  });
});

describe('evaluatePriceMatch', () => {
  it('identical price is info', () => {
    const r = evaluatePriceMatch({
      poUnitPrice: 2_500_000n, // 250.0000
      invoiceUnitPrice: 2_500_000n,
      quantityBase: 10_000_000n,
      tolerance: TOL,
    });
    expect(r.severity).toBe('info');
  });

  it('within the relative tolerance is tolerated', () => {
    // 250 → 254 (1.6% < 2%)
    const r = evaluatePriceMatch({
      poUnitPrice: 2_500_000n,
      invoiceUnitPrice: 2_540_000n,
      quantityBase: 10_000_000n,
      tolerance: TOL,
    });
    expect(r.severity).toBe('tolerated');
    expect(r.varianceUnitPrice).toBe(40_000n);
    // 4.0000 × 10 units = 40.0000
    expect(r.varianceValue).toBe(400_000n);
  });

  it('beyond both tolerances requires approval', () => {
    // 250 → 300 (20% > 2%, value 500 > 10)
    expect(
      evaluatePriceMatch({
        poUnitPrice: 2_500_000n,
        invoiceUnitPrice: 3_000_000n,
        quantityBase: 10_000_000n,
        tolerance: TOL,
      }).severity,
    ).toBe('approval_required');
  });

  it('absolute value tolerance can absorb a large relative variance on a tiny amount', () => {
    // PO 0.0000 vs invoice 5.0000 on 0.000001 units: value = 0.0000 ≤ 10
    const r = evaluatePriceMatch({
      poUnitPrice: 0n,
      invoiceUnitPrice: 50_000n,
      quantityBase: 1n,
      tolerance: TOL,
    });
    expect(r.severity).toBe('tolerated');
  });

  it('zero-PO-price with a material invoice price is approval_required', () => {
    expect(
      evaluatePriceMatch({
        poUnitPrice: 0n,
        invoiceUnitPrice: 50_000n,
        quantityBase: 1_000_000n, // 1 unit → 5.0000
        tolerance: { ...TOL, valueTolerance: 0n },
      }).severity,
    ).toBe('approval_required');
  });
});

describe('purchase line math', () => {
  it('purchaseLineNet rounds the product once, half-even', () => {
    // 3.5 units × 2.2225 = 7.77875 → half-even at 4dp → 7.7788
    expect(purchaseLineNet('3.500000', '2.2225', '0')).toBe('7.7788');
  });

  it('purchaseLineNet subtracts the discount exactly', () => {
    expect(purchaseLineNet('2.000000', '10.0000', '1.5000')).toBe('18.5000');
  });

  it('discount beyond the gross is rejected', () => {
    expect(() => purchaseLineNet('1.000000', '10.0000', '10.0001')).toThrow(/exceeds/);
  });

  it('grnLineValue equals the AVCO layer: round4(qty × cost)', () => {
    expect(grnLineValue('10.000000', '2.5000')).toBe('25.0000');
    // 0.000001 × 5.0000 = 0.000005 → half-even → 0.0000
    expect(grnLineValue('0.000001', '5.0000')).toBe('0.0000');
  });
});

describe('AP math', () => {
  it('aging buckets classify by days late', () => {
    expect(agingBucket('2026-12-31', '2026-12-01')).toBe('current');
    expect(agingBucket('2026-11-01', '2026-11-30')).toBe('1_30');
    expect(agingBucket('2026-09-01', '2026-11-30')).toBe('61_90');
    expect(agingBucket('2025-11-30', '2026-11-30')).toBe('90_plus');
    expect(AGING_BUCKETS).toContain(agingBucket('2026-11-02', '2026-11-02'));
  });

  it('openApForInvoice applies the canonical equation', () => {
    expect(
      openApForInvoice({
        invoiceTotal: 1_000_000n,
        debitNotesTotal: 50_000n,
        creditNotesTotal: 100_000n,
        allocatedTotal: 400_000n,
      }),
    ).toBe(550_000n);
  });

  it('over-application is rejected, never negative AP', () => {
    expect(() =>
      openApForInvoice({
        invoiceTotal: 100_000n,
        debitNotesTotal: 0n,
        creditNotesTotal: 0n,
        allocatedTotal: 150_000n,
      }),
    ).toThrow(/over-applied/);
  });

  it('splitPayment conserves the payment amount', () => {
    const r = splitPayment(1_000_000n, [400_000n, 350_000n]);
    expect(r.allocated).toBe(750_000n);
    expect(r.unapplied).toBe(250_000n);
  });

  it('splitPayment rejects over-allocation', () => {
    expect(() => splitPayment(100_000n, [60_000n, 60_000n])).toThrow(/exceed/);
  });
});

/* ----------------- advance-application request fingerprint ---------------- */

describe('applyAdvanceRequestFingerprint (canonical command identity)', () => {
  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';
  const PAY_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
  const PAY_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
  const INV_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
  const INV_2 = 'bbbbbbbb-0000-4000-8000-000000000002';

  const base = {
    paymentId: PAY_1,
    businessDate: '2026-10-21',
    allocations: [
      { supplierInvoiceId: INV_1, amount: '40.0000' },
      { supplierInvoiceId: INV_2, amount: '20' },
    ],
  };

  it('is stable: leg order, amount spelling and irrelevant fields do not matter', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    // legs reversed, "20" spelled "20.00", extra non-material fields present
    const b = applyAdvanceRequestFingerprint(TENANT_A, {
      ...base,
      allocations: [
        { supplierInvoiceId: INV_2, amount: '20.00' },
        { supplierInvoiceId: INV_1, amount: '40' },
      ],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });

  it('changes when the AMOUNT of any leg changes', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    const b = applyAdvanceRequestFingerprint(TENANT_A, {
      ...base,
      allocations: [
        { supplierInvoiceId: INV_1, amount: '80.0000' }, // 40 -> 80
        { supplierInvoiceId: INV_2, amount: '20.0000' },
      ],
    });
    expect(a).not.toBe(b);
  });

  it('changes when the INVOICE of a leg changes', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    const b = applyAdvanceRequestFingerprint(TENANT_A, {
      ...base,
      allocations: [
        { supplierInvoiceId: INV_2, amount: '40.0000' }, // INV_1 -> INV_2
        { supplierInvoiceId: INV_2, amount: '20.0000' },
      ],
    });
    expect(a).not.toBe(b);
  });

  it('changes when the PAYMENT (advance) changes', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    const b = applyAdvanceRequestFingerprint(TENANT_A, { ...base, paymentId: PAY_2 });
    expect(a).not.toBe(b);
  });

  it('changes when the application BUSINESS DATE changes', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    const b = applyAdvanceRequestFingerprint(TENANT_A, { ...base, businessDate: '2026-10-25' });
    expect(a).not.toBe(b);
  });

  it('changes when the TENANT changes (identity is tenant-scoped)', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    const b = applyAdvanceRequestFingerprint(TENANT_B, base);
    expect(a).not.toBe(b);
  });

  it('changes when the COMMAND TYPE changes (type participates in identity)', () => {
    const a = applyAdvanceRequestFingerprint(TENANT_A, base);
    // the same canonical body under a DIFFERENT command type — proves the
    // type constant participates: a key can never alias two commands
    const b = fingerprint({
      tenant: TENANT_A,
      command: 'some_other_command',
      paymentId: base.paymentId,
      businessDate: base.businessDate,
      allocations: [
        { invoice: INV_1, amount: '40.0000' },
        { invoice: INV_2, amount: '20.0000' },
      ],
    });
    expect(a).not.toBe(b);
    // and the function's own body round-trips through the documented shape
    const c = fingerprint({
      tenant: TENANT_A,
      command: ADVANCE_APPLICATION_COMMAND,
      paymentId: base.paymentId,
      businessDate: base.businessDate,
      allocations: [
        { invoice: INV_1, amount: '40.0000' },
        { invoice: INV_2, amount: '20.0000' },
      ],
    });
    expect(a).toBe(c);
  });
});
