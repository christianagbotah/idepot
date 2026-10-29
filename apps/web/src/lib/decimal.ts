/**
 * Exact signed-decimal helpers for the API's decimal-as-string wire format
 * (quantities: decimal(18,6), money: decimal(18,4)). Implemented with BigInt
 * so `quantityTransacted × conversionFactor` never drifts like float math.
 */

const QTY_RE = /^-?\d{1,14}(\.\d{1,6})?$/;
const MONEY_RE = /^\d{1,14}(\.\d{1,4})?$/;

export function isValidQty(v: string): boolean {
  return QTY_RE.test(v);
}

export function isValidMoney(v: string): boolean {
  return MONEY_RE.test(v);
}

interface Scaled {
  v: bigint;
  scale: number;
}

function parse(v: string): Scaled {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(v.trim());
  if (!m) throw new Error(`invalid decimal: ${v}`);
  const sign = m[1] === '-' ? -1n : 1n;
  const intPart = m[2] || '0';
  const frac = m[3] ?? '';
  return { v: sign * BigInt(intPart + frac), scale: frac.length };
}

function rescale(x: Scaled, scale: number): bigint {
  return x.scale === scale ? x.v : x.v * 10n ** BigInt(scale - x.scale);
}

function render(v: bigint, scale: number): string {
  const neg = v < 0n;
  const digits = (neg ? -v : v).toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, digits.length - scale);
  const frac = scale === 0 ? '' : digits.slice(digits.length - scale).replace(/0+$/, '');
  return (neg ? '-' : '') + intPart + (frac ? `.${frac}` : '');
}

export function addDecimal(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  return render(rescale(x, scale) + rescale(y, scale), scale);
}

export function subDecimal(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  return render(rescale(x, scale) - rescale(y, scale), scale);
}

export function mulDecimal(a: string, b: string): string {
  const x = parse(a);
  const y = parse(b);
  return render(x.v * y.v, x.scale + y.scale);
}

/** -1 | 0 | 1 comparison of two decimal strings. */
export function cmpDecimal(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  const scale = Math.max(x.scale, y.scale);
  const xa = rescale(x, scale);
  const ya = rescale(y, scale);
  return xa < ya ? -1 : xa > ya ? 1 : 0;
}

/** Normalizes a decimal string for display (trims trailing zeros). */
export function formatDecimal(v: string): string {
  try {
    const p = parse(v);
    return render(p.v, p.scale);
  } catch {
    return v;
  }
}
