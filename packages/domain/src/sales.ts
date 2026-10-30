/**
 * Sales domain (Phase 3): corrected sales-line/order math, tender model,
 * payment allocation invariants, document state machines and the corrected
 * payment-status ladder. Every rule cites its legacy defect from the
 * calculation register / sales-pos-lifecycle audit.
 *
 * Corrected rules implemented here (calculation-register):
 *  - C-1  line.net is computed SERVER-side (client amounts are advisory);
 *  - C-2  invoice_total = Σ line.net − order_discount, computed once on the
 *         header — never stored per-row (legacy R14/R9);
 *  - C-6  Σ tenders == amount_paid; change never negative;
 *  - C-7  numeric status ladder with explicit overpaid branch (legacy R4
 *         compared POST strings with ===);
 *  - C-17 explicit allocation rows (no implicit FIFO at read time);
 *         amount_due ≡ total − Σ allocations − Σ credits;
 *  - C-20 customer credit (deposit) is consumed as an explicit credit
 *         application — sale totals never include credit;
 *  - invariant 8: payment.amount == Σ allocations + change + unapplied.
 */
import { MONEY_SCALE, QTY_SCALE, addScaled, formatDecimal, mulScaledRounded, parseDecimal, subScaled } from './decimal.js';
import { ValidationError } from './errors.js';
import { parseQuantity } from './quantity.js';

/* --------------------------------- money ---------------------------------- */

export type Money = string; // decimal string, ≤ 4 dp

export function parseMoney(input: string): bigint {
  try {
    return parseDecimal(input, MONEY_SCALE);
  } catch (err) {
    if (err instanceof Error && err.name === 'DecimalParseError') {
      throw new ValidationError(`money "${input}" is not a decimal(18,4) value`);
    }
    throw err;
  }
}

export function formatMoney(scaled: bigint): Money {
  return formatDecimal(scaled, MONEY_SCALE);
}

/** Non-negative money (prices, totals, deposit amounts). */
export function validateNonNegativeMoney(input: Money): bigint {
  const v = parseMoney(input);
  if (v < 0n) throw new ValidationError(`money "${input}" must be >= 0`);
  return v;
}

/** Strictly positive money (tenders, allocations, payments). */
export function validatePositiveMoney(input: Money): bigint {
  const v = parseMoney(input);
  if (v <= 0n) throw new ValidationError(`money "${input}" must be > 0`);
  return v;
}

/**
 * C-1 (corrected): line extension computed in exact decimal space and
 * normalized ONCE to 4dp half-even (map doc §5 rounding rule). The rounded
 * result IS the canonical line amount — header totals are exact sums of
 * these, so `invoice_total = Σ line.net − discount` holds exactly at 4dp.
 */
export function lineNet(quantity: string, unitPrice: Money): bigint {
  const q = parseQuantity(quantity);
  const price = parseMoney(unitPrice);
  if (q < 0n) throw new ValidationError(`sale quantity "${quantity}" must be >= 0`);
  validateNonNegativeMoney(unitPrice);
  return mulScaledRounded(q, QTY_SCALE, price, MONEY_SCALE, MONEY_SCALE);
}

/* ------------------------------ status ladder ----------------------------- */

/**
 * C-7 (corrected): numeric ladder with an explicit overpaid branch, derived
 * from decimal comparison — never from client strings. `paid` is Σ payment
 * allocations + Σ credit applications against the invoice.
 */
export const PAYMENT_STATUSES = ['unpaid', 'part_paid', 'paid', 'over_paid'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function derivePaymentStatus(totalScaled: bigint, paidScaled: bigint): PaymentStatus {
  if (paidScaled <= 0n) return 'unpaid';
  if (paidScaled === totalScaled) return 'paid';
  if (paidScaled < totalScaled) return 'part_paid';
  return 'over_paid';
}

/* --------------------------------- tenders -------------------------------- */

export const TENDER_METHODS = ['cash', 'momo', 'cheque', 'bank_transfer', 'credit'] as const;
export type TenderMethod = (typeof TENDER_METHODS)[number];

/** Ghana MoMo providers (legacy enum momo_type: MTN/Vodafone/AirtelTigo). */
export const MOMO_PROVIDERS = ['MTN', 'Vodafone', 'AirtelTigo'] as const;
export type MomoProvider = (typeof MOMO_PROVIDERS)[number];

export interface TenderInput {
  method: TenderMethod;
  amount: Money;
  /** required for method='credit': the customer deposit being consumed */
  depositId?: string | null;
  momoProvider?: MomoProvider | null;
  momoPhone?: string | null;
  momoTransactionId?: string | null;
  chequeBank?: string | null;
  chequeBranch?: string | null;
  chequeNumber?: string | null;
  reference?: string | null;
}

const METHOD_DETAILS: Record<Exclude<TenderMethod, 'cash' | 'credit'>, readonly string[]> = {
  momo: ['momoProvider', 'momoPhone'],
  cheque: ['chequeBank', 'chequeNumber'],
  bank_transfer: ['reference'],
};

/**
 * Validates one tender: amount > 0 and the method-appropriate details are
 * present (payment-transaction-map §1: detail fields are structured, never
 * keyed on account-name string matching).
 */
export function validateTender(t: TenderInput): bigint {
  const amount = validatePositiveMoney(t.amount);
  if (!TENDER_METHODS.includes(t.method)) {
    throw new ValidationError(`unknown tender method "${t.method}"`);
  }
  if (t.method === 'credit' && !t.depositId) {
    throw new ValidationError('credit tender requires the deposit being consumed');
  }
  if (t.method !== 'credit' && t.method !== 'cash' && t.depositId) {
    throw new ValidationError('only credit tenders reference a deposit');
  }
  if (t.method !== 'cash' && t.method !== 'credit') {
    for (const field of METHOD_DETAILS[t.method]) {
      const v = (t as unknown as Record<string, unknown>)[field];
      if (v == null || v === '') {
        throw new ValidationError(`${t.method} tender requires ${field}`);
      }
    }
  }
  if (t.momoProvider != null && !MOMO_PROVIDERS.includes(t.momoProvider)) {
    throw new ValidationError(`unknown MoMo provider "${t.momoProvider}"`);
  }
  return amount;
}

/**
 * C-6 (corrected): Σ tenders must equal the intended payment amount, and the
 * change must never be negative. Overpay rules:
 *  - cash may exceed the total (change_due returned);
 *  - a non-cash excess is rejected (deliberate credit goes through deposits);
 *  - credit tenders are capped by the deposit's remaining balance (checked
 *    by the caller against the ledger) and never produce change.
 */
export function validateTenderSet(tenders: TenderInput[], total: Money): { paid: bigint; changeDue: bigint } {
  if (tenders.length === 0) {
    return { paid: 0n, changeDue: 0n };
  }
  const totalScaled = parseMoney(total);
  let paid = 0n;
  let nonCash = 0n;
  for (const t of tenders) {
    const amount = validateTender(t);
    paid = addScaled(paid, MONEY_SCALE, amount, MONEY_SCALE).value;
    if (t.method !== 'cash' && t.method !== 'credit') {
      nonCash = addScaled(nonCash, MONEY_SCALE, amount, MONEY_SCALE).value;
    }
  }
  const changeDue = paid > totalScaled ? subScaled(paid, MONEY_SCALE, totalScaled, MONEY_SCALE).value : 0n;
  // change is given in cash; it may cover the overpay only when the non-cash
  // tenders by themselves do not exceed the total
  if (changeDue > 0n && nonCash > totalScaled) {
    throw new ValidationError(
      'overpayment is only allowed in cash (change due); non-cash tenders must not exceed the total — use a customer deposit for deliberate credit',
    );
  }
  return { paid, changeDue };
}

/* ------------------------------- allocations ------------------------------ */

export interface AllocationInput {
  invoiceId: string;
  amount: Money;
}

/**
 * C-17 (corrected): explicit allocation rows. An allocation must be positive
 * and must not over-allocate the invoice beyond a documented credit — in
 * Phase 3 allocations are capped at the invoice's outstanding due; deliberate
 * credit is modelled as a customer deposit instead.
 */
export function validateAllocation(a: AllocationInput, outstandingDue: Money): bigint {
  const amount = validatePositiveMoney(a.amount);
  const due = parseMoney(outstandingDue);
  if (amount > due) {
    throw new ValidationError(
      `allocation ${formatDecimal(amount, MONEY_SCALE)} exceeds the invoice outstanding due ${outstandingDue} — deliberate credit must be recorded as a customer deposit`,
    );
  }
  return amount;
}

/** Corrected C-16/C-17 derivation: due = total − Σ allocations − Σ credits. */
export function deriveAmountDue(total: bigint, allocated: bigint, credited: bigint): bigint {
  return subScaled(subScaled(total, MONEY_SCALE, allocated, MONEY_SCALE).value, MONEY_SCALE, credited, MONEY_SCALE).value;
}

/* ----------------------------- state machines ----------------------------- */

export const QUOTATION_STATUSES = ['draft', 'converted', 'cancelled'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const SALES_ORDER_STATUSES = [
  'draft', 'confirmed', 'partially_fulfilled', 'fulfilled', 'closed', 'cancelled',
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const FULFILLMENT_STATUSES = ['draft', 'dispatched', 'delivered', 'cancelled'] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const SHIFT_STATUSES = ['open', 'closed'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export function assertQuotationTransition(from: QuotationStatus, to: QuotationStatus): void {
  const allowed: Record<QuotationStatus, QuotationStatus[]> = {
    draft: ['converted', 'cancelled'],
    converted: [],
    cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal quotation transition ${from} → ${to}`);
  }
}

/**
 * Sales-order machine (sales-pos-lifecycle §5 target model, returns excluded
 * until Phase 5): draft → confirmed → partially_fulfilled → fulfilled →
 * closed. Cancel is only possible before fulfillment; a confirmed order is
 * financially live (invoiced at confirmation) and can no longer be cancelled —
 * corrections go through returns/credit notes (Phase 5).
 */
export function assertSalesOrderTransition(from: SalesOrderStatus, to: SalesOrderStatus): void {
  const allowed: Record<SalesOrderStatus, SalesOrderStatus[]> = {
    draft: ['confirmed', 'cancelled'],
    confirmed: ['partially_fulfilled', 'fulfilled', 'closed'],
    partially_fulfilled: ['partially_fulfilled', 'fulfilled', 'closed'],
    fulfilled: ['closed'],
    closed: [],
    cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal sales order transition ${from} → ${to}`);
  }
}

export function assertFulfillmentTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
  const allowed: Record<FulfillmentStatus, FulfillmentStatus[]> = {
    draft: ['dispatched', 'cancelled'],
    dispatched: ['delivered'],
    delivered: [],
    cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal fulfillment transition ${from} → ${to}`);
  }
}

export function assertShiftTransition(from: ShiftStatus, to: ShiftStatus): void {
  const allowed: Record<ShiftStatus, ShiftStatus[]> = {
    open: ['closed'],
    closed: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal shift transition ${from} → ${to}`);
  }
}

/* ------------------------------ document types ---------------------------- */

/** Doc types with server-side numbering (document-numbering §5 corrected). */
export const DOC_TYPES = ['QUOTATION', 'SALE_ORDER', 'INVOICE', 'RECEIPT', 'WAYBILL', 'DEPOSIT'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Oversell policy (offline-sync §5b; configurable per tenant, default reject). */
export const OVERSELL_POLICIES = ['reject', 'allow_backorder'] as const;
export type OversellPolicy = (typeof OVERSELL_POLICIES)[number];

/**
 * Shift cash variance (C-11 corrected): expected = opening float + cash
 * tenders + cash paid-in − cash paid-out − change given; variance = counted −
 * expected (sign: positive = over, negative = short).
 */
export function shiftVariance(expected: bigint, counted: bigint): bigint {
  return subScaled(counted, MONEY_SCALE, expected, MONEY_SCALE).value;
}
