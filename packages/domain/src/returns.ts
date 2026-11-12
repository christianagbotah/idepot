/**
 * Returns, credit notes, refunds, store credit & exchanges — domain half
 * (Phase 5).
 *
 * Pure math + state machines + command fingerprints. NO database access.
 *
 * Financial rules implemented here (posting-rules.md §Phase 5):
 *  - a return NEVER edits the original invoice: every effect is a NEW
 *    append-only correction document (return order → credit note →
 *    refund / store credit);
 *  - the customer entitlement is decomposed against the invoice's own
 *    settlement state at processing time: AR is settled FIRST, the
 *    remainder becomes an explicit refund payable or store-credit
 *    liability (never both for the same money);
 *  - tax reversal uses the invoice's TRANSACTION-TIME tax evidence
 *    (invoice_tax_component rows), prorated by credited net and capped at
 *    the originally posted amount (cumulative proration guarantees the
 *    cap even across many partial returns);
 *  - COGS/stock reversal restores the ORIGINAL cost evidence
 *    (cost-at-sale), never the current AVCO price of the day;
 *  - all arithmetic is exact scaled-BigInt with a single rounding mode
 *    (half-even), exactly like the rest of the money paths.
 */
import { fingerprint } from './canonical.js';
import { halfEvenDiv } from './decimal.js';
import { parseMoney, formatMoney } from './sales.js';
import { ValidationError } from './errors.js';

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export const RETURN_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'received',
  'processed',
  'completed',
  'rejected',
  'cancelled',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/** Allowed transitions of the return-order state machine. */
const RETURN_TRANSITIONS: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['received', 'rejected', 'cancelled'],
  received: ['processed'],
  processed: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!RETURN_TRANSITIONS[from].includes(to)) {
    throw new ValidationError(`return order cannot move from '${from}' to '${to}'`);
  }
}

/** Statuses whose lines RESERVE returnable quantity (drafts reserve
 *  nothing — a draft is not a claim; cancelled/rejected releases it). */
export const RETURN_RESERVING_STATUSES: readonly ReturnStatus[] = [
  'submitted',
  'approved',
  'received',
  'processed',
  'completed',
];

export function returnStatusReserves(status: ReturnStatus): boolean {
  return (RETURN_RESERVING_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Product condition & stock disposition
// ---------------------------------------------------------------------------

export const RETURN_CONDITIONS = [
  'new_unopened',
  'like_new',
  'good',
  'fair',
  'damaged',
  'defective',
  'unsellable',
  'quarantine_pending',
] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_DISPOSITIONS = [
  'restock_sellable',
  'restock_damaged',
  'quarantine',
  'scrap',
  'reject',
  'no_restock',
] as const;
export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

/** Dispositions that physically restock goods (stock receipt movement +
 *  COGS reversal). scrap/reject/no_restock leave the cost in COGS — the
 *  goods are not (or no longer) owned sellable inventory. */
export function dispositionRestocks(d: ReturnDisposition): boolean {
  return d === 'restock_sellable' || d === 'restock_damaged' || d === 'quarantine';
}

export const CREDIT_DISPOSITIONS = ['refund', 'store_credit'] as const;
export type CreditDisposition = (typeof CREDIT_DISPOSITIONS)[number];

// ---------------------------------------------------------------------------
// Reason policy (configurable, effective per tenant)
// ---------------------------------------------------------------------------

export interface ReturnReasonPolicy {
  code: string;
  requiresApproval: boolean;
  refundPermitted: boolean;
  replacementPermitted: boolean;
  storeCreditPermitted: boolean;
  restockPermitted: boolean;
  inspectionRequired: boolean;
  evidenceRequired: boolean;
  /** days after the sale within which a return is still accepted */
  refundDeadlineDays: number | null;
}

// ---------------------------------------------------------------------------
// Exact proration — the single rounding path for every return amount
// ---------------------------------------------------------------------------

/**
 * Cumulative proration of `total` over a quantity axis. Returns the slice
 * attributable to the increment [before, after]:
 *
 *   slice = round4(total × after / axis) − round4(total × before / axis)
 *
 * Because both terms round against the SAME denominator, the sum of all
 * slices over the full axis is EXACTLY total (the last slice absorbs the
 * rounding residue deterministically) — cumulative credits can therefore
 * never exceed the original amount, which is the tax/quantity/COGS cap
 * required by the Phase 5 invariants.
 *
 * All inputs are exact scaled BigInts (money 4 dp, quantities 6 dp).
 */
export function prorateCumulative(
  totalScaled: bigint,
  axisTotalScaled: bigint,
  beforeScaled: bigint,
  afterScaled: bigint,
): bigint {
  if (axisTotalScaled <= 0n) {
    if (beforeScaled === 0n && afterScaled === 0n) return 0n;
    throw new ValidationError('proration axis must be positive when a slice is non-zero');
  }
  if (afterScaled < beforeScaled || beforeScaled < 0n) {
    throw new ValidationError('proration window must be 0 <= before <= after');
  }
  const after = halfEvenDiv(totalScaled * afterScaled, axisTotalScaled);
  const before = halfEvenDiv(totalScaled * beforeScaled, axisTotalScaled);
  return after - before;
}

/** round4(money scaled × numerator / denominator) — single rounding. */
export function prorateMoney(
  amountScaled: bigint,
  numeratorScaled: bigint,
  denominatorScaled: bigint,
): bigint {
  if (denominatorScaled <= 0n) {
    throw new ValidationError('proration denominator must be positive');
  }
  return halfEvenDiv(amountScaled * numeratorScaled, denominatorScaled);
}

// ---------------------------------------------------------------------------
// Credit decomposition — the heart of return financial correctness
// ---------------------------------------------------------------------------

export interface InvoiceSettlementState {
  /** invoice.total (money string) */
  total: string;
  /** Σ payment allocations + Σ credit applications (money string) */
  settled: string;
}

export interface CreditDecompositionInput {
  /** gross customer credit for this return (net + reversible tax),
   *  money string, already prorated incl. order-discount share */
  grossCredit: string;
  /** invoice settlement state at processing time */
  invoice: InvoiceSettlementState;
  /** chosen disposition for the non-AR residual */
  disposition: CreditDisposition;
  /** entitlement already consumed by EARLIER credit notes of the same
   *  invoice (Σ ar_amount of prior credit notes), money string */
  priorArSettled: string;
}

export interface CreditDecomposition {
  /** credit applied against the outstanding receivable */
  arAmount: string;
  /** residual entitlement explicitly owed to the customer as money */
  refundAmount: string;
  /** residual entitlement issued as store-credit liability */
  storeCreditAmount: string;
}

/**
 * Settlement decomposition (master prompt §5):
 *  - unpaid credit sale → the credit reduces the receivable;
 *  - fully paid sale → refund payable / store credit;
 *  - partially paid sale → AR settled FIRST, the remainder is an explicit
 *    refund payable or store credit.
 *
 * arAmount = min(grossCredit, max(outstanding − priorArSettled, 0))
 * residual = grossCredit − arAmount → exactly one of refund/store credit.
 */
export function decomposeCredit(input: CreditDecompositionInput): CreditDecomposition {
  const gross = parseMoney(input.grossCredit);
  if (gross < 0n) throw new ValidationError('gross credit must be >= 0');
  const total = parseMoney(input.invoice.total);
  const settled = parseMoney(input.invoice.settled);
  const priorAr = parseMoney(input.priorArSettled);
  const outstanding = total - settled - priorAr;
  const arAmount = outstanding > 0n ? (gross < outstanding ? gross : outstanding) : 0n;
  const residual = gross - arAmount;
  if (residual < 0n) throw new ValidationError('credit decomposition produced a negative residual');
  if (input.disposition === 'refund') {
    return {
      arAmount: formatMoney(arAmount),
      refundAmount: formatMoney(residual),
      storeCreditAmount: formatMoney(0n),
    };
  }
  return {
    arAmount: formatMoney(arAmount),
    refundAmount: formatMoney(0n),
    storeCreditAmount: formatMoney(residual),
  };
}

// ---------------------------------------------------------------------------
// Command identities — idempotency fingerprints (same contract as the
// supplier advance application: same key + same normalized payload ⇒
// replay; same key + different payload ⇒ 409 idempotency_key_reuse)
// ---------------------------------------------------------------------------

export const RETURN_COMMAND = 'create_return_order';
export const REFUND_COMMAND = 'post_refund';
export const STORE_CREDIT_REDEMPTION_COMMAND = 'redeem_store_credit';
export const EXCHANGE_COMMAND = 'create_exchange';

/** Normalize a money string for fingerprinting: "40" == "40.0000". */
function normMoney(v: string): string {
  return formatMoney(parseMoney(v));
}

export interface ReturnLineCommand {
  invoiceLineId: string;
  quantity: string;
  condition: ReturnCondition;
  disposition: ReturnDisposition;
  reasonCode?: string | null;
}

export function returnRequestFingerprint(
  tenantId: string,
  command: {
    invoiceId: string;
    reasonCode: string;
    customerNote?: string | null;
    lines: ReadonlyArray<ReturnLineCommand>;
    adjustmentAmount: string;
  },
): string {
  return fingerprint({
    tenant: tenantId,
    command: RETURN_COMMAND,
    invoiceId: command.invoiceId,
    reasonCode: command.reasonCode,
    customerNote: command.customerNote ?? null,
    adjustmentAmount: normMoney(command.adjustmentAmount),
    lines: [...command.lines]
      .map((l) => ({
        invoiceLineId: l.invoiceLineId,
        quantity: l.quantity,
        condition: l.condition,
        disposition: l.disposition,
        reasonCode: l.reasonCode ?? null,
      }))
      .sort((a, b) => (a.invoiceLineId < b.invoiceLineId ? -1 : a.invoiceLineId > b.invoiceLineId ? 1 : 0)),
  });
}

export function refundRequestFingerprint(
  tenantId: string,
  command: {
    creditNoteId: string;
    amount: string;
    method: string;
    bankAccountId?: string | null;
    businessDate: string;
  },
): string {
  return fingerprint({
    tenant: tenantId,
    command: REFUND_COMMAND,
    creditNoteId: command.creditNoteId,
    amount: normMoney(command.amount),
    method: command.method,
    bankAccountId: command.bankAccountId ?? null,
    businessDate: command.businessDate,
  });
}

export function storeCreditRedemptionFingerprint(
  tenantId: string,
  command: { storeCreditId: string; invoiceId: string; amount: string; businessDate: string },
): string {
  return fingerprint({
    tenant: tenantId,
    command: STORE_CREDIT_REDEMPTION_COMMAND,
    storeCreditId: command.storeCreditId,
    invoiceId: command.invoiceId,
    amount: normMoney(command.amount),
    businessDate: command.businessDate,
  });
}

export function exchangeRequestFingerprint(
  tenantId: string,
  command: {
    invoiceId: string;
    reasonCode: string;
    returnLines: ReadonlyArray<ReturnLineCommand>;
    replacement: { warehouseId: string; lines: ReadonlyArray<{ productId: string; quantity: string; unitPrice?: string | null }> };
    businessDate: string;
  },
): string {
  return fingerprint({
    tenant: tenantId,
    command: EXCHANGE_COMMAND,
    invoiceId: command.invoiceId,
    reasonCode: command.reasonCode,
    businessDate: command.businessDate,
    returnLines: [...command.returnLines]
      .map((l) => ({ invoiceLineId: l.invoiceLineId, quantity: l.quantity, condition: l.condition, disposition: l.disposition }))
      .sort((a, b) => (a.invoiceLineId < b.invoiceLineId ? -1 : 1)),
    replacement: {
      warehouseId: command.replacement.warehouseId,
      lines: [...command.replacement.lines]
        .map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice ?? null }))
        .sort((a, b) => (a.productId < b.productId ? -1 : 1)),
    },
  });
}
