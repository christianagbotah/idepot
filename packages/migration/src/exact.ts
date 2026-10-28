/**
 * Exact decimal helpers for the migration engine (local to this standalone
 * CLI package — no workspace dependencies). Scaled-bigint arithmetic only:
 * legacy `double` values arrive as canonical strings and are never routed
 * through JS floats.
 */

export class ExactnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExactnessError';
  }
}

const PLAIN = /^[+-]?\d+(\.\d+)?$/;

export function parseScaled(input: string | null | undefined, scale: number): bigint {
  const s = (input ?? '').trim();
  if (s === '') return 0n;
  if (!PLAIN.test(s)) throw new ExactnessError(`"${input}" is not a plain decimal number`);
  const negative = s.startsWith('-');
  const unsigned = s.replace(/^[+-]/, '');
  const [intPart, fracPart = ''] = unsigned.split('.');
  if (fracPart.length > scale) {
    throw new ExactnessError(`"${input}" exceeds scale ${scale}`);
  }
  const digits = intPart + fracPart.padEnd(scale, '0');
  const v = BigInt(digits === '' ? '0' : digits);
  return negative ? -v : v;
}

export function formatScaled(v: bigint, scale: number): string {
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const digits = abs.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const fracPart = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${intPart}${scale > 0 ? '.' + fracPart : ''}`;
}

/** half-even division of scaled integers; exact when remainder is 0 */
export function divScaledExact(numer: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new ExactnessError('division by zero');
  if (numer % denom === 0n) return numer / denom;
  throw new ExactnessError('division is not exact at this scale');
}

/** half-even rounding division (documented lossy path → reconciliation record) */
export function divScaledRounded(numer: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new ExactnessError('division by zero');
  const negative = numer < 0n !== denom < 0n;
  const n = numer < 0n ? -numer : numer;
  const d = denom < 0n ? -denom : denom;
  const q = n / d;
  const r = n % d;
  const twice = r * 2n;
  let out = q;
  if (twice > d || (twice === d && q % 2n === 1n)) out = q + 1n;
  return negative ? -out : out;
}

export function mulScaled(a: bigint, b: bigint): bigint {
  return a * b;
}
