/**
 * Returns module shared helpers (Phase 5).
 */
import { ConflictError } from '@idepot/domain';
import type { UowContext } from '../db/unit-of-work.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique). */
export function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export interface ReturnsPrincipal {
  userId: string;
  tenantId: string;
  displayName: string;
  roles?: string[];
}

/** Reads a PostgreSQL `date` column as an ISO yyyy-mm-dd string. */
export function dateCol(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

/** Reads a nullable date column; null passes through. */
export function dateColNull(v: unknown): string | null {
  if (v == null) return null;
  return dateCol(v);
}

/** Reads a timestamptz column as an ISO string. */
export function tsCol(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function tsColNull(v: unknown): string | null {
  if (v == null) return null;
  return tsCol(v);
}

/**
 * Deterministic advisory-lock key space for one invoice's RETURNS domain:
 * every quantity-consuming or settlement-relevant operation on an
 * invoice's returnable quantity (return creation, exchange, credit-note
 * processing) takes this lock so the same-millisecond over-return race
 * is serialized — the loser re-reads the authoritative reserved
 * quantity and receives a controlled 409, never a raw constraint error.
 */
export function returnInvoiceLockKey(tenantId: string, invoiceId: string): string {
  return `returns-invoice:${tenantId}:${invoiceId}`;
}

export async function lockReturnInvoiceDomain(ctx: UowContext, invoiceId: string): Promise<void> {
  await ctx.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
    [returnInvoiceLockKey(ctx.tenantId, invoiceId)],
  );
}

/** Advisory-lock key space for one return command's IDEMPOTENCY domain. */
export function returnIdemLockKey(tenantId: string, clientDocId: string): string {
  return `returns-idem:${tenantId}:${clientDocId}`;
}

export async function lockReturnIdemDomain(ctx: UowContext, clientDocId: string): Promise<void> {
  await ctx.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
    [returnIdemLockKey(ctx.tenantId, clientDocId)],
  );
}

/** Advisory lock serializing concurrent redemptions of ONE store credit. */
export function storeCreditLockKey(tenantId: string, storeCreditId: string): string {
  return `store-credit:${tenantId}:${storeCreditId}`;
}

export async function lockStoreCreditDomain(ctx: UowContext, storeCreditId: string): Promise<void> {
  await ctx.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
    [storeCreditLockKey(ctx.tenantId, storeCreditId)],
  );
}

/** Advisory lock serializing refunds against ONE credit note. */
export function refundLockKey(tenantId: string, creditNoteId: string): string {
  return `refund:${tenantId}:${creditNoteId}`;
}

export async function lockRefundDomain(ctx: UowContext, creditNoteId: string): Promise<void> {
  await ctx.query(
    `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
    [refundLockKey(ctx.tenantId, creditNoteId)],
  );
}

/** Map a raw 23505 to a controlled conflict (never leak driver errors). */
export function mapUniqueViolation(err: unknown, message: string): never {
  if (pgCode(err) === '23505') {
    throw new ConflictError(message);
  }
  throw err;
}

/** Load the canonical AR settlement of an invoice:
 *  settled = Σ payment allocations + Σ credit applications (money in),
 *  exactly the PaymentService derivation. */
export async function loadInvoiceSettlement(
  ctx: UowContext,
  invoiceId: string,
): Promise<{ total: string; settled: string }> {
  const r = await ctx.query<{ total: string; settled: string }>(
    `SELECT i.total,
            (COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa WHERE pa.invoice_id = i.id), 0)
             + COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0))::text AS settled
       FROM invoice i WHERE i.id = $1`,
    [invoiceId],
  );
  if (r.rows.length === 0) {
    throw new ConflictError('invoice not found for settlement load');
  }
  return r.rows[0]!;
}
