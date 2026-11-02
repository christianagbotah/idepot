/**
 * AR/AP subledger ↔ control-account reconciliation (Phase 4).
 *
 * Surfaces differences EXPLICITLY — never hides a mismatch with an
 * automatic plug (defect C-31: update_ables-style rebasing is
 * structurally impossible; the control balance is read from the ledger,
 * the subledger from its documents).
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

  /** AR: open receivables (invoice totals − allocations − credits) vs the
   *  accounts_receivable control balance. */
  private async arControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const ar = await this.controlBalance(ctx, 'accounts_receivable', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         i.total
         - COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
             JOIN payment p ON p.id = pa.payment_id
             WHERE pa.invoice_id = i.id AND p.status <> 'cancelled' AND p.business_date <= $2::date), 0)
         - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
             JOIN customer_deposit cd ON cd.id = ca.deposit_id
             WHERE ca.invoice_id = i.id AND cd.business_date <= $2::date), 0)
       ), 0)::text AS total
       FROM invoice i
       WHERE i.tenant_id = $1 AND i.status IN ('posted','reversed') AND i.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'accounts_receivable',
      'AR subledger (open invoices − allocations − credit applications)',
      ar,
      subledger,
      'reversed invoices carry a compensating reversal journal, so both sides include them symmetrically',
    );
  }

  /** AP: open payables (supplier invoice totals + debit notes − credit
   *  notes − allocations) vs the accounts_payable control balance. */
  private async apControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const ap = await this.controlBalance(ctx, 'accounts_payable', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         si.total
         + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
             WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note' AND sa.business_date <= $2::date), 0)
         - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
             WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note' AND sa.business_date <= $2::date), 0)
         - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
             JOIN supplier_payment sp ON sp.id = spa.payment_id
             WHERE spa.supplier_invoice_id = si.id AND sp.status <> 'cancelled' AND sp.business_date <= $2::date), 0)
       ), 0)::text AS total
       FROM supplier_invoice si
       WHERE si.tenant_id = $1 AND si.status <> 'cancelled' AND si.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'accounts_payable',
      'AP subledger (supplier invoices + debit notes − credit notes − allocations)',
      ap,
      subledger,
      '',
    );
  }

  /** Customer deposits: liability documents minus consumed credits vs the
   *  customer_deposit_liability control balance. */
  private async customerDepositControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const control = await this.controlBalance(ctx, 'customer_deposit_liability', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         cd.amount
         - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
             WHERE ca.deposit_id = cd.id), 0)
       ), 0)::text AS total
       FROM customer_deposit cd
       WHERE cd.tenant_id = $1 AND cd.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'customer_deposit_liability',
      'Customer deposits (documents − credit applications)',
      control,
      subledger,
      '',
    );
  }

  /** Supplier advances: unapplied payment remainders vs the
   *  supplier_advance control balance. */
  private async supplierAdvanceControlCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const control = await this.controlBalance(ctx, 'supplier_advance', asOf);
    const sub = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         sp.amount - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
             WHERE spa.payment_id = sp.id), 0)
       ), 0)::text AS total
       FROM supplier_payment sp
       WHERE sp.tenant_id = $1 AND sp.business_date <= $2::date`,
      [ctx.tenantId, asOf],
    );
    const subledger = parseMoney(sub.rows[0]!.total);
    return this.check(
      'supplier_advance',
      'Supplier advances (payments − allocations)',
      control,
      subledger,
      '',
    );
  }

  /** COGS ↔ inventory: Σ cost_of_sales movements on the stock ledger must
   *  equal the COGS posted through the GL in the window. */
  private async cogsInventoryCheck(ctx: UowContext, asOf: string): Promise<ReconciliationCheckDto> {
    const cogsControl = await this.controlBalance(ctx, 'cogs', asOf, '1970-01-01');
    const ledger = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(cost_value), 0)::text AS total FROM stock_movement
       WHERE tenant_id = $1 AND movement_type = 'issue'
         AND source_document_type = 'invoice'`,
      [ctx.tenantId],
    );
    const subledger = parseMoney(ledger.rows[0]!.total);
    return this.check(
      'cogs_vs_stock_ledger',
      'Σ sale-issue cost_value on the stock ledger',
      cogsControl,
      subledger,
      'reversed sales post a reversal movement and a compensating journal symmetrically',
    );
  }

  private async controlBalance(ctx: UowContext, purpose: string, asOf: string, from = '1970-01-01'): Promise<bigint> {
    const res = await ctx.query<{ debit: string; credit: string }>(
      `SELECT COALESCE(SUM(l.debit), 0)::text AS debit, COALESCE(SUM(l.credit), 0)::text AS credit
       FROM journal_line l
       JOIN journal_entry e ON e.id = l.entry_id AND e.tenant_id = l.tenant_id
       JOIN gl_mapping m ON m.account_id = l.account_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND m.purpose = $2
         AND COALESCE(e.business_date, e.occurred_at::date) >= $3::date
         AND COALESCE(e.business_date, e.occurred_at::date) <= $4::date`,
      [ctx.tenantId, purpose, from, asOf],
    );
    return parseMoney(res.rows[0]!.debit) - parseMoney(res.rows[0]!.credit);
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
