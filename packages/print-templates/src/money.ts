/**
 * Money DISPLAY formatting for print templates (Phase 6 B5 rule):
 *   - UI/print display: 2 decimal places WITH thousands separators
 *     ("1,230.00"), cedi prefixed by the template profile;
 *   - the API's internal 4dp exact accounting strings are carried through
 *     UNTOUCHED — templates never round, add or recompute money.
 */

/** Parse a decimal string to scaled BigInt at the given scale (default 4dp). */
export function toScaled(value: string, scale = 4): bigint {
  const neg = value.startsWith('-');
  const body = neg ? value.slice(1) : value;
  const [int, frac = ''] = body.split('.');
  const padded = (frac + '0'.repeat(scale)).slice(0, scale);
  const scaled = BigInt(int + padded);
  return neg ? -scaled : scaled;
}

/** 2dp display with thousands separators, HALF-EVEN rounding at the cent
 *  (the domain's money convention): '1234567.8900' → '1,234,567.89'. */
export function display2dp(value: string): string {
  const scaled = toScaled(value, 4); // 4dp internal evidence
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  let cents = abs / 100n; // truncation toward zero on the magnitude
  const rem = abs % 100n;
  if (rem > 50n || (rem === 50n && cents % 2n !== 0n)) cents += 1n; // half-even up
  const units = cents / 100n;
  const centPart = cents % 100n;
  const grouped = units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = neg ? '-' : '';
  return `${sign}${grouped}.${centPart.toString().padStart(2, '0')}`;
}

/** Cedi display: GH¢ 1,234.56 (print profile decides the symbol form). */
export function cedi2dp(value: string, symbol = 'GH¢'): string {
  return `${symbol} ${display2dp(value)}`;
}

/** Quantity display: strips trailing zeros, keeps up to 6dp. */
export function displayQty(value: string): string {
  const [intPart, frac = ''] = value.split('.');
  const int = intPart ?? '0';
  const trimmed = frac.replace(/0+$/, '');
  return trimmed ? `${int}.${trimmed}` : int;
}

/** dd/mm/yyyy for Ghana-facing printouts (ISO in, display out). */
export function displayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]!}/${m[2]!}/${m[1]!}`;
}

/** dd/mm/yyyy HH:MM for timestamps. */
export function displayDateTime(iso: string): string {
  const d = displayDate(iso);
  const t = /T(\d{2}:\d{2})/.exec(iso);
  return t ? `${d} ${t[1]}` : d;
}
