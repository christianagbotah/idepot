/**
 * Minimum synchronous GL primitives — domain half (review finding #2).
 *
 * A journal entry is built here BEFORE any row is inserted: the builder
 * works in exact scaled decimals and REFUSES to produce an unbalanced or
 * malformed entry (Σ debits == Σ credits, one-sided strictly-positive
 * lines). The database guard in migration 0007 (constraint trigger over
 * the denormalized journal_entry totals) is the second wall; this builder
 * is the first.
 *
 * Phase 4 grows this into the full posting engine (chart-of-accounts
 * administration, statements, closing). Phase 3 needs exactly: balanced
 * append-only journals committed in the SAME UnitOfWork transaction as
 * their source document.
 */
import { MONEY_SCALE, addScaled } from './decimal.js';
import { ValidationError } from './errors.js';
import { formatMoney, parseMoney } from './sales.js';

export type GlPurpose =
  | 'sales_revenue'
  | 'inventory'
  | 'cogs'
  | 'accounts_receivable'
  | 'cash'
  | 'bank_clearing'
  | 'momo_clearing'
  | 'cheque_clearing'
  | 'customer_deposit_liability'
  | 'tax_payable';

/** The tender→control-account purposes (payment-transaction-map). */
export const TENDER_GL_PURPOSE: Record<string, GlPurpose> = {
  cash: 'cash',
  momo: 'momo_clearing',
  cheque: 'cheque_clearing',
  bank_transfer: 'bank_clearing',
};

export interface JournalLineSpec {
  accountId: string;
  /** decimal(18,4) string; exactly one side must be positive */
  debit?: string;
  credit?: string;
  memo?: string | null;
}

export interface BuiltJournalLine {
  accountId: string;
  debit: string;
  credit: string;
  memo: string | null;
}

export interface BuiltJournal {
  lines: BuiltJournalLine[];
  totalDebit: string;
  totalCredit: string;
}

/**
 * Balanced-entry builder. `build()` throws ValidationError unless the
 * accumulated set satisfies Σ debits == Σ credits EXACTLY (scaled-integer
 * comparison — never float) and every line is strictly one-sided positive.
 */
export class JournalBuilder {
  private readonly lines: BuiltJournalLine[] = [];
  private debitTotal = 0n;
  private creditTotal = 0n;

  add(spec: JournalLineSpec): this {
    const debit = spec.debit != null ? parseMoney(spec.debit) : 0n;
    const credit = spec.credit != null ? parseMoney(spec.credit) : 0n;
    if (debit < 0n || credit < 0n) {
      throw new ValidationError('journal line amounts must be >= 0');
    }
    if ((debit > 0n) === (credit > 0n)) {
      throw new ValidationError(
        `journal line for account ${spec.accountId} must be exactly one-sided and positive (debit ${spec.debit ?? '0'}, credit ${spec.credit ?? '0'})`,
      );
    }
    this.debitTotal = addScaled(this.debitTotal, MONEY_SCALE, debit, MONEY_SCALE).value;
    this.creditTotal = addScaled(this.creditTotal, MONEY_SCALE, credit, MONEY_SCALE).value;
    this.lines.push({
      accountId: spec.accountId,
      debit: formatMoney(debit),
      credit: formatMoney(credit),
      memo: spec.memo ?? null,
    });
    return this;
  }

  /** Adds a line only when the amount is strictly positive (zero legs are
   *  skipped — a no-tax or zero-COGS sale must not carry dead lines). */
  addIfPositive(spec: JournalLineSpec): this {
    const debit = spec.debit != null ? parseMoney(spec.debit) : 0n;
    const credit = spec.credit != null ? parseMoney(spec.credit) : 0n;
    if (debit > 0n || credit > 0n) return this.add(spec);
    return this;
  }

  /** Number of accumulated lines (callers skip empty entries entirely). */
  get lineCount(): number {
    return this.lines.length;
  }

  build(): BuiltJournal {
    if (this.lines.length === 0) {
      throw new ValidationError('journal entry must have at least one line');
    }
    if (this.debitTotal !== this.creditTotal) {
      throw new ValidationError(
        `unbalanced journal entry: Σ debits ${formatMoney(this.debitTotal)} != Σ credits ${formatMoney(this.creditTotal)}`,
      );
    }
    return {
      lines: this.lines,
      totalDebit: formatMoney(this.debitTotal),
      totalCredit: formatMoney(this.creditTotal),
    };
  }
}
