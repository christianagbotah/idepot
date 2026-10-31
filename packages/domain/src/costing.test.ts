/**
 * Cost-basis (AVCO) domain unit tests (ADR-0004, review finding #3):
 * deterministic averages, multiple receipts at different costs, full
 * depletion, exact reversal restore.
 */
import { describe, expect, it } from 'vitest';
import { applyCostToState, avcoIssueCost } from './costing.js';
import { ValidationError } from './errors.js';

const st = (q: string, v: string) => ({ quantityBase: q, totalValue: v });

describe('avcoIssueCost', () => {
  it('single layer: 10 units @ 3.00 → issue 4 costs 12.0000', () => {
    const r = avcoIssueCost('4', st('10.000000', '30.0000'));
    expect(r.costValue).toBe('12.0000');
    expect(r.unitCost).toBe('3.0000');
    expect(r.layered).toBe(true);
  });

  it('multiple receipts at different costs average (AVCO): (6@10 + 4@20)/10 = 14', () => {
    // state: 6 × 10.00 = 60; + 4 × 20.00 = 80 → 10 units, value 140
    const r = avcoIssueCost('5', st('10.000000', '140.0000'));
    expect(r.costValue).toBe('70.0000');
    expect(r.unitCost).toBe('14.0000');
  });

  it('full depletion empties the value exactly (proportional removal, no residue)', () => {
    const r = avcoIssueCost('10', st('10.000000', '140.0000'));
    expect(r.costValue).toBe('140.0000');
  });

  it('non-terminating average rounds half-once and stays deterministic', () => {
    // 3 units value 10.0000 → issue 1: round4(10/3) = 3.3333
    const a = avcoIssueCost('1', st('3.000000', '10.0000'));
    const b = avcoIssueCost('1', st('3.000000', '10.0000'));
    expect(a.costValue).toBe('3.3333');
    expect(a.costValue).toBe(b.costValue);
  });

  it('no layers (zero on-hand / zero value) → no AVCO cost (fallback territory)', () => {
    expect(avcoIssueCost('1', st('0.000000', '0.0000')).layered).toBe(false);
    expect(avcoIssueCost('1', st('5.000000', '0.0000')).layered).toBe(false);
  });

  it('backorder issue applies cost only to the available share', () => {
    // on-hand 2 @ 5.00 (value 10); issue 5 → cost applies to 2 units only
    const r = avcoIssueCost('5', st('2.000000', '10.0000'));
    expect(r.costValue).toBe('10.0000');
  });
});

describe('applyCostToState', () => {
  it('receipt layer adds quantity and rounded value', () => {
    const next = applyCostToState(st('0.000000', '0.0000'), {
      quantityBase: '6.000000',
      unitCost: '10.0000',
    });
    expect(next.quantityBase).toBe('6.000000');
    expect(next.totalValue).toBe('60.0000');
    expect(next.costValueUsed).toBe('60.0000');
  });

  it('explicit-cost receipt adds the exact caller value (transfer carry — no re-rounding)', () => {
    const next = applyCostToState(st('2.000000', '25.0000'), {
      quantityBase: '3.000000',
      explicitCost: { unitCost: '8.3333', costValue: '25.0000' },
    });
    expect(next.quantityBase).toBe('5.000000');
    expect(next.totalValue).toBe('50.0000'); // 25 + 25 exactly — NOT round4(3 × 8.3333)
    expect(next.costValueUsed).toBe('25.0000');
  });

  it('second receipt at a different cost re-averages (the AVCO walk)', () => {
    let s = applyCostToState(st('0.000000', '0.0000'), { quantityBase: '6.000000', unitCost: '10.0000' });
    s = applyCostToState(s, { quantityBase: '4.000000', unitCost: '20.0000' });
    expect(s.quantityBase).toBe('10.000000');
    expect(s.totalValue).toBe('140.0000');
  });

  it('issue removes proportional value; sequential issues stay consistent', () => {
    let s = applyCostToState(st('0.000000', '0.0000'), { quantityBase: '10.000000', unitCost: '14.0000' });
    const i1 = avcoIssueCost('4', s);
    s = applyCostToState(s, { quantityBase: '-4.000000', issueCost: i1 });
    expect(s.quantityBase).toBe('6.000000');
    expect(s.totalValue).toBe('84.0000');
    const i2 = avcoIssueCost('6', s);
    s = applyCostToState(s, { quantityBase: '-6.000000', issueCost: i2 });
    expect(s.quantityBase).toBe('0.000000');
    expect(s.totalValue).toBe('0.0000'); // exact depletion
  });

  it('reversal restores the ORIGINAL cost evidence exactly', () => {
    let s = applyCostToState(st('0.000000', '0.0000'), { quantityBase: '10.000000', unitCost: '3.0000' });
    const before = { ...s };
    const issue = avcoIssueCost('4', s);
    s = applyCostToState(s, { quantityBase: '-4.000000', issueCost: issue });
    // reversal movement carries the copied evidence of the original issue
    s = applyCostToState(s, {
      quantityBase: '4.000000',
      reversalCost: { unitCost: issue.unitCost, costValue: issue.costValue },
    });
    expect(s.quantityBase).toBe(before.quantityBase);
    expect(s.totalValue).toBe(before.totalValue);
  });

  it('rejects an issue whose evidence exceeds the on-hand value', () => {
    expect(() =>
      applyCostToState(st('1.000000', '3.0000'), {
        quantityBase: '-1.000000',
        issueCost: { unitCost: '5.0000', costValue: '5.0000', layered: true },
      }),
    ).toThrow(ValidationError);
  });

  it('zero-cost receipt (free goods) adds quantity without value', () => {
    const s = applyCostToState(st('2.000000', '6.0000'), { quantityBase: '3.000000', unitCost: '0.0000' });
    expect(s.quantityBase).toBe('5.000000');
    expect(s.totalValue).toBe('6.0000');
  });
});
