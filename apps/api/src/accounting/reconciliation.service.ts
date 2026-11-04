/**
 * AR/AP subledger ↔ control-account reconciliation (Phase 4).
 *
 * Surfaces differences EXPLICITLY — never hides a mismatch with an
 * automatic plug (defect C-31: update_ables-style rebasing is
 * structurally impossible; the control balance is read from the ledger,
 * the subledger from its documents).
 *
 * Review round 2 corrections:
 *
 * 1. SIGN NORMALIZATION (blocker 2): `controlBalance` reads the raw GL
 *    movement (debits − credits) and then NORMALIZES it by the control
 *    account's `normal_balance` — debit-normal accounts keep debits−credits,
 *    credit-normal accounts present credits−debits. A normal AP liability of
 *    100 therefore reconciles against a +100 subledger instead of −100.
 *    The normalization is per-account configuration (gl_account.normal_balance),
 *    linear (no clamping) and sign-preserving for REVERSING balances: an
 *    overpaid supplier (AP debit balance) reconciles against a negative
 *    subledger exactly as a normal creditor does.
 *
 * 2. POSTED-ONLY SCOPE (blocker 2): the AP subledger counts ONLY
 *    authoritatively posted invoices (posted / partially_paid / paid) and
 *    their correction/payment evidence — a pending_match / matched invoice
 *    that has not posted its journal must not appear on either side.
 *    Standalone debit/credit notes (no target invoice) are their own
 *    authoritative posted documents and are included symmetrically.
 *
 * 3. AS-OF SCOPING (blocker 4): every document and allocation affects the
 *    report only from its own authoritative business date — the invoice from
 *    its business_date, an adjustment from its own business_date, a payment
 *    allocation from the payment's business_date, an advance application
 *    from the application document's own business_date, a credit
 *    application from its posting date (created_at — the date the
 *    credit_applied journal carries). Future events never leak into
 *    historical balances, and the COGS check compares GL activity and
 *    stock-ledger movements over the SAME as-of window.
 *
 * Review round 3 corrections:
 *
 * 4. REVERSAL-AWARE, AS-OF-CORRECT AR (blocker 2): the subledger uses
 *    the append-only invoice_reversal record as authoritative correction
 *    evidence. BEFORE the reversal's effective date (the reversal
 *    journal's business_date) the original invoice stays in receivables
 *    exactly as it was; FROM the reversal date onward the reversal
 *    cancels the invoice's outstanding exposure — precisely the amount
 *    the reversal journal removed from the AR control (Σ invoice total
 *    minus what had settled by the reversal date), so an unpaid reversed
 *    invoice leaves the subledger on the reversal date and a part-paid
 *    one leaves the remainder — WITHOUT fake payment rows, and reports
 *    dated BEFORE the reversal still show the original exposure.
 *
 * 5. ADVANCE APPLICATIONS (blocker 1): AP and supplier-advance checks
 *    count each application from the application document's own
 *    business_date (the journal's date) — an advance paid Oct 1 and
 *    applied Oct 21 reduces AP on Oct 21, never retroactively.
 */
import { Injectable } from '@nestjs/common';
import type { ArApReconciliationDto, ReconciliationCheckDto } from '@idepot/contracts';
import { formatMoney, parseMoney } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

@Injectable()
export class ReconciliationService {
  constructor(private readonly uow: UnitOfWork) {}

  async arApReconciliation(tenantId: string, asOf: string): Promise<ArApReconciliationDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const checks: ReconciliationCheckDto[] = [];
      checks.push(await this.arControlCheck(ctx, asOf));
      checks.push(await this.apControlCheck(ctx, asOf));
      checks.push(await this.customerDepositControlCheck(ctx, asOf));
      checks.push(await this.supplierAdvanceControlCheck(ctx, asOf));
      checks.push(await this.cogsInventoryCheck(ctx, asOf));
      return { asOf, checks };
    });
  }

  /** AR: open receivables (posted invoice totals − allocations received by
   *  the as-of date − credit applications posted by the as-of date −
   *  REVERSAL cancellations effective by the as-of date) vs the normalized
   *  accounts_receivable control balance.
   *
   *  Reversal-aware and as-of correct (review round 3, blocker 2): the
   *  append-only invoice_reversal record is the authoritative correction
   *  evidence. Before the reversal's effective date the original invoice
   *  remains in receivables; from that date onward the reversal cancels
   *  the invoice's outstanding exposure (total − what had settled by the
   *  reversal date) — exactly what the reversal journal removed from the
   *  AR control. No fake payment rows are inserted; original invoice,
   *  allocation, credit and reversal evidence all stay in place. */
  private async arControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const ar = await this.controlBalance(ctx, 'accounts_receivable', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         i.total
         - COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
             JOIN payment p ON p.id = pa.payment_id
             WHERE pa.invoice_id = i.id AND p.business_date <= $2::date), 0)
         - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
             WHERE ca.invoice_id = i.id AND ca.created_at::date <= $2::date), 0)
         - CASE WHEN rev.effective_date IS NOT NULL AND rev.effective_date <= $2::date
             -- the reversal cancels the OUTSTANDING exposure as of its
             -- effective date — the exact amount its journal removed
             -- from the AR control (never more, never less)
             THEN GREATEST(
               i.total
               - COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
                   JOIN payment p ON p.id = pa.payment_id
                   WHERE pa.invoice_id = i.id AND p.business_date <= rev.effective_date), 0)
               - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                   WHERE ca.invoice_id = i.id AND ca.created_at::date <= rev.effective_date), 0),
               0)
             ELSE 0 END
       ), 0)::text AS total
       FROM invoice i
       LEFT JOIN LATERAL (
         SELECT COALESCE(re.business_date, r.created_at::date) AS effective_date
         FROM invoice_reversal r
         LEFT JOIN journal_entry re ON re.id = r.journal_entry_id
         WHERE r.tenant_id = i.tenant_id AND r.invoice_id = i.id
       ) rev ON true
       WHERE i.tenant_id = $1 AND i.status IN ('posted','reversed') AND i.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'accounts_receivable',
      'AR subledger (open invoices − allocations − credit applications − reversal cancellations, as-of dated)',
      ar,
      subledger,
      'reversed invoices leave the subledger only from the reversal journal\u2019s effective date — historical reports dated before the reversal still show the original exposure; credit applications count from their own posting date, never the deposit\u2019s',
    );
  }

  /** AP: open payables (POSTED supplier invoice totals + as-of debit notes
   *  − as-of credit notes − as-of allocations, plus standalone notes) vs
   *  the normalized accounts_payable control balance. */
  private async apControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const ap = await this.controlBalance(ctx, 'accounts_payable', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(x.open), 0)::text AS total FROM (
         -- authoritatively POSTED invoices only: a pending_match / matched
         -- invoice has not posted its AP journal and must not appear here
         SELECT (
           si.total
           + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'
                 AND sa.business_date <= $2::date), 0)
           - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'
                 AND sa.business_date <= $2::date), 0)
           - COALESCE((SELECT SUM(x.amount) FROM (
             SELECT spa.amount FROM supplier_payment_allocation spa
               JOIN supplier_payment sp ON sp.id = spa.payment_id
               WHERE spa.supplier_invoice_id = si.id AND sp.business_date <= $2::date
             UNION ALL
             SELECT saal.amount FROM supplier_advance_application_line saal
               JOIN supplier_advance_application saa ON saa.id = saal.application_id
               WHERE saal.supplier_invoice_id = si.id AND saa.business_date <= $2::date
           ) x), 0)
         ) AS open
         FROM supplier_invoice si
         WHERE si.tenant_id = $1 AND si.status IN ('posted','partially_paid','paid')
           AND si.business_date <= $2::date
         UNION ALL
         -- standalone notes are their own posted AP documents
         SELECT CASE WHEN sa.kind = 'debit_note' THEN sa.amount ELSE -sa.amount END
         FROM supplier_adjustment sa
         WHERE sa.tenant_id = $1 AND sa.supplier_invoice_id IS NULL
           AND sa.business_date <= $2::date
       ) x`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'accounts_payable',
      'AP subledger (posted invoices + debit notes − credit notes − allocations, as-of dated)',
      ap,
      subledger,
      'only POSTED invoices (posted / partially_paid / paid) participate — unposted pending-match documents have no AP journal; the control is normalized by the account\u2019s credit normal balance',
    );
  }

  /** Customer deposits: liability documents minus credit applications POSTED
   *  by the as-of date (the application's own posting date — never the
   *  deposit's, never a future application's) vs the normalized
   *  customer_deposit_liability control balance. */
  private async customerDepositControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const control = await this.controlBalance(ctx, 'customer_deposit_liability', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         cd.amount
         - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
             WHERE ca.deposit_id = cd.id AND ca.created_at::date <= $2::date), 0)
       ), 0)::text AS total
       FROM customer_deposit cd
       WHERE cd.tenant_id = $1 AND cd.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'customer_deposit_liability',
      'Customer deposits (documents − credit applications, as-of dated)',
      control,
      subledger,
      'credit applications count from their own posting date (the credit_applied journal\u2019s business date) — a future application cannot reduce a historical deposit balance',
    );
  }

  /** Supplier advances: unapplied payment remainders as of the report date.
   *  Payment-time allocations take effect on the PAYMENT's business date;
   *  each advance APPLICATION (review round 3, blocker 1) reduces the
   *  advance from the application document's OWN business date — the date
   *  its advance_applied journal carries — so an advance paid Oct 1 and
   *  applied Oct 21/25 shows full, 60 and 40 on Oct 5/22/26. */
  private async supplierAdvanceControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const control = await this.controlBalance(ctx, 'supplier_advance', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         sp.amount
         - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
             WHERE spa.payment_id = sp.id), 0)
         - COALESCE((SELECT SUM(saal.amount) FROM supplier_advance_application_line saal
             JOIN supplier_advance_application saa ON saa.id = saal.application_id
             WHERE saa.payment_id = sp.id AND saa.business_date <= $2::date), 0)
       ), 0)::text AS total
       FROM supplier_payment sp
       WHERE sp.tenant_id = $1 AND sp.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'supplier_advance',
      'Supplier advances (payments − payment-time allocations − applications from their own dates, as-of dated)',
      control,
      subledger,
      'advance applications take effect on the application document\u2019s own business date — the same date the advance_applied journal carries',
    );
  }

  /** COGS ↔ inventory: Σ sale-issue cost_value on the stock ledger as of the
   *  report date (reversal movements subtracted) must equal the COGS posted
   *  through the GL up to the same date. */
  private async cogsInventoryCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const cogsControl = await this.controlBalance(ctx, 'cogs', asOf, '1970-01-01');
    const ledger = await ctx.query<{ total: string }>(
      `SELECT (
         COALESCE(SUM(cost_value) FILTER (
           WHERE movement_type = 'issue' AND source_document_type = 'invoice'
             AND occurred_at::date <= $2::date), 0)
         - COALESCE(SUM(cost_value) FILTER (
           WHERE movement_type = 'reversal' AND source_document_type = 'invoice_reversal'
             AND occurred_at::date <= $2::date), 0)
       )::text AS total
       FROM stock_movement
       WHERE tenant_id = $1`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(ledger.rows[0]!.total);
    return this.check(
      'cogs_vs_stock_ledger',
      'Σ sale-issue cost_value on the stock ledger (as-of dated, reversals subtracted)',
      cogsControl,
      subledger,
      'both sides cut at the same as-of date; reversed sales subtract their (verbatim-cost) reversal movement and the compensating reversal journal symmetrically',
    );
  }

  /**
   * GL control balance NORMALIZED to the subledger's sign convention by the
   * account's configured normal balance (gl_account.normal_balance):
   *   debit-normal  → debits − credits
   *   credit-normal → credits − debits
   * The formula is linear (never clamped), so a REVERSING balance (e.g. an
   * overpaid supplier whose AP control is debit-heavy) normalizes to a
   * negative figure and still reconciles exactly against the same signed
   * subledger equation.
   */
  private async controlBalance(ctx: UowContext, purpose: string, asOf: string, from = '1970-01-01'): Promise<bigint> {
    const res = await ctx.query<{ debit: string; credit: string; normal_balance: string }>(
      `SELECT COALESCE(SUM(l.debit), 0)::text AS debit, COALESCE(SUM(l.credit), 0)::text AS credit,
              MAX(a.normal_balance) AS normal_balance
       FROM journal_line l
       JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       JOIN gl_account a ON a.id = l.account_id AND a.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND m.purpose = $2
         AND COALESCE(e.business_date, e.occurred_at::date) >= $3::date
         AND COALESCE(e.business_date, e.occurred_at::date) <= $4::date
       GROUP BY m.purpose`,
      [ctx.tenantId, purpose, from, asOf],
    );
    const row = res.rows[0];
    if (!row) return 0n;
    const debit = parseMoney(row.debit);
    const credit = parseMoney(row.credit);
    return row.normal_balance === 'credit' ? credit - debit : debit - credit;
  }

  private check(
    name: string,
    subledgerDescription: string,
    control: bigint,
    subledger: bigint,
    detail: string,
  ): ReconciliationCheckDto {
    const difference = control - subledger;
    return {
      check: name,
      controlBalance: formatMoney(control),
      subledgerBalance: formatMoney(subledger),
      difference: formatMoney(difference),
      passed: difference === 0n,
      detail: `${subledgerDescription}${detail ? ` — ${detail}` : ''}`,
    };
  }
}
