/**
 * Tax engine unit tests (Phase 3 hardening, review finding #1):
 * exact decimal calculation, exclusive, inclusive, exempt, multiple
 * components, deterministic ordering, structural identities.
 */
import { describe, expect, it } from 'vitest';
import { allocateOrderDiscount, computeTaxEvidence, parseTaxRate, type TaxComponentRule } from './tax.js';
import { ValidationError } from './errors.js';
import { formatMoney } from './sales.js';

const rule = (name: string, rate: string, opts: Partial<TaxComponentRule> = {}): TaxComponentRule => ({
  componentId: `cmp-${name}`,
  name,
  rate,
  inclusive: false,
  seq: 0,
  ...opts,
});

describe('parseTaxRate', () => {
  it('accepts fractional rates', () => {
    expect(parseTaxRate('0.075000')).toBe(75000n);
  });
  it('rejects rates >= 1 (percentages are configuration errors)', () => {
    expect(() => parseTaxRate('7.5')).toThrow(ValidationError);
  });
  it('rejects negative rates', () => {
    expect(() => parseTaxRate('-0.1')).toThrow(ValidationError);
  });
});

describe('computeTaxEvidence — exclusive', () => {
  it('exact decimal: 100.0060 × 5% = 5.0003', () => {
    const r = computeTaxEvidence([rule('TAX-A', '0.050000')], '100.0060');
    expect(formatMoney(r.components[0]!.taxAmount)).toBe('5.0003');
    expect(formatMoney(r.taxTotal)).toBe('5.0003');
    expect(formatMoney(r.taxAdded)).toBe('5.0003');
    expect(formatMoney(r.taxInclusiveTotal)).toBe('0.0000');
  });

  it('half-even ties round to the even cent: 10.0050 × 5% = 0.5002 (not 0.5003)', () => {
    // 10.0050 × 0.05 = 0.500250 → 4dp half-even → 0.5002
    const r = computeTaxEvidence([rule('TAX-A', '0.050000')], '10.0050');
    expect(formatMoney(r.components[0]!.taxAmount)).toBe('0.5002');
  });

  it('multiple components sum exactly', () => {
    const r = computeTaxEvidence(
      [rule('TAX-A', '0.050000', { seq: 1 }), rule('TAX-B', '0.025000', { seq: 2 })],
      '200.0000',
    );
    expect(r.components.map((c) => c.name)).toEqual(['TAX-A', 'TAX-B']);
    expect(formatMoney(r.components[0]!.taxAmount)).toBe('10.0000');
    expect(formatMoney(r.components[1]!.taxAmount)).toBe('5.0000');
    expect(formatMoney(r.taxTotal)).toBe('15.0000');
    expect(formatMoney(r.taxAdded)).toBe('15.0000');
  });

  it('deterministic order is (seq, name), not input order', () => {
    const a = computeTaxEvidence([rule('Z', '0.050000', { seq: 2 }), rule('A', '0.010000', { seq: 1 })], '100.0000');
    const b = computeTaxEvidence([rule('A', '0.010000', { seq: 1 }), rule('Z', '0.050000', { seq: 2 })], '100.0000');
    expect(a.components.map((c) => c.name)).toEqual(['A', 'Z']);
    expect(a.components.map((c) => `${c.name}:${c.taxAmount}`)).toEqual(b.components.map((c) => `${c.name}:${c.taxAmount}`));
    expect(a.taxTotal).toBe(b.taxTotal);
  });

  it('zero basis yields zero amounts (e.g. a fully exempt sale)', () => {
    const r = computeTaxEvidence([rule('TAX-A', '0.050000')], '0.0000');
    expect(formatMoney(r.taxTotal)).toBe('0.0000');
    expect(formatMoney(r.taxAdded)).toBe('0.0000');
  });
});

describe('computeTaxEvidence — inclusive', () => {
  it('extracts embedded tax: 115.0000 gross at 15% → tax 15.0000, net 100.0000', () => {
    const r = computeTaxEvidence([rule('TAX-I', '0.150000', { inclusive: true })], '115.0000');
    expect(formatMoney(r.components[0]!.taxAmount)).toBe('15.0000');
    expect(formatMoney(r.taxTotal)).toBe('15.0000');
    expect(formatMoney(r.taxInclusiveTotal)).toBe('15.0000');
    expect(formatMoney(r.taxAdded)).toBe('0.0000'); // already inside the price
  });

  it('multiple inclusive components split exactly with the residual on the last', () => {
    const r = computeTaxEvidence(
      [
        rule('INC-1', '0.100000', { inclusive: true, seq: 1 }),
        rule('INC-2', '0.050000', { inclusive: true, seq: 2 }),
      ],
      '115.0000',
    );
    // net = round4(115 / 1.15) = 100.0000
    const t1 = r.components.find((c) => c.name === 'INC-1')!;
    const t2 = r.components.find((c) => c.name === 'INC-2')!;
    expect(formatMoney(t1.taxAmount)).toBe('10.0000');
    // residual: 115 − 100 − 10 = 5.0000 exactly
    expect(formatMoney(t2.taxAmount)).toBe('5.0000');
    expect(formatMoney(r.taxInclusiveTotal)).toBe('15.0000');
    // Σ inclusive == gross − net, always exact
    expect(formatMoney(r.taxTotal)).toBe('15.0000');
  });

  it('non-terminating division rounds deterministically and the residual keeps Σ exact', () => {
    // gross 100.0000 at 15%: net = round4(100/1.15) = 86.9565, tax = 13.0435
    const r = computeTaxEvidence([rule('TAX-I', '0.150000', { inclusive: true })], '100.0000');
    expect(formatMoney(r.components[0]!.taxAmount)).toBe('13.0435');
    expect(formatMoney(r.taxInclusiveTotal)).toBe('13.0435');
    expect(formatMoney(r.taxAdded)).toBe('0.0000');
  });

  it('mixed: inclusive extracted from gross, exclusive levied on the NET (a levy never taxes an embedded tax)', () => {
    const r = computeTaxEvidence(
      [
        rule('EXC', '0.050000', { seq: 1 }),
        rule('INC', '0.100000', { inclusive: true, seq: 2 }),
      ],
      '220.0000',
    );
    // inclusive: net = round4(220/1.10) = 200, tax = 20 (residual-exact)
    expect(formatMoney(r.components.find((c) => c.name === 'INC')!.taxAmount)).toBe('20.0000');
    // exclusive: 5% of the NET 200 = 10 (not 11 — never tax the embedded tax)
    expect(formatMoney(r.components.find((c) => c.name === 'EXC')!.taxAmount)).toBe('10.0000');
    expect(formatMoney(r.components.find((c) => c.name === 'EXC')!.taxableBasis)).toBe('200.0000');
    expect(formatMoney(r.taxTotal)).toBe('30.0000');
    expect(formatMoney(r.taxInclusiveTotal)).toBe('20.0000');
    expect(formatMoney(r.taxAdded)).toBe('10.0000');
  });
});

describe('allocateOrderDiscount', () => {
  it('allocates pro-rata with the residual on the last line (Σ == discount exactly)', () => {
    const shares = allocateOrderDiscount([3333n, 3333n, 3334n], 1000n); // 3.333,3.333,3.334 × d=0.1000
    const sum = shares.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(1000n);
    expect(shares.map((s) => formatMoney(s))).toEqual(['0.0333', '0.0333', '0.0334']);
  });

  it('zero discount allocates zeros', () => {
    expect(allocateOrderDiscount([100n, 200n], 0n)).toEqual([0n, 0n]);
  });

  it('rejects discount > subtotal', () => {
    expect(() => allocateOrderDiscount([100n], 200n)).toThrow(ValidationError);
  });
});
