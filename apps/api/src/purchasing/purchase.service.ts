/**
 * Purchase order lifecycle (Phase 4 — purchasing-lifecycle.md §4
 * corrected model).
 *
 * The legacy collapse (PO + GRN + supplier invoice as one row-per-line
 * "purchase order" with grand_total/amount_paid duplicated on every
 * row — defect C-23) is replaced by a proper header/line PO that is
 * PURELY a commitment document: it never touches stock, AP or the GL.
 * Stock arrives through GRNs; the liability through supplier
 * invoices. Received/invoiced quantities are maintained on the lines
 * transactionally by the receiving/invoicing services under row locks.
 */
import { Injectable } from '@nestjs/common';
import type { CreatePurchaseOrder, PurchaseOrderDto, PurchaseOrderLineDto } from '@idepot/contracts';
import { ConflictError, ValidationError } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from '../sales/document-sequence.service.js';
import { assertTenantRefs } from '../inventory/inventory-refs.js';
import {
  assertStatus,
  dateColNull,
  lockRow,
  pgCode,
  requireRow,
  resolveBaseQuantity,
  type PurchasingPrincipal,
} from './purchasing-common.js';

const PO_STATUSES = [
  'draft', 'submitted', 'approved', 'issued', 'partially_received', 'received', 'closed', 'cancelled',
] as const;

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly sequences: DocumentSequenceService,
  ) {}

  async createPurchaseOrder(
    principal: PurchasingPrincipal,
    dto: CreatePurchaseOrder,
  ): Promise<PurchaseOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      await assertTenantRefs(ctx, 'supplier', 'supplier', [dto.supplierId]);
      await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);

      const productIds = [...new Set(dto.lines.map((l) => l.productId))];
      await assertTenantRefs(ctx, 'product', 'product', productIds);
      const unitIds = dto.lines.map((l) => l.unitId).filter((u): u is string => u != null);
      if (unitIds.length > 0) await assertTenantRefs(ctx, 'unit', 'unit', unitIds);

      // resolve every line's base quantity + authoritative factor FIRST
      const resolved = [];
      const seenProducts = new Set<string>();
      for (const line of dto.lines) {
        if (seenProducts.has(line.productId)) {
          throw new ValidationError('duplicate product line — merge quantities onto one line');
        }
        seenProducts.add(line.productId);
        const r = await resolveBaseQuantity(ctx, {
          productId: line.productId,
          unitId: line.unitId ?? null,
          quantity: line.orderedQuantity,
        });
        resolved.push({ line, ...r });
      }

      const code = await this.sequences.allocate(ctx, { docType: 'PURCHASE_ORDER' });
      let id: string;
      try {
        const res = await ctx.query<{ id: string }>(
          `INSERT INTO purchase_order
             (tenant_id, code, supplier_id, warehouse_id, status, expected_date, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [
            ctx.tenantId, code, dto.supplierId, dto.warehouseId,
            dto.submit ? 'submitted' : 'draft',
            dto.expectedDate ?? null, dto.notes ?? null, principal.userId,
          ],
        );
        id = res.rows[0]!.id;
      } catch (err) {
        if (pgCode(err) === '23505') throw new ConflictError(`purchase order code "${code}" already exists`);
        throw err;
      }

      for (const r of resolved) {
        await ctx.query(
          `INSERT INTO purchase_order_line
             (tenant_id, purchase_order_id, product_id, unit_id, ordered_quantity,
              conversion_factor, ordered_quantity_base, unit_price, line_discount, expected_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            ctx.tenantId, id, r.line.productId, r.unitId, r.line.orderedQuantity,
            r.conversionFactor, r.quantityBase, r.line.unitPrice,
            r.line.lineDiscount ?? '0', r.line.expectedDate ?? null,
          ],
        );
      }

      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'purchase_order.created',
        entityType: 'purchase_order',
        entityId: id,
        details: {
          code, supplierId: dto.supplierId, warehouseId: dto.warehouseId,
          lineCount: dto.lines.length,
          submitted: dto.submit === true,
        },
      });
      await ctx.outbox.emit('PurchaseOrderCreated', { purchaseOrderId: id, code, supplierId: dto.supplierId });
      return this.getPurchaseOrderWithinCtx(ctx, id);
    });
  }

  /** Transition: draft|submitted → approved (permission checked at the
   *  controller; the audit row records who approved). */
  async approvePurchaseOrder(principal: PurchasingPrincipal, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    return this.transition(principal, purchaseOrderId, 'approved', ['draft', 'submitted']);
  }

  async issuePurchaseOrder(principal: PurchasingPrincipal, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    return this.transition(principal, purchaseOrderId, 'issued', ['approved']);
  }

  async cancelPurchaseOrder(principal: PurchasingPrincipal, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    return this.transition(principal, purchaseOrderId, 'cancelled', ['draft', 'submitted', 'approved', 'issued']);
  }

  /** Manual close of a received PO whose remainder will never arrive. */
  async closePurchaseOrder(principal: PurchasingPrincipal, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    return this.transition(principal, purchaseOrderId, 'closed', ['received', 'partially_received']);
  }

  private async transition(
    principal: PurchasingPrincipal,
    purchaseOrderId: string,
    to: string,
    allowedFrom: readonly string[],
  ): Promise<PurchaseOrderDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const po = await lockRow(ctx, 'purchase_order', purchaseOrderId);
      assertStatus('purchase_order', purchaseOrderId, String(po.status), allowedFrom);
      await ctx.query(
        `UPDATE purchase_order SET status = $3, updated_at = now(),
           approved_by = CASE WHEN $3 = 'approved' THEN $4 ELSE approved_by END,
           approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END
         WHERE id = $1 AND tenant_id = $2`,
        [purchaseOrderId, ctx.tenantId, to, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: `purchase_order.${to}`,
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        details: { from: String(po.status), to },
      });
      await ctx.outbox.emit('PurchaseOrderStatusChanged', { purchaseOrderId, status: to });
      return this.getPurchaseOrderWithinCtx(ctx, purchaseOrderId);
    });
  }

  async getPurchaseOrder(tenantId: string, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    return this.uow.run({ tenantId }, async (ctx) => this.getPurchaseOrderWithinCtx(ctx, purchaseOrderId));
  }

  async listPurchaseOrders(
    tenantId: string,
    filter: { status?: string; supplierId?: string; limit?: number } = {},
  ): Promise<PurchaseOrderDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const params: unknown[] = [ctx.tenantId];
      let where = 'po.tenant_id = $1';
      if (filter.status) {
        params.push(filter.status);
        where += ` AND po.status = $${params.length}`;
      }
      if (filter.supplierId) {
        params.push(filter.supplierId);
        where += ` AND po.supplier_id = $${params.length}`;
      }
      const limit = Math.min(filter.limit ?? 100, 500);
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT po.id FROM purchase_order po WHERE ${where}
         ORDER BY po.created_at DESC LIMIT ${limit}`,
        params,
      );
      const out: PurchaseOrderDto[] = [];
      for (const r of res.rows) out.push(await this.getPurchaseOrderWithinCtx(ctx, String(r.id)));
      return out;
    });
  }

  async getPurchaseOrderWithinCtx(ctx: UowContext, purchaseOrderId: string): Promise<PurchaseOrderDto> {
    const po = await requireRow<Record<string, unknown>>(ctx, 'purchase_order', purchaseOrderId);
    const supplier = await ctx.query<{ name: string }>(
      `SELECT name FROM supplier WHERE id = $1`, [String(po.supplier_id)],
    );
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT l.*, p.code AS product_code, p.name AS product_name
       FROM purchase_order_line l LEFT JOIN product p ON p.id = l.product_id
       WHERE l.purchase_order_id = $1 ORDER BY l.created_at, l.id`,
      [purchaseOrderId],
    );
    const lineDtos: PurchaseOrderLineDto[] = lines.rows.map((l) => ({
      id: String(l.id),
      productId: String(l.product_id),
      productCode: l.product_code ? String(l.product_code) : null,
      productName: l.product_name ? String(l.product_name) : null,
      unitId: l.unit_id ? String(l.unit_id) : null,
      orderedQuantity: String(l.ordered_quantity),
      conversionFactor: String(l.conversion_factor),
      orderedQuantityBase: String(l.ordered_quantity_base),
      unitPrice: String(l.unit_price),
      lineDiscount: String(l.line_discount),
      expectedDate: dateColNull(l.expected_date),
      receivedQuantityBase: String(l.received_quantity_base),
      invoicedQuantityBase: String(l.invoiced_quantity_base),
    }));
    return {
      id: String(po.id),
      code: String(po.code),
      supplierId: String(po.supplier_id),
      supplierName: supplier.rows[0]?.name ?? null,
      warehouseId: String(po.warehouse_id),
      status: String(po.status),
      expectedDate: dateColNull(po.expected_date),
      notes: po.notes ? String(po.notes) : null,
      approvedBy: po.approved_by ? String(po.approved_by) : null,
      approvedAt: po.approved_at ? new Date(po.approved_at as string).toISOString() : null,
      createdAt: new Date(po.created_at as string).toISOString(),
      lines: lineDtos,
    };
  }
}

export { PO_STATUSES };
