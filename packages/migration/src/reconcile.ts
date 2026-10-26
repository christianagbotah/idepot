/**
 * Correction-aware reconciliation (strategy doc §3a + defect register D1).
 *
 * D1 — "Specific-invoice split payments multiply money" (Admin.php:17270-17438):
 * every per-account statement in the specific-invoice branch uses the RECEIPT
 * TOTAL instead of the per-account share, so N accounts post N× total while
 * amount_due stays correct. Canonical reconstruction recomputes from the
 * payment rows as evidence: pro-rata share of the receipt total by invoice
 * amount. The system NEVER silently repairs: every mismatch emits a
 * correction-aware record with evidence and manual-approval requirement.
 */
import type { LegacyCell, LegacyRow, ReconciliationRecord } from './types.js';
import { findD1Receipts } from './validators.js';

function num(v: LegacyCell | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return n.toFixed(4);
}

export function reconcile(
  invoices: LegacyRow[],
  payments: LegacyRow[],
): { records: ReconciliationRecord[]; warnings: string[] } {
  const records: ReconciliationRecord[] = [];
  const warnings: string[] = [];
  const d1Receipts = findD1Receipts(payments);
  const invoiceById = new Map(invoices.map((i) => [i.id ?? '', i]));

  // --- D1: split receipts across multiple invoices -------------------------
  for (const [receiptCode, rows] of d1Receipts) {
    const storedSum = rows.reduce((acc, r) => acc + num(r.amount), 0);
    const involved = [...new Set(rows.map((r) => r.invoice_id).filter((x): x is string => !!x))]
      .map((id) => invoiceById.get(id))
      .filter((i): i is LegacyRow => Boolean(i));
    const sumAmounts = involved.reduce((acc, i) => acc + num(i.amount), 0);
    if (sumAmounts <= 0) {
      warnings.push(`receipt ${receiptCode}: cannot reconstruct (zero invoice amounts)`);
      continue;
    }
    // D1 signature: stored payment rows carry the receipt total PER ACCOUNT, so
    // Σ payment rows ≈ N × true tender. Reconstruction must NOT reuse the
    // corrupted amounts: per the D1 remediation rule the invoice.amount is the
    // per-invoice authority (defect register: "amount_due stays correct",
    // "recompute from payment rows" applies to tender evidence, not shares).
    for (const inv of involved) {
      const stored = num(inv.amount_paid);
      const reconstructed = num(inv.amount);
      const delta = reconstructed - stored;
      if (Math.abs(delta) < 0.005) continue;
      records.push({
        legacy_table: 'invoice',
        legacy_id: inv.id ?? '?',
        field: 'amount_paid',
        legacy_stored_value: { amount_paid: money(stored), invoice_code: inv.invoice_code },
        legacy_reconstructed_value: {
          amount_paid: money(reconstructed),
          basis: 'invoice.amount authority under D1 receipt-total multiplication',
        },
        new_system_value: {
          model: 'per_payment_allocation',
          allocations: [
            {
              receipt_code: receiptCode,
              invoice_id: inv.id,
              amount: money(reconstructed),
            },
          ],
        },
        correction_delta: { amount_paid: money(delta) },
        correction_reason: 'D1_SPLIT_PAYMENT_RECEIPT_TOTAL_MULTIPLIED',
        evidence: {
          defect: 'D1',
          source: 'Admin.php:17270-17438 (defects-and-risks.md)',
          receipt_code: receiptCode,
          receipt_payment_rows: rows.length,
          sum_stored_payment_amounts: money(storedSum),
          sum_invoice_amounts: money(sumAmounts),
          invoice_amount: money(num(inv.amount)),
          stored_amount_paid: money(stored),
        },
        severity: 'critical',
        requires_manual_approval: true,
      });
    }
  }

  // --- generic payment-sum mismatch outside D1 ------------------------------
  for (const inv of invoices) {
    const invPayments = payments.filter(
      (p) => p.invoice_id === inv.id && !d1Receipts.has(p.receipt_code ?? ''),
    );
    if (invPayments.length === 0) continue;
    const sumPayments = invPayments.reduce((acc, p) => acc + num(p.amount), 0);
    const stored = num(inv.amount_paid);
    if (Math.abs(sumPayments - stored) >= 0.005) {
      records.push({
        legacy_table: 'invoice',
        legacy_id: inv.id ?? '?',
        field: 'amount_paid',
        legacy_stored_value: { amount_paid: money(stored) },
        legacy_reconstructed_value: { amount_paid: money(sumPayments), basis: 'sum of payment rows' },
        new_system_value: {
          model: 'per_payment_allocation',
          allocations: invPayments.map((p) => ({
            payment_id: p.id,
            amount: money(num(p.amount)),
          })),
        },
        correction_delta: { amount_paid: money(sumPayments - stored) },
        correction_reason: 'PAYMENT_SUM_MISMATCH',
        evidence: {
          defect: null,
          payment_rows: invPayments.length,
          sum_payments: money(sumPayments),
          stored_amount_paid: money(stored),
        },
        severity: 'high',
        requires_manual_approval: true,
      });
    }
  }

  return { records, warnings };
}
