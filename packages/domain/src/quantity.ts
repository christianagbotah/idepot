/**
 * Quantity value objects and unit-conversion semantics (unit-conversion-rules
 * §8 "corrected model"): a single stock pool per product+location in BASE-unit
 * quantity; transacted quantities convert at transaction time and both values
 * are stored; conversion conserves base quantity exactly (numeric(18,6)).
 */
import {
  QTY_SCALE,
  DecimalParseError,
  formatDecimal,
  mulScaledExact,
  parseDecimal,
} from './decimal.js';
import { ValidationError } from './errors.js';

export type Quantity = string; // decimal string, ≤ 6 dp

export function parseQuantity(input: string): bigint {
  try {
    return parseDecimal(input, QTY_SCALE);
  } catch (err) {
    if (err instanceof DecimalParseError) {
      throw new ValidationError(`quantity "${input}" is not a decimal(18,6) value`);
    }
    throw err;
  }
}

export function formatQuantity(scaled: bigint): Quantity {
  return formatDecimal(scaled, QTY_SCALE);
}

/** Non-zero signed quantity (a movement must move something). */
export function validateMovementQuantity(input: Quantity): bigint {
  const v = parseQuantity(input);
  if (v === 0n) throw new ValidationError('movement quantity must be non-zero');
  return v;
}

/** Non-negative quantity (counts, received quantities). */
export function validateNonNegativeQuantity(input: Quantity): bigint {
  const v = parseQuantity(input);
  if (v < 0n) throw new ValidationError(`quantity "${input}" must be >= 0`);
  return v;
}

/** Strictly positive conversion factor. */
export function validateConversionFactor(input: string): bigint {
  let v: bigint;
  try {
    v = parseDecimal(input, QTY_SCALE);
  } catch (err) {
    if (err instanceof DecimalParseError) {
      throw new ValidationError(`conversion factor "${input}" is not a decimal(18,6) value`);
    }
    throw err;
  }
  if (v <= 0n) throw new ValidationError(`conversion factor must be > 0, got "${input}"`);
  return v;
}

/**
 * Exact conversion: base = transacted × factor. Throws when the product does
 * not terminate within 6 dp — callers must reject the operation (the user
 * transacts in an amount that cannot map losslessly onto the base pool)
 * instead of silently rounding stock.
 */
export function convertToBaseExact(transacted: Quantity, factor: string): Quantity {
  const qt = parseQuantity(transacted);
  const f = parseDecimal(factor, QTY_SCALE);
  try {
    return formatQuantity(mulScaledExact(qt, QTY_SCALE, f, QTY_SCALE, QTY_SCALE));
  } catch (err) {
    if (err instanceof DecimalParseError) {
      throw new ValidationError(
        `conversion ${transacted} × ${factor} does not conserve base quantity exactly at 6 dp; transact in an amount that maps losslessly (e.g. avoid fractional multiples of the factor's precision)`,
      );
    }
    throw err;
  }
}

/**
 * Legacy reconstruction: stored base quantity = package quantity × package
 * factor + loose base-unit quantity (legacy kept two drifting columns; see
 * unit-conversion-rules §2 and defect I1). Uses exact multiplication — legacy
 * factors that round (recorded separately by the migration engine) must
 * already be normalized before reaching this helper.
 */
export function legacyBaseQuantity(
  packageQuantity: string | null | undefined,
  packageFactor: string | null | undefined,
  looseQuantity: string | null | undefined,
): Quantity {
  let total = 0n;
  if (packageQuantity != null && packageQuantity !== '') {
    const q = parseQuantity(packageQuantity);
    total = packageFactor != null && packageFactor !== ''
      ? mulScaledExact(q, QTY_SCALE, parseDecimal(packageFactor, QTY_SCALE), QTY_SCALE, QTY_SCALE)
      : q;
  }
  if (looseQuantity != null && looseQuantity !== '') {
    total += parseQuantity(looseQuantity);
  }
  return formatQuantity(total);
}
