/**
 * Purchasing module shared helpers (Phase 4).
 */
import { ConflictError, NotFoundError, ValidationError, convertToBaseExact, parseQuantity } from '@idepot/domain';
import type { UowContext } from '../db/unit-of-work.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique). */
export function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export interface PurchasingPrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
}

/**
 * Reads a PostgreSQL `date` column as an ISO yyyy-mm-dd string. node-pg
 * parses DATE columns into JS Date objects (local-midnight); naive
 * String() would produce "Mon Nov 02 ..." — this normalizes both shapes.
 */
export function dateCol(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Reads a nullable date column; null passes through. */
export function dateColNull(v: unknown): string | null {
  if (v == null) return null;
  return dateCol(v);
}

/** Deterministic advisory-lock key space for AP invoice domains. */
export function apInvoiceLockKey(tenantId: string, invoiceId: string): string {
  return `ap-invoice:${tenantId}:${invoiceId}`;
}

/** Transaction-scoped advisory lock on one AP invoice domain (serialized
 *  allocations/adjustments against the same invoice; the losing caller
 *  waits, then re-reads the authoritative open AP — never a raw 23505). */
export async function lockApInvoiceDomain(ctx: UowContext, invoiceId: string): Promise<void> {
  await ctx.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
    [apInvoiceLockKey(ctx.tenantId, invoiceId)],
  );
}

/** Recomputes a supplier invoice's payment status from the CANONICAL AP
 *  equation — the same one openApForInvoice derives:
 *
 *    open = total + Σ debit notes − Σ credit notes
 *           − Σ payment allocations − Σ advance-application legs
 *
 *  open ≤ 0 → 'paid'; otherwise 'partially_paid' (called only from paths
 *  that have just created an allocation/adjustment/application against
 *  the invoice, so 'partially_paid' is always truthful in those contexts).
 *  Cancelled invoices are never touched.
 *
 *  Regression background: the previous inline updates marked an invoice
 *  'paid' when `allocation >= open-after-this-allocation` — i.e. for any
 *  allocation greater than HALF the remaining balance (paying 60 of 100
 *  left status 'paid' with 40 open), and the advance-application flow
 *  never refreshed the status at all.
 */
export async function refreshInvoiceStatus(ctx: UowContext, invoiceId: string): Promise<void> {
  await ctx.query(
    `UPDATE supplier_invoice si
        SET status = CASE
              WHEN (si.total
                    + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                        WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
                    - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa
                        WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0)
                    - COALESCE((SELECT SUM(x.amount) FROM (
                        SELECT spa.amount FROM supplier_payment_allocation spa
                          WHERE spa.supplier_invoice_id = si.id
                        UNION ALL
                        SELECT saal.amount FROM supplier_advance_application_line saal
                          WHERE saal.supplier_invoice_id = si.id
                      ) x), 0)) <= 0
              THEN 'paid'
              ELSE 'partially_paid'
            END
      WHERE si.id = $1 AND si.tenant_id = $2
        AND si.status IN ('posted','partially_paid','paid')`,
    [invoiceId, ctx.tenantId],
  );
}

/**
 * Resolves a transacted quantity to its server-authoritative BASE
 * quantity using the product_unit configuration (mirrors StockPoster's
 * conversion authority; the client unit/quantity is the business fact,
 * the factor is always resolved server-side).
 */
export async function resolveBaseQuantity(
  ctx: UowContext,
  args: { productId: string; unitId?: string | null; quantity: string },
): Promise<{ quantityBase: string; conversionFactor: string; unitId: string | null }> {
  const qty = parseQuantity(args.quantity);
  if (qty <= 0n) throw new ValidationError('quantity must be > 0');
  if (args.unitId == null || args.unitId === '') {
    return { quantityBase: args.quantity, conversionFactor: '1', unitId: null };
  }
  const product = await ctx.query<{ base_unit_id: string }>(
    `SELECT base_unit_id FROM product WHERE id = $1`,
    [args.productId],
  );
  if (product.rows.length === 0) throw new NotFoundError('product', args.productId);
  let factor: string;
  if (String(product.rows[0]!.base_unit_id) === args.unitId) {
    factor = '1';
  } else {
    const cfg = await ctx.query<{ conversion_factor: string }>(
      `SELECT conversion_factor::text AS conversion_factor FROM product_unit
       WHERE product_id = $1 AND unit_id = $2`,
      [args.productId, args.unitId],
    );
    if (cfg.rows.length === 0) {
      throw new NotFoundError('product_unit configuration', `${args.productId}/${args.unitId}`);
    }
    factor = cfg.rows[0]!.conversion_factor;
  }
  const base = convertToBaseExact(args.quantity, factor);
  return { quantityBase: base, conversionFactor: factor, unitId: args.unitId };
}

/** Loads a tenant-scoped row and throws NotFoundError when absent
 *  (cross-tenant ids are indistinguishable from missing — RLS). */
export async function requireRow<T extends Record<string, unknown>>(
  ctx: UowContext,
  table: string,
  id: string,
): Promise<T> {
  const res = await ctx.query<T>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  if (res.rows.length === 0) throw new NotFoundError(table, id);
  return res.rows[0]!;
}

/** Loads a tenant-scoped row FOR UPDATE (header lock for state machines). */
export async function lockRow<T extends Record<string, unknown>>(
  ctx: UowContext,
  table: string,
  id: string,
): Promise<T> {
  const res = await ctx.query<T>(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
  if (res.rows.length === 0) throw new NotFoundError(table, id);
  return res.rows[0]!;
}

/** Purchasing tolerance policy from tenant_config (configurable, never
 *  magic constants; defaults are strict zero). */
export async function purchasingTolerance(ctx: UowContext): Promise<{
  overreceiptTolerancePct: string;
  priceTolerancePct: string;
  valueTolerance: string;
}> {
  const res = await ctx.query<{
    po_overreceipt_tolerance_pct: string;
    match_price_tolerance_pct: string;
    match_value_tolerance: string;
  }>(
    `SELECT po_overreceipt_tolerance_pct::text AS po_overreceipt_tolerance_pct,
            match_price_tolerance_pct::text AS match_price_tolerance_pct,
            match_value_tolerance::text AS match_value_tolerance
     FROM tenant_config WHERE tenant_id = $1`,
    [ctx.tenantId],
  );
  const row = res.rows[0];
  return {
    overreceiptTolerancePct: row?.po_overreceipt_tolerance_pct ?? '0',
    priceTolerancePct: row?.match_price_tolerance_pct ?? '0',
    valueTolerance: row?.match_value_tolerance ?? '0',
  };
}

/** Guard: a header status must be one of the allowed values. */
export function assertStatus(
  table: string,
  id: string,
  current: string,
  allowed: readonly string[],
): void {
  if (!allowed.includes(current)) {
    throw new ConflictError(`${table} ${id} is "${current}" — allowed: ${allowed.join(', ')}`);
  }
}
