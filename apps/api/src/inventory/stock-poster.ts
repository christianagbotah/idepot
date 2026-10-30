import { Injectable } from '@nestjs/common';
import type { StockMovementDto } from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  QTY_SCALE,
  convertToBaseExact,
  formatDecimal,
  parseQuantity,
  validateConversionFactor,
  validateMovementEntry,
  type MovementEntry,
} from '@idepot/domain';

import type { UowContext } from '../db/unit-of-work.js';

import { assertTenantRefs } from './inventory-refs.js';

export interface PostMovementsMeta {
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  createdBy?: string | null;
  /**
   * Oversell policy (offline-sync §5b, Phase 3): the tenant-level default is
   * 'reject' (fail loud — identical to the Phase 2 behaviour). When the
   * tenant configures 'allow_backorder', sale postings may drive the
   * projection negative (the ledger always applies); the CALLER is
   * responsible for raising the backorder exception task — the poster only
   * permits the negative arithmetic. Inventory documents (transfers,
   * adjustments, counts) never set this flag.
   */
  allowNegative?: boolean;
}

/** Postgres SQLSTATE of a driver error, when present (23505 unique, 23503 fk). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Advisory-lock domain key shared with BalanceRebuildService. */
export function inventoryWriteLockKey(tenantId: string): string {
  return `${tenantId}:inventory-write`;
}

interface ResolvedEntry {
  entry: MovementEntry;
  /** server-authoritative signed base quantity (scaled) */
  base: bigint;
  unitId: string | null;
  quantityTransacted: string | null;
  /** factor RESOLVED from server configuration — stored as historical evidence */
  conversionFactor: string | null;
}

/**
 * The single posting mechanism for every inventory-affecting authoritative
 * write (ADR-0001): inserts append-only ledger rows and updates the derived
 * balance projection INSIDE the caller's UnitOfWork transaction.
 *
 * Concurrency contract (PR #3 review fixes 1–3):
 * - Every posting first takes a per-tenant SHARED pg advisory xact lock.
 *   Postings may run concurrently with each other, but NEVER with a balance
 *   rebuild (which takes the same lock exclusively) — so a rebuild can never
 *   overwrite a projection with a stale aggregate. Lock order is always
 *   advisory lock → balance rows, which makes deadlocks structurally
 *   impossible between any two writers.
 * - For every (warehouse, product) touched: the zero balance row is created
 *   with an idempotent INSERT … ON CONFLICT DO NOTHING, then locked with
 *   SELECT … FOR UPDATE, then read, then updated with a plain UPDATE. Two
 *   concurrent FIRST postings therefore serialize on the now-existing row —
 *   the projection can never lose a committed movement (no UPSERT that
 *   replaces a concurrently updated projection with a pre-lock value).
 * - All balance rows of the posting set are locked up front in one
 *   deterministic sorted order (same order in every transaction), so
 *   multi-line postings cannot deadlock against each other.
 *
 * Conversion authority (review fix 3): product_unit configuration is the
 * ONLY authority for online cross-unit movements. The factor is resolved
 * server-side under the tenant, quantity_base is computed from
 * quantity_transacted × configured factor, and the client-supplied factor /
 * base quantity are treated purely as optimistic expectations — any
 * disagreement is rejected (409), never silently accepted. The resolved
 * factor is stored on the ledger row as historical evidence. The migration
 * engine keeps its own separate import path for legacy conversion evidence.
 */
@Injectable()
export class StockPoster {
  /**
   * Post movements + update balances atomically within the open UoW context.
   * Throws ConflictError on insufficient stock, stale conversion or an
   * already-reversed movement; NotFoundError on cross-tenant/missing
   * references; ValidationError on any conversion/quantity violation.
   * Zero partial state on failure (single tx).
   */
  async post(ctx: UowContext, entries: MovementEntry[], meta: PostMovementsMeta = {}): Promise<StockMovementDto[]> {
    if (entries.length === 0) return [];

    // tenant-wide SHARED advisory lock: concurrent postings allowed,
    // rebuilds excluded (they take it exclusively). Acquired FIRST.
    // Key derivation is a deterministic 64-bit hash of
    // "<tenantId>:inventory-write" (md5 is a documented, version-stable
    // function; hash-named internals like hashtext_extended were renamed
    // across major PostgreSQL releases).
    await ctx.query(
      `SELECT pg_advisory_xact_lock_shared(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
      [inventoryWriteLockKey(ctx.tenantId)],
    );

    // 1. validate entries + resolve authoritative conversions / references
    const resolved: ResolvedEntry[] = [];
    for (const entry of entries) {
      resolved.push(await this.resolveEntry(ctx, entry));
    }

    // 2. RLS-filtered reference validation for every client-supplied
    //    warehouse/product id (cross-tenant ⇒ indistinguishable from missing)
    await assertTenantRefs(
      ctx,
      'warehouse',
      'warehouse',
      resolved.map((r) => r.entry.warehouseId),
    );
    await assertTenantRefs(
      ctx,
      'product',
      'product',
      resolved.map((r) => r.entry.productId),
    );

    // 3. create-and-lock every balance row of the posting set, in one
    //    deterministic order shared by all writers (no lock-order cycles)
    const current = await this.lockBalances(ctx, resolved);

    // 4. apply deltas (read under lock → compute → plain UPDATE) and append
    //    the ledger rows with the server-resolved conversion evidence
    const out: StockMovementDto[] = [];
    for (const r of resolved) {
      const { entry } = r;
      const key = balanceKey(entry.warehouseId, entry.productId);
      const currentQty = current.get(key)!;
      const next = currentQty + r.base;
      if (next < 0n && !meta.allowNegative) {
        throw new ConflictError(
          `insufficient stock: product ${entry.productId} in warehouse ${entry.warehouseId} has ${formatDecimal(currentQty, QTY_SCALE)}, movement would make ${formatDecimal(next, QTY_SCALE)}`,
        );
      }
      const nextStr = formatDecimal(next, QTY_SCALE);
      await ctx.query(
        `UPDATE stock_balance SET quantity_base = $4, updated_at = now()
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
        [ctx.tenantId, entry.warehouseId, entry.productId, nextStr],
      );
      current.set(key, next);

      let res;
      try {
        res = await ctx.query<Record<string, unknown>>(
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
            formatDecimal(r.base, QTY_SCALE),
            r.unitId,
            r.quantityTransacted,
            r.conversionFactor,
            entry.reason ?? null,
            meta.sourceDocumentType ?? null,
            meta.sourceDocumentId ?? null,
            entry.transferId ?? null,
            entry.reversalOf ?? null,
            meta.createdBy ?? ctx.userId,
          ],
        );
      } catch (err) {
        // partial unique index uq_stock_movement_reversal_of (migration 0005):
        // a movement can be reversed at most once, enforced by the database
        if (pgCode(err) === '23505') {
          throw new ConflictError('movement has already been reversed');
        }
        throw err;
      }
      out.push(this.toMovementDto(res.rows[0] as Record<string, unknown>));
    }
    return out;
  }

  /**
   * Validates an entry and resolves its authoritative base quantity and
   * conversion factor. Base-unit movements keep the client's signed base
   * quantity (that IS the business fact; there is nothing to derive).
   * Cross-unit movements derive |quantity_base| server-side from the
   * configured product_unit factor; the client's factor and base quantity
   * are optimistic expectations compared against server configuration and
   * rejected when stale or tampered.
   */
  private async resolveEntry(ctx: UowContext, entry: MovementEntry): Promise<ResolvedEntry> {
    const base = validateMovementEntry(entry);
    const hasTransacted = entry.quantityTransacted != null && entry.quantityTransacted !== '';
    if (!hasTransacted) {
      return { entry, base, unitId: null, quantityTransacted: null, conversionFactor: null };
    }

    // RLS-filtered product load: a cross-tenant product is "not found"
    const product = await ctx.query<{ base_unit_id: string }>(
      `SELECT base_unit_id FROM product WHERE id = $1`,
      [entry.productId],
    );
    if (product.rows.length === 0) {
      throw new NotFoundError('product', entry.productId);
    }

    // resolve the authoritative factor from server configuration
    let factor: string;
    if (String(product.rows[0]!.base_unit_id) === entry.unitId) {
      factor = '1';
    } else {
      const cfg = await ctx.query<{ conversion_factor: string }>(
        `SELECT conversion_factor::text AS conversion_factor FROM product_unit
         WHERE product_id = $1 AND unit_id = $2`,
        [entry.productId, entry.unitId],
      );
      if (cfg.rows.length === 0) {
        throw new NotFoundError(
          'product_unit configuration',
          `${entry.productId}/${entry.unitId}`,
        );
      }
      factor = cfg.rows[0]!.conversion_factor;
    }

    // the client-supplied factor is an EXPECTATION only — never authoritative.
    // Compared numerically (12 == 12.000000), not textually.
    const clientFactor = entry.conversionFactor != null && entry.conversionFactor !== ''
      ? entry.conversionFactor
      : null;
    if (clientFactor != null && validateConversionFactor(clientFactor) !== parseQuantity(factor)) {
      throw new ConflictError(
        `stale conversion configuration: client sent factor ${clientFactor} but the configured factor for this product/unit is ${factor} (reload and retry)`,
      );
    }

    // server-side derivation: |base| = transacted × configured factor,
    // sign (movement direction) carried by the client's signed quantityBase
    const exact = convertToBaseExact(entry.quantityTransacted!, factor);
    const exactScaled = parseQuantity(exact);
    const absExact = exactScaled < 0n ? -exactScaled : exactScaled;
    const absBase = base < 0n ? -base : base;
    if (absExact !== absBase) {
      throw new ConflictError(
        `conversion mismatch: ${entry.quantityTransacted} × ${factor} = ${exact} but base quantity is ${entry.quantityBase} (the configured conversion is authoritative)`,
      );
    }
    const serverBase = (base < 0n ? -1n : 1n) * absExact;
    return {
      entry,
      base: serverBase,
      unitId: entry.unitId!,
      quantityTransacted: entry.quantityTransacted!,
      conversionFactor: factor,
    };
  }

  /**
   * Creates (idempotently) and locks (FOR UPDATE) every balance row in the
   * posting set, in deterministic sorted order, returning the locked current
   * quantities. The INSERT … ON CONFLICT DO NOTHING waits out a concurrent
   * creator of the same row, and guarantees the row exists for the lock
   * statement that follows in the same transaction — closing the first-row
   * race where two concurrent first postings both read "no row" and later
   * clobber each other's projection.
   */
  private async lockBalances(ctx: UowContext, resolved: ResolvedEntry[]): Promise<Map<string, bigint>> {
    const keys = [...new Set(resolved.map((r) => balanceKey(r.entry.warehouseId, r.entry.productId)))].sort();
    const current = new Map<string, bigint>();
    for (const key of keys) {
      const sep = key.indexOf(':');
      const warehouseId = key.slice(0, sep);
      const productId = key.slice(sep + 1);
      await ctx.query(
        `INSERT INTO stock_balance (tenant_id, warehouse_id, product_id, quantity_base)
         VALUES ($1,$2,$3,0)
         ON CONFLICT (tenant_id, warehouse_id, product_id) DO NOTHING`,
        [ctx.tenantId, warehouseId, productId],
      );
      const cur = await ctx.query<{ quantity_base: string }>(
        `SELECT quantity_base FROM stock_balance
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
        [ctx.tenantId, warehouseId, productId],
      );
      if (cur.rows.length === 0) {
        // unreachable after the ensure-insert above; kept as a hard guard
        throw new ConflictError(`stock balance row vanished while locking (${warehouseId}/${productId})`);
      }
      current.set(key, parseQuantity(cur.rows[0]!.quantity_base));
    }
    return current;
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

/** Sortable identity of a balance row: `${warehouseId}:${productId}`. */
function balanceKey(warehouseId: string, productId: string): string {
  return `${warehouseId}:${productId}`;
}
