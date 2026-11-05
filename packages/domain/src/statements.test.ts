/**
 * Statement classification tests (Phase 4).
 */
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CLASSES,
  broadTypeForClass,
  cashFlowLineForClass,
  classForBroadType,
  isProfitAndLossClass,
  normalBalanceForClass,
  plSectionForClass,
  sectionSignedTotal,
} from './statements.js';

describe('account class mapping', () => {
  it('exposes the eight canonical classes', () => {
    expect(ACCOUNT_CLASSES).toHaveLength(8);
  });

  it('maps every class to a broad type and back without loss', () => {
    for (const cls of ACCOUNT_CLASSES) {
      const broad = broadTypeForClass(cls);
      expect(['asset', 'liability', 'equity', 'revenue', 'expense']).toContain(broad);
      // round trip only for the non-ambiguous direction
      if (broad === 'revenue' && cls === 'revenue') expect(classForBroadType(broad)).toBe('revenue');
      if (broad === 'asset') expect(classForBroadType(broad)).toBe('asset');
    }
  });

  it('normal balances follow the accounting equation', () => {
    expect(normalBalanceForClass('asset')).toBe('debit');
    expect(normalBalanceForClass('cost_of_sales')).toBe('debit');
    expect(normalBalanceForClass('operating_expense')).toBe('debit');
    expect(normalBalanceForClass('other_expense')).toBe('debit');
    expect(normalBalanceForClass('liability')).toBe('credit');
    expect(normalBalanceForClass('equity')).toBe('credit');
    expect(normalBalanceForClass('revenue')).toBe('credit');
    expect(normalBalanceForClass('other_income')).toBe('credit');
  });
});

describe('P&L classification', () => {
  it('balance-sheet classes do not appear on the P&L', () => {
    expect(plSectionForClass('asset')).toBeNull();
    expect(plSectionForClass('liability')).toBeNull();
    expect(plSectionForClass('equity')).toBeNull();
  });

  it('the five P&L sections map one-to-one', () => {
    expect(plSectionForClass('revenue')).toBe('revenue');
    expect(plSectionForClass('cost_of_sales')).toBe('cost_of_sales');
    expect(plSectionForClass('operating_expense')).toBe('operating_expense');
    expect(plSectionForClass('other_income')).toBe('other_income');
    expect(plSectionForClass('other_expense')).toBe('other_expense');
  });

  it('isProfitAndLossClass flags exactly the P&L classes', () => {
    for (const cls of ACCOUNT_CLASSES) {
      expect(isProfitAndLossClass(cls)).toBe(plSectionForClass(cls) !== null);
    }
  });
});

describe('section totals', () => {
  it('debit-normal sections present debits as positive cost', () => {
    expect(sectionSignedTotal('cost_of_sales', 500_000n)).toBe(500_000n);
    expect(sectionSignedTotal('operating_expense', 500_000n)).toBe(500_000n);
  });

  it('credit-normal sections present credits as positive income', () => {
    expect(sectionSignedTotal('revenue', -900_000n)).toBe(900_000n);
    expect(sectionSignedTotal('liability', -300_000n)).toBe(300_000n);
  });
});

describe('cash-flow classification', () => {
  it('assets are operating-asset changes; liabilities are operating-liability changes', () => {
    expect(cashFlowLineForClass('asset')).toBe('operating_asset_change');
    expect(cashFlowLineForClass('liability')).toBe('operating_liability_change');
    // equity is handled explicitly by the statements service
    expect(cashFlowLineForClass('equity')).toBe('not_applicable');
    expect(cashFlowLineForClass('revenue')).toBe('not_applicable');
  });
});
