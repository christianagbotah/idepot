import { Injectable } from '@nestjs/common';
import type { BalanceRebuildReportDto, StockBalanceDto, StockMovementDto } from '@idepot/contracts';
 
import type { UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';

/**
 * Ledger rebuild / reconciliation job. Proves the core invariant
 * `on_hand == Σ stock movements`: recomputes every (warehouse, product)
 * balance from the append-only ledger and compares with the stored
 * projection. dryRun reports differences without writing; otherwise the
 * projection is corrected to the ledger-derived truth (the ledger wins —
 * the balance is never authoritative).
 */
@Injectable()
export class BalanceRebuildService {
  constructor(private readonly uow: UnitOfWork) {}

  /** Tenant-scoped entry (controller path): opens the UoW. */
  runForTenant(
    tenantId: string,
    opts: { dryRun?: boolean; warehouseId?: string } = {},
  ): Promise<BalanceRebuildReportDto> {
    return this.uow.run({ tenantId }, (ctx) => this.run(ctx, opts));
  }

  async run(
    ctx: UowContext,
    opts: { dryRun?: boolean; warehouseId?: string } = {},
  ): Promise<BalanceRebuildReportDto> {
    const params: unknown[] = [ctx.tenantId];
    let warehouseFilter = '';
    if (opts.warehouseId) {
      params.push(opts.warehouseId);
      warehouseFilter = ` AND m.warehouse_id = $${params.length}`;
    }

    // ledger-derived truth per (warehouse, product)
    const computed = await ctx.query<{ warehouse_id: string; product_id: string; total: string }>(
      `SELECT m.warehouse_id, m.product_id, SUM(m.quantity_base)::text AS total
       FROM stock_movement m
       WHERE m.tenant_id = $1${warehouseFilter}
       GROUP BY m.warehouse_id, m.product_id`,
      params,
    );

    const stored = await ctx.query<{
      warehouse_id: string;
      product_id: string;
      quantity_base: string;
    }>(
      `SELECT warehouse_id, product_id, quantity_base FROM stock_balance WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    const storedMap = new Map(
      stored.rows.map((r) => [`${r.warehouse_id}:${r.product_id}`, r.quantity_base]),
    );

    const mismatches: BalanceRebuildReportDto['mismatches'] = [];
    let rebuilt = 0;
    let checked = 0;

    for (const row of computed.rows) {
      checked++;
      const key = `${row.warehouse_id}:${row.product_id}`;
      const storedQty = storedMap.get(key) ?? '0';
      const computedQty = row.total;
      if (storedQty !== computedQty) {
        mismatches.push({
          warehouseId: row.warehouse_id,
          productId: row.product_id,
          balance: storedQty,
          computed: computedQty,
        });
      }
      if (!opts.dryRun) {
        await ctx.query(
          `INSERT INTO stock_balance (tenant_id, warehouse_id, product_id, quantity_base)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, warehouse_id, product_id)
           DO UPDATE SET quantity_base = EXCLUDED.quantity_base, updated_at = now()`,
          [ctx.tenantId, row.warehouse_id, row.product_id, computedQty],
        );
        rebuilt++;
      }
      storedMap.delete(key);
    }

    // balances with no movements at all must be zero — reset stale rows
    for (const key of storedMap.keys()) {
      const [warehouseId, productId] = key.split(':');
      checked++;
      if (storedMap.get(key) !== '0') {
        mismatches.push({
          warehouseId: warehouseId!,
          productId: productId!,
          balance: storedMap.get(key)!,
          computed: '0',
        });
      }
      if (!opts.dryRun) {
        await ctx.query(
          `UPDATE stock_balance SET quantity_base = 0, updated_at = now()
           WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
          [ctx.tenantId, warehouseId, productId],
        );
        rebuilt++;
      }
    }

    return { checked, mismatches, rebuilt, dryRun: Boolean(opts.dryRun) };
  }
}

/** Read-side queries for the ledger and balances (inventory:read). */
@Injectable()
export class InventoryReadService {
  constructor(private readonly uow: UnitOfWork) {}

  balances(
    tenantId: string,
    filter: { warehouseId?: string; productId?: string },
  ): Promise<{ items: StockBalanceDto[]; total: number }> {
    return this.uow.run({ tenantId }, (ctx) => InventoryRepositoryQueries.listBalances(ctx, filter));
  }

  movements(
    tenantId: string,
    filter: { warehouseId?: string; productId?: string; transferId?: string; limit?: number },
  ): Promise<{ items: StockMovementDto[]; total: number }> {
    return this.uow.run({ tenantId }, (ctx) => InventoryRepositoryQueries.listMovements(ctx, filter));
  }
}

/** Read-side queries for the ledger and balances (ctx-parameterized). */
export class InventoryRepositoryQueries {
  static async listBalances(
    ctx: UowContext,
    filter: { warehouseId?: string; productId?: string },
  ): Promise<{ items: StockBalanceDto[]; total: number }> {
    const params: unknown[] = [ctx.tenantId];
    const where: string[] = ['tenant_id = $1'];
    if (filter.warehouseId) {
      params.push(filter.warehouseId);
      where.push(`warehouse_id = $${params.length}`);
    }
    if (filter.productId) {
      params.push(filter.productId);
      where.push(`product_id = $${params.length}`);
    }
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT warehouse_id, product_id, quantity_base, bin, updated_at
       FROM stock_balance WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC, warehouse_id, product_id LIMIT 500`,
      params,
    );
    return {
      items: res.rows.map((r) => ({
        warehouseId: String(r.warehouse_id),
        productId: String(r.product_id),
        quantityBase: String(r.quantity_base),
        bin: r.bin ? String(r.bin) : null,
        updatedAt: new Date(r.updated_at as string).toISOString(),
      })),
      total: res.rows.length,
    };
  }

  static async listMovements(
    ctx: UowContext,
    filter: { warehouseId?: string; productId?: string; transferId?: string; limit?: number },
  ): Promise<{ items: StockMovementDto[]; total: number }> {
    const params: unknown[] = [ctx.tenantId];
    const where: string[] = ['tenant_id = $1'];
    if (filter.warehouseId) {
      params.push(filter.warehouseId);
      where.push(`warehouse_id = $${params.length}`);
    }
    if (filter.productId) {
      params.push(filter.productId);
      where.push(`product_id = $${params.length}`);
    }
    if (filter.transferId) {
      params.push(filter.transferId);
      where.push(`transfer_id = $${params.length}`);
    }
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
    const res = await ctx.query<Record<string, unknown>>(
      `SELECT id, warehouse_id, product_id, movement_type, quantity_base,
              unit_id, quantity_transacted, conversion_factor, reason,
              source_document_type, source_document_id, transfer_id, reversal_of, occurred_at
       FROM stock_movement WHERE ${where.join(' AND ')}
       ORDER BY occurred_at DESC, created_at DESC LIMIT ${limit}`,
      params,
    );
    return { items: res.rows.map((r) => InventoryRepositoryQueries.toMovementDto(r)), total: res.rows.length };
  }

  private static toMovementDto(r: Record<string, unknown>): StockMovementDto {
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
