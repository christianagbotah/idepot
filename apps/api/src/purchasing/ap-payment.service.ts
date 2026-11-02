/**
 * Supplier payments + explicit allocations (Phase 4 AP subledger).
 *
 * Canonical AP equation (ledger/allocation-driven — NEVER a mutable
 * snapshot column, defect C-24):
 *   open(invoice) = invoice total + Σ debit notes − Σ credit notes
 *                   − Σ payment allocations
 *
 * Concurrency: every allocation/adjustment against an invoice takes a
 * transaction-scoped advisory lock on the invoice domain (sorted lock
 * order for multi-invoice payments), then re-reads the authoritative
 * open balance under the lock — the losing caller of two simultaneous
 * payments receives a deterministic "over-allocation" conflict, never a
 * raw 23505 or a silent over-payment.
 *
 * Journal: Dr accounts payable (allocated) + Dr advances to suppliers
 * (unapplied) / Cr the tender control account (a named bank account's
 * own GL account for bank tenders). payment amount = Σ allocations +
 * unapplied — enforced here AND by the DB guard trigger.
 */
import { Injectable } from '@nestjs/common';
import type {
  ApAgingRowDto,
  ApplySupplierAdvance,
  PaySupplier,
  SupplierPaymentDto,
  SupplierStatementDto,
  SupplierStatementLineDto,
} from '@idepot/contracts';
import {
  ConflictError,
  ValidationError,
  formatMoney,
  parseMoney,
  splitPayment,
  type GlPurpose,
  type JournalLineSpec,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
import {
  dateCol,
  lockApInvoiceDomain,
  lockRow,
  pgCode,
  requireRow,
  type PurchasingPrincipal,
} from './purchasing-common.js';

@Injectable()
export class ApPaymentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
    private readonly finance: FinancialConfigurationService,
  ) {}

  async paySupplier(principal: PurchasingPrincipal, dto: PaySupplier): Promise<SupplierPaymentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [dto.supplierId]);

      const amount = parseMoney(dto.amount);
      const allocations = (dto.allocations ?? []).map((a) => ({ ...a, scaled: parseMoney(a.amount) }));

      // ---- serialize every invoice domain in deterministic order ------
      const invoiceIds = [...new Set(allocations.map((a) => a.supplierInvoiceId))].sort();
      for (const id of invoiceIds) await lockApInvoiceDomain(ctx, id);

      // ---- validate allocations against the canonical open AP ---------
      const seen = new Set<string>();
      for (const a of allocations) {
        if (seen.has(a.supplierInvoiceId)) {
          throw new ValidationError('duplicate allocation target — merge amounts onto one allocation');
        }
        seen.add(a.supplierInvoiceId);
        const inv = await lockRow(ctx, 'supplier_invoice', a.supplierInvoiceId);
        if (String(inv.supplier_id) !== dto.supplierId) {
          throw new ValidationError('allocation target invoice belongs to a different supplier');
        }
        if (String(inv.status) !== 'posted' && String(inv.status) !== 'partially_paid' && String(inv.status) !== 'paid') {
          throw new ConflictError(
            `supplier invoice ${a.supplierInvoiceId} is "${String(inv.status)}" — only posted invoices can be paid`,
          );
        }
        const open = await this.openApForInvoice(ctx, a.supplierInvoiceId);
        if (a.scaled > open) {
          throw new ConflictError(
            `over-allocation: invoice ${String(inv.code)} has open AP ${formatMoney(open)}, allocation is ${a.amount}`,
          );
        }
      }
      const { unapplied } = splitPayment(
        amount,
        allocations.map((a) => a.scaled),
      );

      // ---- tender account resolution ------------------------------------
      let tenderAccountId: string;
      if (dto.bankAccountId != null && dto.bankAccountId !== '') {
        const bank = await requireRow<Record<string, unknown>>(ctx, 'bank_account', dto.bankAccountId);
        if (!Boolean(bank.is_active)) throw new ConflictError('bank account is inactive');
        if (dto.method !== 'bank_transfer' && dto.method !== 'other' && dto.method !== 'cheque') {
          throw new ValidationError(`method "${dto.method}" does not take a bank account tender`);
        }
        tenderAccountId = String(bank.gl_account_id);
      } else {
        const TENDER_PURPOSE: Record<string, GlPurpose> = {
          cash: 'cash',
          momo: 'momo_clearing',
          cheque: 'cheque_clearing',
          bank_transfer: 'bank_clearing',
        };
        const purpose: GlPurpose | undefined = TENDER_PURPOSE[dto.method];
        if (purpose == null) {
          throw new ValidationError('method "other" requires a bankAccountId (which GL account did it leave?)');
        }
        const accounts = await this.finance.resolveGlAccounts(ctx, [purpose]);
        tenderAccountId = accounts.get(purpose)!;
      }

      // ---- period lock + numbering + insert ------------------------------
      await this.finance.assertPeriodOpen(ctx, dto.businessDate);
      const code = await this.sequences.allocate(ctx, { docType: 'SUPPLIER_PAYMENT' });
      let paymentId: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO supplier_payment
             (tenant_id, code, client_doc_id, supplier_id, business_date, amount, method,
              reference, bank_account_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            ctx.tenantId, code, dto.clientDocId ?? null, dto.supplierId, dto.businessDate,
            formatMoney(amount), dto.method, dto.reference ?? null,
            dto.bankAccountId ?? null, dto.notes ?? null, principal.userId,
          ],
        );
        paymentId = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError(
            dto.clientDocId != null
              ? `duplicate supplier payment (client doc ${dto.clientDocId} already applied)`
              : `supplier payment code "${code}" already exists`,
          );
        }
        throw err;
      }

      let allocatedTotal = 0n;
      for (const a of allocations) {
        await ctx.query(
          `INSERT INTO supplier_payment_allocation (tenant_id, payment_id, supplier_invoice_id, amount, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, paymentId, a.supplierInvoiceId, a.amount, principal.userId],
        );
        allocatedTotal += a.scaled;
        await ctx.query(
          `UPDATE supplier_invoice SET status = 'paid'
           WHERE id = $1 AND tenant_id = $2
             AND $3 >= (
               total + COALESCE((SELECT SUM(amount) FROM supplier_adjustment sa
                   WHERE sa.supplier_invoice_id = supplier_invoice.id AND sa.kind = 'debit_note'), 0)
               - COALESCE((SELECT SUM(amount) FROM supplier_adjustment sa
                   WHERE sa.supplier_invoice_id = supplier_invoice.id AND sa.kind = 'credit_note'), 0)
               - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                   JOIN supplier_payment sp ON sp.id = spa.payment_id
                   WHERE spa.supplier_invoice_id = supplier_invoice.id), 0))`,
          [a.supplierInvoiceId, ctx.tenantId, a.amount],
        );
        await ctx.query(
          `UPDATE supplier_invoice SET status = 'partially_paid'
           WHERE id = $1 AND tenant_id = $2 AND status = 'posted'`,
          [a.supplierInvoiceId, ctx.tenantId],
        );
      }

      // ---- GL journal -----------------------------------------------------
      const purposes: GlPurpose[] = ['accounts_payable', 'supplier_advance'];
      const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
      const journalLines: JournalLineSpec[] = [];
      if (allocatedTotal > 0n) {
        journalLines.push({
          accountId: accounts.get('accounts_payable')!,
          debit: formatMoney(allocatedTotal),
          memo: `supplier payment ${code} — AP settled`,
        });
      }
      if (unapplied > 0n) {
        journalLines.push({
          accountId: accounts.get('supplier_advance')!,
          debit: formatMoney(unapplied),
          memo: `supplier payment ${code} — advance (unapplied)`,
        });
      }
      journalLines.push({
        accountId: tenderAccountId,
        credit: formatMoney(amount),
        memo: `supplier payment ${code} tender ${dto.method}`,
      });
      await this.finance.postJournal(ctx, {
        sourceKind: 'supplier_payment',
        sourceId: paymentId,
        event: 'supplier_payment_posted',
        description: `Supplier payment ${code}`,
        businessDate: dto.businessDate,
        reference: code,
        createdBy: principal.userId,
        lines: journalLines,
      });

      // TEST ONLY: deterministic failure injection at two depths
      if (dto.simulateFailure != null) {
        throw new Error(`simulated failure after ${dto.simulateFailure} (atomicity test)`);
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier_payment.posted',
        entityType: 'supplier_payment',
        entityId: paymentId,
        details: {
          code, supplierId: dto.supplierId, amount: formatMoney(amount),
          allocated: formatMoney(allocatedTotal), unapplied: formatMoney(unapplied),
          method: dto.method, invoiceCount: allocations.length,
        },
      });
      await ctx.outbox.emit('SupplierPaymentPosted', {
        supplierPaymentId: paymentId, code, supplierId: dto.supplierId,
        amount: formatMoney(amount), unapplied: formatMoney(unapplied),
      });
      return this.getPaymentWithinCtx(ctx, paymentId);
    });
  }

  /** Applies the unapplied remainder of an existing payment to invoices. */
  async applyAdvance(
    principal: PurchasingPrincipal,
    dto: ApplySupplierAdvance,
  ): Promise<SupplierPaymentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const payment = await lockRow(ctx, 'supplier_payment', dto.paymentId);
      const invoiceIds = [...new Set(dto.allocations.map((a) => a.supplierInvoiceId))].sort();
      for (const id of invoiceIds) await lockApInvoiceDomain(ctx, id);

      const existing = await ctx.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM supplier_payment_allocation
         WHERE payment_id = $1`,
        [dto.paymentId],
      );
      let allocated = parseMoney(existing.rows[0]!.total);
      const amount = parseMoney(String(payment.amount));
      for (const a of dto.allocations) {
        const scaled = parseMoney(a.amount);
        const inv = await lockRow(ctx, 'supplier_invoice', a.supplierInvoiceId);
        if (String(inv.supplier_id) !== String(payment.supplier_id)) {
          throw new ValidationError('allocation target invoice belongs to a different supplier');
        }
        const open = await this.openApForInvoice(ctx, a.supplierInvoiceId);
        if (scaled > open) {
          throw new ConflictError(
            `over-allocation: invoice ${String(inv.code)} has open AP ${formatMoney(open)}, allocation is ${a.amount}`,
          );
        }
        if (allocated + scaled > amount) {
          throw new ConflictError(
            `advance application exceeds the payment amount (${formatMoney(allocated + scaled)} > ${formatMoney(amount)})`,
          );
        }
        await ctx.query(
          `INSERT INTO supplier_payment_allocation (tenant_id, payment_id, supplier_invoice_id, amount, created_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [ctx.tenantId, dto.paymentId, a.supplierInvoiceId, a.amount, principal.userId],
        );
        allocated += scaled;
      }

      // GL: move the newly applied share from the advance to AP
      const appliedNow = dto.allocations.reduce((s, a) => s + parseMoney(a.amount), 0n);
      const purposes: GlPurpose[] = ['accounts_payable', 'supplier_advance'];
      const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
      await this.finance.postJournal(ctx, {
        sourceKind: 'supplier_payment',
        sourceId: dto.paymentId,
        event: 'advance_applied',
        description: `Advance application on payment ${String(payment.code)}`,
        businessDate: dateCol(payment.business_date),
        reference: String(payment.code),
        createdBy: principal.userId,
        lines: [
          { accountId: accounts.get('accounts_payable')!, debit: formatMoney(appliedNow), memo: `advance applied — AP settled` },
          { accountId: accounts.get('supplier_advance')!, credit: formatMoney(appliedNow), memo: `advance consumed` },
        ],
      });
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier_payment.advance_applied',
        entityType: 'supplier_payment',
        entityId: dto.paymentId,
        details: { applied: formatMoney(appliedNow), invoiceCount: dto.allocations.length },
      });
      return this.getPaymentWithinCtx(ctx, dto.paymentId);
    });
  }

  /* -------------------------------- reads -------------------------------- */

  async getPayment(tenantId: string, paymentId: string): Promise<SupplierPaymentDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getPaymentWithinCtx(ctx, paymentId));
  }

  async listPayments(
    tenantId: string,
    filter: { supplierId?: string; limit?: number } = {},
  ): Promise<SupplierPaymentDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'sp.tenant_id = $1';
      if (filter.supplierId) {
        params.push(filter.supplierId);
        where += ` AND sp.supplier_id = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT sp.id FROM supplier_payment sp WHERE ${where}
         ORDER BY sp.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: SupplierPaymentDto[] = [];
      for (const r of res.rows) out.push(await this.getPaymentWithinCtx(ctx, String(r.id)));
      return out;
    });
  }

  async getPaymentWithinCtx(ctx: UowContext, paymentId: string): Promise<SupplierPaymentDto> {
    const p = await requireRow<Record<string, unknown>>(ctx, 'supplier_payment', paymentId);
    const supplier = await ctx.query<{ name: string }>(
      `SELECT name FROM supplier WHERE id = $1`, [String(p.supplier_id)],
    );
    const allocations = await ctx.query<Record<string, unknown>>(
      `SELECT spa.*, si.code AS invoice_code FROM supplier_payment_allocation spa
       JOIN supplier_invoice si ON si.id = spa.supplier_invoice_id
       WHERE spa.payment_id = $1 ORDER BY spa.created_at`,
      [paymentId],
    );
    const allocated = allocations.rows.reduce((s, a) => s + parseMoney(String(a.amount)), 0n);
    return {
      id: String(p.id),
      code: String(p.code),
      supplierId: String(p.supplier_id),
      supplierName: supplier.rows[0]?.name ?? null,
      businessDate: dateCol(p.business_date),
      amount: String(p.amount),
      method: String(p.method),
      reference: p.reference ? String(p.reference) : null,
      bankAccountId: p.bank_account_id ? String(p.bank_account_id) : null,
      amountAllocated: formatMoney(allocated),
      amountUnapplied: formatMoney(parseMoney(String(p.amount)) - allocated),
      createdAt: new Date(p.created_at as string).toISOString(),
      allocations: allocations.rows.map((a) => ({
        supplierInvoiceId: String(a.supplier_invoice_id),
        supplierInvoiceCode: a.invoice_code ? String(a.invoice_code) : null,
        amount: String(a.amount),
      })),
    };
  }

  /** Canonical open AP for one invoice (invoice + debit − credit − allocated). */
  async openApForInvoice(ctx: UowContext, invoiceId: string): Promise<bigint> {
    const res = await ctx.query<{ total: string; debit_total: string; credit_total: string; allocated: string }>(
      `SELECT
         si.total::text AS total,
         COALESCE((SELECT SUM(amount) FROM supplier_adjustment
            WHERE supplier_invoice_id = si.id AND kind = 'debit_note'), 0)::text AS debit_total,
         COALESCE((SELECT SUM(amount) FROM supplier_adjustment
            WHERE supplier_invoice_id = si.id AND kind = 'credit_note'), 0)::text AS credit_total,
         COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
            JOIN supplier_payment sp ON sp.id = spa.payment_id
            WHERE spa.supplier_invoice_id = si.id), 0)::text AS allocated
       FROM supplier_invoice si WHERE si.id = $1`,
      [invoiceId],
    );
    const r = res.rows[0];
    if (!r) throw new ConflictError(`supplier invoice ${invoiceId} not found`);
    return parseMoney(r.total) + parseMoney(r.debit_total) - parseMoney(r.credit_total) - parseMoney(r.allocated);
  }

  /** AP aging buckets by supplier (current / 1-30 / 31-60 / 61-90 / 90+). */
  async apAging(tenantId: string, asOf: string): Promise<ApAgingRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{
        supplier_id: string; supplier_name: string | null; bucket: string; open: string;
      }>(
        `WITH open_items AS (
           SELECT si.supplier_id,
                  CASE
                    WHEN ($2::date - COALESCE(si.due_date, si.business_date)) <= 0 THEN 'current'
                    WHEN ($2::date - COALESCE(si.due_date, si.business_date)) <= 30 THEN '1_30'
                    WHEN ($2::date - COALESCE(si.due_date, si.business_date)) <= 60 THEN '31_60'
                    WHEN ($2::date - COALESCE(si.due_date, si.business_date)) <= 90 THEN '61_90'
                    ELSE '90_plus'
                  END AS bucket,
                  (si.total
                   + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                       WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
                   - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                       WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0)
                   - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                       JOIN supplier_payment sp ON sp.id = spa.payment_id
                       WHERE spa.supplier_invoice_id = si.id), 0)) AS open
           FROM supplier_invoice si
           WHERE si.tenant_id = $1 AND si.status IN ('posted','partially_paid','paid')
             AND si.business_date <= $2::date
         )
         SELECT o.supplier_id, s.name AS supplier_name, o.bucket, SUM(o.open)::text AS open
         FROM open_items o JOIN supplier s ON s.id = o.supplier_id
         GROUP BY o.supplier_id, s.name, o.bucket
         ORDER BY s.name`,
        [ctx.tenantId, asOf],
      );
      const bySupplier = new Map<string, ApAgingRowDto>();
      for (const r of res.rows) {
        let row = bySupplier.get(r.supplier_id);
        if (!row) {
          row = {
            supplierId: r.supplier_id,
            supplierName: r.supplier_name,
            current: '0', bucket_1_30: '0', bucket_31_60: '0', bucket_61_90: '0', bucket_90_plus: '0',
            total: '0',
          };
          bySupplier.set(r.supplier_id, row);
        }
        const open = parseMoney(r.open);
        const key = r.bucket as keyof ApAgingRowDto;
        row[key] = formatMoney(parseMoney(String(row[key])) + open);
        row.total = formatMoney(parseMoney(row.total) + open);
      }
      return [...bySupplier.values()];
    });
  }

  /** Supplier statement: chronological AP movements with a running balance,
   *  regenerated from documents (true date filtering, defect A4-class). */
  async supplierStatement(tenantId: string, supplierId: string, asOf: string): Promise<SupplierStatementDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [supplierId]);
      const supplier = await requireRow<Record<string, unknown>>(ctx, 'supplier', supplierId);
      const events = await ctx.query<{
        business_date: string; code: string; doc_type: string; debit: string; credit: string; detail: string | null;
      }>(
        `SELECT si.business_date, si.code, 'supplier_invoice' AS doc_type,
                (si.total + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                    WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
                 - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                    WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0))::text AS debit,
                '0' AS credit, si.supplier_invoice_number AS detail
         FROM supplier_invoice si
         WHERE si.tenant_id = $1 AND si.supplier_id = $2 AND si.status <> 'cancelled' AND si.business_date <= $3::date
         UNION ALL
         SELECT sa.business_date, sa.code, 'supplier_adjustment' AS doc_type,
                CASE WHEN sa.kind = 'debit_note' THEN sa.amount ELSE 0 END::text AS debit,
                CASE WHEN sa.kind = 'credit_note' THEN sa.amount ELSE 0 END::text AS credit,
                sa.reason AS detail
         FROM supplier_adjustment sa
         WHERE sa.tenant_id = $1 AND sa.supplier_id = $2 AND sa.business_date <= $3::date
         UNION ALL
         SELECT sp.business_date, sp.code, 'supplier_payment' AS doc_type,
                0::text AS debit,
                COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                  WHERE spa.payment_id = sp.id AND spa.supplier_invoice_id IN (
                    SELECT id FROM supplier_invoice WHERE supplier_id = $2)), 0)::text AS credit,
                sp.method AS detail
         FROM supplier_payment sp
         WHERE sp.tenant_id = $1 AND sp.supplier_id = $2 AND sp.business_date <= $3::date
         ORDER BY business_date, code`,
        [ctx.tenantId, supplierId, asOf],
      );
      let running = 0n;
      const lines: SupplierStatementLineDto[] = events.rows.map((e) => {
        running += parseMoney(e.debit) - parseMoney(e.credit);
        return {
          businessDate: dateCol(e.business_date),
          documentCode: String(e.code),
          documentType: String(e.doc_type),
          detail: e.detail ?? null,
          debit: String(e.debit),
          credit: String(e.credit),
          runningOpen: formatMoney(running),
        };
      });
      return {
        supplierId,
        supplierName: supplier.name ? String(supplier.name) : null,
        asOf,
        openingBalance: '0',
        lines,
        closingBalance: formatMoney(running),
      };
    });
  }

  /** Total AP by supplier (open items only). */
  async apBalances(
    tenantId: string,
  ): Promise<Array<{ supplierId: string; supplierName: string | null; open: string }>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ supplier_id: string; supplier_name: string | null; open: string }>(
        `SELECT si.supplier_id, s.name AS supplier_name, SUM(
           si.total
           + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
           - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0)
           - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
               JOIN supplier_payment sp ON sp.id = spa.payment_id
               WHERE spa.supplier_invoice_id = si.id), 0))::text AS open
         FROM supplier_invoice si JOIN supplier s ON s.id = si.supplier_id
         WHERE si.tenant_id = $1 AND si.status IN ('posted','partially_paid','paid')
         GROUP BY si.supplier_id, s.name
         HAVING SUM(
           si.total
           + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
           - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
               WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0)
           - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
               JOIN supplier_payment sp ON sp.id = spa.payment_id
               WHERE spa.supplier_invoice_id = si.id), 0)) <> 0
         ORDER BY s.name`,
        [ctx.tenantId],
      );
      return res.rows.map((r) => ({
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        open: r.open,
      }));
    });
  }
}
