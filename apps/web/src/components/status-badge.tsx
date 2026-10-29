/**
 * Shared status → badge-variant mapping so every list renders the same
 * visual language for lifecycle states and ledger movement types.
 */

type Variant = 'ok' | 'warn' | 'err' | 'mut';

const VARIANTS: Record<string, Variant> = {
  // lifecycle states
  active: 'ok',
  posted: 'ok',
  approved: 'ok',
  received: 'ok',
  draft: 'mut',
  counted: 'warn',
  in_transit: 'warn',
  inactive: 'err',
  cancelled: 'err',
  archived: 'mut',
  // ledger movement types
  receipt: 'ok',
  transfer_in: 'ok',
  issue: 'err',
  transfer_out: 'err',
  adjustment: 'warn',
  count_variance: 'warn',
  reversal: 'warn',
};

export function StatusBadge({ status }: { status: string }) {
  const variant = VARIANTS[status] ?? 'mut';
  return <span className={`badge badge-${variant}`}>{status.replaceAll('_', ' ')}</span>;
}
