import { Injectable } from '@nestjs/common';
import type { InvoiceReversalDto, ListDto, ReverseInvoice } from '@idepot/contracts';
import {
  ConflictError,
  MONEY_SCALE,
  NotFoundError,
  addScaled,
  formatMoney,
  parseMoney,
  subScaled,
  type JournalLineSpec,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from '../inventory/stock-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';

import type { SalePrincipal } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from './document-sequence.service.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * INVOICE REVERSAL (review hardening P0) — the append-only correction
 * document for a posted invoice.
 *
 * ONE UnitOfWork transaction inverses everything the sale committed:
 *
 *   STOCK/AVCO — one 'reversal' movement per original issue, linked through
 *     reversal_of. The StockPoster copies the ORIGINAL movement's
 *     (unit_cost, cost_value) evidence VERBATIM, so both the quantity and
 *     the AVCO value layers return exactly; uq_stock_movement_reversal_of
 *     makes a double reversal structurally impossible.
 *
 *   GL — the reversal journal INVERTS the original sale journal line by
 *     line (every debit becomes a credit and vice versa, aggregated per
 *     account): revenue, tax payable, tender control accounts, change,
 *     receivable, deposits consumed, COGS and inventory all return to
 *     their pre-sale state.
 *
 *   AR — money and credit that settled the invoice AFTER the sale
 *     (standalone receipts T2, standalone credit applications C2) left a
 *     receivable credit the inverted journal does not know about: after
 *     the inversion the AR balance would go negative by exactly T2 + C2.
 *     One extra pair — DR accounts receivable / CR customer deposits for
 *     T2 + C2 — clears the receivable to zero and converts that later
 *     settled value into a usable deposit for the customer.
 *
 *   DEPOSITS — the value the customer had already settled on the reversed
 *     invoice (sale-time credit C + later T2 + C2) is restored as ONE new
 *     append-only customer_deposit row (linked via restored_deposit_id);
 *     the legacy deposit rows and application rows stay untouched as
 *     history (both are append-only by grant design).
 *
 *   The sale's own payment/allocation rows and every later receipt stay
 *   as committed facts — money did change hands; the accounting inverse
 *   lives in the journals, the subledger restoration in the new deposit.
 *
 * Guards: only status='posted' invoices (voided/reversed are refused);
 * exactly one reversal per invoice (DB UNIQUE); idempotent retry by
 * client_doc_id (DB UNIQUE — a replay returns the original document);
 * a pre-hardening invoice without a sale journal is refused with a pointer
 * to the documented Phase 4 back-fill.
 */
@Injectable()
export class ReversalService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly poster: StockPoster,
    private readonly sequences: DocumentSequenceService,
    private readonly finance: FinancialConfigurationService,
  ) {}

  reverseInvoice(principal: SalePrincipal, invoiceId: string, dto: ReverseInvoice): Promise<InvoiceReversalDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, (ctx) =>
      this.postReversal(ctx, principal, invoiceId, dto),
    );
  }

  async postReversal(
    ctx: UowContext,
    principal: SalePrincipal,
    invoiceId: string,
    dto: ReverseInvoice,
  ): Promise<InvoiceReversalDto> {
    // ---- 0. idempotent replay of the correction command itself -----------
    if (dto.clientDocId) {
      const existing = await ctx.query<{ id: string }>(
        `SELECT id FROM invoice_reversal WHERE tenant_id = $1 AND client_doc_id = $2`,
        [ctx.tenantId, dto.clientDocId],
      );
      if (existing.rows.length > 0) return this.loadReversal(ctx, String(existing.rows[0]!.id));
    }

    // ---- 1. lock + validate the invoice ----------------------------------
    const invRes = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, customer_id, warehouse_id, status, total::text AS total
       FROM invoice WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [invoiceId, ctx.tenantId],
    );
    if (invRes.rows.length === 0) throw new NotFoundError('invoice', invoiceId);
    const invoice = invRes.rows[0]!;
    if (String(invoice.status) !== 'posted') {
      throw new ConflictError(`invoice ${String(invoice.code)} is ${String(invoice.status)} — only a posted invoice can be reversed`);
    }
    const customerId = invoice.customer_id ? String(invoice.customer_id) : null;
    const invoiceCode = String(invoice.code);

    // ---- 2. the original sale journal (the accounting source of truth) ---
    const journalRes = await ctx.query<{ id: string }>(
      `SELECT id FROM journal_entry
       WHERE tenant_id = $1 AND source_kind = 'invoice' AND source_id = $2 AND event = 'sale_posted'`,
      [ctx.tenantId, invoiceId],
    );
    if (journalRes.rows.length === 0) {
      throw new ConflictError(
        `invoice ${invoiceCode} predates the GL hardening (no sale journal to inverse) — corrections for pre-hardening documents arrive with the Phase 4 back-fill`,
      );
    }
    const saleJournalId = String(journalRes.rows[0]!.id);
    const journalLines = await ctx.query<{ account_id: string; debit: string; credit: string; memo: string | null }>(
      `SELECT account_id, debit::text AS debit, credit::text AS credit, memo
       FROM journal_line WHERE entry_id = $1 ORDER BY id`,
      [saleJournalId],
    );
    if (journalLines.rows.length === 0) {
      throw new ConflictError(`sale journal of invoice ${invoiceCode} has no lines — refusing to reverse blind`);
    }

    // ---- 3. settlement decomposition (what settled AFTER the sale) -------
    const accounts = await this.finance.resolveGlAccounts(ctx, [
      'accounts_receivable',
      'customer_deposit_liability',
    ]);
    const depositAccountId = accounts.get('customer_deposit_liability')!;

    // sale-time deposits leg C (the sale journal's deposit-liability debit)
    let saleCreditConsumed = 0n;
    for (const l of journalLines.rows) {
      if (String(l.account_id) === depositAccountId) {
        saleCreditConsumed = addScaled(saleCreditConsumed, MONEY_SCALE, parseMoney(l.debit), MONEY_SCALE).value;
      }
    }

    // all money allocated to this invoice, split by sale-carried vs later
    const allocRes = await ctx.query<{ sale: string; all: string }>(
      `SELECT
         COALESCE(SUM(a.amount) FILTER (WHERE p.source = 'sale'), 0)::text AS sale,
         COALESCE(SUM(a.amount), 0)::text AS all
       FROM payment_allocation a JOIN payment p ON p.id = a.payment_id
       WHERE a.tenant_id = $1 AND a.invoice_id = $2`,
      [ctx.tenantId, invoiceId],
    );
    const allocAll = parseMoney(allocRes.rows[0]!.all);
    const allocSale = parseMoney(allocRes.rows[0]!.sale);
    const laterMoney = subScaled(allocAll, MONEY_SCALE, allocSale, MONEY_SCALE).value; // T2

    // all credit applications, minus the sale-time leg → later applies (C2)
    const creditRes = await ctx.query<{ all: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS all FROM credit_application
       WHERE tenant_id = $1 AND invoice_id = $2`,
      [ctx.tenantId, invoiceId],
    );
    const creditAll = parseMoney(creditRes.rows[0]!.all);
    const laterCredit = subScaled(creditAll, MONEY_SCALE, saleCreditConsumed, MONEY_SCALE).value; // C2

    // clearing pair amount + restored deposit total
    const clearing = addScaled(laterMoney, MONEY_SCALE, laterCredit, MONEY_SCALE).value; // T2 + C2
    const restoredDeposit = addScaled(saleCreditConsumed, MONEY_SCALE, clearing, MONEY_SCALE).value; // C + T2 + C2

    if ((clearing > 0n || restoredDeposit > 0n) && !customerId) {
      throw new ConflictError(
        `invoice ${invoiceCode} was settled by payments/credit but has no customer to restore the value to — record the customer before reversing`,
      );
    }

    // ---- 4. the correction document's code (uniqueness claimed below) ----
    const code = await this.sequences.allocate(ctx, { docType: 'INVOICE_REVERSAL' });
    // the restored deposit is written BEFORE the reversal row: the append-only
    // grants leave no UPDATE path, so the reversal row lands complete
    const needsDeposit = restoredDeposit > 0n;
    const depositCode = needsDeposit
      ? await this.sequences.allocate(ctx, { docType: 'DEPOSIT' })
      : null;

    // ---- 5. stock/AVCO inverse (verbatim cost evidence) -------------------
    const originals = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, quantity_base::text AS quantity_base
       FROM stock_movement
       WHERE tenant_id = $1 AND source_document_type = 'invoice' AND source_document_id = $2
         AND movement_type = 'issue'`,
      [ctx.tenantId, invoiceId],
    );
    if (originals.rows.length === 0) {
      throw new ConflictError(`invoice ${invoiceCode} has no issue movements to reverse`);
    }
    await this.poster.post(
      ctx,
      originals.rows.map((m) => {
        const q = String(m.quantity_base);
        return {
          warehouseId: String(invoice.warehouse_id),
          productId: String(m.product_id),
          movementType: 'reversal' as const,
          // sign-flipped base quantity: the issue was negative
          quantityBase: q.startsWith('-') ? q.slice(1) : `-${q}`,
          reason: `reversal of invoice ${invoiceCode}: ${dto.reason.slice(0, 160)}`,
          reversalOf: String(m.id),
        };
      }),
      {
        sourceDocumentType: 'invoice_reversal',
        sourceDocumentId: invoiceId,
        createdBy: principal.userId,
      },
    );

    // ---- 6. GL inverse: invert the sale journal, clear residual AR --------
    // aggregate the inverted lines per account; opposite sides on the same
    // account NET to one one-sided line (JournalBuilder requirement)
    const inverted = new Map<string, { debit: bigint; credit: bigint }>();
    for (const l of journalLines.rows) {
      const acc = String(l.account_id);
      const row = inverted.get(acc) ?? { debit: 0n, credit: 0n };
      row.debit = addScaled(row.debit, MONEY_SCALE, parseMoney(l.credit), MONEY_SCALE).value;
      row.credit = addScaled(row.credit, MONEY_SCALE, parseMoney(l.debit), MONEY_SCALE).value;
      inverted.set(acc, row);
    }
    if (clearing > 0n) {
      const ar = inverted.get(accounts.get('accounts_receivable')!) ?? { debit: 0n, credit: 0n };
      ar.debit = addScaled(ar.debit, MONEY_SCALE, clearing, MONEY_SCALE).value;
      const dep = inverted.get(depositAccountId) ?? { debit: 0n, credit: 0n };
      dep.credit = addScaled(dep.credit, MONEY_SCALE, clearing, MONEY_SCALE).value;
    }
    const journalSpecs: JournalLineSpec[] = [];
    for (const [accountId, amounts] of inverted) {
      const debit = amounts.debit > amounts.credit ? subScaled(amounts.debit, MONEY_SCALE, amounts.credit, MONEY_SCALE).value : 0n;
      const credit = amounts.credit > amounts.debit ? subScaled(amounts.credit, MONEY_SCALE, amounts.debit, MONEY_SCALE).value : 0n;
      if (debit === 0n && credit === 0n) continue; // fully cancelled account
      journalSpecs.push({
        accountId,
        debit: formatMoney(debit),
        credit: formatMoney(credit),
        memo: `invoice ${invoiceCode} reversal`,
      });
    }
    const journal = await this.finance.postJournal(ctx, {
      sourceKind: 'invoice_reversal',
      sourceId: invoiceId,
      event: 'invoice_reversed',
      description: `Reversal of invoice ${invoiceCode}`,
      createdBy: principal.userId,
      lines: journalSpecs,
    });

    // ---- 7. restore settled value as ONE new append-only deposit --------
    let restoredDepositId: string | null = null;
    if (needsDeposit && depositCode) {
      const depRes = await ctx.query<{ id: string }>(
        `INSERT INTO customer_deposit (tenant_id, code, customer_id, amount, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          ctx.tenantId,
          depositCode,
          customerId,
          formatMoney(restoredDeposit),
          `value restored by invoice reversal ${code} (${invoiceCode})`,
          principal.userId,
        ],
      );
      restoredDepositId = String(depRes.rows[0]!.id);
    }

    // ---- 8. the reversal document (complete: journal + deposit linked) ---
    let reversalId: string;
    try {
      const res = await ctx.query<{ id: string }>(
        `INSERT INTO invoice_reversal
           (tenant_id, invoice_id, code, reason, journal_entry_id, restored_deposit_id, client_doc_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.tenantId, invoiceId, code, dto.reason, journal?.id ?? null, restoredDepositId, dto.clientDocId ?? null, principal.userId],
      );
      reversalId = String(res.rows[0]!.id);
    } catch (err) {
      if (pgCode(err) === '23505') {
        // client_doc_id replay raced us, or the invoice is already reversed
        if (dto.clientDocId) {
          const existing = await ctx.query<{ id: string }>(
            `SELECT id FROM invoice_reversal WHERE tenant_id = $1 AND client_doc_id = $2`,
            [ctx.tenantId, dto.clientDocId],
          );
          if (existing.rows.length > 0) return this.loadReversal(ctx, String(existing.rows[0]!.id));
        }
        throw new ConflictError(`invoice ${invoiceCode} has already been reversed (one reversal per invoice)`);
      }
      throw err;
    }

    // ---- 9. flip the invoice (inside the same transaction) ---------------
    await ctx.query(
      `UPDATE invoice SET status = 'reversed', reversed_at = now() WHERE tenant_id = $1 AND id = $2`,
      [ctx.tenantId, invoiceId],
    );

    // ---- 10. audit + outbox (committed facts only) -----------------------
    await ctx.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: principal.userId,
      actorDisplay: principal.displayName,
      action: 'invoice.reversed',
      entityType: 'invoice_reversal',
      entityId: reversalId,
      details: {
        code,
        invoiceId,
        invoiceCode,
        reason: dto.reason,
        journalId: journal?.id ?? null,
        restoredDepositId,
        laterMoney: formatMoney(laterMoney),
        laterCredit: formatMoney(laterCredit),
        movementsReversed: originals.rows.length,
      },
    });
    await ctx.outbox.emit('InvoiceReversed', {
      reversalId,
      code,
      invoiceId,
      invoiceCode,
      reason: dto.reason,
      journalId: journal?.id ?? null,
      restoredDepositId,
    });

    return {
      id: reversalId,
      code,
      invoiceId,
      invoiceCode,
      reason: dto.reason,
      journalEntryId: journal?.id ?? null,
      restoredDepositId,
      clientDocId: dto.clientDocId ?? null,
      createdBy: principal.userId,
      createdAt: new Date().toISOString(),
    };
  }

  /* --------------------------------- reads -------------------------------- */

  getReversal(tenantId: string, invoiceId: string): Promise<InvoiceReversalDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM invoice_reversal WHERE tenant_id = $1 AND invoice_id = $2`,
        [ctx.tenantId, invoiceId],
      );
      if (res.rows.length === 0) throw new NotFoundError('invoice_reversal for invoice', invoiceId);
      return this.loadReversal(ctx, String(res.rows[0]!.id));
    });
  }

  listReversals(tenantId: string, opts: { invoiceId?: string; limit?: number } = {}): Promise<ListDto<InvoiceReversalDto>> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'r.tenant_id = $1';
      if (opts.invoiceId) {
        params.push(opts.invoiceId);
        where += ` AND r.invoice_id = $${params.length}`;
      }
      const limit = Math.min(opts.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT r.id FROM invoice_reversal r WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit}`,
        params,
      );
      const items: InvoiceReversalDto[] = [];
      for (const r of res.rows) items.push(await this.loadReversal(ctx, String(r.id)));
      return { items, total: items.length };
    });
  }

  private async loadReversal(ctx: UowContext, id: string): Promise<InvoiceReversalDto> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT r.id, r.code, r.invoice_id, i.code AS invoice_code, r.reason,
              r.journal_entry_id, r.restored_deposit_id, r.client_doc_id,
              r.created_by, r.created_at
       FROM invoice_reversal r
       LEFT JOIN invoice i ON i.id = r.invoice_id
       WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, ctx.tenantId],
    );
    if (res.rows.length === 0) throw new NotFoundError('invoice_reversal', id);
    const r = res.rows[0]!;
    return {
      id: String(r.id),
      code: String(r.code),
      invoiceId: String(r.invoice_id),
      invoiceCode: r.invoice_code ? String(r.invoice_code) : null,
      reason: String(r.reason),
      journalEntryId: r.journal_entry_id ? String(r.journal_entry_id) : null,
      restoredDepositId: r.restored_deposit_id ? String(r.restored_deposit_id) : null,
      clientDocId: r.client_doc_id ? String(r.client_doc_id) : null,
      createdBy: r.created_by ? String(r.created_by) : null,
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
