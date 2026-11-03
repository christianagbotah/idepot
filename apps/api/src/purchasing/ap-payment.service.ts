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
  refreshInvoiceStatus,
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
        // chronology guard (review round 2, blocker 4): an allocation must
        // not predate the invoice document date — a payment booked before
        // its invoice would distort every historical AP window
        if (dto.businessDate < dateCol(inv.business_date)) {
          throw new ValidationError(
            `payment business date ${dto.businessDate} predates invoice ${String(inv.code)} document date ${dateCol(inv.business_date)} — settle it with an advance and apply it on/after the invoice date`,
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
      }
      // status recomputed from the canonical AP equation (paid ⟺ open ≤ 0;
      // partially_paid otherwise) — regression: the previous inline UPDATE
      // marked any allocation greater than HALF the open balance as 'paid'
      for (const id of invoiceIds) await refreshInvoiceStatus(ctx, id);

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
        // chronology guard: an advance application books on the payment's
        // business date — that date must not predate the invoice either
        if (dateCol(payment.business_date) < dateCol(inv.business_date)) {
          throw new ValidationError(
            `payment ${String(payment.code)} is dated ${dateCol(payment.business_date)}, before invoice ${String(inv.code)} document date ${dateCol(inv.business_date)} — the application would predate the invoice`,
          );
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
      // the invoice's status must reflect the newly applied share (fully
      // settled via advance → paid; partly → partially_paid)
      for (const id of invoiceIds) await refreshInvoiceStatus(ctx, id);

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

  /** AP aging buckets by supplier (current / 1-30 / 31-60 / 61-90 / 90+).
   *  As-of correct (review round 2, blocker 4): only POSTED invoices
   *  participate, and every adjustment / allocation affects a bucket only
   *  from its own authoritative business date — an allocation dated after
   *  the as-of date never reduces a historical bucket. */
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
                       WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'
                         AND sa.business_date <= $2::date), 0)
                   - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                       WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'
                         AND sa.business_date <= $2::date), 0)
                   - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                       JOIN supplier_payment sp ON sp.id = spa.payment_id
                       WHERE spa.supplier_invoice_id = si.id AND sp.business_date <= $2::date), 0)) AS open
           FROM supplier_invoice si
           WHERE si.tenant_id = $1 AND si.status IN ('posted','partially_paid','paid')
             AND si.business_date <= $2::date
           UNION ALL
           SELECT sa.supplier_id, 'current',
                  CASE WHEN sa.kind = 'debit_note' THEN sa.amount ELSE -sa.amount END
           FROM supplier_adjustment sa
           WHERE sa.tenant_id = $1 AND sa.supplier_invoice_id IS NULL AND sa.business_date <= $2::date
         )
         SELECT o.supplier_id, s.name AS supplier_name, o.bucket, SUM(o.open)::text AS open
         FROM open_items o JOIN supplier s ON s.id = o.supplier_id
         GROUP BY o.supplier_id, s.name, o.bucket
         ORDER BY s.name`,
        [ctx.tenantId, asOf],
      );
      const bySupplier = new Map<string, ApAgingRowDto>();
      // bucket → DTO field (defect found by the as-of timeline tests: the
      // previous code used the raw bucket value as the DTO key, so ANY
      // invoice 1–90 days past due crashed the report with a
      // "money \"undefined\"" validation error)
      const BUCKET_FIELD: Record<string, keyof ApAgingRowDto> = {
        current: 'current',
        '1_30': 'bucket_1_30',
        '31_60': 'bucket_31_60',
        '61_90': 'bucket_61_90',
        '90_plus': 'bucket_90_plus',
      };
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
        const field = BUCKET_FIELD[r.bucket];
        if (field == null) continue; // unknown bucket label — never crash the report
        row[field] = formatMoney(parseMoney(String(row[field])) + open);
        row.total = formatMoney(parseMoney(row.total) + open);
      }
      // fully-settled suppliers carry no open AP — they are omitted from
      // the aging rather than presented as all-zero rows
      return [...bySupplier.values()].filter((r) => parseMoney(r.total) !== 0n);
    });
  }

  /** Supplier statement: chronological AP movements with a running balance,
   *  regenerated from documents (true date filtering, defect A4-class).
   *
   *  Review round 2 (blocker 5) — the previous UNION presented each
   *  invoice WITH its debit/credit-note adjustments folded into the
   *  invoice row AND those same adjustments again as separate rows,
   *  double-counting every note. Now:
   *    - the invoice row carries the ORIGINAL posted value exactly once;
   *    - each debit/credit note appears ONCE, on its own business date;
   *    - each payment allocation appears ONCE, on the payment's date;
   *    - only POSTED invoices (posted / partially_paid / paid) appear —
   *      an unposted pending-match document has no AP journal;
   *    - standalone notes (no target invoice) are their own posted AP
   *      documents and appear on their own dates;
   *    - the running balance follows document chronology (business date,
   *      then document code as the deterministic tie-break).
   *  The closing balance equals the canonical AP equation for the
   *  supplier; unapplied ADVANCE remainder is reported separately
   *  (advanceBalance) — it is an asset, not a payable. */
  async supplierStatement(tenantId: string, supplierId: string, asOf: string): Promise<SupplierStatementDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [supplierId]);
      const supplier = await requireRow<Record<string, unknown>>(ctx, 'supplier', supplierId);
      const events = await ctx.query<{
        business_date: string; code: string; doc_type: string; debit: string; credit: string; detail: string | null;
      }>(
        `SELECT e.business_date, e.code, e.doc_type, e.debit, e.credit, e.detail FROM (
           -- 1. posted invoices: the original posted value, exactly once
           SELECT si.business_date, si.code, 'supplier_invoice' AS doc_type,
                  si.total::text AS debit, '0.0000' AS credit,
                  si.supplier_invoice_number AS detail
           FROM supplier_invoice si
           WHERE si.tenant_id = $1 AND si.supplier_id = $2
             AND si.status IN ('posted','partially_paid','paid')
             AND si.business_date <= $3::date
           UNION ALL
           -- 2. debit/credit notes: ONE row each, on their own date
           --    (attached notes only for invoices already in scope; notes
           --     without a target invoice are their own posted documents)
           SELECT sa.business_date, sa.code, 'supplier_adjustment' AS doc_type,
                  (CASE WHEN sa.kind = 'debit_note' THEN sa.amount ELSE 0.0000 END)::text AS debit,
                  (CASE WHEN sa.kind = 'credit_note' THEN sa.amount ELSE 0.0000 END)::text AS credit,
                  sa.reason AS detail
           FROM supplier_adjustment sa
           WHERE sa.tenant_id = $1 AND sa.supplier_id = $2 AND sa.business_date <= $3::date
             AND (sa.supplier_invoice_id IS NULL
                  OR EXISTS (
                    SELECT 1 FROM supplier_invoice x
                    WHERE x.id = sa.supplier_invoice_id
                      AND x.status IN ('posted','partially_paid','paid')
                      AND x.business_date <= sa.business_date))
           UNION ALL
           -- 3. payments: the allocated share ONCE, on the payment's date
           SELECT sp.business_date, sp.code, 'supplier_payment' AS doc_type,
                  '0.0000' AS debit,
                  COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
                    JOIN supplier_invoice x ON x.id = spa.supplier_invoice_id
                    WHERE spa.payment_id = sp.id AND x.supplier_id = sp.supplier_id
                      AND x.status IN ('posted','partially_paid','paid')), 0.0000)::text AS credit,
                  sp.method AS detail
           FROM supplier_payment sp
           WHERE sp.tenant_id = $1 AND sp.supplier_id = $2 AND sp.business_date <= $3::date
         ) e
         ORDER BY e.business_date, e.code`,
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
      // unapplied advance remainder as of the same date (payments dated on
      // or before asOf minus their invoice allocations)
      const advance = await ctx.query<{ total: string }>(
        `SELECT COALESCE(SUM(
           sp.amount - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa
             WHERE spa.payment_id = sp.id), 0)
         ), 0)::text AS total
         FROM supplier_payment sp
         WHERE sp.tenant_id = $1 AND sp.supplier_id = $2 AND sp.business_date <= $3::date`,
        [ctx.tenantId, supplierId, asOf],
      );
      return {
        supplierId,
        supplierName: supplier.name ? String(supplier.name) : null,
        asOf,
        openingBalance: '0',
        lines,
        closingBalance: formatMoney(running),
        advanceBalance: formatMoney(parseMoney(advance.rows[0]!.total)),
      };
    });
  }

  /** Total AP by supplier (open items only, POSTED documents + their
   *  corrections; standalone notes included). */
  async apBalances(
    tenantId: string,
  ): Promise<Array<{ supplierId: string; supplierName: string | null; open: string }>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ supplier_id: string; supplier_name: string | null; open: string }>(
        `SELECT x.supplier_id, s.name AS supplier_name, SUM(x.open)::text AS open
         FROM (
           SELECT si.supplier_id,
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
           UNION ALL
           SELECT sa.supplier_id,
              CASE WHEN sa.kind = 'debit_note' THEN sa.amount ELSE -sa.amount END
           FROM supplier_adjustment sa
           WHERE sa.tenant_id = $1 AND sa.supplier_invoice_id IS NULL
         ) x
         JOIN supplier s ON s.id = x.supplier_id
         GROUP BY x.supplier_id, s.name
         HAVING SUM(x.open) <> 0
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
