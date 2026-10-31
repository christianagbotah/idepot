/**
 * Exact decimal arithmetic on scaled BigInts — the ONLY arithmetic used for
 * quantities and money in the new system. PostgreSQL `numeric` arrives as a
 * string; it is parsed here into a scaled integer, never through a float.
 *
 * Invariants:
 *  - parsing is strict: no NaN/Infinity/exponents/thousands separators;
 *  - every operation is exact unless an explicit target scale forces a
 *    round-half-even reduction (the only rounding mode, per the migration
 *    map §5 "round-half-even" normalization rule);
 *  - conversion conservation (quantity_transacted × factor == quantity_base)
 *    is checked EXACTLY — a product that does not terminate within the
 *    target scale is rejected, never silently rounded.
 */

export const QTY_SCALE = 6;
export const MONEY_SCALE = 4;
/** tax component rates are numeric(9,6) — fractions like 0.075000 */
export const RATE_SCALE = 6;

const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

export class DecimalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecimalParseError';
  }
}

/** Round-half-even integer division of numer by denom (denom > 0). */
export function halfEvenDiv(numer: bigint, denom: bigint): bigint {
  if (denom <= 0n) throw new DecimalParseError('halfEvenDiv requires a positive divisor');
  const negative = numer < 0n;
  const n = negative ? -numer : numer;
  const q = n / denom;
  const r = n % denom;
  const twice = r * 2n;
  let out = q;
  if (twice > denom || (twice === denom && q % 2n === 1n)) out = q + 1n;
  return negative ? -out : out;
}

/** Parse a decimal string into an integer scaled by 10^scale. */
export function parseDecimal(input: string, scale: number): bigint {
  if (typeof input !== 'string') {
    throw new DecimalParseError(`decimal input must be a string, got ${typeof input}`);
  }
  const s = input.trim();
  if (s === '' || !DECIMAL_RE.test(s)) {
    throw new DecimalParseError(`"${input}" is not a plain decimal number`);
  }
  const negative = s.startsWith('-');
  const unsigned = s.replace(/^[+-]/, '');
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > scale) {
    throw new DecimalParseError(
      `"${input}" has ${fracPart.length} decimal places; scale is ${scale} (round explicitly with roundDecimal first)`,
    );
  }
  const digits = intPart + fracPart.padEnd(scale, '0');
  const value = BigInt(digits === '' ? '0' : digits);
  return negative ? -value : value;
}

/** Format a scaled integer back to a plain decimal string with fixed scale. */
export function formatDecimal(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const digits = abs.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${intPart}${scale > 0 ? '.' + fracPart : ''}`;
}

/** Re-scale a scaled integer to a different scale (half-even when reducing). */
export function rescale(scaled: bigint, fromScale: number, toScale: number): bigint {
  if (toScale === fromScale) return scaled;
  if (toScale > fromScale) return scaled * 10n ** BigInt(toScale - fromScale);
  return halfEvenDiv(scaled, 10n ** BigInt(fromScale - toScale));
}

/** True when the input terminates within `scale` decimal places. */
export function fitsScale(input: string, scale: number): boolean {
  try {
    parseDecimal(input, scale);
    return true;
  } catch {
    return false;
  }
}

/** Explicit half-even rounding to a target scale. */
export function roundDecimal(input: string, fromScale: number, toScale: number): bigint {
  return rescale(parseDecimal(input, fromScale), fromScale, toScale);
}

/** a + b, both scaled; result scaled to the larger of the two scales. */
export function addScaled(
  a: bigint,
  aScale: number,
  b: bigint,
  bScale: number,
): { value: bigint; scale: number } {
  if (aScale >= bScale) {
    return { value: a + rescale(b, bScale, aScale), scale: aScale };
  }
  return { value: rescale(a, aScale, bScale) + b, scale: bScale };
}

/** a − b, both scaled; result scaled to the larger of the two scales. */
export function subScaled(
  a: bigint,
  aScale: number,
  b: bigint,
  bScale: number,
): { value: bigint; scale: number } {
  if (aScale >= bScale) {
    return { value: a - rescale(b, bScale, aScale), scale: aScale };
  }
  return { value: rescale(a, aScale, bScale) - b, scale: bScale };
}

/** Exact multiply of two scaled integers into an explicit target scale.
 *  Throws when the mathematical product does not terminate within targetScale
 *  (conservation checks rely on this — no silent precision loss). */
export function mulScaledExact(
  a: bigint,
  aScale: number,
  b: bigint,
  bScale: number,
  targetScale: number,
): bigint {
  const product = a * b;
  const productScale = aScale + bScale;
  if (productScale < targetScale) return product * 10n ** BigInt(targetScale - productScale);
  const drop = productScale - targetScale;
  const divisor = 10n ** BigInt(drop);
  if (product % divisor !== 0n) {
    throw new DecimalParseError(
      `exact multiplication impossible: product needs ${productScale} decimal places, target scale is ${targetScale}`,
    );
  }
  return product / divisor;
}

/** Multiply allowing half-even rounding to the target scale (documented lossy path,
 *  e.g. legacy double normalization — every use emits a reconciliation record). */
export function mulScaledRounded(
  a: bigint,
  aScale: number,
  b: bigint,
  bScale: number,
  targetScale: number,
): bigint {
  const product = a * b;
  const productScale = aScale + bScale;
  if (productScale <= targetScale) return product * 10n ** BigInt(targetScale - productScale);
  return halfEvenDiv(product, 10n ** BigInt(productScale - targetScale));
}

export function cmpScaled(a: bigint, aScale: number, b: bigint, bScale: number): number {
  const target = Math.max(aScale, bScale);
  const av = rescale(a, aScale, target);
  const bv = rescale(b, bScale, target);
  return av === bv ? 0 : av < bv ? -1 : 1;
}
