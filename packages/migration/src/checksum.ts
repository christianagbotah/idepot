/** Checksum / row-count framework: deterministic sha256 over ordered rows. */
import { createHash } from 'node:crypto';
import type { LegacyRow } from './types.js';

export interface ChecksumResult {
  rows: number;
  checksum: string;
}

/** Canonical row serialization: column order fixed, cells JSON-encoded, LF separators. */
export function checksumRows(columns: string[], rows: LegacyRow[]): ChecksumResult {
  const h = createHash('sha256');
  h.update(columns.join('\t') + '\n');
  for (const row of rows) {
    const cells = columns.map((c) => JSON.stringify(row[c] ?? null));
    h.update(cells.join('\t') + '\n');
  }
  return { rows: rows.length, checksum: h.digest('hex') };
}
