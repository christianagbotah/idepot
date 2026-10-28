/**
 * Inventory domain: append-only stock ledger, derived balances, counts,
 * adjustments, transfers. The ledger is the only source of truth for
 * on-hand quantity; stock_balance is a rebuildable projection whose
 * invariant `on_hand == Σ stock movements` is proven by the rebuild job.
 */
import { ValidationError } from './errors.js';
import {
  parseQuantity,
  validateConversionFactor,
  validateMovementQuantity,
  validateNonNegativeQuantity,
} from './quantity.js';

export const MOVEMENT_TYPES = [
  'receipt',
  'issue',
  'transfer_out',
  'transfer_in',
  'adjustment',
  'count_variance',
  'reversal',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const COUNT_STATUSES = ['draft', 'counted', 'approved', 'cancelled'] as const;
export type StockCountStatus = (typeof COUNT_STATUSES)[number];

export const ADJUSTMENT_STATUSES = ['posted', 'cancelled'] as const;
export type StockAdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number];

export const TRANSFER_STATUSES = ['draft', 'in_transit', 'received', 'cancelled'] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

/** Opening-stock authority per migration strategy §4. */
export const COUNT_AUTHORITIES = ['physical_count', 'legacy_quantity', 'system_entry'] as const;
export type CountAuthority = (typeof COUNT_AUTHORITIES)[number];

export interface MovementEntry {
  warehouseId: string;
  productId: string;
  movementType: MovementType;
  /** signed base-unit quantity; never 0 */
  quantityBase: string;
  /** transacted unit + quantity + factor when the user transacted in a non-base unit */
  unitId?: string | null;
  quantityTransacted?: string | null;
  conversionFactor?: string | null;
  reason?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  transferId?: string | null;
  reversalOf?: string | null;
}

const TRANSFER_TYPES: ReadonlySet<string> = new Set(['transfer_out', 'transfer_in']);

export function validateMovementEntry(m: MovementEntry): bigint {
  if (!MOVEMENT_TYPES.includes(m.movementType)) {
    throw new ValidationError(`unknown movement type "${m.movementType}"`);
  }
  if (!m.warehouseId || !m.productId) {
    throw new ValidationError('movement requires warehouse and product');
  }
  const base = validateMovementQuantity(m.quantityBase);

  if (TRANSFER_TYPES.has(m.movementType) && !m.transferId) {
    throw new ValidationError(`${m.movementType} movements must reference a transfer`);
  }
  if (m.movementType === 'reversal' && !m.reversalOf) {
    throw new ValidationError('reversal movements must reference the movement being reversed');
  }

  const hasTransacted = m.quantityTransacted != null && m.quantityTransacted !== '';
  const hasFactor = m.conversionFactor != null && m.conversionFactor !== '';
  if (hasTransacted || hasFactor) {
    if (!hasTransacted || !hasFactor || !m.unitId) {
      throw new ValidationError(
        'cross-unit movements require unitId, quantityTransacted AND conversionFactor together',
      );
    }
    validateConversionFactor(m.conversionFactor!);
    const transacted = validateNonNegativeQuantity(m.quantityTransacted!);
    if (transacted === 0n) throw new ValidationError('transacted quantity must be non-zero');
  }
  return base;
}

/** Legal stock_count state transitions. */
export function assertCountTransition(from: StockCountStatus, to: StockCountStatus): void {
  const allowed: Record<StockCountStatus, StockCountStatus[]> = {
    draft: ['counted', 'cancelled'],
    counted: ['approved', 'cancelled'],
    approved: [],
    cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal stock count transition ${from} → ${to}`);
  }
}

/** Legal transfer state transitions. Dispatched transfers cannot be cancelled —
 *  the quantity is physically gone from the source and must be received back. */
export function assertTransferTransition(from: TransferStatus, to: TransferStatus): void {
  const allowed: Record<TransferStatus, TransferStatus[]> = {
    draft: ['in_transit', 'cancelled'],
    in_transit: ['received'],
    received: [],
    cancelled: [],
  };
  if (!allowed[from].includes(to)) {
    throw new ValidationError(`illegal transfer transition ${from} → ${to}`);
  }
}

export interface CountLineInput {
  productId: string;
  countedQuantityBase: string | null;
  systemQuantityBase: string;
}

/** Variance = counted − system; null counted = not counted (no variance). */
export function countVariance(line: CountLineInput): bigint | null {
  if (line.countedQuantityBase == null) return null;
  return parseQuantity(line.countedQuantityBase) - parseQuantity(line.systemQuantityBase);
}

/**
 * Materiality gate for supervisor attention (strategy doc §4.3 default:
 * per-item 5% of system quantity, floor of 1 base unit so tiny balances
 * still report absolute variances).
 */
export function isMaterialVariance(systemQuantityBase: string, variance: bigint): boolean {
  const system = parseQuantity(systemQuantityBase);
  if (system === 0n) return variance !== 0n;
  const absV = variance < 0n ? -variance : variance;
  return absV * 20n >= system; // |variance| >= 5% of system
}
