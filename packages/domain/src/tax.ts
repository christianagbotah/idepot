/**
 * Tax engine domain (Phase 3 hardening, review finding #1).
 *
 * The engine is deliberately STATUTE-FREE: no statutory rate, name or
 * threshold is embedded. A tax profile version is configuration — named
 * components, each with a rate and an inclusive/exclusive treatment — and
 * every computation is exact-decimal with a single documented rounding rule
 * (half-even at the money scale), so the same inputs always produce the
 * same evidence.
 *
 * Treatment model (the basis is the sum of non-exempt charged line nets
 * after the order-discount allocation):
 *  - INCLUSIVE components are embedded in the charged prices. Given the
 *    gross basis G and the inclusive rate sum R:
 *      net   = round4(G / (1 + R))
 *      tax_i = round4(net × rate_i)   for every inclusive component except
 *                                  the LAST in deterministic order,
 *      tax_last = G − net − Σ tax_i   (exact residual: the extracted total
 *                                  is EXACTLY G − net, never off by a
 *                                  rounding step)
 *    Inclusive amounts do NOT change the payable total (they are already
 *    inside it); they split it into net revenue + tax.
 *  - EXCLUSIVE components are added on top of the NET amount (after the
 *    inclusive extraction, when both treatments are configured — a levy
 *    never taxes an embedded tax):
 *      amount_i = round4(net × rate_i)
 *    and increase the payable total by their sum.
 *
 * Exempt lines simply do not contribute to the taxable basis; the evidence
 * records the applicability per line.
 */
import { MONEY_SCALE, RATE_SCALE, addScaled, halfEvenDiv, parseDecimal, subScaled } from './decimal.js';
import { ValidationError } from './errors.js';
import { formatMoney, parseMoney } from './sales.js';

/** A configured tax component as resolved at transaction time. */
export interface TaxComponentRule {
  componentId: string | null;
  name: string;
  /** decimal rate, e.g. '0.075000' (7.5%) — configuration, never code */
  rate: string;
  /** true = embedded in the charged price; false = added on top */
  inclusive: boolean;
  /** deterministic evaluation order (seq, then name) */
  seq: number;
}

export interface TaxComponentEvidence {
  componentId: string | null;
  name: string;
  rate: string;
  inclusive: boolean;
  taxableBasis: bigint; // scaled MONEY_SCALE
  taxAmount: bigint; // scaled MONEY_SCALE
}

export interface TaxComputationResult {
  components: TaxComponentEvidence[];
  /** Σ all component amounts (display + payable-evidence total) */
  taxTotal: bigint;
  /** Σ inclusive component amounts (already inside the charged prices) */
  taxInclusiveTotal: bigint;
  /** the share that increases the payable total: taxTotal − taxInclusiveTotal */
  taxAdded: bigint;
}

/** Parses and validates a component rate (>= 0, < 1, ≤ 6dp — numeric(9,6)). */
export function parseTaxRate(rate: string): bigint {
  let scaled: bigint;
  try {
    scaled = parseDecimal(rate, RATE_SCALE);
  } catch {
    throw new ValidationError(`tax rate "${rate}" is not a decimal value`);
  }
  if (scaled < 0n) throw new ValidationError(`tax rate "${rate}" must be >= 0`);
  if (scaled >= 10n ** BigInt(RATE_SCALE)) {
    throw new ValidationError(`tax rate "${rate}" must be < 1 (rates are fractions, not percentages)`);
  }
  return scaled;
}

/**
 * Computes the immutable tax evidence for one document from the resolved
 * component rules and the taxable basis (Σ non-exempt charged line nets
 * after the order-discount allocation — GROSS when any component is
 * inclusive). Deterministic: components are evaluated in (seq, name)
 * order, the inclusive residual is assigned to the last inclusive
 * component, and exclusive components are computed on the NET amount (the
 * basis after the inclusive extraction), so identical inputs can never
 * diverge.
 */
export function computeTaxEvidence(
  rules: readonly TaxComponentRule[],
  taxableBasis: Money_,
): TaxComputationResult {
  const basis = parseMoney(taxableBasis);
  const ordered = [...rules].sort((a, b) => (a.seq - b.seq) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const components: TaxComponentEvidence[] = [];
  let taxTotal = 0n;
  let taxInclusiveTotal = 0n;

  // inclusive extraction first (defines the net the exclusive levies apply to)
  const inclusive = ordered.filter((r) => r.inclusive);
  let net = basis;
  if (inclusive.length > 0) {
    const gross = basis; // the charged prices ARE gross for inclusive tax
    let rateSum = 0n;
    for (const r of inclusive) rateSum = addScaled(rateSum, RATE_SCALE, parseTaxRate(r.rate), RATE_SCALE).value;
    const denominator = 10n ** BigInt(RATE_SCALE) + rateSum; // (1 + R) at rate scale
    // net = round4(gross / (1 + R))
    net = halfEvenDiv(gross * 10n ** BigInt(RATE_SCALE), denominator);
    let allocated = 0n;
    for (let i = 0; i < inclusive.length; i++) {
      const r = inclusive[i]!;
      const rate = parseTaxRate(r.rate);
      let amount: bigint;
      if (i === inclusive.length - 1) {
        // exact residual: Σ inclusive amounts == gross − net, always
        amount = subScaled(subScaled(gross, MONEY_SCALE, net, MONEY_SCALE).value, MONEY_SCALE, allocated, MONEY_SCALE).value;
      } else {
        amount = halfEvenDiv(net * rate, 10n ** BigInt(RATE_SCALE));
        allocated = addScaled(allocated, MONEY_SCALE, amount, MONEY_SCALE).value;
      }
      components.push({
        componentId: r.componentId,
        name: r.name,
        rate: r.rate,
        inclusive: true,
        taxableBasis: gross,
        taxAmount: amount,
      });
      taxTotal = addScaled(taxTotal, MONEY_SCALE, amount, MONEY_SCALE).value;
      taxInclusiveTotal = addScaled(taxInclusiveTotal, MONEY_SCALE, amount, MONEY_SCALE).value;
    }
  }

  // exclusive pass — on the NET amount (post-extraction): a levy never
  // taxes an embedded tax
  for (const r of ordered) {
    if (r.inclusive) continue;
    const rate = parseTaxRate(r.rate);
    // amount = round4(net × rate) — half-even, the only rounding mode
    const amount = halfEvenDiv(net * rate, 10n ** BigInt(RATE_SCALE));
    components.push({
      componentId: r.componentId,
      name: r.name,
      rate: r.rate,
      inclusive: false,
      taxableBasis: net,
      taxAmount: amount,
    });
    taxTotal = addScaled(taxTotal, MONEY_SCALE, amount, MONEY_SCALE).value;
  }

  const taxAdded = subScaled(taxTotal, MONEY_SCALE, taxInclusiveTotal, MONEY_SCALE).value;
  return { components, taxTotal, taxInclusiveTotal, taxAdded };
}

/** money alias kept local so this module reads like the sales module */
type Money_ = string;

/**
 * Deterministic pro-rata allocation of the order discount to invoice lines
 * (largest-remainder-free: sequential rounding with the residual on the
 * LAST line, matching the inclusive residual convention). Returns the
 * per-line share in input order; Σ shares == discount exactly.
 */
export function allocateOrderDiscount(
  lineNets: readonly bigint[],
  discount: bigint,
): bigint[] {
  if (lineNets.length === 0) {
    if (discount !== 0n) throw new ValidationError('cannot allocate a discount to an empty invoice');
    return [];
  }
  let subtotal = 0n;
  for (const n of lineNets) subtotal = addScaled(subtotal, MONEY_SCALE, n, MONEY_SCALE).value;
  if (discount < 0n) throw new ValidationError('order discount must be >= 0');
  if (discount > subtotal) throw new ValidationError('order discount exceeds the invoice subtotal');
  const shares: bigint[] = [];
  let allocated = 0n;
  for (let i = 0; i < lineNets.length; i++) {
    let share: bigint;
    if (i === lineNets.length - 1) {
      share = subScaled(discount, MONEY_SCALE, allocated, MONEY_SCALE).value;
    } else if (subtotal === 0n) {
      share = 0n;
    } else {
      share = halfEvenDiv(lineNets[i]! * discount, subtotal);
    }
    shares.push(share);
    allocated = addScaled(allocated, MONEY_SCALE, share, MONEY_SCALE).value;
  }
  return shares;
}

/** Formats a scaled money value back to the decimal string contract. */
export function taxMoney(scaled: bigint): string {
  return formatMoney(scaled);
}
