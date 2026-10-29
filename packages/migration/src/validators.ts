/**
 * Validator framework (Phase 1 set): encoding, date parsability, orphan FKs,
 * receipt-level payment consistency (the D1 class), code census.
 * Errors quarantine; census findings become warnings (never silent drops).
 */
import type { LegacyRow, TableSpec, ValidatorFinding } from './types.js';

const MOJIBAKE_MARKERS = ['Ã', 'Â', 'â€', 'ï¿½', '\uFFFD'];
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})( \d{2}:\d{2}:\d{2})?$/;

export interface ValidatorContext {
  /** all staged rows per table (for cross-table checks) */
  staged: Map<string, LegacyRow[]>;
  specs: TableSpec[];
}

function validateRow(
  spec: TableSpec,
  row: LegacyRow,
  ctx: ValidatorContext,
  knownIds: Map<string, Set<string>>,
): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];
  const pk = row[spec.pk] ?? '?';

  // 1. encoding sanity
  for (const col of spec.columns) {
    const v = row[col];
    if (v == null || v === '') continue;
    if (MOJIBAKE_MARKERS.some((m) => v.includes(m)) || CONTROL_CHARS.test(v)) {
      findings.push({
        validator: 'encoding',
        table: spec.table,
        pk,
        reasonCode: 'encoding_mojibake',
        reasonDetail: `column ${col} contains double-encoded/malformed text`,
        severity: 'error',
        quarantine: true,
      });
      break;
    }
  }

  // 2. date parsability (columns ending in _date)
  for (const col of spec.columns.filter((c) => c.endsWith('_date'))) {
    const v = row[col];
    if (v == null || v === '') continue;
    const m = DATE_PATTERN.exec(v);
    let ok = false;
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      const dt = new Date(Date.UTC(year, month - 1, day));
      ok =
        dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
    }
    if (!ok) {
      findings.push({
        validator: 'date',
        table: spec.table,
        pk,
        reasonCode: 'date_unparsable',
        reasonDetail: `column ${col} value "${v}" is not a real calendar date`,
        severity: 'error',
        quarantine: true,
      });
    }
  }

  // 2b. numeric parsability + conversion sanity (declared per table/column)
  for (const col of NUMERIC_COLUMNS[spec.table] ?? []) {
    const v = row[col];
    if (v == null || v === '') continue;
    if (!/^[+-]?\d+(\.\d+)?$/.test(v.trim())) {
      findings.push({
        validator: 'numeric',
        table: spec.table,
        pk,
        reasonCode: 'numeric_unparsable',
        reasonDetail: `column ${col} value "${v}" is not a plain number`,
        severity: 'error',
        quarantine: true,
      });
      continue;
    }
    if (col === 'unit_total' && Number(v) <= 0) {
      findings.push({
        validator: 'numeric',
        table: spec.table,
        pk,
        reasonCode: 'invalid_conversion',
        reasonDetail: `column ${col} value "${v}" is not a positive conversion factor`,
        severity: 'error',
        quarantine: true,
      });
    }
  }

  // 3. orphan FK checks (declared: table.column -> referencedTable.pk)
  for (const [col, refTable] of FK_MAP[spec.table] ?? []) {
    const v = row[col];
    if (v == null || v === '') continue;
    const ids = knownIds.get(refTable);
    if (ids && !ids.has(v)) {
      findings.push({
        validator: 'fk',
        table: spec.table,
        pk,
        reasonCode: 'fk_orphan',
        reasonDetail: `${spec.table}.${col}=${v} has no ${refTable} row`,
        severity: 'error',
        quarantine: true,
      });
    }
  }

  return findings;
}

const FK_MAP: Record<string, Array<[string, string]>> = {
  item: [
    ['store_id', 'store'],
    ['category_id', 'item_category'],
    ['supplier_id', 'suppliers'],
  ],
  invoice: [['store_id', 'store']],
  payment: [['invoice_id', 'invoice'], ['store_id', 'store']],
  item_category: [['main_id', 'item_main_category']],
  units_items: [['unit_id', 'units'], ['item_id', 'item']],
  opening_stock_count: [['item_id', 'item'], ['store_id', 'store']],
};

/** Numeric columns that must parse as plain decimal numbers. */
const NUMERIC_COLUMNS: Record<string, string[]> = {
  units_items: ['unit_total', 'unit_price'],
  item: ['quantity', 'unit_quantity', 'selling_price', 'purchase_price'],
  opening_stock_count: ['counted_quantity'],
};

/** Receipt-level consistency: the D1 defect class detection. */
export function findD1Receipts(payments: LegacyRow[]): Map<string, LegacyRow[]> {
  const byReceipt = new Map<string, LegacyRow[]>();
  for (const p of payments) {
    const rc = p.receipt_code;
    if (!rc) continue;
    const list = byReceipt.get(rc) ?? [];
    list.push(p);
    byReceipt.set(rc, list);
  }
  const multi = new Map<string, LegacyRow[]>();
  for (const [rc, rows] of byReceipt) {
    const invoices = new Set(rows.map((r) => r.invoice_id).filter((x): x is string => x !== null));
    if (invoices.size > 1) multi.set(rc, rows);
  }
  return multi;
}

export interface ValidatorOutcome {
  findings: ValidatorFinding[];
  checks: Array<{ code: string; table: string; checked: number; failed: number }>;
  censusWarnings: Array<{ code: string; table: string; message: string }>;
  d1Receipts: Map<string, LegacyRow[]>;
}

export function runValidators(ctx: ValidatorContext): ValidatorOutcome {
  const findings: ValidatorFinding[] = [];
  const checks: ValidatorOutcome['checks'] = [];
  const censusWarnings: ValidatorOutcome['censusWarnings'] = [];

  const knownIds = new Map<string, Set<string>>();
  for (const spec of ctx.specs) {
    knownIds.set(
      spec.table,
      new Set(ctx.staged.get(spec.table)?.map((r) => r[spec.pk] ?? '') ?? []),
    );
  }

  for (const spec of ctx.specs) {
    const rows = ctx.staged.get(spec.table) ?? [];
    let failed = 0;
    for (const row of rows) {
      const f = validateRow(spec, row, ctx, knownIds);
      if (f.length) failed++;
      findings.push(...f);
    }
    checks.push({ code: 'row-validators', table: spec.table, checked: rows.length, failed });
  }

  // code census: report distinct status values (informational)
  for (const spec of ctx.specs) {
    const rows = ctx.staged.get(spec.table) ?? [];
    const col = spec.columns.find((c) => c === 'status');
    if (!col) continue;
    const distinct = new Map<string, number>();
    for (const r of rows) {
      const v = r[col];
      if (v == null) continue;
      distinct.set(v, (distinct.get(v) ?? 0) + 1);
    }
    censusWarnings.push({
      code: 'code_census',
      table: spec.table,
      message: `status values: ${[...distinct.entries()].map(([k, n]) => `${k}(${n})`).join(', ') || 'none'}`,
    });
  }

  const payments = ctx.staged.get('payment') ?? [];
  const d1Receipts = findD1Receipts(payments);
  if (d1Receipts.size > 0) {
    checks.push({
      code: 'd1-split-receipts',
      table: 'payment',
      checked: payments.length,
      failed: d1Receipts.size,
    });
  }

  return { findings, checks, censusWarnings, d1Receipts };
}

/** Rows that survived error-severity quarantine (importable). */
export function isQuarantined(
  findings: ValidatorFinding[],
  table: string,
  pk: string | undefined,
): boolean {
  return findings.some((f) => f.table === table && f.pk === (pk ?? '') && f.quarantine);
}
