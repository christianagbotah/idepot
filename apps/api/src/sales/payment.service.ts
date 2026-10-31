import { Injectable } from '@nestjs/common';
import type {
  ApplyCredit,
  ListDto,
  CreateDeposit,
  CustomerDepositDto,
  CreditApplicationDto,
  PaymentDto,
  ReceivePayment,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  formatMoney,
  parseMoney,
  validateAllocation,
  validatePositiveMoney,
  validateTenderSet,
  TENDER_GL_PURPOSE,
  type GlPurpose,
  type JournalLineSpec,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';

import type { SalePrincipal } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SalePoster } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from './document-sequence.service.js';

/** Postgres SQLSTATE of a driver error, when present. */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Standalone payments (payments_received corrected model):
 *
 * - Every receipt is a payment document with typed tenders (C-6) and
 *   EXPLICIT allocation rows (C-17) — the legacy implicit FIFO at read time
 *   and the D1 per-account multiplication are structurally impossible here.
 * - FIFO allocation (legacy behaviour preserved) is an explicit OPTION that
 *   still writes per-invoice allocation rows, oldest invoice first, under
 *   row locks — never a read-time derivation.
 * - Invariant 8 (payment.amount == Σ allocations + change + unapplied) is
 *   enforced by the payment_allocation_guard trigger + service validation.
 * - Payments are append-only; correcting a wrong receipt is a reversal
 *   document (Phase 5), never the legacy destructive delete/diff engine.
 *
 * Deposits are unapplied-cash documents (C-20/C-26 corrected): a liability
 * row + explicit credit applications, never a negative invoice row.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly poster: SalePoster,
    private readonly sequences: DocumentSequenceService,
    private readonly finance: FinancialConfigurationService,
  ) {}

  /** Receive money from a customer: multi-tender receipt + allocations. */
  receivePayment(principal: SalePrincipal, dto: ReceivePayment): Promise<PaymentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, (ctx) =>
      this.receivePaymentWithinCtx(ctx, principal, dto),
    );
  }

  async receivePaymentWithinCtx(ctx: UowContext, principal: SalePrincipal, dto: ReceivePayment): Promise<PaymentDto> {
    await assertTenantRefs(ctx, 'customer', 'customer', [dto.customerId]);
    if (dto.shiftId) {
      const shift = await ctx.query<Record<string, unknown>>(
        `SELECT id, user_id, status FROM cashier_shift WHERE id = $1 AND tenant_id = $2`,
        [dto.shiftId, ctx.tenantId],
      );
      const row = shift.rows[0];
      if (!row) throw new NotFoundError('shift', dto.shiftId);
      if (String(row.status) !== 'open') throw new ConflictError('shift is closed');
      if (String(row.user_id) !== principal.userId) {
        throw new ValidationError('payments can only be received on the open shift of the signed-in cashier');
      }
    }

    const amount = validatePositiveMoney(dto.amount);
    const { paid, changeDue } = validateTenderSet(dto.tenders, formatMoney(amount));
    if (paid !== amount) {
      throw new ValidationError('Σ tenders must equal the payment amount');
    }
    if (changeDue > 0n) {
      // a standalone receipt must not be a cash-overpay puzzle: deliberate
      // credit goes through deposits (payment-transaction-map §10)
      throw new ValidationError('a standalone receipt cannot exceed the intended amount — use a customer deposit for deliberate credit');
    }

    // resolve allocation targets
    const allocations = dto.allocations ?? [];
    if (dto.invoiceId && !allocations.some((a) => a.invoiceId === dto.invoiceId)) {
      allocations.push({ invoiceId: dto.invoiceId, amount: formatMoney(amount) });
    }
    await assertTenantRefs(ctx, 'invoice', 'invoice', allocations.map((a) => a.invoiceId));

    // lock the target invoices and validate outstanding dues
    let outstandingTotal = 0n;
    const dues = new Map<string, bigint>();
    for (const a of allocations) {
      validatePositiveMoney(a.amount);
    }
    const invoiceRows = await ctx.query<Record<string, unknown>>(
      `SELECT id, total, status FROM invoice
       WHERE tenant_id = $1 AND id = ANY($2::uuid[])
       ORDER BY created_at, id
       FOR UPDATE`,
      [ctx.tenantId, allocations.map((a) => a.invoiceId)],
    );
    const invoiceById = new Map(invoiceRows.rows.map((r) => [String(r.id), r]));
    for (const a of allocations) {
      const inv = invoiceById.get(a.invoiceId);
      if (!inv) throw new NotFoundError('invoice', a.invoiceId);
      if (String(inv.status) !== 'posted') throw new ConflictError(`invoice ${a.invoiceId} is not posted`);
      const due = await this.invoiceDue(ctx, a.invoiceId);
      const allocated = validateAllocation({ invoiceId: a.invoiceId, amount: a.amount }, formatMoney(due));
      dues.set(a.invoiceId, allocated);
      outstandingTotal += allocated;
    }
    if (outstandingTotal > amount) {
      throw new ValidationError('Σ allocations exceed the payment amount');
    }

    const receiptCode = await this.sequences.allocate(ctx, { docType: 'RECEIPT' });
    let paymentId: string;
    try {
      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO payment
           (tenant_id, code, customer_id, amount, change_given, unapplied,
            shift_id, source, client_doc_id, business_date, occurred_at, created_by)
         VALUES ($1,$2,$3,$4,0,$5,$6,'counter',$7,CURRENT_DATE,$8,$9)
         RETURNING id`,
        [
          ctx.tenantId,
          receiptCode,
          dto.customerId,
          formatMoney(amount),
          formatMoney(amount - outstandingTotal), // unapplied
          dto.shiftId ?? null,
          dto.clientDocId ?? null,
          dto.occurredAt ?? null,
          principal.userId,
        ],
      );
      paymentId = String(res.rows[0]!.id);
    } catch (err) {
      if (pgCode(err) === '23505') {
        throw new ConflictError('duplicate receipt: this client document id has already been committed');
      }
      throw err;
    }
    for (const t of dto.tenders) {
      await ctx.query(
        `INSERT INTO payment_tender
           (tenant_id, payment_id, method, amount, momo_provider, momo_phone,
            momo_transaction_id, cheque_bank, cheque_branch, cheque_number, reference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          ctx.tenantId,
          paymentId,
          t.method,
          t.amount,
          t.momoProvider ?? null,
          t.momoPhone ?? null,
          t.momoTransactionId ?? null,
          t.chequeBank ?? null,
          t.chequeBranch ?? null,
          t.chequeNumber ?? null,
          t.reference ?? null,
        ],
      );
    }
    for (const [invoiceId, allocated] of dues) {
      await ctx.query(
        `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [ctx.tenantId, paymentId, invoiceId, formatMoney(allocated)],
      );
    }

    // GL journal (finding #2): DR tender control accounts, CR receivable for
    // the allocated share, CR deposit liability for the unapplied remainder
    // (money received but not yet attached to a debt becomes customer credit)
    await this.postPaymentJournal(ctx, principal, {
      paymentId,
      code: receiptCode,
      tenders: dto.tenders,
      allocated: outstandingTotal,
      unapplied: amount - outstandingTotal,
      sourceKind: 'payment',
      event: 'receipt_posted',
    });

    // audit + outbox (committed facts only)
    for (const [invoiceId, allocated] of dues) {
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'payment.received',
        entityType: 'payment',
        entityId: paymentId,
        details: {
          code: receiptCode,
          invoiceId,
          allocated: formatMoney(allocated),
          tenders: dto.tenders.map((t) => ({ method: t.method, amount: t.amount })),
        },
      });
    }
    await ctx.outbox.emit('PaymentReceived', {
      paymentId,
      code: receiptCode,
      customerId: dto.customerId,
      amount: formatMoney(amount),
      unapplied: formatMoney(amount - outstandingTotal),
      allocations: [...dues.entries()].map(([invoiceId, allocated]) => ({ invoiceId, amount: formatMoney(allocated) })),
    });
    return this.poster.loadPayment(ctx, paymentId);
  }

  /** Take a customer deposit (unapplied cash = customer credit). */
  createDeposit(principal: SalePrincipal, dto: CreateDeposit): Promise<CustomerDepositDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'customer', 'customer', [dto.customerId]);
      const amount = validatePositiveMoney(dto.amount);
      const { paid } = validateTenderSet(dto.tenders, formatMoney(amount));
      if (paid !== amount) throw new ValidationError('Σ tenders must equal the deposit amount');
      if (dto.shiftId) {
        const shift = await ctx.query<Record<string, unknown>>(
          `SELECT id, user_id, status FROM cashier_shift WHERE id = $1 AND tenant_id = $2`,
          [dto.shiftId, ctx.tenantId],
        );
        const row = shift.rows[0];
        if (!row) throw new NotFoundError('shift', dto.shiftId);
        if (String(row.status) !== 'open') throw new ConflictError('shift is closed');
        if (String(row.user_id) !== principal.userId) {
          throw new ValidationError('deposits can only be taken on the open shift of the signed-in cashier');
        }
      }

      // the deposit's money arrives as a payment document (evidence + receipt)
      const receiptCode = await this.sequences.allocate(ctx, { docType: 'RECEIPT' });
      const payRes = await ctx.query<Record<string, unknown>>(
        `INSERT INTO payment
           (tenant_id, code, customer_id, amount, change_given, unapplied,
            shift_id, source, client_doc_id, business_date, created_by)
         VALUES ($1,$2,$3,$4,0,$5,$6,'counter',$7,CURRENT_DATE,$8)
         RETURNING id`,
        [
          ctx.tenantId,
          receiptCode,
          dto.customerId,
          formatMoney(amount),
          formatMoney(amount), // fully unapplied — becomes the deposit
          dto.shiftId ?? null,
          dto.clientDocId ?? null,
          principal.userId,
        ],
      );
      const paymentId = String(payRes.rows[0]!.id);
      for (const t of dto.tenders) {
        await ctx.query(
          `INSERT INTO payment_tender
             (tenant_id, payment_id, method, amount, momo_provider, momo_phone,
              momo_transaction_id, cheque_bank, cheque_branch, cheque_number, reference)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            ctx.tenantId, paymentId, t.method, t.amount,
            t.momoProvider ?? null, t.momoPhone ?? null, t.momoTransactionId ?? null,
            t.chequeBank ?? null, t.chequeBranch ?? null, t.chequeNumber ?? null, t.reference ?? null,
          ],
        );
      }

      const code = await this.sequences.allocate(ctx, { docType: 'DEPOSIT' });
      let depositId: string;
      try {
        const res = await ctx.query<Record<string, unknown>>(
          `INSERT INTO customer_deposit
             (tenant_id, code, customer_id, amount, payment_id, shift_id,
              client_doc_id, note, business_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9)
           RETURNING id`,
          [
            ctx.tenantId, code, dto.customerId, formatMoney(amount), paymentId,
            dto.shiftId ?? null, dto.clientDocId ?? null, dto.note ?? null, principal.userId,
          ],
        );
        depositId = String(res.rows[0]!.id);
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError('duplicate deposit: this client document id has already been committed');
        }
        throw err;
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'deposit.created',
        entityType: 'customer_deposit',
        entityId: depositId,
        details: { code, customerId: dto.customerId, amount: formatMoney(amount), paymentId },
      });
      await ctx.outbox.emit('DepositReceived', {
        depositId,
        code,
        customerId: dto.customerId,
        amount: formatMoney(amount),
        paymentId,
      });

      // GL journal (finding #2): DR tender control accounts, CR customer
      // deposits — the money is a LIABILITY until it is applied to a sale
      await this.postPaymentJournal(ctx, principal, {
        paymentId: depositId,
        code,
        tenders: dto.tenders,
        allocated: 0n,
        unapplied: amount,
        sourceKind: 'customer_deposit',
        event: 'deposit_posted',
      });

      return this.loadDeposit(ctx, depositId);
    });
  }

  /** Explicit credit application: consume deposit against an invoice. */
  applyCredit(principal: SalePrincipal, dto: ApplyCredit): Promise<CreditApplicationDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'customer_deposit', 'customer_deposit', [dto.depositId]);
      await assertTenantRefs(ctx, 'invoice', 'invoice', [dto.invoiceId]);
      const amount = validatePositiveMoney(dto.amount);

      // Serialize credit consumption per customer — customer_deposit is
      // APPEND-ONLY for the app role (no UPDATE grant), so SELECT … FOR
      // UPDATE is unavailable by design; a transaction-scoped advisory lock
      // (same key domain as the sale's credit waterfall) gives the same
      // guarantee: concurrent applications serialize and the
      // remaining-balance reads below are always current.
      const depHead = await ctx.query<{ customer_id: string }>(
        `SELECT customer_id FROM customer_deposit WHERE id = $1 AND tenant_id = $2`,
        [dto.depositId, ctx.tenantId],
      );
      if (depHead.rows.length === 0) throw new NotFoundError('customer_deposit', dto.depositId);
      await ctx.query(
        `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
        [`customer-credit:${ctx.tenantId}:${depHead.rows[0]!.customer_id}`],
      );

      const depRes = await ctx.query<Record<string, unknown>>(
        `SELECT id, code, customer_id, amount FROM customer_deposit
         WHERE id = $1 AND tenant_id = $2`,
        [dto.depositId, ctx.tenantId],
      );
      const dep = depRes.rows[0];
      if (!dep) throw new NotFoundError('customer_deposit', dto.depositId);

      const invRes = await ctx.query<Record<string, unknown>>(
        `SELECT id, code, customer_id, status FROM invoice
         WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [dto.invoiceId, ctx.tenantId],
      );
      const inv = invRes.rows[0];
      if (!inv) throw new NotFoundError('invoice', dto.invoiceId);
      if (String(inv.status) !== 'posted') throw new ConflictError('invoice is not posted');
      if (String(inv.customer_id) !== String(dep.customer_id)) {
        throw new ValidationError('credit can only be applied to an invoice of the same customer');
      }

      const remaining = await this.depositRemaining(ctx, dto.depositId);
      const due = await this.invoiceDue(ctx, dto.invoiceId);
      const allocated = validateAllocation({ invoiceId: dto.invoiceId, amount: formatMoney(amount) }, formatMoney(due));
      if (allocated > remaining) {
        throw new ConflictError(
          `deposit remaining ${formatMoney(remaining)} is less than the application ${formatMoney(allocated)}`,
        );
      }
      let appRow: Record<string, unknown>;
      try {
        const res = await ctx.query<Record<string, unknown>>(
          `INSERT INTO credit_application (tenant_id, deposit_id, invoice_id, amount)
           VALUES ($1,$2,$3,$4)
           RETURNING id, created_at`,
          [ctx.tenantId, dto.depositId, dto.invoiceId, formatMoney(allocated)],
        );
        appRow = res.rows[0]!;
      } catch (err) {
        if (pgCode(err) === '23505') {
          throw new ConflictError('this deposit is already applied to this invoice');
        }
        throw err;
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'credit.applied',
        entityType: 'credit_application',
        entityId: String(appRow.id),
        details: {
          depositId: dto.depositId,
          depositCode: String(dep.code),
          invoiceId: dto.invoiceId,
          invoiceCode: String(inv.code),
          amount: formatMoney(allocated),
        },
      });
      await ctx.outbox.emit('CreditApplied', {
        depositId: dto.depositId,
        invoiceId: dto.invoiceId,
        amount: formatMoney(allocated),
      });

      // GL journal (finding #2): the deposit liability is consumed to settle
      // a receivable — DR customer deposits, CR accounts receivable
      const creditPurposes: GlPurpose[] = ['customer_deposit_liability', 'accounts_receivable'];
      const creditAccounts = await this.finance.resolveGlAccounts(ctx, creditPurposes);
      await this.finance.postJournal(ctx, {
        sourceKind: 'credit_application',
        sourceId: String(appRow.id),
        event: 'credit_applied',
        description: `Credit application ${String(dep.code)} → ${String(inv.code)}`,
        createdBy: principal.userId,
        lines: [
          { accountId: creditAccounts.get('customer_deposit_liability')!, debit: formatMoney(allocated), memo: `deposit ${String(dep.code)} consumed` },
          { accountId: creditAccounts.get('accounts_receivable')!, credit: formatMoney(allocated), memo: `invoice ${String(inv.code)} settled by credit` },
        ],
      });

      return {
        id: String(appRow.id),
        depositId: dto.depositId,
        depositCode: String(dep.code),
        invoiceId: dto.invoiceId,
        invoiceCode: String(inv.code),
        amount: formatMoney(allocated),
        createdAt: new Date(appRow.created_at as string).toISOString(),
      };
    });
  }

  /* ------------------------------- GL helper ------------------------------ */

  /**
   * Balanced journal for a money-receipt document (standalone receipt or
   * deposit): DR tender control accounts (gross), CR accounts receivable for
   * the allocated share, CR customer deposits for the unapplied share.
   * amount = allocated + unapplied keeps the entry balanced by construction.
   */
  private async postPaymentJournal(
    ctx: UowContext,
    principal: SalePrincipal,
    args: {
      paymentId: string;
      code: string;
      tenders: ReceivePayment['tenders'];
      allocated: bigint;
      unapplied: bigint;
      sourceKind: string;
      event: string;
    },
  ): Promise<void> {
    const purposes: GlPurpose[] = ['accounts_receivable', 'customer_deposit_liability'];
    for (const t of args.tenders) {
      const purpose = TENDER_GL_PURPOSE[t.method];
      if (purpose && !purposes.includes(purpose)) purposes.push(purpose);
    }
    const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
    const lines: JournalLineSpec[] = [];
    for (const t of args.tenders) {
      const purpose = TENDER_GL_PURPOSE[t.method];
      if (!purpose) throw new ValidationError(`tender method "${t.method}" has no GL control account`);
      lines.push({
        accountId: accounts.get(purpose)!,
        debit: formatMoney(parseMoney(t.amount)),
        memo: `${args.sourceKind === 'payment' ? 'receipt' : 'deposit'} ${args.code} tender ${t.method}`,
      });
    }
    lines.push({ accountId: accounts.get('accounts_receivable')!, credit: formatMoney(args.allocated), memo: `${args.code} receivable settled` });
    lines.push({ accountId: accounts.get('customer_deposit_liability')!, credit: formatMoney(args.unapplied), memo: `${args.code} customer credit` });
    await this.finance.postJournal(ctx, {
      sourceKind: args.sourceKind,
      sourceId: args.paymentId,
      event: args.event,
      description: `${args.sourceKind === 'payment' ? 'Receipt' : 'Deposit'} ${args.code}`,
      createdBy: principal.userId,
      lines,
    });
  }

  /* --------------------------------- reads -------------------------------- */

  async getPayment(tenantId: string, paymentId: string): Promise<PaymentDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.poster.loadPayment(ctx, paymentId));
  }

  async listPayments(tenantId: string, opts: { customerId?: string; limit?: number } = {}): Promise<ListDto<PaymentDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'p.tenant_id = $1';
      if (opts.customerId) {
        params.push(opts.customerId);
        where += ` AND p.customer_id = $${params.length}`;
      }
      const limit = Math.min(opts.limit ?? 100, 500);
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT p.id FROM payment p WHERE ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT ${limit}`,
        params,
      );
      const items: PaymentDto[] = [];
      for (const r of res.rows) items.push(await this.poster.loadPayment(ctx, String(r.id)));
      return { items, total: items.length };
    });
  }

  async getDeposit(tenantId: string, depositId: string): Promise<CustomerDepositDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.loadDeposit(ctx, depositId));
  }

  async listDeposits(tenantId: string, opts: { customerId?: string } = {}): Promise<ListDto<CustomerDepositDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'd.tenant_id = $1';
      if (opts.customerId) {
        params.push(opts.customerId);
        where += ` AND d.customer_id = $${params.length}`;
      }
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT d.id FROM customer_deposit d WHERE ${where} ORDER BY d.created_at DESC LIMIT 200`,
        params,
      );
      const items: CustomerDepositDto[] = [];
      for (const r of res.rows) items.push(await this.loadDeposit(ctx, String(r.id)));
      return { items, total: items.length };
    });
  }

  async listCreditApplications(tenantId: string, opts: { depositId?: string; invoiceId?: string } = {}): Promise<ListDto<CreditApplicationDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'ca.tenant_id = $1';
      if (opts.depositId) {
        params.push(opts.depositId);
        where += ` AND ca.deposit_id = $${params.length}`;
      }
      if (opts.invoiceId) {
        params.push(opts.invoiceId);
        where += ` AND ca.invoice_id = $${params.length}`;
      }
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT ca.id, ca.deposit_id, d.code AS deposit_code, ca.invoice_id,
                i.code AS invoice_code, ca.amount::text AS amount, ca.created_at
         FROM credit_application ca
         LEFT JOIN customer_deposit d ON d.id = ca.deposit_id
         LEFT JOIN invoice i ON i.id = ca.invoice_id
         WHERE ${where}
         ORDER BY ca.created_at DESC LIMIT 200`,
        params,
      );
      const items = res.rows.map((r) => ({
        id: String(r.id),
        depositId: String(r.deposit_id),
        depositCode: r.deposit_code ? String(r.deposit_code) : null,
        invoiceId: String(r.invoice_id),
        invoiceCode: r.invoice_code ? String(r.invoice_code) : null,
        amount: String(r.amount),
        createdAt: new Date(r.created_at as string).toISOString(),
      }));
      return { items, total: items.length };
    });
  }

  /* ------------------------------- subledger ------------------------------ */

  /** C-16/C-17 corrected due: total − Σ allocations − Σ credit applications. */
  async invoiceDue(ctx: UowContext, invoiceId: string): Promise<bigint> {
    const total = await this.invoiceTotal(ctx, invoiceId);
    const paid = await this.invoicePaidAmount(ctx, invoiceId);
    return total > paid ? total - paid : 0n;
  }

  async invoiceTotal(ctx: UowContext, invoiceId: string): Promise<bigint> {
    const res = await ctx.query<{ total: string }>(
      `SELECT total::text AS total FROM invoice WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
    return parseMoney(res.rows[0]!.total);
  }

  async invoicePaidAmount(ctx: UowContext, invoiceId: string): Promise<bigint> {
    const res = await ctx.query<{ paid: string }>(
      `SELECT (COALESCE((SELECT SUM(a.amount) FROM payment_allocation a
                         WHERE a.tenant_id = $1 AND a.invoice_id = $2), 0)
             + COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                         WHERE ca.tenant_id = $1 AND ca.invoice_id = $2), 0))::text AS paid`,
      [ctx.tenantId, invoiceId],
    );
    return parseMoney(res.rows[0]!.paid);
  }

  async depositRemaining(ctx: UowContext, depositId: string): Promise<bigint> {
    const res = await ctx.query<{ remaining: string }>(
      `SELECT (d.amount - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                                     WHERE ca.tenant_id = $1 AND ca.deposit_id = $2), 0))::text AS remaining
       FROM customer_deposit d WHERE d.id = $2 AND d.tenant_id = $1`,
      [ctx.tenantId, depositId],
    );
    if (res.rows.length === 0) throw new NotFoundError('customer_deposit', depositId);
    return parseMoney(res.rows[0]!.remaining);
  }

  /** Customer balance (C-16 corrected): single subledger query service. */
  async customerBalance(tenantId: string, customerId: string): Promise<{ receivable: string; credit: string }> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const inv = await ctx.query<{ due: string }>(
        `SELECT COALESCE(SUM(GREATEST(i.total
             - COALESCE((SELECT SUM(a.amount) FROM payment_allocation a WHERE a.tenant_id = $1 AND a.invoice_id = i.id), 0)
             - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.tenant_id = $1 AND ca.invoice_id = i.id), 0), 0)), 0)::text AS due
         FROM invoice i WHERE i.tenant_id = $1 AND i.customer_id = $2 AND i.status = 'posted'`,
        [ctx.tenantId, customerId],
      );
      const dep = await ctx.query<{ credit: string }>(
        `SELECT COALESCE(SUM(d.amount - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                                                   WHERE ca.tenant_id = $1 AND ca.deposit_id = d.id), 0)), 0)::text AS credit
         FROM customer_deposit d WHERE d.tenant_id = $1 AND d.customer_id = $2`,
        [ctx.tenantId, customerId],
      );
      return { receivable: inv.rows[0]!.due, credit: dep.rows[0]!.credit };
    });
  }

  private async loadDeposit(ctx: UowContext, depositId: string): Promise<CustomerDepositDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT d.id, d.code, d.customer_id, c.name AS customer_name, d.amount::text AS amount,
              d.payment_id, d.note, d.created_by, d.created_at
       FROM customer_deposit d
       LEFT JOIN customer c ON c.id = d.customer_id
       WHERE d.id = $1 AND d.tenant_id = $2`,
      [depositId, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('customer_deposit', depositId);
    const r = res.rows[0]!;
    const remaining = await this.depositRemaining(ctx, depositId);
    const amount = parseMoney(String(r.amount));
    const applied = amount - remaining;
    return {
      id: String(r.id),
      code: String(r.code),
      customerId: String(r.customer_id),
      customerName: r.customer_name ? String(r.customer_name) : null,
      amount: String(r.amount),
      appliedAmount: formatMoney(applied),
      remainingAmount: formatMoney(remaining),
      paymentId: r.payment_id ? String(r.payment_id) : null,
      status: remaining === 0n ? 'exhausted' : 'active',
      note: r.note ? String(r.note) : null,
      createdBy: r.created_by ? String(r.created_by) : null,
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
