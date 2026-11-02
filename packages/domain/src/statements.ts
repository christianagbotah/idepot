/**
 * Financial-statement classification (Phase 4) — pure helpers that map
 * chart-of-accounts attributes onto statement sections.
 *
 * The statements themselves (trial balance, P&L, balance sheet, cash
 * flow) are SQL aggregations over the append-only journal; this module
 * owns the CLASSIFICATION rules so the same rule set is shared by the
 * statements service, the tests and the UI:
 *
 *  - account_class (migration 0009) is the statement authority:
 *      asset | liability | equity | revenue | cost_of_sales |
 *      operating_expense | other_income | other_expense
 *  - the P&L derives from revenue/cost_of_sales/operating_expense/
 *    other_income/other_expense classes ONLY (accrual, posted journals
 *    — calculation-register C-29: never cash-basis, never
 *    "COGS = supplier payments");
 *  - the balance sheet derives from asset/liability/equity classes and
 *    ties to the trial balance BY CONSTRUCTION (C-27/C-28: id-keyed
 *    accounts, ledger-derived balances, real equity accounts — the
 *    equity plug is a documented opening-balance artifact only).
 */

/** The eight canonical account classes (migration 0009 CHECK). */
export const ACCOUNT_CLASSES = [
  'asset',
  'liability',
  'equity',
  'revenue',
  'cost_of_sales',
  'operating_expense',
  'other_income',
  'other_expense',
] as const;

export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

/** Legacy Phase 3 account_type (broad) — kept for compatibility reads. */
export type BroadAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/** The broad type a class maps onto. */
export function broadTypeForClass(cls: AccountClass): BroadAccountType {
  switch (cls) {
    case 'asset':
      return 'asset';
    case 'liability':
      return 'liability';
    case 'equity':
      return 'equity';
    case 'revenue':
    case 'other_income':
      return 'revenue';
    default:
      return 'expense';
  }
}

/** The class implied by a Phase 3 broad type (used by backfills). */
export function classForBroadType(t: BroadAccountType): AccountClass {
  switch (t) {
    case 'asset':
      return 'asset';
    case 'liability':
      return 'liability';
    case 'equity':
      return 'equity';
    case 'revenue':
      return 'revenue';
    default:
      return 'operating_expense';
  }
}

/** Normal balance for a class (asset/expense-like → debit). */
export function normalBalanceForClass(cls: AccountClass): 'debit' | 'credit' {
  switch (cls) {
    case 'asset':
    case 'cost_of_sales':
    case 'operating_expense':
    case 'other_expense':
      return 'debit';
    default:
      return 'credit';
  }
}

/** P&L sections in presentation order (calculation-register C-29). */
export const PL_SECTIONS = [
  'revenue',
  'cost_of_sales',
  'operating_expense',
  'other_income',
  'other_expense',
] as const;

export type PlSection = (typeof PL_SECTIONS)[number];

/** The P&L section an account class contributes to. */
export function plSectionForClass(cls: AccountClass): PlSection | null {
  switch (cls) {
    case 'revenue':
      return 'revenue';
    case 'cost_of_sales':
      return 'cost_of_sales';
    case 'operating_expense':
      return 'operating_expense';
    case 'other_income':
      return 'other_income';
    case 'other_expense':
      return 'other_expense';
    default:
      return null; // balance-sheet classes do not appear on the P&L
  }
}

/** Whether a class is a P&L (temporary) account — closed to retained
 *  earnings at period end in the canonical close. */
export function isProfitAndLossClass(cls: AccountClass): boolean {
  return plSectionForClass(cls) !== null;
}

/**
 * Signed balance for a section total. Debit-normal sections (expenses,
 * COGS) present their natural sign as positive cost; credit-normal
 * sections present credits as positive income. The caller supplies
 * (Σdebits − Σcredits) per account; the sign convention is applied here
 * so every statement total is computed exactly once, the same way.
 */
export function sectionSignedTotal(
  cls: AccountClass,
  debitMinusCredit: bigint,
): bigint {
  return normalBalanceForClass(cls) === 'debit' ? debitMinusCredit : -debitMinusCredit;
}

/**
 * Cash-flow classification for the INDIRECT method (documented Phase 4
 * canonical method — docs/accounting/cash-flow-method.md):
 *
 *   net profit (P&L)
 * + Δ non-cash working capital (Δ AR, Δ inventory, Δ AP, Δ deposits,
 *   Δ GR/IR, Δ advances — movements NOT through cash/bank accounts)
 * + explicit fees/FX adjustments posted through cash accounts
 * = net cash movement, which must equal Σ(cash & bank account
 *   movements) — an invariant asserted by the statements tests
 *   (calculation-register C-30: transfers are net-zero and excluded;
 *   deposits are classified, never dropped).
 *
 * This helper classifies an ACCOUNT for cash-flow presentation:
 */
export type CashFlowLine =
  | 'net_profit'
  | 'operating_asset_change'
  | 'operating_liability_change'
  | 'not_applicable';

export function cashFlowLineForClass(cls: AccountClass): CashFlowLine {
  switch (cls) {
    case 'asset':
      return 'operating_asset_change';
    case 'liability':
      return 'operating_liability_change';
    default:
      // equity movements other than the current-period result are
      // financing; P&L classes roll up into net profit. The statements
      // service handles equity explicitly (capital injections /
      // distributions), so classes map to 'not_applicable' here and the
      // few equity accounts are classified by the service.
      return 'not_applicable';
  }
}
