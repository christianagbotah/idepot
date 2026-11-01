import { Injectable } from '@nestjs/common';
import type {
  ApproveCount,
  CreateStockAdjustment,
  CreateStockCount,
  StockAdjustmentDto,
  StockCountDto,
  SubmitCount,
  UpdateCountLines,
} from '@idepot/contracts';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  assertCountTransition,
  countVariance,
  formatDecimal,
  isMaterialVariance,
  QTY_SCALE,
  validateNonNegativeQuantity,
} from '@idepot/domain';
import { hasPermission } from '@idepot/auth';
 
import type { UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
import { assertTenantRefs } from './inventory-refs.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockPoster } from './stock-poster.js';

export interface PrincipalLike {
  userId: string;
  tenantId: string;
  displayName: string;
  roles: string[];
}

function newCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;
}

/**
 * Stock counts: draft → counted → approved. Approval of variances posts
 * count_variance movements through the StockPoster inside ONE transaction
 * (count status + adjustment document + movements + balances + audit +
 * outbox commit or roll back together). Material variances require the
 * stockcount:approve permission — supervisor control (strategy doc §4.3).
 */
@Injectable()
export class StockCountService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly poster: StockPoster,
  ) {}

  create(principal: PrincipalLike, dto: CreateStockCount): Promise<StockCountDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      // RLS-filtered reference validation (review fix 4): cross-tenant
      // warehouse/products are indistinguishable from missing ones
      await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);
      await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => l.productId));
      const authority = dto.authority ?? 'system_entry';
      const risk = dto.acceptedMigrationRisk ?? false;
      if (authority === 'legacy_quantity') {
        // legacy-quantity authority is an explicitly flagged accepted migration
        // risk requiring sign-off permission — never silently allowed (§4.5)
        if (!risk) {
          throw new ValidationError(
            'authority=legacy_quantity requires acceptedMigrationRisk=true (accepted migration risk)',
          );
        }
        if (!hasPermission(principal.roles, 'stockcount:approve')) {
          throw new ForbiddenError('legacy-quantity authority requires stockcount:approve');
        }
      }
      for (const line of dto.lines) {
        if (line.countedQuantityBase != null) validateNonNegativeQuantity(line.countedQuantityBase);
      }

      const code = dto.code ?? newCode('SC');
      const countRes = await ctx.query<{ id: string }>(
        `INSERT INTO stock_count (tenant_id, warehouse_id, code, authority, accepted_migration_risk, source_evidence, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.tenantId, dto.warehouseId, code, authority, risk, dto.sourceEvidence ?? null, dto.note ?? null],
      );
      const countId = countRes.rows[0]!.id;
      await this.upsertLines(ctx, countId, dto.lines);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'stock.count.created',
        entityType: 'stock_count',
        entityId: countId,
        details: { code, warehouseId: dto.warehouseId, authority, acceptedMigrationRisk: risk, lines: dto.lines.length },
      });
      await ctx.outbox.emit('StockCountCreated', { countId, code });
      return this.getWithinCtx(ctx, countId) as Promise<StockCountDto>;
    });
  }

  /** Add/update count lines with a fresh system-quantity snapshot. */
  updateLines(principal: PrincipalLike, id: string, dto: UpdateCountLines): Promise<StockCountDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const count = await this.lockCount(ctx, id);
      if (!count) throw new NotFoundError('stock count', id);
      if (count.status !== 'draft' && count.status !== 'counted') {
        throw new ConflictError(`cannot update lines of a ${count.status} count`);
      }
      // RLS-filtered product validation (review fix 4)
      await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => l.productId));
      for (const line of dto.lines) {
        if (line.countedQuantityBase != null) validateNonNegativeQuantity(line.countedQuantityBase);
      }
      await this.upsertLines(ctx, id, dto.lines);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'stock.count.updated',
        entityType: 'stock_count',
        entityId: id,
        details: { lines: dto.lines.length },
      });
      return this.getWithinCtx(ctx, id) as Promise<StockCountDto>;
    });
  }

  submit(principal: PrincipalLike, id: string, dto: SubmitCount): Promise<StockCountDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const count = await this.lockCount(ctx, id);
      if (!count) throw new NotFoundError('stock count', id);
      assertCountTransition(count.status as StockCountDto['status'], 'counted');
      await ctx.query(
        `UPDATE stock_count SET status='counted', counted_by=$2, counted_at=now() WHERE id=$1`,
        [id, dto.countedBy ?? principal.displayName],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'stock.count.submitted',
        entityType: 'stock_count',
        entityId: id,
        details: { countedBy: dto.countedBy ?? principal.displayName },
      });
      return this.getWithinCtx(ctx, id) as Promise<StockCountDto>;
    });
  }

  /** Approve (HTTP): posts one adjustment document for the variances (if any)
   *  and the corresponding ledger movements — all-or-nothing with the status flip. */
  approve(principal: PrincipalLike, id: string, dto: ApproveCount): Promise<StockCountDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, (ctx) =>
      this.approveWithinCtx(ctx, principal, id, { note: dto.note ?? null }),
    );
  }

  /** Core approval within an already-open UoW context (also used by the
   *  opening-stock flow, which posts receipt-type movements). */
  async approveWithinCtx(
    ctx: UowContext,
    principal: PrincipalLike,
    id: string,
    opts: {
      note?: string | null;
      movementType?: 'count_variance' | 'receipt' | 'adjustment';
      movementReason?: string;
      adjustmentReason?: string;
      /** opening-stock cost layers (ADR-0004): per-unit cost by product for
       *  the RECEIVING variance direction */
      costByProduct?: Map<string, string>;
    } = {},
  ): Promise<StockCountDto> {
    const count = await this.lockCount(ctx, id);
    if (!count) throw new NotFoundError('stock count', id);
    assertCountTransition(count.status as StockCountDto['status'], 'approved');

      const lines = await ctx.query<Record<string, unknown>>(
        `SELECT l.product_id, l.counted_quantity_base, l.system_quantity_base
         FROM stock_count_line l WHERE l.count_id = $1 ORDER BY l.product_id`,
        [id],
      );

      const varianceLines: Array<{ productId: string; quantityBase: string }> = [];
      let materialCount = 0;
      for (const row of lines.rows) {
        if (row.counted_quantity_base == null) continue;
        const line = {
          productId: String(row.product_id),
          countedQuantityBase: String(row.counted_quantity_base),
          systemQuantityBase: String(row.system_quantity_base),
        };
        const variance = countVariance(line);
        if (variance === null || variance === 0n) continue;
        if (isMaterialVariance(line.systemQuantityBase, variance)) materialCount++;
        varianceLines.push({
          productId: line.productId,
          quantityBase: (variance >= 0n ? '' : '-') + this.scaledToQty(variance < 0n ? -variance : variance),
        });
      }

      let adjustmentId: string | null = null;
      if (varianceLines.length > 0) {
        const adjustment = await this.postAdjustmentWithinCtx(ctx, principal, {
          warehouseId: String(count.warehouse_id),
          reason: opts.adjustmentReason ?? `stock count ${count.code} variance approval`,
          sourceCountId: id,
          note: opts.note ?? null,
          lines: varianceLines.map((l) => ({
            productId: l.productId,
            quantityBase: l.quantityBase,
            note: null,
            // cost layers attach to the RECEIVING direction only (issues
            // resolve their AVCO evidence from the locked cost state)
            ...(opts.costByProduct?.has(l.productId) && !l.quantityBase.startsWith('-')
              ? { unitCost: opts.costByProduct.get(l.productId)! }
              : {}),
          })),
          movementType: opts.movementType ?? 'count_variance',
          movementReason: opts.movementReason ?? `stock count ${count.code} variance`,
        });
        adjustmentId = adjustment.id;
      }

      await ctx.query(
        `UPDATE stock_count SET status='approved', approved_by=$2, approved_at=now() WHERE id=$1`,
        [id, principal.userId],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'stock.count.approved',
        entityType: 'stock_count',
        entityId: id,
        details: {
          code: count.code,
          varianceLines: varianceLines.length,
          materialVariances: materialCount,
          adjustmentId,
        },
      });
      await ctx.outbox.emit('StockCountApproved', {
        countId: id,
        code: count.code,
        adjustmentId,
        materialVariances: materialCount,
      });
      return this.getWithinCtx(ctx, id) as Promise<StockCountDto>;
  }

  list(principal: { tenantId: string }) {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT id FROM stock_count ORDER BY created_at DESC LIMIT 200`,
      );
      const out: StockCountDto[] = [];
      for (const r of res.rows) out.push((await this.getWithinCtx(ctx, String(r.id)))!);
      return out;
    });
  }

  get(principal: { tenantId: string }, id: string): Promise<StockCountDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const dto = await this.getWithinCtx(ctx, id);
      if (!dto) throw new NotFoundError('stock count', id);
      return dto;
    });
  }

  // ---------- shared internals (also used by the opening-stock flow) ----------

  async upsertLines(
    ctx: UowContext,
    countId: string,
    lines: Array<{ productId: string; countedQuantityBase?: string | null }>,
  ): Promise<void> {
    for (const line of lines) {
      // snapshot the current system quantity at count time
      const bal = await ctx.query<{ quantity_base: string }>(
        `SELECT quantity_base FROM stock_balance
         WHERE tenant_id = $1 AND warehouse_id = (SELECT warehouse_id FROM stock_count WHERE id = $2)
           AND product_id = $3`,
        [ctx.tenantId, countId, line.productId],
      );
      const systemQty = bal.rows[0]?.quantity_base ?? '0';
      await ctx.query(
        `INSERT INTO stock_count_line (tenant_id, count_id, product_id, counted_quantity_base, system_quantity_base)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (count_id, product_id)
         DO UPDATE SET counted_quantity_base = EXCLUDED.counted_quantity_base,
                       system_quantity_base = EXCLUDED.system_quantity_base`,
        [ctx.tenantId, countId, line.productId, line.countedQuantityBase ?? null, systemQty],
      );
    }
  }

  /** Posts the variance adjustment document + movements within the caller's ctx.
   *  Lines may carry cross-unit evidence (unitId/quantityTransacted/conversionFactor)
   *  and reversalOf references for 'reversal' movements — the StockPoster enforces
   *  exact conversion conservation and append-only reversal semantics. */
  async postAdjustmentWithinCtx(
    ctx: UowContext,
    principal: PrincipalLike,
    dto: CreateStockAdjustment & {
      movementType?: 'count_variance' | 'receipt' | 'adjustment' | 'reversal';
      movementReason?: string;
    },
  ): Promise<StockAdjustmentDto> {
    // RLS-filtered reference validation (review fix 4): happens inside the
    // caller's transaction before any document row is written, so a failed
    // reference leaves zero partial state
    await assertTenantRefs(ctx, 'warehouse', 'warehouse', [dto.warehouseId]);
    await assertTenantRefs(ctx, 'product', 'product', dto.lines.map((l) => l.productId));
    const movementType = dto.movementType ?? 'adjustment';
    const movementReason = dto.movementReason ?? `adjustment: ${dto.reason}`;
    const code = dto.code ?? newCode('ADJ');
    const adjRes = await ctx.query<{ id: string }>(
      `INSERT INTO stock_adjustment (tenant_id, warehouse_id, code, reason, source_count_id, posted_by, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx.tenantId, dto.warehouseId, code, dto.reason, dto.sourceCountId ?? null, principal.userId, dto.note ?? null],
    );
    const adjustmentId = adjRes.rows[0]!.id;
    for (const line of dto.lines) {
      await ctx.query(
        `INSERT INTO stock_adjustment_line (tenant_id, adjustment_id, product_id, quantity_base, note)
         VALUES ($1,$2,$3,$4,$5)`,
        [ctx.tenantId, adjustmentId, line.productId, line.quantityBase, line.note ?? null],
      );
    }
    await this.poster.post(
      ctx,
      dto.lines.map((l) => ({
        warehouseId: dto.warehouseId,
        productId: l.productId,
        movementType,
        quantityBase: l.quantityBase,
        unitId: 'unitId' in l && l.unitId != null ? String(l.unitId) : null,
        quantityTransacted:
          'quantityTransacted' in l && l.quantityTransacted != null ? String(l.quantityTransacted) : null,
        conversionFactor:
          'conversionFactor' in l && l.conversionFactor != null ? String(l.conversionFactor) : null,
        reason: movementReason,
        reversalOf: 'reversalOf' in l && l.reversalOf != null ? String(l.reversalOf) : null,
        unitCost: 'unitCost' in l && l.unitCost != null ? String(l.unitCost) : null,
      })),
      { sourceDocumentType: 'stock_adjustment', sourceDocumentId: adjustmentId, createdBy: principal.userId },
    );
    await ctx.audit.record({
      tenantId: ctx.tenantId,
      actorUserId: principal.userId,
      actorDisplay: principal.displayName,
      action: 'stock.adjustment.posted',
      entityType: 'stock_adjustment',
      entityId: adjustmentId,
      details: { code, reason: dto.reason, lines: dto.lines.length, sourceCountId: dto.sourceCountId ?? null },
    });
    await ctx.outbox.emit('StockAdjustmentPosted', { adjustmentId, code, lines: dto.lines.length });
    const result = await this.getAdjustmentWithinCtx(ctx, adjustmentId);
    if (!result) throw new NotFoundError('stock adjustment', adjustmentId);
    return result;
  }

  async getAdjustmentWithinCtx(ctx: UowContext, id: string): Promise<StockAdjustmentDto | undefined> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT a.id, a.code, a.warehouse_id, a.status, a.reason, a.source_count_id, a.posted_by, a.posted_at, a.note, a.created_at
       FROM stock_adjustment a WHERE a.id = $1`,
      [id],
    );
    if (!res.rows[0]) return undefined;
    const h = res.rows[0];
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, quantity_base, note FROM stock_adjustment_line WHERE adjustment_id = $1 ORDER BY product_id`,
      [id],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      warehouseId: String(h.warehouse_id),
      status: String(h.status) as 'posted' | 'cancelled',
      reason: String(h.reason),
      sourceCountId: h.source_count_id ? String(h.source_count_id) : null,
      postedBy: h.posted_by ? String(h.posted_by) : null,
      postedAt: new Date(h.posted_at as string).toISOString(),
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((l) => ({
        id: String(l.id),
        productId: String(l.product_id),
        quantityBase: String(l.quantity_base),
        note: l.note ? String(l.note) : null,
      })),
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }

  private scaledToQty(v: bigint): string {
    return formatDecimal(v, QTY_SCALE);
  }

  private async lockCount(
    ctx: UowContext,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, warehouse_id, status, authority, accepted_migration_risk, source_evidence,
              counted_by, counted_at, approved_by, approved_at, note, created_at
       FROM stock_count WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return res.rows[0];
  }

  async getWithinCtx(ctx: UowContext, id: string): Promise<StockCountDto | undefined> {
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, code, warehouse_id, status, authority, accepted_migration_risk, source_evidence,
              counted_by, counted_at, approved_by, approved_at, note, created_at
       FROM stock_count WHERE id = $1`,
      [id],
    );
    const h = res.rows[0];
    if (!h) return undefined;
    const lines = await ctx.query<Record<string, unknown>>(
      `SELECT id, product_id, counted_quantity_base, system_quantity_base
       FROM stock_count_line WHERE count_id = $1 ORDER BY product_id`,
      [id],
    );
    return {
      id: String(h.id),
      code: String(h.code),
      warehouseId: String(h.warehouse_id),
      status: String(h.status) as StockCountDto['status'],
      authority: String(h.authority) as StockCountDto['authority'],
      acceptedMigrationRisk: Boolean(h.accepted_migration_risk),
      sourceEvidence: h.source_evidence ? String(h.source_evidence) : null,
      countedBy: h.counted_by ? String(h.counted_by) : null,
      countedAt: h.counted_at ? new Date(h.counted_at as string).toISOString() : null,
      approvedBy: h.approved_by ? String(h.approved_by) : null,
      approvedAt: h.approved_at ? new Date(h.approved_at as string).toISOString() : null,
      note: h.note ? String(h.note) : null,
      lines: lines.rows.map((l) => ({
        id: String(l.id),
        productId: String(l.product_id),
        countedQuantityBase: l.counted_quantity_base != null ? String(l.counted_quantity_base) : null,
        systemQuantityBase: String(l.system_quantity_base),
      })),
      createdAt: new Date(h.created_at as string).toISOString(),
    };
  }
}
