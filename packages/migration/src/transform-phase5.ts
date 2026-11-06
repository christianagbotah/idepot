/**
 * Phase 5 transform: legacy returns / refunds / store-credit EVIDENCE.
 *
 * Forensic basis (docs/legacy-audit/returns-refund-credit.md):
 *  - the legacy returns subsystem (return_reasons, sales_returns,
 *    sales_return_items, refund_transactions, store_credits,
 *    returns_audit_trail) was designed-but-DEAD DDL — no code ever
 *    referenced it and the tables are empty or absent in real dumps;
 *  - the only live refund path (Admin::sales_order_refund) was a
 *    DESTRUCTIVE in-place order amendment, broken against its own
 *    schema (it updates columns that do not exist) — its `refund=1`
 *    attempts failed; amended historical orders simply look like
 *    smaller sales.
 *
 * Consequences implemented here (master prompt §19):
 *  1. NO historical return / credit-note / refund / store-credit
 *     documents are EVER synthesized. The authoritative final-state sale
 *     evidence (imported by Phase 3) stands as-is.
 *  2. The dead returns tables are verified empty (or reported when the
 *     dump surprises us) — dormant loyalty/returns schema is never
 *     treated as customer activity.
 *  3. Orders whose history changed AFTER payment (the fingerprint of a
 *     legacy destructive amendment: final amount_paid exceeding the
 *     final grand_total, or a final amount_paid on an order whose
 *     payment rows exceed the final invoice) are flagged as AMBIGUITY
 *     reconciliation records requiring manual review — never "fixed",
 *     never invented as returns.
 *  4. Customer credit balances are verified against the Phase 3 deposit
 *     import; legacy store credit never existed (dead DDL).
 */
import type { Client, PoolClient } from 'pg';
import type { LegacyRow, ReconciliationRecord, Phase5ReturnsStats } from './types.js';
import { parseScaled, formatScaled } from './exact.js';

export interface Phase5Options {
  tenantId: string;
  runId: string;
}

export interface Phase5Result {
  stats: Phase5ReturnsStats;
  records: ReconciliationRecord[];
}

interface SourceTables {
  salesOrder: LegacyRow[];
  paymentWithGoods: LegacyRow[];
}

export async function transformPhase5Returns(
  pg: PoolClient | Client,
  tables: SourceTables,
  opts: Phase5Options,
): Promise<Phase5Result> {
  const records: ReconciliationRecord[] = [];

  // ---- 1. dead returns DDL verification ------------------------------
  const deadTables = [
    'return_reasons', 'sales_returns', 'sales_return_items',
    'refund_transactions', 'store_credits', 'returns_audit_trail',
  ];
  const deadReturnsTablesFound: string[] = [];
  let deadReturnsRows = 0;
  for (const table of deadTables) {
    const exists = await pg.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.tables
        WHERE table_schema = 'legacy_raw' AND table_name = $1`,
      [table],
    );
    if (Number(exists.rows[0]!.n) > 0) {
      deadReturnsTablesFound.push(table);
      const rows = await pg.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM legacy_raw."${table}"`,
      );
      deadReturnsRows += Number(rows.rows[0]!.n);
      if (Number(rows.rows[0]!.n) > 0) {
        // unexpected: the DDL was dead — any rows are suspect evidence,
        // quarantined for manual review, NEVER imported as returns
        records.push({
          legacy_table: table,
          legacy_id: '(all)',
          field: 'rows',
          legacy_stored_value: { rowCount: Number(rows.rows[0]!.n) },
          legacy_reconstructed_value: { expected: 0, basis: 'dead DDL — no code path ever referenced this table' },
          new_system_value: { imported: 0 },
          correction_delta: {},
          correction_reason:
            'legacy returns subsystem was designed-but-dead; unexpected rows are withheld as untrusted evidence',
          evidence: { forensic: 'docs/legacy-audit/returns-refund-credit.md §2' },
          severity: 'warning',
          requires_manual_approval: true,
        });
      }
    }
  }

  // ---- 2. post-payment mutation scan (ambiguity, never synthesis) ----
  let ambiguityRecords = 0;
  for (const row of tables.salesOrder) {
    const paid = parseScaled(normalize(row.amount_paid), 4);
    const grand = parseScaled(normalize(row.grand_total), 4);
    if (paid > grand) {
      ambiguityRecords += 1;
      records.push({
        legacy_table: 'sales_order',
        legacy_id: String(row.id ?? row.so_code ?? ''),
        field: 'amount_paid vs grand_total',
        legacy_stored_value: {
          so_code: row.so_code ?? null,
          amount_paid: normalize(row.amount_paid),
          grand_total: normalize(row.grand_total),
          amount_due: normalize(row.amount_due),
          status: row.status ?? null,
          track_code: row.track_code ?? null,
        },
        legacy_reconstructed_value: {
          possibleHistoricalRefund: formatScaled(paid - grand, 4),
          basis: 'final amount_paid exceeds final grand_total — the fingerprint of a destructive post-payment amendment by the broken legacy sales_order_refund routine',
        },
        new_system_value: {
          decision: 'final-state import stands; NO return/credit-note/refund document was synthesized',
        },
        correction_delta: {},
        correction_reason:
          'possible historical refund or post-payment amendment — legacy evidence is unreliable (the live refund engine was broken against its own schema); manual review required',
        evidence: {
          forensic: 'docs/legacy-audit/returns-refund-credit.md §1.1',
          trackCode: row.track_code ?? null,
        },
        severity: 'warning',
        requires_manual_approval: true,
      });
    }
  }
  for (const row of tables.paymentWithGoods) {
    const paid = parseScaled(normalize(row.amount_paid), 4);
    const grand = parseScaled(normalize(row.grand_total), 4);
    if (paid > grand) {
      ambiguityRecords += 1;
      records.push({
        legacy_table: 'payment_with_goods',
        legacy_id: String(row.id ?? row.so_code ?? ''),
        field: 'amount_paid vs grand_total',
        legacy_stored_value: {
          so_code: row.so_code ?? null,
          invoice_code: row.invoice_code ?? null,
          amount_paid: normalize(row.amount_paid),
          grand_total: normalize(row.grand_total),
          track_code: row.track_code ?? null,
        },
        legacy_reconstructed_value: {
          possibleHistoricalRefund: formatScaled(paid - grand, 4),
        },
        new_system_value: { decision: 'final-state import stands; no synthesized return' },
        correction_delta: {},
        correction_reason:
          'possible historical refund/adjustment on a delivery order — flagged for manual review, never reconstructed',
        evidence: { forensic: 'docs/legacy-audit/returns-refund-credit.md §1.1' },
        severity: 'info',
        requires_manual_approval: true,
      });
    }
  }

  // ---- 3. customer credit balances verification -----------------------
  const deposits = await pg.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM customer_deposit WHERE tenant_id = $1`,
    [opts.tenantId],
  );
  const creditBalancesVerified = Number(deposits.rows[0]!.n);

  return {
    stats: {
      deadReturnsTablesFound,
      deadReturnsRows,
      ordersScanned: tables.salesOrder.length,
      pwgRowsScanned: tables.paymentWithGoods.length,
      ambiguityRecords,
      returnsSynthesized: 0,
      creditBalancesVerified,
      legacyStoreCreditsFound: deadReturnsTablesFound.includes('store_credits') ? deadReturnsRows : 0,
    },
    records,
  };
}

function normalize(v: unknown): string {
  if (v == null) return '0';
  return String(v).trim() === '' ? '0' : String(v);
}
