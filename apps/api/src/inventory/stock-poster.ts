import { Injectable } from '@nestjs/common';
import type { StockMovementDto } from '@idepot/contracts';
import {
  ConflictError,
  QTY_SCALE,
  convertToBaseExact,
  formatDecimal,
  parseQuantity,
  validateMovementEntry,
  type MovementEntry,
} from '@idepot/domain';
 
import type { UowContext } from '../db/unit-of-work.js';

export interface PostMovementsMeta {
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  createdBy?: string | null;
}

/**
 * The single posting mechanism for every inventory-affecting authoritative
 * write (ADR-0001): inserts append-only ledger rows and updates the derived
 * balance projection INSIDE the caller's UnitOfWork transaction, under a
 * row lock on the balance so concurrent postings serialize and cannot
 * overdraw. Cross-unit entries are converted EXACTLY (conservation or
 * rejection — never rounded stock).
 *
 * Participants per posting set (registered by the calling service):
 * document row(s) + stock movements + stock balances + audit + outbox.
 */
@Injectable()
export class StockPoster {
  /**
   * Post movements + update balances atomically within the open UoW context.
   * Throws ConflictError on insufficient stock; ValidationError on any
   * conversion/quantity violation. Zero partial state on failure (single tx).
   */
  async post(ctx: UowContext, entries: MovementEntry[], meta: PostMovementsMeta = {}): Promise<StockMovementDto[]> {
    const out: StockMovementDto[] = [];
    for (const entry of entries) {
      const base = validateMovementEntry(entry);

      // exactness double-check: |transacted × factor| must equal |base qty|
      // (the sign of quantityBase carries the movement direction)
      if (entry.quantityTransacted != null && entry.quantityTransacted !== '') {
        const exact = convertToBaseExact(entry.quantityTransacted, entry.conversionFactor!);
        const exactScaled = parseQuantity(exact);
        const absExact = exactScaled < 0n ? -exactScaled : exactScaled;
        const absBase = base < 0n ? -base : base;
        if (absExact !== absBase) {
          throw new ConflictError(
            `conversion mismatch: ${entry.quantityTransacted} × ${entry.conversionFactor} = ${exact} but base quantity is ${entry.quantityBase}`,
          );
        }
      }

      await this.lockBalance(ctx, entry.warehouseId, entry.productId);
      await this.applyBalanceDelta(ctx, entry.warehouseId, entry.productId, base);

      const res = await ctx.query<Record<string, unknown>>(
        `INSERT INTO stock_movement
           (tenant_id, warehouse_id, product_id, movement_type, quantity_base,
            unit_id, quantity_transacted, conversion_factor, reason,
            source_document_type, source_document_id, transfer_id, reversal_of, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, warehouse_id, product_id, movement_type, quantity_base,
            unit_id, quantity_transacted, conversion_factor, reason,
            source_document_type, source_document_id, transfer_id, reversal_of, occurred_at`,
        [
          ctx.tenantId,
          entry.warehouseId,
          entry.productId,
          entry.movementType,
          entry.quantityBase,
          entry.unitId ?? null,
          entry.quantityTransacted ?? null,
          entry.conversionFactor ?? null,
          entry.reason ?? null,
          meta.sourceDocumentType ?? null,
          meta.sourceDocumentId ?? null,
          entry.transferId ?? null,
          entry.reversalOf ?? null,
          meta.createdBy ?? ctx.userId,
        ],
      );
      out.push(this.toMovementDto(res.rows[0] as Record<string, unknown>));
    }
    return out;
  }

  /** Returns the updated balance quantity string. */
  private async applyBalanceDelta(
    ctx: UowContext,
    warehouseId: string,
    productId: string,
    delta: bigint,
  ): Promise<string> {
    const cur = await ctx.query<{ quantity_base: string }>(
      `SELECT quantity_base FROM stock_balance
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
      [ctx.tenantId, warehouseId, productId],
    );
    const current = cur.rows[0] ? parseQuantity(cur.rows[0].quantity_base) : 0n;
    const next = current + delta;
    if (next < 0n) {
      throw new ConflictError(
        `insufficient stock: product ${productId} in warehouse ${warehouseId} has ${formatDecimal(current, QTY_SCALE)}, movement would make ${formatDecimal(next, QTY_SCALE)}`,
      );
    }
    // scaled bigint → decimal(18,6) string for the numeric column
    const nextStr = formatDecimal(next, QTY_SCALE);
    await ctx.query(
      `INSERT INTO stock_balance (tenant_id, warehouse_id, product_id, quantity_base)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, warehouse_id, product_id)
       DO UPDATE SET quantity_base = EXCLUDED.quantity_base, updated_at = now()`,
      [ctx.tenantId, warehouseId, productId, nextStr],
    );
    return nextStr;
  }

  private async lockBalance(ctx: UowContext, warehouseId: string, productId: string): Promise<void> {
    await ctx.query(
      `SELECT id FROM stock_balance
       WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
      [ctx.tenantId, warehouseId, productId],
    );
  }

  private toMovementDto(r: Record<string, unknown>): StockMovementDto {
    return {
      id: String(r.id),
      warehouseId: String(r.warehouse_id),
      productId: String(r.product_id),
      movementType: String(r.movement_type) as StockMovementDto['movementType'],
      quantityBase: String(r.quantity_base),
      unitId: r.unit_id ? String(r.unit_id) : null,
      quantityTransacted: r.quantity_transacted != null ? String(r.quantity_transacted) : null,
      conversionFactor: r.conversion_factor != null ? String(r.conversion_factor) : null,
      reason: r.reason ? String(r.reason) : null,
      sourceDocumentType: r.source_document_type ? String(r.source_document_type) : null,
      sourceDocumentId: r.source_document_id ? String(r.source_document_id) : null,
      transferId: r.transfer_id ? String(r.transfer_id) : null,
      reversalOf: r.reversal_of ? String(r.reversal_of) : null,
      occurredAt: new Date(r.occurred_at as string).toISOString(),
    };
  }
}
