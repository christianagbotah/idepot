import { Injectable } from '@nestjs/common';
import type { CreateStockAdjustment, StockAdjustmentDto } from '@idepot/contracts';
import { validateMovementQuantity, NotFoundError, ConflictError } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockCountService, type PrincipalLike } from './stock-count.service.js';

/**
 * Stock adjustments: reason-mandatory posted documents that move stock via
 * the StockPoster (adjustment movements) inside one UnitOfWork transaction
 * with audit + outbox. Variances from approved counts land here too.
 */
@Injectable()
export class StockAdjustmentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly counts: StockCountService,
  ) {}

  create(principal: PrincipalLike, dto: CreateStockAdjustment): Promise<StockAdjustmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      for (const line of dto.lines) {
        validateMovementQuantity(line.quantityBase);
      }
      const adjustment = await this.counts.postAdjustmentWithinCtx(ctx, principal, dto);
      return adjustment;
    });
  }

  /** Reverse a posted adjustment: posts 'reversal' movements with reversal_of
   *  pointing at the original movements, restoring the prior quantities
   *  exactly. Reversing a reversal is rejected. One transaction. */
  reverse(principal: PrincipalLike, id: string): Promise<StockAdjustmentDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const original = await this.counts.getAdjustmentWithinCtx(ctx, id);
      if (!original) throw new NotFoundError('stock adjustment', id);
      if (original.status !== 'posted') {
        throw new ConflictError(`cannot reverse a ${original.status} adjustment`);
      }
      const movementIds = await ctx.query<{ id: string }>(
        `SELECT id FROM stock_movement WHERE tenant_id = $1 AND source_document_type = 'stock_adjustment' AND source_document_id = $2`,
        [ctx.tenantId, id],
      );
      if (movementIds.rowCount === 0) {
        throw new ConflictError('adjustment has no movements to reverse');
      }
      const alreadyReversed = await ctx.query<{ n: string }>(
        `SELECT count(*)::text n FROM stock_movement
         WHERE reversal_of = ANY($1::uuid[])`,
        [movementIds.rows.map((r) => r.id)],
      );
      if (Number(alreadyReversed.rows[0]!.n) > 0) {
        throw new ConflictError('adjustment has already been reversed');
      }

      const movementIdByProduct = new Map<string, string>();
      const qtyByProduct = new Map<string, string>();
      for (const r of movementIds.rows) {
        const m = await ctx.query<Record<string, unknown>>(
          `SELECT product_id, quantity_base FROM stock_movement WHERE id = $1`,
          [r.id],
        );
        const pid = String(m.rows[0]!.product_id);
        movementIdByProduct.set(pid, r.id);
        qtyByProduct.set(pid, String(m.rows[0]!.quantity_base));
      }

      const reversal = await this.counts.postAdjustmentWithinCtx(ctx, principal, {
        warehouseId: original.warehouseId,
        reason: `reversal of ${original.code}`,
        note: `reverses adjustment ${original.id}`,
        lines: [...qtyByProduct.entries()].map(([productId, q]) => ({
          productId,
          quantityBase: q.startsWith('-') ? q.slice(1) : `-${q}`,
          note: null,
          reversalOf: movementIdByProduct.get(productId) ?? null,
        })),
        movementType: 'reversal',
      });
      return reversal;
    });
  }

  list(principal: { tenantId: string }) {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const res = await ctx.query<{ id: string }>(
        `SELECT id FROM stock_adjustment ORDER BY created_at DESC LIMIT 200`,
      );
      const out: StockAdjustmentDto[] = [];
      for (const r of res.rows) {
        out.push((await this.counts.getAdjustmentWithinCtx(ctx, String(r.id)))!);
      }
      return out;
    });
  }

  get(principal: { tenantId: string }, id: string): Promise<StockAdjustmentDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const dto = await this.counts.getAdjustmentWithinCtx(ctx, id);
      if (!dto) throw new NotFoundError('stock adjustment', id);
      return dto;
    });
  }
}
