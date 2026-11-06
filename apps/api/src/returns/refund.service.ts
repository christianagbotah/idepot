/**
 * Refund engine (Phase 5 §6) + credit-note reads.
 *
 * A refund is money actually LEAVING the business for a customer
 * entitlement created by a credit note. Statuses:
 *   requested → approved → posted → externally settled
 * with cancelled (from requested/approved) and failed (from posted,
 * non-cash, externally-failed with a clean reversal journal + safe
 * retry via a NEW refund document).
 *
 * Safeguards implemented:
 *  - idempotent command identity (client_doc_id + request fingerprint,
 *    advisory-lock claim, same-key/same-payload replay, different
 *    payload ⇒ 409 idempotency_key_reuse);
 *  - concurrent double-refund protection (advisory lock per credit
 *    note + the DB entitlement guard);
 *  - available refundable amount validation;
 *  - refund destination validation (bank account must belong to the
 *    tenant — RLS-checked);
 *  - transactional GL (DR refunds_payable / CR tender control or the
 *    named bank account's own GL account);
 *  - accounting-period validation (through postJournal);
 *  - full audit history + committed-fact outbox events;
 *  - a refund is NEVER marked externally settled merely because an API
 *    call was initiated — settlement is an explicit, referenced action.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateRefund,
  CreditNoteDto,
  RefundDto,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  IdempotencyKeyReuseError,
  parseMoney,
  formatMoney,
  TENDER_GL_PURPOSE,
  type JournalLineSpec,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
import {
  dateCol,
  tsCol,
  tsColNull,
  lockRefundDomain,
  mapUniqueViolation,
  type ReturnsPrincipal,
} from './returns-common.js';
import { refundRequestFingerprint } from '@idepot/domain';

@Injectable()
export class RefundService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
    private readonly sequences: DocumentSequenceService,
  ) {}

  // =========================================================================
  // Credit-note reads (drilldown: invoice → return → credit note → refund)
  // =========================================================================

  async listCreditNotes(
    tenantId: string,
    filter: { invoiceId?: string; customerId?: string; returnOrderId?: string; limit?: number; offset?: number },
  ): Promise<CreditNoteDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const conditions = ['cn.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.invoiceId) {
        params.push(filter.invoiceId);
        conditions.push(`cn.invoice_id = $${params.length}`);
      }
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`cn.customer_id = $${params.length}`);
      }
      if (filter.returnOrderId) {
        params.push(filter.returnOrderId);
        conditions.push(`cn.return_order_id = $${params.length}`);
      }
      params.push(limit, filter.offset ?? 0);
      const rows = await ctx.query(
        `SELECT cn.id FROM credit_note cn WHERE ${conditions.join(' AND ')}
         ORDER BY cn.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const items: CreditNoteDto[] = [];
      for (const r of rows.rows) {
        items.push(await this.loadCreditNote(ctx, String(r.id)));
      }
      return items;
    });
  }

  async getCreditNote(tenantId: string, creditNoteId: string): Promise<CreditNoteDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.loadCreditNote(ctx, creditNoteId));
  }

  async loadCreditNote(ctx: UowContext, creditNoteId: string): Promise<CreditNoteDto> {
    const r = await ctx.query(
      `SELECT cn.*, i.code AS invoice_code, c.name AS customer_name, ro.code AS return_order_code
         FROM credit_note cn
         LEFT JOIN invoice i ON i.id = cn.invoice_id
         LEFT JOIN customer c ON c.id = cn.customer_id
         LEFT JOIN return_order ro ON ro.id = cn.return_order_id
        WHERE cn.id = $1`,
      [creditNoteId],
    );
    if (r.rows.length === 0) throw new NotFoundError('credit note', creditNoteId);
    const cn = r.rows[0] as Record<string, unknown> & { business_date: Date; created_at: Date };
    const tax = await ctx.query(
      `SELECT id, component_name, rate, inclusive, taxable_basis, tax_amount
         FROM credit_note_tax_component WHERE credit_note_id = $1 ORDER BY component_name`,
      [creditNoteId],
    );
    const refunded = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM refund
        WHERE credit_note_id = $1 AND status IN ('approved','posted','settled')`,
      [creditNoteId],
    );
    const consumed = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(exc.consumed_refund_amount), 0)::text AS total FROM exchange exc
        WHERE exc.return_order_id = (SELECT return_order_id FROM credit_note WHERE id = $1)`,
      [creditNoteId],
    );
    const refundedAmount = parseMoney(String(refunded.rows[0]!.total)) + parseMoney(String(consumed.rows[0]!.total));
    const limit = parseMoney(String(cn.refund_amount));
    return {
      id: String(cn.id),
      code: String(cn.code),
      returnOrderId: String(cn.return_order_id),
      returnOrderCode: cn.return_order_code == null ? null : String(cn.return_order_code),
      invoiceId: String(cn.invoice_id),
      invoiceCode: cn.invoice_code == null ? null : String(cn.invoice_code),
      customerId: String(cn.customer_id),
      customerName: cn.customer_name == null ? null : String(cn.customer_name),
      businessDate: dateCol(cn.business_date),
      total: String(cn.total),
      netRevenueReversal: String(cn.net_revenue_reversal),
      taxReversalTotal: String(cn.tax_reversal_total),
      arAmount: String(cn.ar_amount),
      refundAmount: String(cn.refund_amount),
      storeCreditAmount: String(cn.store_credit_amount),
      cogsReversal: String(cn.cogs_reversal),
      journalEntryId: cn.journal_entry_id == null ? null : String(cn.journal_entry_id),
      refundedAmount: formatMoney(refundedAmount),
      outstandingRefundAmount: formatMoney(limit - refundedAmount),
      note: cn.note == null ? null : String(cn.note),
      createdAt: tsCol(cn.created_at),
      taxComponents: tax.rows.map((tx: Record<string, unknown>) => ({
        id: String(tx.id),
        componentName: String(tx.component_name),
        rate: String(tx.rate),
        inclusive: Boolean(tx.inclusive),
        taxableBasis: String(tx.taxable_basis),
        taxAmount: String(tx.tax_amount),
      })),
    };
  }

  // =========================================================================
  // Refund lifecycle
  // =========================================================================

  async createRefund(principal: ReturnsPrincipal, dto: CreateRefund): Promise<RefundDto> {
    const fingerprint = refundRequestFingerprint(principal.tenantId, {
      creditNoteId: dto.creditNoteId,
      amount: dto.amount,
      method: dto.method,
      bankAccountId: dto.bankAccountId ?? null,
      businessDate: dto.businessDate ?? new Date().toISOString().slice(0, 10),
    });

    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.clientDocId) {
        await ctx.query(
          `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
          [`refund-idem:${ctx.tenantId}:${dto.clientDocId}`],
        );
        const existing = await ctx.query(`SELECT id FROM refund WHERE client_doc_id = $1`, [dto.clientDocId]);
        if (existing.rows.length > 0) {
          const fp = await ctx.query(`SELECT request_fingerprint FROM refund WHERE id = $1`, [existing.rows[0]!.id]);
          if (String(fp.rows[0]!.request_fingerprint) === fingerprint) {
            return this.getRefundWithinCtx(ctx, String(existing.rows[0]!.id));
          }
          throw new IdempotencyKeyReuseError('refund command idempotency key was already used with a different payload');
        }
      }

      await lockRefundDomain(ctx, dto.creditNoteId);

      const outstanding = await this.outstandingRefundEntitlement(ctx, dto.creditNoteId);
      const amount = parseMoney(dto.amount);
      if (amount <= 0n) throw new ValidationError('refund amount must be positive');
      if (amount > outstanding) {
        throw new ConflictError(
          `refund exceeds the outstanding refundable entitlement (${dto.amount} > ${formatMoney(outstanding)})`,
        );
      }

      if (dto.bankAccountId) {
        await assertTenantRefs(ctx, 'bank_account', 'refund destination', [dto.bankAccountId]);
      }

      const code = await this.sequences.allocate(ctx, { docType: 'REFUND' });
      const id = randomUUID();
      try {
        await ctx.query(
          `INSERT INTO refund (id, tenant_id, code, credit_note_id, return_order_id, customer_id, amount,
             method, bank_account_id, momo_provider, momo_phone, reference, note, status,
             client_doc_id, request_fingerprint, business_date, created_by)
           SELECT $1,$2,$3,$4,cn.return_order_id,cn.customer_id,$5,$6,$7,$8,$9,$10,$11,'requested',
                  $12,$13,$14,$15
             FROM credit_note cn WHERE cn.id = $4`,
          [
            id, ctx.tenantId, code, dto.creditNoteId, dto.amount, dto.method,
            dto.bankAccountId ?? null, dto.momoProvider ?? null, dto.momoPhone ?? null,
            dto.reference ?? null, dto.note ?? null, dto.clientDocId ?? null, fingerprint,
            dto.businessDate ?? new Date().toISOString().slice(0, 10), principal.userId,
          ],
        );
      } catch (err) {
        mapUniqueViolation(err, 'refund document already exists (duplicate client document id)');
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'refund.requested', entityType: 'refund', entityId: id,
        details: { code, creditNoteId: dto.creditNoteId, amount: dto.amount, method: dto.method },
      });
      await ctx.outbox.emit('RefundRequested', { refundId: id, code, amount: dto.amount, method: dto.method });

      if (dto.approveAndPost) {
        await this.approveWithinCtx(ctx, principal, id);
        return this.postWithinCtx(ctx, principal, id, dto.simulateFailure);
      }
      return this.getRefundWithinCtx(ctx, id);
    });
  }

  async approveRefund(principal: ReturnsPrincipal, refundId: string): Promise<RefundDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      return this.approveWithinCtx(ctx, principal, refundId);
    });
  }

  private async approveWithinCtx(ctx: UowContext, principal: ReturnsPrincipal, refundId: string): Promise<RefundDto> {
    const row = await this.lockRefund(ctx, refundId);
    if (row.status !== 'requested') {
      throw new ConflictError(`refund cannot be approved from status '${row.status}'`);
    }
    await lockRefundDomain(ctx, String(row.credit_note_id));
    await ctx.query(`UPDATE refund SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [
      refundId, principal.userId,
    ]);
    await ctx.audit.record({
      tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
      action: 'refund.approved', entityType: 'refund', entityId: refundId,
      details: { code: row.code, amount: String(row.amount) },
    });
    await ctx.outbox.emit('RefundApproved', { refundId });
    return this.getRefundWithinCtx(ctx, refundId);
  }

  async postRefund(principal: ReturnsPrincipal, refundId: string, simulateFailure?: string): Promise<RefundDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      return this.postWithinCtx(ctx, principal, refundId, simulateFailure);
    });
  }

  private async postWithinCtx(
    ctx: UowContext,
    principal: ReturnsPrincipal,
    refundId: string,
    simulateFailure?: string,
  ): Promise<RefundDto> {
    const row = await this.lockRefund(ctx, refundId);
    if (row.status !== 'approved') {
      throw new ConflictError(`refund cannot be posted from status '${row.status}'`);
    }
    await lockRefundDomain(ctx, String(row.credit_note_id));

    // resolve the money-out account: the named bank account's own GL
    // account for bank/cheque refunds, the tender control otherwise
    const purposes = ['refunds_payable' as const, TENDER_GL_PURPOSE[String(row.method)] ?? 'cash'];
    const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
    let creditAccountId = accounts.get(TENDER_GL_PURPOSE[String(row.method)] ?? 'cash')!;
    if (row.bank_account_id != null) {
      const bank = await ctx.query<{ gl_account_id: string | null }>(
        `SELECT gl_account_id FROM bank_account WHERE id = $1`,
        [row.bank_account_id],
      );
      if (bank.rows.length > 0 && bank.rows[0]!.gl_account_id != null) {
        creditAccountId = String(bank.rows[0]!.gl_account_id);
      }
    }

    const amount = String(row.amount);
    const lines: JournalLineSpec[] = [
      { accountId: accounts.get('refunds_payable')!, debit: amount, memo: 'refund payable settled' },
      { accountId: creditAccountId, credit: amount, memo: `refund via ${String(row.method)}` },
    ];
    const journal = await this.finance.postJournal(ctx, {
      sourceKind: 'refund',
      sourceId: refundId,
      event: 'refund_posted',
      description: `Refund ${String(row.code)}`,
      businessDate: dateCol(row.business_date),
      reference: String(row.code),
      createdBy: principal.userId,
      allowSoftClosedPeriod: true,
      lines,
    });

    // a CASH refund is physically paid out at posting (drawer money
    // leaves with the customer) — settled at post; external methods
    // (momo/bank/cheque) stay 'posted' until an EXPLICIT settlement
    const isCash = String(row.method) === 'cash';
    await ctx.query(
      `UPDATE refund SET status = CASE WHEN $2 THEN 'settled' ELSE 'posted' END,
           posted_by = $3, posted_at = now(), journal_entry_id = $4,
           settled_at = CASE WHEN $2 THEN now() ELSE settled_at END,
           settled_by = CASE WHEN $2 THEN $3 ELSE settled_by END
         WHERE id = $1`,
      [refundId, isCash, principal.userId, journal?.id ?? null],
    );

    await ctx.audit.record({
      tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
      action: 'refund.posted', entityType: 'refund', entityId: refundId,
      details: { code: String(row.code), amount, method: String(row.method), journalEntryId: journal?.id ?? null },
    });
    await ctx.outbox.emit('RefundPosted', { refundId, code: String(row.code), amount, method: String(row.method) });

    if (simulateFailure === 'after_writes') {
      throw new ValidationError('simulated failure after refund writes (atomicity test)');
    }

    if (isCash) {
      await this.checkReturnCompletion(ctx, String(row.credit_note_id));
    }
    return this.getRefundWithinCtx(ctx, refundId);
  }

  async settleRefund(principal: ReturnsPrincipal, refundId: string, settlementReference: string): Promise<RefundDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockRefund(ctx, refundId);
      if (row.status !== 'posted') {
        throw new ConflictError(`refund cannot be settled from status '${row.status}'`);
      }
      if (String(row.method) === 'cash') {
        throw new ValidationError('cash refunds are settled at posting (drawer payout is immediate)');
      }
      await ctx.query(
        `UPDATE refund SET status = 'settled', settled_at = now(), settled_by = $2, settlement_reference = $3
         WHERE id = $1`,
        [refundId, principal.userId, settlementReference],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'refund.settled', entityType: 'refund', entityId: refundId,
        details: { code: String(row.code), settlementReference },
      });
      await ctx.outbox.emit('RefundSettled', { refundId, settlementReference });
      await this.checkReturnCompletion(ctx, String(row.credit_note_id));
      return this.getRefundWithinCtx(ctx, refundId);
    });
  }

  async cancelRefund(principal: ReturnsPrincipal, refundId: string, reason: string): Promise<RefundDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockRefund(ctx, refundId);
      if (row.status !== 'requested' && row.status !== 'approved') {
        throw new ConflictError(`refund cannot be cancelled from status '${row.status}'`);
      }
      await ctx.query(`UPDATE refund SET status = 'cancelled', note = COALESCE(note || ' | ', '') || $2 WHERE id = $1`, [
        refundId, `cancelled: ${reason}`,
      ]);
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'refund.cancelled', entityType: 'refund', entityId: refundId,
        details: { code: String(row.code), reason },
      });
      await ctx.outbox.emit('RefundCancelled', { refundId, reason });
      return this.getRefundWithinCtx(ctx, refundId);
    });
  }

  /** External settlement failed AFTER posting: post the clean reversal
   *  journal (tender back in, refunds_payable restored) and mark the
   *  document failed. A safe retry is a NEW refund document — the
   *  failed one no longer consumes the entitlement (guard counts
   *  approved/posted/settled only). */
  async failRefund(principal: ReturnsPrincipal, refundId: string, reason: string): Promise<RefundDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await this.lockRefund(ctx, refundId);
      if (row.status !== 'posted') {
        throw new ConflictError(`refund cannot fail from status '${row.status}'`);
      }
      if (String(row.method) === 'cash') {
        throw new ValidationError('cash refunds settle at posting — they cannot externally fail');
      }
      await lockRefundDomain(ctx, String(row.credit_note_id));

      const purposes = ['refunds_payable' as const, TENDER_GL_PURPOSE[String(row.method)] ?? 'cash'];
      const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
      let debitAccountId = accounts.get(TENDER_GL_PURPOSE[String(row.method)] ?? 'cash')!;
      if (row.bank_account_id != null) {
        const bank = await ctx.query<{ gl_account_id: string | null }>(
          `SELECT gl_account_id FROM bank_account WHERE id = $1`,
          [row.bank_account_id],
        );
        if (bank.rows.length > 0 && bank.rows[0]!.gl_account_id != null) {
          debitAccountId = String(bank.rows[0]!.gl_account_id);
        }
      }
      const amount = String(row.amount);
      await this.finance.postJournal(ctx, {
        sourceKind: 'refund',
        sourceId: refundId,
        event: 'refund_failed_reversal',
        description: `Reversal of failed refund ${String(row.code)}: ${reason}`,
        businessDate: dateCol(row.business_date),
        reference: String(row.code),
        createdBy: principal.userId,
        allowSoftClosedPeriod: true,
        lines: [
          { accountId: debitAccountId, debit: amount, memo: 'failed refund — tender restored' },
          { accountId: accounts.get('refunds_payable')!, credit: amount, memo: 'entitlement restored' },
        ],
      });
      await ctx.query(`UPDATE refund SET status = 'failed' WHERE id = $1`, [refundId]);
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'refund.failed', entityType: 'refund', entityId: refundId,
        details: { code: String(row.code), reason },
      });
      await ctx.outbox.emit('RefundFailed', { refundId, reason });
      return this.getRefundWithinCtx(ctx, refundId);
    });
  }

  // =========================================================================
  // Reads
  // =========================================================================

  async listRefunds(
    tenantId: string,
    filter: { creditNoteId?: string; customerId?: string; status?: string; limit?: number; offset?: number },
  ): Promise<RefundDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const conditions = ['r.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.creditNoteId) {
        params.push(filter.creditNoteId);
        conditions.push(`r.credit_note_id = $${params.length}`);
      }
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`r.customer_id = $${params.length}`);
      }
      if (filter.status) {
        params.push(filter.status);
        conditions.push(`r.status = $${params.length}`);
      }
      params.push(limit, filter.offset ?? 0);
      const rows = await ctx.query(
        `SELECT r.id FROM refund r WHERE ${conditions.join(' AND ')}
         ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const items: RefundDto[] = [];
      for (const row of rows.rows) {
        items.push(await this.getRefundWithinCtx(ctx, String(row.id)));
      }
      return items;
    });
  }

  async getRefund(tenantId: string, refundId: string): Promise<RefundDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getRefundWithinCtx(ctx, refundId));
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private async getRefundWithinCtx(ctx: UowContext, refundId: string): Promise<RefundDto> {
    const r = await ctx.query(
      `SELECT r.*, cn.code AS credit_note_code, ro.code AS return_order_code, c.name AS customer_name,
              ba.code AS bank_account_code
         FROM refund r
         LEFT JOIN credit_note cn ON cn.id = r.credit_note_id
         LEFT JOIN return_order ro ON ro.id = r.return_order_id
         LEFT JOIN customer c ON c.id = r.customer_id
         LEFT JOIN bank_account ba ON ba.id = r.bank_account_id
        WHERE r.id = $1`,
      [refundId],
    );
    if (r.rows.length === 0) throw new NotFoundError('refund', refundId);
    const row = r.rows[0] as Record<string, unknown> & { business_date: Date; created_at: Date; approved_at: Date | null; posted_at: Date | null; settled_at: Date | null };
    const s = (v: unknown): string => String(v);
    return {
      id: s(row.id),
      code: s(row.code),
      creditNoteId: s(row.credit_note_id),
      creditNoteCode: row.credit_note_code == null ? null : s(row.credit_note_code),
      returnOrderId: s(row.return_order_id),
      returnOrderCode: row.return_order_code == null ? null : s(row.return_order_code),
      customerId: s(row.customer_id),
      customerName: row.customer_name == null ? null : s(row.customer_name),
      amount: s(row.amount),
      method: s(row.method),
      bankAccountId: row.bank_account_id == null ? null : s(row.bank_account_id),
      bankAccountCode: row.bank_account_code == null ? null : s(row.bank_account_code),
      momoProvider: row.momo_provider == null ? null : s(row.momo_provider),
      momoPhone: row.momo_phone == null ? null : s(row.momo_phone),
      reference: row.reference == null ? null : s(row.reference),
      note: row.note == null ? null : s(row.note),
      status: s(row.status) as RefundDto['status'],
      approvedBy: row.approved_by == null ? null : s(row.approved_by),
      approvedAt: tsColNull(row.approved_at),
      postedBy: row.posted_by == null ? null : s(row.posted_by),
      postedAt: tsColNull(row.posted_at),
      journalEntryId: row.journal_entry_id == null ? null : s(row.journal_entry_id),
      settledAt: tsColNull(row.settled_at),
      settledBy: row.settled_by == null ? null : s(row.settled_by),
      settlementReference: row.settlement_reference == null ? null : s(row.settlement_reference),
      businessDate: dateCol(row.business_date),
      createdAt: tsCol(row.created_at),
    };
  }

  private async lockRefund(ctx: UowContext, refundId: string) {
    const r = await ctx.query(`SELECT * FROM refund WHERE id = $1 FOR UPDATE`, [refundId]);
    if (r.rows.length === 0) throw new NotFoundError('refund', refundId);
    return r.rows[0] as Record<string, unknown> & {
      business_date: Date;
      status: string;
      code: string;
      amount: string;
      method: string;
      credit_note_id: string;
      bank_account_id: string | null;
    };
  }

  /** outstanding refundable entitlement of a credit note:
   *  refund_amount − committed refunds − exchange consumptions.
   *  (Voided store credits add back to the pool — see the DB guard.) */
  async outstandingRefundEntitlement(ctx: UowContext, creditNoteId: string): Promise<bigint> {
    const r = await ctx.query<{ outstanding: string }>(
      `SELECT (cn.refund_amount
               + COALESCE((SELECT SUM(sc.amount) FROM store_credit sc
                   WHERE sc.credit_note_id = cn.id AND sc.status = 'void'), 0)
               - COALESCE((SELECT SUM(r.amount) FROM refund r
                   WHERE r.credit_note_id = cn.id AND r.status IN ('approved','posted','settled')), 0)
               - COALESCE((SELECT SUM(exc.consumed_refund_amount) FROM exchange exc
                   WHERE exc.return_order_id = cn.return_order_id), 0))::text AS outstanding
         FROM credit_note cn WHERE cn.id = $1`,
      [creditNoteId],
    );
    if (r.rows.length === 0) throw new NotFoundError('credit note', creditNoteId);
    const value = parseMoney(String(r.rows[0]!.outstanding));
    return value > 0n ? value : 0n;
  }

  /** When the refundable entitlement is fully settled (settled refunds +
   *  exchange consumptions), the return order completes. */
  async checkReturnCompletion(ctx: UowContext, creditNoteId: string): Promise<void> {
    const r = await ctx.query(
      `UPDATE return_order ro SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE ro.credit_note_id = $1 AND ro.status = 'processed'
           AND ro.refund_amount > 0
           AND ro.refund_amount <= (
             COALESCE((SELECT SUM(r.amount) FROM refund r
                 WHERE r.credit_note_id = $1 AND r.status = 'settled'), 0)
             + COALESCE((SELECT SUM(exc.consumed_refund_amount) FROM exchange exc
                 WHERE exc.return_order_id = ro.id), 0))
       RETURNING ro.id, ro.code`,
      [creditNoteId],
    );
    for (const row of r.rows) {
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: null,
        actorDisplay: 'system',
        action: 'return_order.completed',
        entityType: 'return_order',
        entityId: String(row.id),
        details: { code: String(row.code), reason: 'refund entitlement fully settled' },
      });
      await ctx.outbox.emit('ReturnOrderCompleted', { returnOrderId: String(row.id) });
    }
  }
}
