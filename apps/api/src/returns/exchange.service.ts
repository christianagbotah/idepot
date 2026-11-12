/**
 * Exchanges (Phase 5 §8) — an exchange is a LINKED return + replacement
 * sale settled ATOMICALLY in ONE UnitOfWork transaction:
 *
 *   1. the return order is created + submitted + approved (+ received)
 *      and PROCESSED through the standard credit-note path (stock
 *      disposition, tax reversal at original evidence, AR settlement);
 *   2. the replacement sale is posted through the standard SalePoster
 *      (server price authority, stock issues, COGS evidence, tenders);
 *   3. the residual return entitlement (refunds payable) consumes the
 *      replacement invoice's AR:
 *        Dr refunds_payable  consumed
 *        Cr accounts_receivable  consumed
 *      Additional payment (replacement MORE expensive) arrives as normal
 *      sale tenders; a cheaper replacement leaves the residual
 *      entitlement outstanding for a later refund.
 *
 * No destructive invoice edit anywhere: append-only linked documents.
 * UNIQUE (tenant, return_order_id) makes an exchange per return
 * structurally single.
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreateExchange, ExchangeDto } from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  IdempotencyKeyReuseError,
  parseMoney,
  formatMoney,
  exchangeRequestFingerprint,
} from '@idepot/domain';
import { hasPermission } from '@idepot/auth';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SalePoster, type SaleInput } from '../sales/sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ReturnsService } from './returns.service.js';
import { dateCol, tsCol, mapUniqueViolation, type ReturnsPrincipal } from './returns-common.js';

@Injectable()
export class ExchangeService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly finance: FinancialConfigurationService,
    private readonly sequences: DocumentSequenceService,
    private readonly returns: ReturnsService,
    private readonly salePoster: SalePoster,
  ) {}

  async createExchange(principal: ReturnsPrincipal, dto: CreateExchange): Promise<ExchangeDto> {
    const fingerprint = exchangeRequestFingerprint(principal.tenantId, {
      invoiceId: dto.invoiceId,
      reasonCode: dto.reasonCode,
      returnLines: dto.returnLines.map((l) => ({
        invoiceLineId: l.invoiceLineId,
        quantity: l.quantity,
        condition: l.condition,
        disposition: l.disposition,
      })),
      replacement: {
        warehouseId: dto.replacement.warehouseId,
        lines: dto.replacement.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      },
      businessDate: dto.businessDate ?? new Date().toISOString().slice(0, 10),
    });

    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.clientDocId) {
        await ctx.query(
          `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
          [`exchange-idem:${ctx.tenantId}:${dto.clientDocId}`],
        );
        const existing = await ctx.query(`SELECT id FROM exchange WHERE client_doc_id = $1`, [dto.clientDocId]);
        if (existing.rows.length > 0) {
          const fp = await ctx.query(`SELECT request_fingerprint FROM exchange WHERE id = $1`, [existing.rows[0]!.id]);
          if (String(fp.rows[0]!.request_fingerprint) === fingerprint) {
            return this.getExchangeWithinCtx(ctx, String(existing.rows[0]!.id));
          }
          throw new IdempotencyKeyReuseError('exchange command idempotency key was already used with a different payload');
        }
      }

      // ---- 1. the return side (standard lifecycle, forced refund
      //          disposition so the entitlement is refund payable) -----
      const created = await this.returns.createReturn(principal, {
        invoiceId: dto.invoiceId,
        reasonCode: dto.reasonCode,
        warehouseId: null,
        creditDisposition: 'refund',
        lines: dto.returnLines,
        adjustmentAmount: '0',
        customerNote: `exchange replacement`,
        internalNote: null,
        businessDate: dto.businessDate,
        clientDocId: null,
        submit: true,
      });
      const returnId = created.id;

      let current = created;
      if (current.status === 'submitted') {
        // the reason requires approval: the principal must hold it
        if (!hasPermission(principal.roles ?? [], 'returns:approve')) {
          throw new ForbiddenExchangeApproval();
        }
        current = await this.returns.approveReturn(principal, { id: returnId });
      }
      if (current.status === 'approved') {
        current = await this.returns.receiveReturn(principal, { id: returnId, inspectionNote: 'exchange receiving' });
      }
      if (current.status !== 'received') {
        throw new ConflictError(`exchange return could not reach the received state (current: '${current.status}')`);
      }

      const processed = await this.returns.processWithinCtx(ctx, principal, returnId, {
        forceRefundDisposition: true,
      });
      const entitlement = parseMoney(processed.dto.refundAmount ?? '0');

      // ---- 2. the replacement sale (standard SalePoster, same tx) ----
      const invoiceRow = await ctx.query(
        `SELECT customer_id FROM invoice WHERE id = $1`,
        [dto.invoiceId],
      );
      if (invoiceRow.rows.length === 0) throw new NotFoundError('invoice', dto.invoiceId);
      const customerId = invoiceRow.rows[0]!.customer_id == null ? undefined : String(invoiceRow.rows[0]!.customer_id);

      const saleInput: SaleInput = {
        warehouseId: dto.replacement.warehouseId,
        customerId,
        shiftId: null,
        note: `exchange for return ${processed.dto.code}`,
        lines: dto.replacement.lines.map((l) => ({
          productId: l.productId,
          unitId: l.unitId ?? null,
          quantityBase: l.quantity,
          quantityTransacted: l.quantityTransacted ?? null,
          conversionFactor: l.conversionFactor ?? null,
          unitPrice: l.unitPrice,
          note: l.note ?? null,
        })),
        tenders: dto.tenders,
        source: 'pos',
      };
      const sale = await this.salePoster.postSale(ctx, principal, saleInput);
      const replacementTotal = parseMoney(sale.invoice.total);

      // ---- 4. the exchange document ------------------------------------
      // the id is allocated BEFORE the settlement journal so the journal
      // references the real document (journal source linkage)
      const code = await this.sequences.allocate(ctx, { docType: 'EXCHANGE' });
      const id = randomUUID();

      // ---- 3. settlement: consume entitlement against the replacement AR
      const tenderTotal = dto.tenders.reduce((s, t) => s + parseMoney(t.amount), 0n);
      const replacementAr = replacementTotal - tenderTotal;
      const consume = entitlement < replacementAr ? entitlement : replacementAr > 0n ? replacementAr : 0n;

      let journalEntryId: string | null = null;
      if (consume > 0n) {
        const accounts = await this.finance.resolveGlAccounts(ctx, ['refunds_payable', 'accounts_receivable']);
        const settlementJournal = await this.finance.postJournal(ctx, {
          sourceKind: 'exchange',
          sourceId: id,
          event: 'exchange_settled',
          description: `Exchange settlement: return ${processed.dto.code} ↔ replacement ${sale.invoice.code}`,
          businessDate: dto.businessDate ?? null,
          reference: sale.invoice.code,
          createdBy: principal.userId,
          allowSoftClosedPeriod: true,
          lines: [
            { accountId: accounts.get('refunds_payable')!, debit: formatMoney(consume), memo: 'return entitlement consumed by exchange' },
            { accountId: accounts.get('accounts_receivable')!, credit: formatMoney(consume), memo: 'replacement invoice settled by exchange credit' },
          ],
        });
        journalEntryId = settlementJournal?.id ?? null;
      }

      const difference = replacementTotal - entitlement;
      const settlement: ExchangeDto['settlement'] =
        tenderTotal > 0n ? 'additional_payment' : consume < entitlement ? 'residual_credit' : 'even';

      try {
        await ctx.query(
          `INSERT INTO exchange (id, tenant_id, code, return_order_id, replacement_invoice_id, customer_id,
             return_credit, replacement_total, price_difference, settlement, consumed_refund_amount,
             journal_entry_id, business_date, client_doc_id, request_fingerprint, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            id, ctx.tenantId, code, returnId, sale.invoice.id, customerId ?? null,
            formatMoney(entitlement), formatMoney(replacementTotal), formatMoney(difference),
            settlement, formatMoney(consume), journalEntryId,
            dto.businessDate ?? new Date().toISOString().slice(0, 10), dto.clientDocId ?? null, fingerprint, principal.userId,
          ],
        );
      } catch (err) {
        mapUniqueViolation(err, 'exchange document already exists (duplicate client document id or return)');
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId, actorUserId: principal.userId, actorDisplay: principal.displayName,
        action: 'exchange.created', entityType: 'exchange', entityId: id,
        details: {
          code, returnOrderCode: processed.dto.code, replacementInvoiceCode: sale.invoice.code,
          returnCredit: formatMoney(entitlement), replacementTotal: formatMoney(replacementTotal),
          priceDifference: formatMoney(difference), settlement, consumed: formatMoney(consume),
        },
      });
      await ctx.outbox.emit('ExchangeCreated', {
        exchangeId: id, code, returnOrderId: returnId, replacementInvoiceId: sale.invoice.id,
        settlement, priceDifference: formatMoney(difference),
      });

      if (dto.simulateFailure === 'after_writes') {
        throw new ValidationError('simulated failure after exchange writes (atomicity test)');
      }

      return this.getExchangeWithinCtx(ctx, id);
    });
  }

  async listExchanges(
    tenantId: string,
    filter: { customerId?: string; limit?: number; offset?: number },
  ): Promise<ExchangeDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const limit = Math.min(filter.limit ?? 100, 500);
      const conditions = ['exc.tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.customerId) {
        params.push(filter.customerId);
        conditions.push(`exc.customer_id = $${params.length}`);
      }
      params.push(limit, filter.offset ?? 0);
      const rows = await ctx.query(
        `SELECT exc.id FROM exchange exc WHERE ${conditions.join(' AND ')}
         ORDER BY exc.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const items: ExchangeDto[] = [];
      for (const r of rows.rows) {
        items.push(await this.getExchangeWithinCtx(ctx, String(r.id)));
      }
      return items;
    });
  }

  async getExchange(tenantId: string, exchangeId: string): Promise<ExchangeDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getExchangeWithinCtx(ctx, exchangeId));
  }

  private async getExchangeWithinCtx(ctx: UowContext, exchangeId: string): Promise<ExchangeDto> {
    const r = await ctx.query(
      `SELECT exc.*, ro.code AS return_order_code, i.code AS replacement_invoice_code, c.name AS customer_name
         FROM exchange exc
         LEFT JOIN return_order ro ON ro.id = exc.return_order_id
         LEFT JOIN invoice i ON i.id = exc.replacement_invoice_id
         LEFT JOIN customer c ON c.id = exc.customer_id
        WHERE exc.id = $1`,
      [exchangeId],
    );
    if (r.rows.length === 0) throw new NotFoundError('exchange', exchangeId);
    const row = r.rows[0]! as Record<string, unknown> & { business_date: Date; created_at: Date };
    const s = (v: unknown): string => String(v);
    return {
      id: s(row.id),
      code: s(row.code),
      returnOrderId: s(row.return_order_id),
      returnOrderCode: row.return_order_code == null ? null : s(row.return_order_code),
      replacementInvoiceId: s(row.replacement_invoice_id),
      replacementInvoiceCode: row.replacement_invoice_code == null ? null : s(row.replacement_invoice_code),
      customerId: row.customer_id == null ? '' : s(row.customer_id),
      customerName: row.customer_name == null ? null : s(row.customer_name),
      returnCredit: s(row.return_credit),
      replacementTotal: s(row.replacement_total),
      priceDifference: s(row.price_difference),
      settlement: s(row.settlement) as ExchangeDto['settlement'],
      consumedRefundAmount: s(row.consumed_refund_amount),
      journalEntryId: row.journal_entry_id == null ? null : s(row.journal_entry_id),
      businessDate: dateCol(row.business_date),
      createdAt: tsCol(row.created_at),
    };
  }
}

/** Raised when an exchange's reason requires approval but the principal
 *  does not hold returns:approve — a cashier cannot push an unapproved
 *  exchange through the composite command. */
class ForbiddenExchangeApproval extends ConflictError {
  constructor() {
    super(
      'this return reason requires approval — approve the return first or perform the exchange with returns:approve authority',
    );
  }
}
