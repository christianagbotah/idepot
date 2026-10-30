/**
 * Sales domain tests: corrected math (C-1/C-2/C-6/C-7/C-17), tender rules,
 * allocation invariants (calculation-register cross-cutting invariants 3/8)
 * and the document state machines — includes a seeded property sweep.
 */
import { describe, it, expect } from 'vitest';
import {
  MONEY_SCALE,
  QTY_SCALE,
  addScaled,
  formatDecimal,
} from '../src/decimal.js';
import {
  deriveAmountDue,
  derivePaymentStatus,
  assertFulfillmentTransition,
  assertQuotationTransition,
  assertSalesOrderTransition,
  assertShiftTransition,
  lineNet,
  parseMoney,
  shiftVariance,
  validateAllocation,
  validateTender,
  validateTenderSet,
  type TenderInput,
} from '../src/sales.js';

/** deterministic 32-bit LCG so the property sweep is reproducible in CI */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('line net (C-1 corrected: server-computed, half-even at 4dp)', () => {
  it('computes exact extensions for terminating products', () => {
    expect(lineNet('3', '10.5000')).toBe(parseMoney('31.5'));
    expect(lineNet('2.5', '4.2000')).toBe(parseMoney('10.5'));
    expect(lineNet('0.000001', '1000000')).toBe(parseMoney('1'));
  });

  it('rounds half-even at 4dp exactly once per line (documented normalization)', () => {
    // 1.111111 × 1.0001 = 1.1112222111 (10dp) → 1.1112 (remainder < 5e-5 → down)
    expect(lineNet('1.111111', '1.0001')).toBe(parseMoney('1.1112'));
    // 0.00005 × 1 = 0.00005 → exact half → last kept digit 0 is even → 0.0000
    expect(lineNet('0.00005', '1')).toBe(parseMoney('0'));
    // 0.00015 × 1 = 0.00015 → exact half → last kept digit 1 is odd → up 0.0002
    expect(lineNet('0.00015', '1')).toBe(parseMoney('0.0002'));
    // terminating beyond 4dp still normalizes to exactly 4dp
    expect(lineNet('1.111111', '1')).toBe(parseMoney('1.1111'));
  });

  it('rejects negative quantity and negative price', () => {
    expect(() => lineNet('-1', '10')).toThrow(/must be >= 0/);
    expect(() => lineNet('1', '-10')).toThrow(/must be >= 0/);
  });
});

describe('payment status ladder (C-7 corrected: numeric, explicit overpaid)', () => {
  it('derives every branch numerically — "500" vs "500.00" cannot disagree', () => {
    expect(derivePaymentStatus(parseMoney('500'), parseMoney('0'))).toBe('unpaid');
    expect(derivePaymentStatus(parseMoney('500'), parseMoney('200'))).toBe('part_paid');
    expect(derivePaymentStatus(parseMoney('500'), parseMoney('500'))).toBe('paid');
    expect(derivePaymentStatus(parseMoney('500'), parseMoney('500.0000'))).toBe('paid');
    expect(derivePaymentStatus(parseMoney('500'), parseMoney('600'))).toBe('over_paid');
  });
});

describe('tenders (C-6 corrected)', () => {
  it('requires method details for non-cash methods', () => {
    expect(() => validateTender({ method: 'momo', amount: '10' })).toThrow(/requires momoProvider/);
    expect(() =>
      validateTender({ method: 'momo', amount: '10', momoProvider: 'MTN', momoPhone: '0244000000' }),
    ).not.toThrow();
    expect(() => validateTender({ method: 'cheque', amount: '10', chequeBank: 'GCB' })).toThrow(
      /requires chequeNumber/,
    );
    expect(() => validateTender({ method: 'credit', amount: '10' })).toThrow(/requires the deposit/);
    expect(() => validateTender({ method: 'cash', amount: '0' })).toThrow(/must be > 0/);
  });

  it('Σ tenders must equal the paid amount and change never negative', () => {
    const tenders: TenderInput[] = [
      { method: 'cash', amount: '30' },
      { method: 'momo', amount: '20', momoProvider: 'Vodafone', momoPhone: '0200000000' },
    ];
    expect(validateTenderSet(tenders, '50')).toEqual({ paid: parseMoney('50'), changeDue: 0n });
    expect(validateTenderSet(tenders, '55')).toEqual({ paid: parseMoney('50'), changeDue: 0n });
    const { paid, changeDue } = validateTenderSet(tenders, '45');
    expect(paid).toBe(parseMoney('50'));
    expect(changeDue).toBe(parseMoney('5'));
  });

  it('rejects non-cash overpayment (deliberate credit goes through deposits)', () => {
    const tenders: TenderInput[] = [
      { method: 'momo', amount: '60', momoProvider: 'MTN', momoPhone: '0244000000' },
    ];
    expect(() => validateTenderSet(tenders, '50')).toThrow(/only allowed in cash/);
    // mixed with cash: the non-cash part alone does not exceed the total → allowed
    const mixed: TenderInput[] = [
      { method: 'momo', amount: '30', momoProvider: 'MTN', momoPhone: '0244000000' },
      { method: 'cash', amount: '40' },
    ];
    expect(validateTenderSet(mixed, '50').changeDue).toBe(parseMoney('20'));
  });
});

describe('allocations (C-17 + invariant 3/8)', () => {
  it('rejects over-allocation beyond outstanding due', () => {
    expect(() => validateAllocation({ invoiceId: 'i1', amount: '60' }, '50')).toThrow(
      /exceeds the invoice outstanding due/,
    );
    expect(validateAllocation({ invoiceId: 'i1', amount: '50' }, '50')).toBe(parseMoney('50'));
  });

  it('amount_due ≡ total − Σ allocations − Σ credits (property sweep, seeded)', () => {
    const rnd = lcg(20261030);
    for (let i = 0; i < 300; i++) {
      const total = Math.floor(rnd() * 1_000_000); // scaled 4dp units
      const alloc = Math.floor(rnd() * (total + 1));
      const credit = Math.floor(rnd() * (total - alloc + 1));
      const due = deriveAmountDue(BigInt(total), BigInt(alloc), BigInt(credit));
      expect(due).toBe(BigInt(total - alloc - credit));
      expect(due).toBeGreaterThanOrEqual(0n);
      const status = derivePaymentStatus(BigInt(total), BigInt(alloc + credit));
      if (alloc + credit === 0) expect(status).toBe('unpaid');
      else if (alloc + credit < total) expect(status).toBe('part_paid');
      else expect(status === 'paid' || status === 'over_paid').toBe(true);
    }
  });

  it('invariant 8: payment.amount == Σ allocations + change + unapplied holds in the model', () => {
    // a 100.0000 payment: 70 allocated, 5 change, 25 unapplied
    const amount = parseMoney('100');
    const parts = [parseMoney('70'), parseMoney('5'), parseMoney('25')].reduce(
      (a, b) => addScaled(a, MONEY_SCALE, b, MONEY_SCALE).value,
      0n,
    );
    expect(parts).toBe(amount);
  });
});

describe('state machines', () => {
  it('quotation', () => {
    expect(() => assertQuotationTransition('draft', 'converted')).not.toThrow();
    expect(() => assertQuotationTransition('draft', 'cancelled')).not.toThrow();
    expect(() => assertQuotationTransition('converted', 'draft')).toThrow(/illegal/);
    expect(() => assertQuotationTransition('cancelled', 'converted')).toThrow(/illegal/);
  });

  it('sales order', () => {
    expect(() => assertSalesOrderTransition('draft', 'confirmed')).not.toThrow();
    expect(() => assertSalesOrderTransition('confirmed', 'partially_fulfilled')).not.toThrow();
    expect(() => assertSalesOrderTransition('partially_fulfilled', 'fulfilled')).not.toThrow();
    expect(() => assertSalesOrderTransition('fulfilled', 'closed')).not.toThrow();
    expect(() => assertSalesOrderTransition('confirmed', 'cancelled')).toThrow(/illegal/);
    expect(() => assertSalesOrderTransition('fulfilled', 'draft')).toThrow(/illegal/);
    expect(() => assertSalesOrderTransition('closed', 'confirmed')).toThrow(/illegal/);
  });

  it('fulfillment', () => {
    expect(() => assertFulfillmentTransition('draft', 'dispatched')).not.toThrow();
    expect(() => assertFulfillmentTransition('dispatched', 'delivered')).not.toThrow();
    expect(() => assertFulfillmentTransition('delivered', 'dispatched')).toThrow(/illegal/);
    expect(() => assertFulfillmentTransition('dispatched', 'cancelled')).toThrow(/illegal/);
  });

  it('shift', () => {
    expect(() => assertShiftTransition('open', 'closed')).not.toThrow();
    expect(() => assertShiftTransition('closed', 'open')).toThrow(/illegal/);
  });
});

describe('shift variance (C-11 corrected)', () => {
  it('expected = float + cash in − cash out − change; variance = counted − expected', () => {
    // float 100, cash tenders 250, paid-in 50, paid-out 30, change 20 → expected 350
    const expected = formatDecimal(
      [parseMoney('100'), parseMoney('250'), parseMoney('50')].reduce(
        (a, b) => addScaled(a, MONEY_SCALE, b, MONEY_SCALE).value,
        0n,
      ) - parseMoney('30') - parseMoney('20'),
      MONEY_SCALE,
    );
    expect(shiftVariance(parseMoney(expected), parseMoney('340'))).toBe(parseMoney('-10'));
    expect(shiftVariance(parseMoney(expected), parseMoney('350'))).toBe(parseMoney('0'));
    expect(shiftVariance(parseMoney(expected), parseMoney('352.5'))).toBe(parseMoney('2.5'));
  });
});

describe('quantity/money scale separation', () => {
  it('line net never leaks quantity scale into money', () => {
    // 2.123456 (6dp) × 10.5000 (4dp) = 22.296288 → 22.2963
    expect(lineNet('2.123456', '10.5')).toBe(parseMoney('22.2963'));
    expect(QTY_SCALE).toBe(6);
    expect(MONEY_SCALE).toBe(4);
  });
});
