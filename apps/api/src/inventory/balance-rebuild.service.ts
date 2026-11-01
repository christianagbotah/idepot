import { Injectable } from '@nestjs/common';
import type { BalanceRebuildReportDto, StockBalanceDto, StockMovementDto } from '@idepot/contracts';
import { applyCostToState, parseQuantity } from '@idepot/domain';

import type { UowContext } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
import { inventoryWriteLockKey } from './stock-poster.js';

/**
 * Ledger rebuild / reconciliation job. Proves the core invariant
 * `on_hand == Σ stock movements`: recomputes every (warehouse, product)
 * balance from the append-only ledger and compares with the stored
 * projection. dryRun reports differences without writing; otherwise the
 * projection is corrected to the ledger-derived truth (the ledger wins —
 * the balance is never authoritative).
 *
 * Concurrency contract (PR #3 review fix 2): rebuild coordinates with the
 * StockPoster's locking strategy through the SAME per-tenant advisory lock
 * domain. Every posting holds the lock in SHARED mode; a repair rebuild
 * takes it EXCLUSIVELY, so no posting can commit between the ledger SUM and
 * the projection writes — the committed projection can never be older than
 * the ledger state it was rebuilt from. A dry-run report takes the lock
 * shared (writers keep flowing; the report reads a consistent locked view).
 * Balance rows are additionally created (idempotently) and locked FOR
 * UPDATE in the same deterministic sorted order the poster uses, so even a
 * path that bypassed the advisory lock could not interleave with the writes.
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
    // coordinate with StockPoster: exclusive for repair, shared for reports.
    // Same deterministic 64-bit md5-derived key domain as StockPoster.
    const lockFn = opts.dryRun ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock';
    await ctx.query(
      `SELECT ${lockFn}(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
      [inventoryWriteLockKey(ctx.tenantId)],
    );

    const params: unknown[] = [ctx.tenantId];
    let warehouseFilter = '';
    if (opts.warehouseId) {
      params.push(opts.warehouseId);
      warehouseFilter = ` AND warehouse_id = $${params.length}`;
    }

    // key universe within the rebuild scope (tenant + optional warehouse):
    // stored balances ∪ ledger keys. Locked BEFORE the SUM is computed.
    const universeRows = await ctx.query<{ warehouse_id: string; product_id: string }>(
      `SELECT warehouse_id, product_id FROM stock_balance
       WHERE tenant_id = $1${warehouseFilter}
       UNION
       SELECT warehouse_id, product_id FROM stock_movement
       WHERE tenant_id = $1${warehouseFilter}`,
      params,
    );
    const universe = [
      ...new Map(
        universeRows.rows.map((r) => [`${r.warehouse_id}:${r.product_id}`, r]),
      ).values(),
    ].sort((a, b) => `${a.warehouse_id}:${a.product_id}`.localeCompare(`${b.warehouse_id}:${b.product_id}`));

    // ensure-and-lock every key (same mechanism and order as StockPoster):
    // the balance row AND the AVCO cost-state row (Phase 3 hardening — the
    // cost state is a second projection the rebuild must not leave stale)
    for (const key of universe) {
      await ctx.query(
        `INSERT INTO stock_balance (tenant_id, warehouse_id, product_id, quantity_base)
         VALUES ($1,$2,$3,0)
         ON CONFLICT (tenant_id, warehouse_id, product_id) DO NOTHING`,
        [ctx.tenantId, key.warehouse_id, key.product_id],
      );
      await ctx.query(
        `INSERT INTO stock_cost_state (tenant_id, warehouse_id, product_id, quantity_base, total_value)
         VALUES ($1,$2,$3,0,0)
         ON CONFLICT (tenant_id, warehouse_id, product_id) DO NOTHING`,
        [ctx.tenantId, key.warehouse_id, key.product_id],
      );
      const cur = await ctx.query<{ quantity_base: string }>(
        `SELECT quantity_base FROM stock_balance
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
        [ctx.tenantId, key.warehouse_id, key.product_id],
      );
      if (cur.rows.length === 0) {
        throw new Error(`unreachable: balance row missing after ensure (${key.warehouse_id}/${key.product_id})`);
      }
      const costCur = await ctx.query<{ quantity_base: string }>(
        `SELECT quantity_base FROM stock_cost_state
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
        [ctx.tenantId, key.warehouse_id, key.product_id],
      );
      if (costCur.rows.length === 0) {
        throw new Error(`unreachable: cost-state row missing after ensure (${key.warehouse_id}/${key.product_id})`);
      }
    }

    // ledger-derived truth per (warehouse, product) — under the locks above:
    // quantities AND the AVCO cost fold over the ledger's cost evidence
    const computed = await ctx.query<{ warehouse_id: string; product_id: string; total: string }>(
      `SELECT m.warehouse_id, m.product_id, SUM(m.quantity_base)::text AS total
       FROM stock_movement m
       WHERE m.tenant_id = $1${warehouseFilter.replace('warehouse_id', 'm.warehouse_id')}
       GROUP BY m.warehouse_id, m.product_id`,
      params,
    );
    const costLedger = await ctx.query<{
      warehouse_id: string; product_id: string;
      movements: Array<{ quantity_base: string; unit_cost: string | null; cost_value: string | null }>;
    }>(
      `SELECT m.warehouse_id, m.product_id,
              json_agg(json_build_object(
                'quantity_base', m.quantity_base::text,
                'unit_cost', m.unit_cost::text,
                'cost_value', m.cost_value::text
              ) ORDER BY m.occurred_at, m.created_at, m.id) AS movements
       FROM stock_movement m
       WHERE m.tenant_id = $1${warehouseFilter.replace('warehouse_id', 'm.warehouse_id')}
       GROUP BY m.warehouse_id, m.product_id`,
      params,
    );
    const costBy = new Map(costLedger.rows.map((r) => [`${r.warehouse_id}:${r.product_id}`, r.movements]));

    // stored projection, re-read AFTER locking (authoritative view)
    const stored = await ctx.query<{
      warehouse_id: string;
      product_id: string;
      quantity_base: string;
    }>(
      `SELECT warehouse_id, product_id, quantity_base FROM stock_balance
       WHERE tenant_id = $1${warehouseFilter}`,
      params,
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
      if (parseQuantity(storedQty) !== parseQuantity(computedQty)) {
        mismatches.push({
          warehouseId: row.warehouse_id,
          productId: row.product_id,
          balance: storedQty,
          computed: computedQty,
        });
      }
      if (!opts.dryRun) {
        // plain UPDATE on a row that was ensured + locked above — never an
        // UPSERT that could clobber a concurrently committed projection
        await ctx.query(
          `UPDATE stock_balance SET quantity_base = $4, updated_at = now()
           WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
          [ctx.tenantId, row.warehouse_id, row.product_id, computedQty],
        );
        // AVCO cost state: fold the ledger's per-movement cost evidence in
        // ledger order (receipts add layer value round4(qty×unit) or the
        // recorded explicit value; issues/remove their recorded evidence)
        let costState = { quantityBase: '0.000000', totalValue: '0.0000' };
        for (const mv of costBy.get(key) ?? []) {
          if (mv.cost_value == null && mv.unit_cost == null) {
            // un-costed movement: quantity still walks the cost state
            costState = applyCostToState(costState, { quantityBase: mv.quantity_base });
            continue;
          }
          costState = applyCostToState(costState, {
            quantityBase: mv.quantity_base,
            unitCost: mv.unit_cost,
            issueCost: mv.cost_value != null && parseQuantity(mv.quantity_base) < 0n
              ? { unitCost: mv.unit_cost, costValue: mv.cost_value, layered: true }
              : null,
            reversalCost: mv.cost_value != null ? { unitCost: mv.unit_cost, costValue: mv.cost_value } : null,
            explicitCost: mv.cost_value != null && parseQuantity(mv.quantity_base) > 0n
              ? { unitCost: mv.unit_cost, costValue: mv.cost_value }
              : null,
          });
        }
        await ctx.query(
          `UPDATE stock_cost_state SET quantity_base = $4, total_value = $5, updated_at = now()
           WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
          [ctx.tenantId, row.warehouse_id, row.product_id, costState.quantityBase, costState.totalValue],
        );
        rebuilt++;
      }
      storedMap.delete(key);
    }

    // in-scope balances with no movements at all must be zero — reset stale
    // rows (only within the rebuild scope: a warehouse-filtered rebuild must
    // never touch other warehouses' balances)
    for (const key of storedMap.keys()) {
      const sep = key.indexOf(':');
      const warehouseId = key.slice(0, sep);
      const productId = key.slice(sep + 1);
      checked++;
      if (parseQuantity(storedMap.get(key)!) !== 0n) {
        mismatches.push({
          warehouseId,
          productId,
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
        await ctx.query(
          `UPDATE stock_cost_state SET quantity_base = 0, total_value = 0, updated_at = now()
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
              source_document_type, source_document_id, transfer_id, reversal_of,
              unit_cost, cost_value, occurred_at
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
      unitCost: r.unit_cost != null ? String(r.unit_cost) : null,
      costValue: r.cost_value != null ? String(r.cost_value) : null,
    };
  }
}
