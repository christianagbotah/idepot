/**
 * Returns domain tests: credit-note proration caps, settlement decomposition
 * (AR-first), the return state machine and command fingerprints.
 *
 * The property sweep proves the core financial invariant of Phase 5: for ANY
 * split of a return axis, the sum of cumulative-prorated slices is EXACTLY
 * the original amount — cumulative credits can never exceed it.
 */
import { describe, it, expect } from 'vitest';
import {
  assertReturnTransition,
  decomposeCredit,
  exchangeRequestFingerprint,
  prorateCumulative,
  prorateMoney,
  refundRequestFingerprint,
  RETURN_STATUSES,
  returnRequestFingerprint,
  returnStatusReserves,
  storeCreditRedemptionFingerprint,
  type ReturnLineCommand,
} from '../src/returns.js';
import { QTY_SCALE } from '../src/decimal.js';

/** deterministic 32-bit LCG so the property sweep is reproducible in CI */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toMoneyScaled = (units: number) => BigInt(Math.round(units * 10_000));
const toQtyScaled = (units: number) => BigInt(Math.round(units * 1_000_000));

describe('return state machine', () => {
  it('walks the happy path draft → completed', () => {
    for (const [from, to] of [
      ['draft', 'submitted'],
      ['submitted', 'approved'],
      ['approved', 'received'],
      ['received', 'processed'],
      ['processed', 'completed'],
    ] as const) {
      expect(() => assertReturnTransition(from, to)).not.toThrow();
    }
  });

  it('rejects skipping stages and exiting terminal states', () => {
    expect(() => assertReturnTransition('draft', 'approved')).toThrow();
    expect(() => assertReturnTransition('submitted', 'received')).toThrow();
    expect(() => assertReturnTransition('completed', 'draft')).toThrow();
    expect(() => assertReturnTransition('rejected', 'submitted')).toThrow();
    expect(() => assertReturnTransition('cancelled', 'draft')).toThrow();
  });

  it('terminal states have no outgoing transitions at all', () => {
    for (const t of ['completed', 'rejected', 'cancelled'] as const) {
      for (const to of RETURN_STATUSES) {
        expect(() => assertReturnTransition(t, to)).toThrow();
      }
    }
  });

  it('drafts reserve nothing; submitted onward reserves until terminal', () => {
    expect(returnStatusReserves('draft')).toBe(false);
    for (const s of ['submitted', 'approved', 'received', 'processed', 'completed'] as const) {
      expect(returnStatusReserves(s)).toBe(true);
    }
    expect(returnStatusReserves('rejected')).toBe(false);
    expect(returnStatusReserves('cancelled')).toBe(false);
  });
});

describe('prorateCumulative — exact cumulative proration (the credit cap)', () => {
  it('sum of slices over the full axis is EXACTLY the total (seeded sweep)', () => {
    const rnd = lcg(20261109);
    for (let trial = 0; trial < 500; trial++) {
      const total = toMoneyScaled(Math.floor(rnd() * 1_000_000) / 100); // cents-scale money
      const axis = toQtyScaled(Math.max(1, Math.floor(rnd() * 500) / 10));
      // random cut points over the axis
      const cuts = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () =>
        BigInt(Math.floor(rnd() * Number(axis))),
      ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      let before = 0n;
      let acc = 0n;
      for (const after of cuts) {
        acc += prorateCumulative(total, axis, before, after);
        before = after;
      }
      acc += prorateCumulative(total, axis, before, axis);
      expect(acc).toBe(total);
    }
  });

  it('never exceeds the total mid-way and never goes negative', () => {
    const total = 1_000_0001n; // 1000.0001 — indivisible by 3 at 4dp
    const axis = 3n * 10n ** BigInt(QTY_SCALE); // three units
    let before = 0n;
    let acc = 0n;
    for (const after of [10n ** BigInt(QTY_SCALE), 2n * 10n ** BigInt(QTY_SCALE), 3n * 10n ** BigInt(QTY_SCALE)]) {
      const slice = prorateCumulative(total, axis, before, after);
      expect(slice >= 0n).toBe(true);
      acc += slice;
      expect(acc <= total).toBe(true);
      before = after;
    }
    expect(acc).toBe(total);
  });

  it('a zero axis with a zero window yields zero (empty return)', () => {
    expect(prorateCumulative(123n, 0n, 0n, 0n)).toBe(0n);
  });

  it('rejects a non-zero slice on a non-positive axis', () => {
    expect(() => prorateCumulative(1n, 0n, 0n, 5n)).toThrow(/axis must be positive/);
    expect(() => prorateCumulative(1n, -3n, 0n, 5n)).toThrow(/axis must be positive/);
  });

  it('rejects inverted or negative windows', () => {
    expect(() => prorateCumulative(10n, 100n, 6n, 5n)).toThrow(/0 <= before <= after/);
    expect(() => prorateCumulative(10n, 100n, -1n, 5n)).toThrow(/0 <= before <= after/);
  });

  it('full-window single slice returns the total unchanged', () => {
    expect(prorateCumulative(7_777_701n, 13n * 10n ** BigInt(QTY_SCALE), 0n, 13n * 10n ** BigInt(QTY_SCALE))).toBe(7_777_701n);
  });
});

describe('prorateMoney — single-rounding proportional money', () => {
  it('scales exactly when the division terminates', () => {
    expect(prorateMoney(40_0000n, 10n, 40n)).toBe(10_0000n);
  });

  it('rounds half-even at the money scale', () => {
    // 1.5 → 2 (odd quotient rounds up), 2.5 → 2 (even stays), 0.5 → 0 (even stays)
    expect(prorateMoney(3n, 5n, 10n)).toBe(2n);
    expect(prorateMoney(5n, 5n, 10n)).toBe(2n);
    expect(prorateMoney(1n, 5n, 10n)).toBe(0n);
  });

  it('rejects a non-positive denominator', () => {
    expect(() => prorateMoney(1n, 1n, 0n)).toThrow(/denominator must be positive/);
    expect(() => prorateMoney(1n, 1n, -2n)).toThrow(/denominator must be positive/);
  });
});

describe('decomposeCredit — AR settled FIRST, residual is one instrument only', () => {
  it('unpaid credit sale: the whole credit reduces the receivable', () => {
    const d = decomposeCredit({
      grossCredit: '100.0000',
      invoice: { total: '100.0000', settled: '0.0000' },
      disposition: 'refund',
      priorArSettled: '0.0000',
    });
    expect(d).toEqual({ arAmount: '100.0000', refundAmount: '0.0000', storeCreditAmount: '0.0000' });
  });

  it('fully paid sale: the whole credit becomes a refund (or store credit)', () => {
    const r = decomposeCredit({
      grossCredit: '100.0000',
      invoice: { total: '100.0000', settled: '100.0000' },
      disposition: 'refund',
      priorArSettled: '0.0000',
    });
    expect(r).toEqual({ arAmount: '0.0000', refundAmount: '100.0000', storeCreditAmount: '0.0000' });
    const s = decomposeCredit({
      grossCredit: '100.0000',
      invoice: { total: '100.0000', settled: '100.0000' },
      disposition: 'store_credit',
      priorArSettled: '0.0000',
    });
    expect(s).toEqual({ arAmount: '0.0000', refundAmount: '0.0000', storeCreditAmount: '100.0000' });
  });

  it('partially paid sale: AR first, the remainder is the explicit residual', () => {
    const d = decomposeCredit({
      grossCredit: '80.0000',
      invoice: { total: '100.0000', settled: '40.0000' },
      disposition: 'refund',
      priorArSettled: '0.0000',
    });
    expect(d).toEqual({ arAmount: '60.0000', refundAmount: '20.0000', storeCreditAmount: '0.0000' });
  });

  it('earlier credit notes consume the AR headroom (priorArSettled)', () => {
    const d = decomposeCredit({
      grossCredit: '50.0000',
      invoice: { total: '100.0000', settled: '20.0000' },
      disposition: 'store_credit',
      priorArSettled: '60.0000',
    });
    // outstanding = 100 - 20 - 60 = 20 → AR takes 20, residual 30 as store credit
    expect(d).toEqual({ arAmount: '20.0000', refundAmount: '0.0000', storeCreditAmount: '30.0000' });
  });

  it('over-settled invoice (deposit excess): everything is residual', () => {
    const d = decomposeCredit({
      grossCredit: '25.0000',
      invoice: { total: '100.0000', settled: '110.0000' },
      disposition: 'refund',
      priorArSettled: '0.0000',
    });
    expect(d).toEqual({ arAmount: '0.0000', refundAmount: '25.0000', storeCreditAmount: '0.0000' });
  });

  it('rejects a negative gross credit', () => {
    expect(() =>
      decomposeCredit({
        grossCredit: '-1.0000',
        invoice: { total: '100.0000', settled: '0.0000' },
        disposition: 'refund',
        priorArSettled: '0.0000',
      }),
    ).toThrow(/gross credit must be >= 0/);
  });
});

describe('return command fingerprints (idempotency trust boundary)', () => {
  const lines: ReturnLineCommand[] = [
    { invoiceLineId: 'line-2', quantity: '2', condition: 'good', disposition: 'restock_sellable' },
    { invoiceLineId: 'line-1', quantity: '1', condition: 'damaged', disposition: 'scrap' },
  ];

  it('line order and money spelling are normalized away on replay', () => {
    const a = returnRequestFingerprint('t1', {
      invoiceId: 'inv-1',
      reasonCode: 'DEFECTIVE',
      customerNote: undefined,
      lines,
      adjustmentAmount: '40',
    });
    const b = returnRequestFingerprint('t1', {
      invoiceId: 'inv-1',
      reasonCode: 'DEFECTIVE',
      customerNote: null,
      lines: [...lines].reverse(),
      adjustmentAmount: '40.0000',
    });
    expect(a).toBe(b);
  });

  it('any material change produces a different fingerprint', () => {
    const base = returnRequestFingerprint('t1', {
      invoiceId: 'inv-1',
      reasonCode: 'DEFECTIVE',
      lines,
      adjustmentAmount: '40',
    });
    expect(
      returnRequestFingerprint('t1', {
        invoiceId: 'inv-2',
        reasonCode: 'DEFECTIVE',
        lines,
        adjustmentAmount: '40',
      }),
    ).not.toBe(base);
    expect(
      returnRequestFingerprint('t1', {
        invoiceId: 'inv-1',
        reasonCode: 'WRONG_ITEM',
        lines,
        adjustmentAmount: '40',
      }),
    ).not.toBe(base);
    expect(
      returnRequestFingerprint('t1', {
        invoiceId: 'inv-1',
        reasonCode: 'DEFECTIVE',
        lines,
        adjustmentAmount: '40.01',
      }),
    ).not.toBe(base);
    expect(
      returnRequestFingerprint('t2', {
        invoiceId: 'inv-1',
        reasonCode: 'DEFECTIVE',
        lines,
        adjustmentAmount: '40',
      }),
    ).not.toBe(base);
  });

  it('refund fingerprint: optional bank account and money spelling normalize; amount/credit note do not', () => {
    const base = refundRequestFingerprint('t1', {
      creditNoteId: 'cn-1',
      amount: '12.5',
      method: 'cash',
      bankAccountId: undefined,
      businessDate: '2026-11-09',
    });
    expect(
      refundRequestFingerprint('t1', {
        creditNoteId: 'cn-1',
        amount: '12.5000',
        method: 'cash',
        bankAccountId: null,
        businessDate: '2026-11-09',
      }),
    ).toBe(base);
    expect(
      refundRequestFingerprint('t1', {
        creditNoteId: 'cn-1',
        amount: '12.5001',
        method: 'cash',
        bankAccountId: null,
        businessDate: '2026-11-09',
      }),
    ).not.toBe(base);
    expect(
      refundRequestFingerprint('t1', {
        creditNoteId: 'cn-2',
        amount: '12.5',
        method: 'cash',
        bankAccountId: null,
        businessDate: '2026-11-09',
      }),
    ).not.toBe(base);
  });

  it('store-credit redemption fingerprint pins instrument, invoice, amount and date', () => {
    const base = storeCreditRedemptionFingerprint('t1', {
      storeCreditId: 'sc-1',
      invoiceId: 'inv-9',
      amount: '7',
      businessDate: '2026-11-09',
    });
    expect(
      storeCreditRedemptionFingerprint('t1', {
        storeCreditId: 'sc-1',
        invoiceId: 'inv-9',
        amount: '7.0000',
        businessDate: '2026-11-09',
      }),
    ).toBe(base);
    expect(
      storeCreditRedemptionFingerprint('t1', {
        storeCreditId: 'sc-1',
        invoiceId: 'inv-10',
        amount: '7',
        businessDate: '2026-11-09',
      }),
    ).not.toBe(base);
    expect(
      storeCreditRedemptionFingerprint('t1', {
        storeCreditId: 'sc-1',
        invoiceId: 'inv-9',
        amount: '7',
        businessDate: '2026-11-10',
      }),
    ).not.toBe(base);
  });

  it('exchange fingerprint is line-order insensitive but replacement-order sensitive to content', () => {
    const cmd = {
      invoiceId: 'inv-1',
      reasonCode: 'SIZE',
      returnLines: lines,
      replacement: {
        warehouseId: 'wh-1',
        lines: [
          { productId: 'p-2', quantity: '2', unitPrice: '10' },
          { productId: 'p-1', quantity: '1', unitPrice: null as string | null },
        ],
      },
      businessDate: '2026-11-09',
    };
    const a = exchangeRequestFingerprint('t1', cmd);
    const b = exchangeRequestFingerprint('t1', {
      ...cmd,
      returnLines: [...cmd.returnLines].reverse(),
      replacement: { ...cmd.replacement, lines: [...cmd.replacement.lines].reverse() },
    });
    expect(a).toBe(b);
    const c = exchangeRequestFingerprint('t1', {
      ...cmd,
      replacement: {
        ...cmd.replacement,
        lines: [cmd.replacement.lines[0]!, { productId: 'p-1', quantity: '1', unitPrice: '11' }],
      },
    });
    expect(c).not.toBe(a);
  });

  it('different command types never collide on the same payload', () => {
    const tenant = 't1';
    const ret = returnRequestFingerprint(tenant, {
      invoiceId: 'x',
      reasonCode: 'R',
      lines: [],
      adjustmentAmount: '0',
    });
    const exc = exchangeRequestFingerprint(tenant, {
      invoiceId: 'x',
      reasonCode: 'R',
      returnLines: [],
      replacement: { warehouseId: 'w', lines: [] },
      businessDate: '2026-11-09',
    });
    expect(ret).not.toBe(exc);
  });
});
