import { NotFoundError } from '@idepot/domain';

import type { UowContext } from '../db/unit-of-work.js';

/**
 * RLS-filtered reference validation for client-supplied entity ids
 * (review fix 4, application layer): a referenced row in ANOTHER tenant is
 * indistinguishable from a missing one — both are a clean 404. The
 * tenant-aware composite FKs from migration 0005 are the structural
 * backstop behind these checks; this layer exists so callers get
 * meaningful 404/409 responses instead of FK violation 500s.
 *
 * The table name is a compile-time literal union (never user input),
 * mirroring ProductRepository.assertRef.
 */
export type TenantRefTable =
  | 'warehouse'
  | 'product'
  | 'unit'
  | 'product_unit'
  | 'stock_count'
  | 'stock_adjustment'
  | 'transfer';

export async function assertTenantRef(
  ctx: UowContext,
  table: TenantRefTable,
  entity: string,
  id: string | null | undefined,
): Promise<void> {
  if (id == null || id === '') return;
  const res = await ctx.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
  if (res.rows.length === 0) throw new NotFoundError(entity, id);
}

/** Batched form: validates every id (deduplicated) with one query. */
export async function assertTenantRefs(
  ctx: UowContext,
  table: TenantRefTable,
  entity: string,
  ids: Array<string | null | undefined>,
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id != null && id !== ''))];
  if (unique.length === 0) return;
  const res = await ctx.query(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`, [unique]);
  const found = new Set(res.rows.map((r) => String((r as Record<string, unknown>).id)));
  for (const id of unique) {
    if (!found.has(id)) throw new NotFoundError(entity, id);
  }
}
