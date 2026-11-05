/**
 * Store credit (Phase 5 §7) — an EXPLICIT customer-liability instrument
 * issued by credit notes, distinct from pre-payment customer deposits
 * (which remain the Phase 3 substrate). Balances are DERIVED from the
 * append-only redemption ledger (amount − Σ redemptions), never mutated;
 * concurrent redemptions serialize on a per-instrument advisory lock.
 *
 * Expiry is NEVER silent: it is an explicit, permissioned, audited
 * action with a breakage journal (Dr store_credit_liability /
 * Cr refund_breakage_income) — only under authorized accounting policy.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  RedeemStoreCredit,
  StoreCreditDto,
  StoreCreditRedemptionDto,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  IdempotencyKeyReuseError,
  parseMoney,
  formatMoney,
  storeCreditRedemptionFingerprint,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
import type { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
import {
  dateCol,
  tsCol,
  lockStoreCreditDomain,
  mapUniqueViolation,
  type ReturnsPrincipal,
} from './returns-common.js';

@Injectable()
export class StoreCreditService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
  ) {}

  // =========================================================================
  // Reads
  // =========================================================================

  async listStoreCredits(
    tenantId: string,
    filter: { customerId?: string; status?: string; limit?: number; offset?: number },
  ): Promise<StoreCreditDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const conditions = ['sc.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`sc.customer_id = $${params.length}`);
      }
      if (filter.status) {
        params.push(filter.status);
        conditions.push(`sc.status = $${params.length}`);
      }
      params.push(limit, filter.offset ?? 0);
      const rows = await ctx.query(
        `SELECT sc.id FROM store_credit sc WHERE ${conditions.join(' AND ')}
         ORDER BY sc.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const items: StoreCreditDto[] = [];
      for (const r of rows.rows) {
        items.push(await this.loadStoreCredit(ctx, String(r.id)));
      }
      return items;
    });
  }

  async getStoreCredit(tenantId: string, storeCreditId: string): Promise<StoreCreditDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.loadStoreCredit(ctx, storeCreditId));
  }

  async listRedemptions(
    tenantId: string,
    filter: { storeCreditId?: string; invoiceId?: string; customerId?: string; limit?: number },
  ): Promise<StoreCreditRedemptionDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const conditions = ['scr.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.storeCreditId) {
        params.push(filter.storeCreditId);
        conditions.push(`scr.store_credit_id = $${params.length}`);
      }
      if (filter.invoiceId) {
        params.push(filter.invoiceId);
        conditions.push(`scr.invoice_id = $${params.length}`);
      }
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`sc.customer_id = $${params.length}`);
      }
      params.push(limit);
      const rows = await ctx.query(
        `SELECT scr.id FROM store_credit_redemption scr
           JOIN store_credit sc ON sc.id = scr.store_credit_id
          WHERE ${conditions.join(' AND ')}
         ORDER BY scr.created_at DESC LIMIT $${params.length}`,
        params,
      );
      const items: StoreCreditRedemptionDto[] = [];
      for (const r of rows.rows) {
        items.push(await this.loadRedemption(ctx, String(r.id)));
      }
      return items;
    });
  }

  /** Customer store-credit statement: instruments + activity. */
  async customerStatement(tenantId: string, customerId: string): Promise<{
    customerId: string;
    totalIssued: string;
    totalRedeemed: string;
    outstanding: string;
    credits: StoreCreditDto[];
  }> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const credits = await this.listStoreCreditsWithinCtx(ctx, customerId);
      let issued = 0n;
      let redeemed = 0n;
      for (const c of credits) {
        issued += parseMoney(c.amount);
        redeemed += parseMoney(c.redeemedAmount);
      }
      return {
        customerId,
        totalIssued: formatMoney(issued),
        totalRedeemed: formatMoney(redeemed),
        outstanding: formatMoney(issued - redeemed),
        credits,
      };
    });
  }

  private async listStoreCreditsWithinCtx(ctx: UowContext, customerId: string): Promise<StoreCreditDto[]> {
    const rows = await ctx.query(
      `SELECT id FROM store_credit WHERE customer_id = $1 ORDER BY created_at`,
      [customerId],
    );
    const items: StoreCreditDto[] = [];
    for (const r of rows.rows) {
      items.push(await this.loadStoreCredit(ctx, String(r.id)));
    }
    return items;
  }

  // =========================================================================
  // Redemption — settle an invoice due with store credit
  // =========================================================================

  async redeemStoreCredit(principal: ReturnsPrincipal, dto: RedeemStoreCredit): Promise<StoreCreditRedemptionDto> {
    const fingerprint = storeCreditRedemptionFingerprint(principal.tenantId, {
      storeCreditId: dto.storeCreditId,
      invoiceId: dto.invoiceId,
      amount: dto.amount,
      businessDate: dto.businessDate ?? new Date().toISOString().slice(0, 10),
    });

    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.clientDocId) {
        await ctx.query(
          `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
          [`scr-idem:${ctx.tenantId}:${dto.clientDocId}`],
        );
        const existing = await ctx.query(`SELECT id FROM store_credit_redemption WHERE client_doc_id = $1`, [
          dto.clientDocId,
        ]);
        if (existing.rows.length > 0) {
          const fp = await ctx.query(`SELECT request_fingerprint FROM store_credit_redemption WHERE id = $1`, [
            existing.rows[0]!.id,
          ]);
          if (String(fp.rows[0]!.request_fingerprint) === fingerprint) {
            return this.loadRedemption(ctx, String(existing.rows[0]!.id));
          }
          throw new IdempotencyKeyReuseError(
            'store credit redemption idempotency key was already used with a different payload',
          );
        }
      }

      await lockStoreCreditDomain(ctx, dto.storeCreditId);

      const credit = await ctx.query(
        `SELECT * FROM store_credit WHERE id = $1 FOR UPDATE`,
        [dto.storeCreditId],
      );
      if (credit.rows.length === 0) throw new NotFoundError('store credit', dto.storeCreditId);
      const sc = credit.rows[0]!;
      if (String(sc.status) !== 'active') {
        throw new ConflictError(`store credit is '${String(sc.status)}' — only active credits can expire`);
      }
      if (sc.expiry_date != null && dateCol(sc.expiry_date) < (dto.businessDate ?? new Date().toISOString().slice(0, 10))) {
        throw new ConflictError('store credit has expired — redeeming an expired instrument requires the authorized expiry/breakage policy');
      }

      const amount = parseMoney(dto.amount);
      if (amount <= 0n) throw new ValidationError('redemption amount must be positive');
      const remaining = await this.remainingWithinCtx(ctx, dto.storeCreditId);
      if (amount > remaining) {
        throw new ConflictError(`redemption exceeds the remaining store credit (${dto.amount} > ${formatMoney(remaining)})`);
      }

      // invoice must be posted, belong to the same customer, and have due
      const invoice = await ctx.query(
        `SELECT i.id, i.code, i.customer_id, i.status, i.total,
                (COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa WHERE pa.invoice_id = i.id), 0)
                 + COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                 + COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0))::text AS settled
           FROM invoice i WHERE i.id = $1 FOR UPDATE`,
        [dto.invoiceId],
      );
      if (invoice.rows.length === 0) throw new NotFoundError('invoice', dto.invoiceId);
      const inv = invoice.rows[0]!;
      if (String(inv.status) !== 'posted') {
        throw new ConflictError(`invoice is '${String(inv.status)}' — store credit settles posted invoices only`);
      }
      if (String(inv.customer_id) !== String(sc.customer_id)) {
        throw new ValidationError('store credit can only settle invoices of its own customer');
      }
      const due = parseMoney(String(inv.total)) - parseMoney(String(inv.settled));
      if (amount > due) {
        throw new ConflictError(`redemption exceeds the invoice due (${dto.amount} > ${formatMoney(due)})`);
      }

      // GL: Dr store_credit_liability / Cr accounts_receivable
      const accounts = await this.finance.resolveGlAccounts(ctx, ['store_credit_liability', 'accounts_receivable']);
      const redemptionId = randomUUID();
      const journal = await this.finance.postJournal(ctx, {
        sourceKind: 'store_credit_redemption',
        sourceId: redemptionId,
        event: 'store_credit_redeemed',
        description: `Store credit ${String(sc.code)} redeemed against invoice ${String(inv.code)}`,
        businessDate: dto.businessDate ?? null,
        reference: String(sc.code),
        createdBy: principal.userId,
        lines: [
          { accountId: accounts.get('store_credit_liability')!, debit: dto.amount, memo: 'store credit redeemed' },
          { accountId: accounts.get('accounts_receivable')!, credit: dto.amount, memo: 'invoice settled by store credit' },
        ],
      });

      try {
        await ctx.query(
          `INSERT INTO store_credit_redemption (id, tenant_id, store_credit_id, invoice_id, amount,
             journal_entry_id, business_date, client_doc_id, request_fingerprint, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            redemptionId, ctx.tenantId, dto.storeCreditId, dto.invoiceId, dto.amount,
            journal?.id ?? null, dto.businessDate ?? null, dto.clientDocId ?? null, fingerprint, principal.userId,
          ],
        );
      } catch (err) {
        mapUniqueViolation(err, 'store credit redemption already exists (duplicate client document id)');
      }

      if (amount === remaining) {
        await ctx.query(`UPDATE store_credit SET status = 'redeemed' WHERE id = $1`, [dto.storeCreditId]);
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'store_credit.redeemed', entityType: 'store_credit', entityId: dto.storeCreditId,
        details: { code: String(sc.code), invoiceId: dto.invoiceId, invoiceCode: String(inv.code), amount: dto.amount },
      });
      await ctx.outbox.emit('StoreCreditRedeemed', {
        storeCreditId: dto.storeCreditId, code: String(sc.code), invoiceId: dto.invoiceId, amount: dto.amount,
      });

      return this.loadRedemption(ctx, redemptionId);
    });
  }

  // =========================================================================
  // Explicit expiry (authorized accounting policy, never silent) & void
  // =========================================================================

  async expireStoreCredit(principal: ReturnsPrincipal, storeCreditId: string, reason: string): Promise<StoreCreditDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await lockStoreCreditDomain(ctx, storeCreditId);
      const credit = await ctx.query(`SELECT * FROM store_credit WHERE id = $1 FOR UPDATE`, [storeCreditId]);
      if (credit.rows.length === 0) throw new NotFoundError('store credit', storeCreditId);
      const sc = credit.rows[0]!;
      if (String(sc.status) !== 'active') {
        throw new ConflictError(`store credit is '${String(sc.status)}' — only active credits can expire`);
      }
      const remaining = await this.remainingWithinCtx(ctx, storeCreditId);
      if (remaining <= 0n) {
        throw new ConflictError('store credit is fully redeemed — nothing to expire');
      }
      if (sc.expiry_date == null || dateCol(sc.expiry_date) > new Date().toISOString().slice(0, 10)) {
        throw new ValidationError(
          'store credit has not reached its configured expiry date — early expiry requires a documented accounting decision (use void or a policy change)',
        );
      }

      // breakage: the unredeemed liability becomes explicit income
      const accounts = await this.finance.resolveGlAccounts(ctx, ['store_credit_liability', 'refund_breakage_income']);
      await this.finance.postJournal(ctx, {
        sourceKind: 'store_credit',
        sourceId: storeCreditId,
        event: 'store_credit_expired',
        description: `Store credit ${String(sc.code)} expired: ${reason}`,
        businessDate: dateCol(sc.expiry_date),
        reference: String(sc.code),
        createdBy: principal.userId,
        allowSoftClosedPeriod: true,
        lines: [
          { accountId: accounts.get('store_credit_liability')!, debit: formatMoney(remaining), memo: 'expired store credit liability' },
          { accountId: accounts.get('refund_breakage_income')!, credit: formatMoney(remaining), memo: 'store credit breakage income' },
        ],
      });

      await ctx.query(
        `UPDATE store_credit SET status = 'expired', expired_at = now(), expired_by = $2,
           note = COALESCE(note || ' | ', '') || $3 WHERE id = $1`,
        [storeCreditId, principal.userId, `expired: ${reason}`],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'store_credit.expired', entityType: 'store_credit', entityId: storeCreditId,
        details: { code: String(sc.code), breakage: formatMoney(remaining), reason },
      });
      await ctx.outbox.emit('StoreCreditExpired', { storeCreditId, breakage: formatMoney(remaining) });
      return this.loadStoreCredit(ctx, storeCreditId);
    });
  }

  /** Void an UNREDEEMED store credit (authorized correction): converts
   *  the liability back into refund-payable entitlement so a refund
   *  document can pay the customer out. */
  async voidStoreCredit(principal: ReturnsPrincipal, storeCreditId: string, reason: string): Promise<StoreCreditDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await lockStoreCreditDomain(ctx, storeCreditId);
      const credit = await ctx.query(`SELECT * FROM store_credit WHERE id = $1 FOR UPDATE`, [storeCreditId]);
      if (credit.rows.length === 0) throw new NotFoundError('store credit', storeCreditId);
      const sc = credit.rows[0]!;
      if (String(sc.status) !== 'active') {
        throw new ConflictError(`store credit is '${String(sc.status)}' — only active credits can be voided`);
      }
      const redemptions = await ctx.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM store_credit_redemption WHERE store_credit_id = $1`,
        [storeCreditId],
      );
      if (Number(redemptions.rows[0]!.n) > 0) {
        throw new ConflictError('a partially redeemed store credit cannot be voided — issue a correction credit note instead');
      }

      const accounts = await this.finance.resolveGlAccounts(ctx, ['store_credit_liability', 'refunds_payable']);
      await this.finance.postJournal(ctx, {
        sourceKind: 'store_credit',
        sourceId: storeCreditId,
        event: 'store_credit_voided',
        description: `Store credit ${String(sc.code)} voided: ${reason}`,
        businessDate: null,
        reference: String(sc.code),
        createdBy: principal.userId,
        allowSoftClosedPeriod: true,
        lines: [
          { accountId: accounts.get('store_credit_liability')!, debit: String(sc.amount), memo: 'voided store credit liability' },
          { accountId: accounts.get('refunds_payable')!, credit: String(sc.amount), memo: 'entitlement returned to refund payable' },
        ],
      });

      await ctx.query(
        `UPDATE store_credit SET status = 'void', note = COALESCE(note || ' | ', '') || $2 WHERE id = $1`,
        [storeCreditId, `voided: ${reason}`],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'store_credit.voided', entityType: 'store_credit', entityId: storeCreditId,
        details: { code: String(sc.code), amount: String(sc.amount), reason },
      });
      await ctx.outbox.emit('StoreCreditVoided', { storeCreditId, amount: String(sc.amount) });
      return this.loadStoreCredit(ctx, storeCreditId);
    });
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  async remainingWithinCtx(ctx: UowContext, storeCreditId: string): Promise<bigint> {
    const r = await ctx.query<{ remaining: string }>(
      `SELECT (sc.amount - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr
          WHERE scr.store_credit_id = sc.id), 0))::text AS remaining
         FROM store_credit sc WHERE sc.id = $1`,
      [storeCreditId],
    );
    return parseMoney(String(r.rows[0]?.remaining ?? '0'));
  }

  private async loadStoreCredit(ctx: UowContext, storeCreditId: string): Promise<StoreCreditDto> {
    const r = await ctx.query(
      `SELECT sc.*, c.name AS customer_name, cn.code AS credit_note_code
         FROM store_credit sc
         LEFT JOIN customer c ON c.id = sc.customer_id
         LEFT JOIN credit_note cn ON cn.id = sc.credit_note_id
        WHERE sc.id = $1`,
      [storeCreditId],
    );
    if (r.rows.length === 0) throw new NotFoundError('store credit', storeCreditId);
    const sc = r.rows[0]!;
    const redeemed = await ctx.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total FROM store_credit_redemption WHERE store_credit_id = $1`,
      [storeCreditId],
    );
    const amount = parseMoney(String(sc.amount));
    const redeemedAmount = parseMoney(String(redeemed.rows[0]!.total));
    return {
      id: String(sc.id),
      code: String(sc.code),
      creditNoteId: String(sc.credit_note_id),
      creditNoteCode: sc.credit_note_code == null ? null : String(sc.credit_note_code),
      customerId: String(sc.customer_id),
      customerName: sc.customer_name == null ? null : String(sc.customer_name),
      amount: String(sc.amount),
      redeemedAmount: formatMoney(redeemedAmount),
      remainingAmount: formatMoney(amount - redeemedAmount),
      businessDate: dateCol(sc.business_date),
      expiryDate: sc.expiry_date == null ? null : dateCol(sc.expiry_date),
      status: String(sc.status) as StoreCreditDto['status'],
      note: sc.note == null ? null : String(sc.note),
      createdAt: tsCol(sc.created_at),
    };
  }

  private async loadRedemption(ctx: UowContext, redemptionId: string): Promise<StoreCreditRedemptionDto> {
    const r = await ctx.query(
      `SELECT scr.*, sc.code AS store_credit_code, i.code AS invoice_code
         FROM store_credit_redemption scr
         LEFT JOIN store_credit sc ON sc.id = scr.store_credit_id
         LEFT JOIN invoice i ON i.id = scr.invoice_id
        WHERE scr.id = $1`,
      [redemptionId],
    );
    if (r.rows.length === 0) throw new NotFoundError('store credit redemption', redemptionId);
    const row = r.rows[0]!;
    return {
      id: String(row.id),
      storeCreditId: String(row.store_credit_id),
      storeCreditCode: row.store_credit_code == null ? null : String(row.store_credit_code),
      invoiceId: String(row.invoice_id),
      invoiceCode: row.invoice_code == null ? null : String(row.invoice_code),
      amount: String(row.amount),
      journalEntryId: row.journal_entry_id == null ? null : String(row.journal_entry_id),
      businessDate: dateCol(row.business_date),
      createdAt: tsCol(row.created_at),
    };
  }
}
