/**
 * Purchasing domain (Phase 4) — pure, framework-free math for the
 * PO ↔ GRN ↔ supplier-invoice 3-way match, receiving tolerances and
 * the AP subledger.
 *
 * Corrected model (legacy-audit/purchasing-lifecycle.md §4 and
 * calculation-register C-23..C-26): PO totals are header-derived, the
 * GRN is the stock authority, the supplier invoice is the AP
 * authority, and matching is an explicit evidence-producing step with
 * CONFIGURABLE tolerances — never magic constants, never a silent
 * rewrite of the invoice to force a match.
 *
 * All arithmetic is exact scaled-BigInt (decimal.ts); percentages are
 * numeric(9,6) fractions (e.g. '0.050000' = 5%).
 */
import { MONEY_SCALE, QTY_SCALE, RATE_SCALE, cmpScaled, parseDecimal, subScaled } from './decimal.js';
import { ValidationError } from './errors.js';
import { formatMoney, parseMoney } from './sales.js';

/* ----------------------------- tolerances ------------------------------ */

export interface MatchTolerance {
  /** over-receipt tolerance as a fraction of the ordered quantity */
  overreceiptTolerancePct: bigint; // scaled RATE_SCALE
  /** price variance tolerance as a fraction of the PO unit price */
  priceTolerancePct: bigint; // scaled RATE_SCALE
  /** absolute money tolerance for line-value differences */
  valueTolerance: bigint; // scaled MONEY_SCALE
}

export function parseTolerancePct(input: string): bigint {
  let scaled: bigint;
  try {
    scaled = parseDecimal(input, RATE_SCALE);
  } catch {
    throw new ValidationError(`tolerance "${input}" is not a decimal value`);
  }
  if (scaled < 0n) throw new ValidationError(`tolerance "${input}" must be >= 0`);
  return scaled;
}

/**
 * The maximum receivable base quantity for a PO line given the ordered
 * quantity and the tenant's over-receipt tolerance:
 *   floor at QTY_SCALE of ordered × (1 + pct)
 * Receiving beyond this limit is a conflict, not a silent acceptance.
 */
export function overReceiptLimit(orderedBase: bigint, overreceiptTolerancePct: bigint): bigint {
  if (orderedBase <= 0n) throw new ValidationError('ordered quantity must be > 0');
  // limit = ordered * (10^RATE + pct) / 10^RATE, truncated at QTY_SCALE
  return (orderedBase * (10n ** BigInt(RATE_SCALE) + overreceiptTolerancePct))
    / 10n ** BigInt(RATE_SCALE);
}

/* ------------------------------- matching ------------------------------ */

export type MatchSeverity = 'info' | 'tolerated' | 'approval_required';

export interface QuantityMatchInput {
  /** PO ordered base quantity */
  orderedBase: bigint;
  /** base quantity already received against the PO line BEFORE this GRN */
  previouslyReceivedBase: bigint;
  /** base quantity being received NOW */
  receivingBase: bigint;
  tolerance: MatchTolerance;
}

export interface QuantityMatchResult {
  severity: MatchSeverity;
  /** received − ordered (positive = over-receipt) */
  varianceBase: bigint;
  limitBase: bigint;
}

/** GRN-side quantity evaluation: over-receipt within tolerance is
 *  TOLERATED evidence; beyond it is APPROVAL_REQUIRED (or rejected
 *  outright by the posting service per policy). */
export function evaluateReceivingQuantity(input: QuantityMatchInput): QuantityMatchResult {
  const limit = overReceiptLimit(input.orderedBase, input.tolerance.overreceiptTolerancePct);
  const received = input.previouslyReceivedBase + input.receivingBase;
  const variance = received - input.orderedBase;
  if (variance <= 0n) return { severity: 'info', varianceBase: variance, limitBase: limit };
  if (received <= limit) return { severity: 'tolerated', varianceBase: variance, limitBase: limit };
  return { severity: 'approval_required', varianceBase: variance, limitBase: limit };
}

export interface PriceMatchInput {
  /** PO unit price (money scale) */
  poUnitPrice: bigint;
  /** supplier invoice unit price (money scale) */
  invoiceUnitPrice: bigint;
  /** matched base quantity (for the absolute value check) */
  quantityBase: bigint;
  tolerance: MatchTolerance;
}

export interface PriceMatchResult {
  severity: MatchSeverity;
  /** invoice − PO unit price */
  varianceUnitPrice: bigint;
  /** |variance| × quantity, at money scale (rounded once, half-even) */
  varianceValue: bigint;
}

/**
 * Price evaluation for the invoice side of the 3-way match. Tolerated
 * when BOTH the relative variance is within the price tolerance AND
 * the absolute line variance is within the value tolerance. A price
 * variance is evidence, never a silent invoice rewrite: the invoice
 * keeps its own price and the difference posts to the
 * purchase_price_variance account.
 */
export function evaluatePriceMatch(input: PriceMatchInput): PriceMatchResult {
  if (input.poUnitPrice < 0n || input.invoiceUnitPrice < 0n) {
    throw new ValidationError('unit prices must be >= 0');
  }
  const variance = input.invoiceUnitPrice - input.poUnitPrice;
  if (variance === 0n) return { severity: 'info', varianceUnitPrice: 0n, varianceValue: 0n };
  // varianceValue = round4(|invoice − PO| × qty) — single half-even rounding
  const absVariance = variance < 0n ? -variance : variance;
  const varianceValue = halfEvenMul(input.quantityBase, absVariance);
  const relativeOk =
    absVariance * 10n ** BigInt(RATE_SCALE)
      <= input.poUnitPrice * input.tolerance.priceTolerancePct;
  const valueOk = varianceValue <= input.tolerance.valueTolerance;
  if (relativeOk || valueOk) {
    return { severity: 'tolerated', varianceUnitPrice: variance, varianceValue };
  }
  return { severity: 'approval_required', varianceUnitPrice: variance, varianceValue };
}

/* ----------------------------- AP subledger ---------------------------- */

/**
 * AP aging bucket for an amount due on `dueDate`, evaluated `asOf`:
 *   current (not yet due), 1_30, 31_60, 61_90, 90_plus.
 * Dates are ISO yyyy-mm-dd strings; comparison is lexicographic-safe.
 */
export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus';

export const AGING_BUCKETS: readonly AgingBucket[] = ['current', '1_30', '31_60', '61_90', '90_plus'];

export function agingBucket(dueDate: string, asOf: string): AgingBucket {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const as = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(as)) {
    throw new ValidationError(`aging dates must be ISO dates (due ${dueDate}, asOf ${asOf})`);
  }
  const daysLate = Math.floor((as - due) / 86_400_000);
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return '1_30';
  if (daysLate <= 60) return '31_60';
  if (daysLate <= 90) return '61_90';
  return '90_plus';
}

/**
 * Open AP for one invoice (canonical accounting rule):
 *   open = invoice total + Σ debit notes − Σ credit notes − Σ allocations
 * Inputs are money-scale bigints; the caller supplies the aggregates.
 */
export function openApForInvoice(args: {
  invoiceTotal: bigint;
  debitNotesTotal: bigint;
  creditNotesTotal: bigint;
  allocatedTotal: bigint;
}): bigint {
  const open = args.invoiceTotal + args.debitNotesTotal - args.creditNotesTotal - args.allocatedTotal;
  if (open < 0n) {
    throw new ValidationError(
      `over-applied invoice: allocations + credit notes exceed the open AP (${formatMoney(-open)} over)`,
    );
  }
  return open;
}

/** Payment conservation: amount = Σ allocations + unapplied (advance). */
export function splitPayment(
  amount: bigint,
  allocations: readonly bigint[],
): { allocated: bigint; unapplied: bigint } {
  let allocated = 0n;
  for (const a of allocations) {
    if (a <= 0n) throw new ValidationError('allocation amounts must be > 0');
    allocated += a;
  }
  if (allocated > amount) {
    throw new ValidationError(
      `allocations exceed the payment amount by ${formatMoney(allocated - amount)}`,
    );
  }
  return { allocated, unapplied: amount - allocated };
}

/* ---------------------------- line math -------------------------------- */

/**
 * Purchase line net: round4(quantity_base × unit_price) − discount.
 * The rounded product IS the canonical gross line amount (single
 * half-even rounding, mirroring sales lineNet); the discount reduces it.
 */
export function purchaseLineNet(quantityBase: string, unitPrice: string, discount: string): string {
  const qty = parseDecimal(quantityBase, QTY_SCALE);
  const price = parseMoney(unitPrice);
  const disc = parseMoney(discount === '' ? '0' : discount);
  if (qty <= 0n) throw new ValidationError('quantity must be > 0');
  if (price < 0n) throw new ValidationError('unit price must be >= 0');
  if (disc < 0n) throw new ValidationError('line discount must be >= 0');
  const gross = halfEvenMul(qty, price);
  const net = subScaled(gross, MONEY_SCALE, disc, MONEY_SCALE).value;
  if (net < 0n) throw new ValidationError('line discount exceeds the line gross amount');
  return formatMoney(net);
}

/** half-even reduction of qty(6) × money(4) to money(4) — the single
 *  rounding every purchase line performs. */
function halfEvenMul(qty: bigint, price: bigint): bigint {
  const product = qty * price; // scale 10
  const divisor = 10n ** BigInt(QTY_SCALE); // drop 6 → scale 4
  // half-even division
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const q = abs / divisor;
  const r = abs % divisor;
  const twice = r * 2n;
  let out = q;
  if (twice > divisor || (twice === divisor && q % 2n === 1n)) out = q + 1n;
  return negative ? -out : out;
}

/** GRN line value: round4(quantity_base × unit_cost) — the AVCO layer
 *  amount and the GR/IR accrual amount, identical by construction. */
export function grnLineValue(quantityBase: string, unitCost: string): string {
  const qty = parseDecimal(quantityBase, QTY_SCALE);
  const cost = parseMoney(unitCost);
  if (qty <= 0n) throw new ValidationError('received quantity must be > 0');
  if (cost < 0n) throw new ValidationError('unit cost must be >= 0');
  return formatMoney(halfEvenMul(qty, cost));
}

/** Signed net movement on an account for statement purposes. */
export function signedMovement(debit: string, credit: string): bigint {
  const d = parseMoney(debit === '' ? '0' : debit);
  const c = parseMoney(credit === '' ? '0' : credit);
  return subScaled(d, MONEY_SCALE, c, MONEY_SCALE).value;
}

/** Compare two money strings (convenience for tests + read models). */
export function moneyCompare(a: string, b: string): number {
  return cmpScaled(parseMoney(a), MONEY_SCALE, parseMoney(b), MONEY_SCALE);
}
