/**
 * Cost-basis domain math (ADR-0004 — AVCO, review finding #3).
 *
 * Weighted-average (AVCO) is the locked default cost basis for the
 * depot/hardware model. All arithmetic is exact scaled-BigInt:
 *
 *  - receipt layer: value_in = round6(qty) × unit_cost rounded ONCE to 4dp
 *    half-even; the layer adds (qty, value_in) to the state.
 *  - issue (sale): the removal is PROPORTIONAL to the on-hand value —
 *        cost_value = round4(|qty| × total_value / on_hand_qty)
 *    so the average cost is carried exactly and the full depletion of a
 *    layer empties its value precisely (no cent is invented or lost; the
 *    sub-cent rounding residue of partial issues stays in inventory).
 *  - issue beyond available layers (backorder): cost applies only to the
 *    available quantity share; the negative remainder carries no cost.
 *  - reversal: the original movement's (unit_cost, cost_value) are copied
 *    verbatim — the stock and value effects restore EXACTLY.
 */
import { MONEY_SCALE, QTY_SCALE, halfEvenDiv, mulScaledRounded, parseDecimal, formatDecimal } from './decimal.js';
import { ValidationError } from './errors.js';
import { parseMoney } from './sales.js';
import { parseQuantity } from './quantity.js';

export type CostMethod = 'avco' | 'purchase_price_fallback' | 'legacy_import';

export interface CostStateSnapshot {
  quantityBase: string; // decimal(18,6)
  totalValue: string; // decimal(18,4)
}

export interface IssueCostResult {
  /** per-unit average cost evidence (4dp, rounded for display/AVCO trace) */
  unitCost: string | null;
  /** authoritative value removed from inventory for this issue (4dp) */
  costValue: string | null;
  /** true when on-hand layers existed for at least part of the issue */
  layered: boolean;
}

/**
 * Computes the AVCO removal for an issue of `qtyBase` (unsigned decimal
 * string) against the current cost state. Pure and deterministic.
 */
export function avcoIssueCost(qtyBase: string, state: CostStateSnapshot): IssueCostResult {
  const qty = parseQuantity(qtyBase);
  if (qty <= 0n) throw new ValidationError('issue quantity must be > 0');
  const onHand = parseQuantity(state.quantityBase);
  const value = parseMoney(state.totalValue);
  if (onHand <= 0n || value <= 0n) {
    // no cost layers: the issue extends beyond tracked value (backorder or
    // un-costed opening stock) — no AVCO cost applies
    return { unitCost: null, costValue: null, layered: false };
  }
  const applied = onHand < qty ? onHand : qty;
  // cost_value = round4(applied × value / on_hand)  (scales: 6+4−6 → 4)
  const costValue = halfEvenDiv(applied * value, onHand);
  // unit cost evidence = round4(cost_value / applied)
  const unitCost = halfEvenDiv(costValue * 10n ** BigInt(QTY_SCALE), applied);
  return { unitCost: formatDecimal(unitCost, MONEY_SCALE), costValue: formatDecimal(costValue, MONEY_SCALE), layered: true };
}

/**
 * Applies a signed movement to a cost state, returning the next state.
 * Receipts (qty > 0, unitCost given) add a layer; issues (qty < 0,
 * evidence supplied) remove value; reversal movements carry their copied
 * evidence and restore exactly. Zero-cost receipts are allowed (free
 * goods) and simply add quantity without value.
 */
export function applyCostToState(
  state: CostStateSnapshot,
  movement: {
    /** signed decimal(18,6) */
    quantityBase: string;
    /** decimal(18,4) per-unit cost for receipt layers */
    unitCost?: string | null;
    /** precomputed issue evidence (from avcoIssueCost) */
    issueCost?: IssueCostResult | null;
    /** reversal: copy of the original movement's cost evidence */
    reversalCost?: { unitCost: string | null; costValue: string | null } | null;
    /** receipt with an exact caller-computed value (e.g. a transfer-in
     *  carrying the dispatched batch's AVCO value — the exact-residual
     *  convention keeps Σ transfer-in values == transfer-out value) */
    explicitCost?: { unitCost: string | null; costValue: string } | null;
  },
): CostStateSnapshot & { costValueUsed: string | null; unitCostUsed: string | null } {
  const qty = parseQuantity(movement.quantityBase);
  if (qty === 0n) throw new ValidationError('cost movements must be non-zero');

  const onHand = parseQuantity(state.quantityBase);
  const value = parseMoney(state.totalValue);

  if (qty > 0n) {
    // receipt / reversal-in layer
    let costValue = 0n;
    let unitCostUsed: string | null = null;
    if (movement.reversalCost && movement.reversalCost.costValue != null) {
      costValue = parseMoney(movement.reversalCost.costValue);
      unitCostUsed = movement.reversalCost.unitCost;
    } else if (movement.explicitCost && movement.explicitCost.costValue != null) {
      costValue = parseMoney(movement.explicitCost.costValue);
      unitCostUsed = movement.explicitCost.unitCost;
    } else if (movement.unitCost != null) {
      const unit = parseMoney(movement.unitCost);
      if (unit < 0n) throw new ValidationError('unit cost must be >= 0');
      // value = round4(qty × unit) — the single rounding of the layer
      costValue = mulScaledRounded(qty, QTY_SCALE, unit, MONEY_SCALE, MONEY_SCALE);
      unitCostUsed = movement.unitCost;
    } else if (movement.issueCost && movement.issueCost.costValue != null) {
      // a positive movement carrying precomputed evidence (issue-side
      // reversal handled above; defensive path)
      costValue = parseMoney(movement.issueCost.costValue);
      unitCostUsed = movement.issueCost.unitCost;
    }
    return {
      quantityBase: formatDecimal(onHand + qty, QTY_SCALE),
      totalValue: formatDecimal(value + costValue, MONEY_SCALE),
      costValueUsed: costValue > 0n ? formatDecimal(costValue, MONEY_SCALE) : (unitCostUsed != null ? '0.0000' : null),
      unitCostUsed,
    };
  }

  // issue (qty < 0)
  const absQty = -qty;
  let costValue = 0n;
  let unitCostUsed: string | null = null;
  if (movement.reversalCost && movement.reversalCost.costValue != null) {
    costValue = parseMoney(movement.reversalCost.costValue);
    unitCostUsed = movement.reversalCost.unitCost;
  } else if (movement.issueCost && movement.issueCost.costValue != null) {
    costValue = parseMoney(movement.issueCost.costValue);
    unitCostUsed = movement.issueCost.unitCost;
  } else if (movement.unitCost != null) {
    // caller-supplied evidence (e.g. migration import): round once
    const unit = parseMoney(movement.unitCost);
    costValue = mulScaledRounded(absQty, QTY_SCALE, unit, MONEY_SCALE, MONEY_SCALE);
    unitCostUsed = movement.unitCost;
  }
  if (costValue > value) {
    throw new ValidationError(
      `cost layers exhausted: issue value ${formatDecimal(costValue, MONEY_SCALE)} exceeds on-hand value ${state.totalValue}`,
    );
  }
  return {
    quantityBase: formatDecimal(onHand + qty, QTY_SCALE),
    totalValue: formatDecimal(value - costValue, MONEY_SCALE),
    costValueUsed: costValue > 0n ? formatDecimal(costValue, MONEY_SCALE) : null,
    unitCostUsed,
  };
}

/** Parses a decimal(18,4) unit cost, validating non-negativity. */
export function parseUnitCost(input: string): bigint {
  const v = parseMoney(input);
  if (v < 0n) throw new ValidationError(`unit cost "${input}" must be >= 0`);
  return v;
}

/** Re-exported for the rebuild path (state from ledger rows). */
export function parseCostDecimal(input: string, scale: number): bigint {
  return parseDecimal(input, scale);
}
