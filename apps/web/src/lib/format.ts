/** Client-side display formatters (only called after mount, never during SSR). */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Ghana cedi money display: '₵ 1,234.50' from a decimal(18,4) string.
 * Two display decimals; the wire format keeps its full precision.
 */
export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '₵ 0.00';
  const negative = value.startsWith('-');
  const [intPart, fracPart = ''] = value.replace(/^[-+]/, '').split('.');
  const two = (fracPart + '00').slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}₵ ${grouped}.${two}`;
}

/** Plain quantity display (up to 3 significant decimals, trailing zeros trimmed). */
export function formatQty(value: string | null | undefined): string {
  if (value == null || value === '') return '0';
  const trimmed = value.replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m));
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}
