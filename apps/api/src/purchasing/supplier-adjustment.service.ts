/**
 * Supplier adjustments — append-only debit/credit notes (Phase 4).
 *
 * A correction NEVER edits the source supplier invoice (defect class:
 * destructive posted edits). Effects post transactionally to:
 *   supplier subledger (the AP equation picks the adjustment up),
 *   GL (AP debit / inventory credit for returned stock at AVCO cost /
 *   purchase_expense for the remainder),
 *   stock (return-to-supplier issue movements, append-only),
 *   audit + outbox — one transaction.
 */
import { Injectable } from '@nestjs/common';
import type { CreateSupplierAdjustment, SupplierAdjustmentDto } from '@idepot/contracts';
import {
  ConflictError,
  ValidationError,
  formatMoney,
  parseMoney,
  parseQuantity,
  type GlPurpose,
  type JournalLineSpec,
  type MovementEntry,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from '../inventory/stock-poster.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from '../finance/financial-configuration.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ApPaymentService } from './ap-payment.service.js';
import {
  dateCol,
  lockApInvoiceDomain,
  pgCode,
  refreshInvoiceStatus,
  requireRow,
  type PurchasingPrincipal,
} from './purchasing-common.js';

@Injectable()
export class SupplierAdjustmentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
    private readonly stockPoster: StockPoster,
    private readonly finance: FinancialConfigurationService,
    private readonly apPayments: ApPaymentService,
  ) {}

  async createSupplierAdjustment(
    principal: PurchasingPrincipal,
    dto: CreateSupplierAdjustment,
  ): Promise<SupplierAdjustmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [dto.supplierId]);
      const amount = parseMoney(dto.amount);

      // target invoice (optional): validate ownership + AP headroom
      if (dto.supplierInvoiceId != null && dto.supplierInvoiceId !== '') {
        await lockApInvoiceDomain(ctx, dto.supplierInvoiceId);
        const inv = await requireRow<Record<string, unknown>>(ctx, 'supplier_invoice', dto.supplierInvoiceId);
        if (String(inv.supplier_id) !== dto.supplierId) {
          throw new ValidationError('adjustment target invoice belongs to a different supplier');
        }
        if (String(inv.status) === 'cancelled') {
          throw new ConflictError('cannot adjust a cancelled supplier invoice');
        }
        if (dto.kind === 'credit_note') {
          const open = await this.apPayments.openApForInvoice(ctx, dto.supplierInvoiceId);
          if (amount > open) {
            throw new ConflictError(
              `credit note ${dto.amount} exceeds the invoice open AP ${formatMoney(open)} — AP cannot go negative`,
            );
          }
        }
      } else if (dto.stockReturn != null && dto.stockReturn.length > 0) {
        throw new ValidationError('stock returns require a target supplier invoice');
      }
      if (dto.kind === 'debit_note' && dto.stockReturn != null && dto.stockReturn.length > 0) {
        throw new ValidationError('stock returns apply to credit notes only');
      }

      await this.finance.assertPeriodOpen(ctx, dto.businessDate, { allowSoftClosed: true });
      const code = await this.sequences.allocate(ctx, { docType: 'SUPPLIER_ADJUSTMENT' });

      let adjustmentId: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO supplier_adjustment
             (tenant_id, code, kind, supplier_id, supplier_invoice_id, business_date, reason,
              adjustment_class, amount, stock_return, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            ctx.tenantId, code, dto.kind, dto.supplierId, dto.supplierInvoiceId ?? null,
            dto.businessDate, dto.reason, dto.adjustmentClass, formatMoney(amount),
            (dto.stockReturn?.length ?? 0) > 0, principal.userId,
          ],
        );
        adjustmentId = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`adjustment code "${code}" already exists`);
        throw err;
      }

      // ---- stock returns: append-only issue movements at AVCO cost -----
      let stockReturnValue = 0n;
      if (dto.stockReturn != null && dto.stockReturn.length > 0) {
        await assertTenantRefs(ctx, 'product', 'product', [...new Set(dto.stockReturn.map((l) => l.productId))]);
        await assertTenantRefs(ctx, 'warehouse', 'warehouse', [...new Set(dto.stockReturn.map((l) => l.warehouseId))]);
        const movements: MovementEntry[] = dto.stockReturn.map((l) => ({
          warehouseId: l.warehouseId,
          productId: l.productId,
          movementType: 'issue' as const,
          quantityBase: `-${l.quantityBase}`,
          reason: 'supplier_return',
          sourceDocumentType: 'supplier_adjustment',
          sourceDocumentId: adjustmentId,
        }));
        const posted = await this.stockPoster.post(ctx, movements, {
          sourceDocumentType: 'supplier_adjustment',
          sourceDocumentId: adjustmentId,
          createdBy: principal.userId,
        });
        for (const m of posted) {
          if (m.costValue != null) stockReturnValue += parseMoney(m.costValue);
        }
        for (const l of dto.stockReturn) {
          await ctx.query(
            `INSERT INTO supplier_adjustment_line
               (tenant_id, supplier_adjustment_id, product_id, description, quantity_base)
             VALUES ($1,$2,$3,$4,$5)`,
            [ctx.tenantId, adjustmentId, l.productId, l.description ?? null, l.quantityBase],
          );
        }
      }

      // ---- GL journal ----------------------------------------------------
      const purposes: GlPurpose[] = ['accounts_payable', 'inventory', 'purchase_expense'];
      const accounts = await this.finance.resolveGlAccounts(ctx, purposes);
      const journalLines: JournalLineSpec[] = [];
      if (dto.kind === 'credit_note') {
        journalLines.push({
          accountId: accounts.get('accounts_payable')!,
          debit: formatMoney(amount),
          memo: `credit note ${code} — AP reduced`,
        });
        if (stockReturnValue > 0n) {
          journalLines.push({
            accountId: accounts.get('inventory')!,
            credit: formatMoney(stockReturnValue),
            memo: `credit note ${code} — returned stock at AVCO cost`,
          });
        }
        const remainder = amount - stockReturnValue;
        if (remainder > 0n) {
          journalLines.push({
            accountId: accounts.get('purchase_expense')!,
            credit: formatMoney(remainder),
            memo: `credit note ${code} — price correction`,
          });
        } else if (remainder < 0n) {
          journalLines.push({
            accountId: accounts.get('purchase_expense')!,
            debit: formatMoney(-remainder),
            memo: `credit note ${code} — returned stock exceeds the credited amount`,
          });
        }
      } else {
        journalLines.push({
          accountId: accounts.get('purchase_expense')!,
          debit: formatMoney(amount),
          memo: `debit note ${code} — additional charge`,
        });
        journalLines.push({
          accountId: accounts.get('accounts_payable')!,
          credit: formatMoney(amount),
          memo: `debit note ${code} — AP increased`,
        });
      }
      await this.finance.postJournal(ctx, {
        sourceKind: 'supplier_adjustment',
        sourceId: adjustmentId,
        event: 'supplier_adjustment_posted',
        description: `${dto.kind === 'credit_note' ? 'Credit note' : 'Debit note'} ${code}: ${dto.reason}`,
        businessDate: dto.businessDate,
        reference: code,
        createdBy: principal.userId,
        allowSoftClosedPeriod: true, // correction document
        lines: journalLines,
      });

      // a credit note can settle an invoice (paid) and a debit note can
      // re-open a paid one (partially_paid) — recompute from the equation
      if (dto.supplierInvoiceId != null && dto.supplierInvoiceId !== '') {
        await refreshInvoiceStatus(ctx, dto.supplierInvoiceId);
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'supplier_adjustment.posted',
        entityType: 'supplier_adjustment',
        entityId: adjustmentId,
        details: {
          code, kind: dto.kind, supplierId: dto.supplierId,
          supplierInvoiceId: dto.supplierInvoiceId ?? null,
          amount: formatMoney(amount),
          stockReturnValue: formatMoney(stockReturnValue),
          adjustmentClass: dto.adjustmentClass,
          reason: dto.reason,
        },
      });
      await ctx.outbox.emit('SupplierAdjustmentPosted', {
        supplierAdjustmentId: adjustmentId, code, kind: dto.kind, amount: formatMoney(amount),
      });
      return this.getAdjustmentWithinCtx(ctx, adjustmentId);
    });
  }

  async listAdjustments(
    tenantId: string,
    filter: { supplierId?: string; limit?: number } = {},
  ): Promise<SupplierAdjustmentDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'sa.tenant_id = $1';
      if (filter.supplierId) {
        params.push(filter.supplierId);
        where += ` AND sa.supplier_id = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<{ id: string }>(
        `SELECT sa.id FROM supplier_adjustment sa WHERE ${where}
         ORDER BY sa.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: SupplierAdjustmentDto[] = [];
      for (const r of res.rows) out.push(await this.getAdjustmentWithinCtx(ctx, String(r.id)));
      return out;
    });
  }

  async getAdjustmentWithinCtx(ctx: UowContext, adjustmentId: string): Promise<SupplierAdjustmentDto> {
    const sa = await requireRow<Record<string, unknown>>(ctx, 'supplier_adjustment', adjustmentId);
    const supplier = await ctx.query<{ name: string }>(
      `SELECT name FROM supplier WHERE id = $1`, [String(sa.supplier_id)],
    );
    let invoiceCode: string | null = null;
    if (sa.supplier_invoice_id != null) {
      const inv = await ctx.query<{ code: string }>(
        `SELECT code FROM supplier_invoice WHERE id = $1`, [String(sa.supplier_invoice_id)],
      );
      invoiceCode = inv.rows[0]?.code ?? null;
    }
    let stockReturnValue: string | null = null;
    if (Boolean(sa.stock_return)) {
      const val = await ctx.query<{ total: string | null }>(
        `SELECT SUM(cost_value)::text AS total FROM stock_movement
         WHERE source_document_type = 'supplier_adjustment' AND source_document_id = $1`,
        [adjustmentId],
      );
      stockReturnValue = val.rows[0]?.total ?? null;
    }
    void parseQuantity;
    return {
      id: String(sa.id),
      code: String(sa.code),
      kind: String(sa.kind),
      supplierId: String(sa.supplier_id),
      supplierName: supplier.rows[0]?.name ?? null,
      supplierInvoiceId: sa.supplier_invoice_id ? String(sa.supplier_invoice_id) : null,
      supplierInvoiceCode: invoiceCode,
      businessDate: dateCol(sa.business_date),
      reason: String(sa.reason),
      adjustmentClass: String(sa.adjustment_class),
      amount: String(sa.amount),
      stockReturnValue,
      postedAt: new Date(sa.posted_at as string).toISOString(),
      createdAt: new Date(sa.created_at as string).toISOString(),
    };
  }
}
