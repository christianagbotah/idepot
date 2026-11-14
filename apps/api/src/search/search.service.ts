import { Injectable } from '@nestjs/common';
import type { SearchQuery, SearchResultDto, SearchResultsDto } from '@idepot/contracts';
import { SEARCH_ENTITY_PERMISSIONS } from '@idepot/contracts';
import { hasPermission, type Permission } from '@idepot/auth';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';

interface Principal {
  userId: string;
  tenantId: string;
  roles: string[];
}

/** Max hits per entity group — global search is a navigation aid, not a report. */
const PER_ENTITY_LIMIT = 5;

type Entity = SearchResultDto['entity'];

interface EntityDef {
  /** Column display labels, verbatim from the row. */
  sql: string;
  params: Array<(like: string) => unknown>;
  map: (r: Record<string, unknown>) => SearchResultDto;
}

/**
 * Phase 6 parity: cross-entity global search (legacy `search_result.php` was
 * per-page only — the parity register pinned this gap).
 *
 * Security model:
 *  - any AUTHENTICATED principal may call /search (JwtAuthGuard), but every
 *    entity group is filtered by the caller's RBAC permissions — a cashier
 *    never sees purchase orders, an auditor sees everything read-only;
 *  - tenant isolation comes from the UnitOfWork RLS session (same as every
 *    other read), never from a hand-written tenant predicate;
 *  - the LIKE pattern is escaped (% _ \) so a user term can never widen the
 *    match, and the term is length-capped by the contract schema.
 */
@Injectable()
export class SearchService {
  constructor(private readonly uow: UnitOfWork) {}

  async search(principal: Principal, query: SearchQuery): Promise<SearchResultsDto> {
    const like = `%${escapeLike(query.q)}%`;

    return this.uow.run({ tenantId: principal.tenantId }, async (ctx) => {
      const groups: SearchResultsDto['groups'] = [];
      let total = 0;
      for (const entity of visibleEntities(principal.roles)) {
        const def = ENTITY_DEFS[entity]!;
        const params = def.params.map((p) => p(like));
        const res = await ctx.query<Record<string, unknown>>(def.sql, params);
        const items = res.rows.map(def.map);
        if (items.length > 0) {
          groups.push({ entity, items });
          total += items.length;
        }
      }
      return { q: query.q, total, groups };
    });
  }
}

/** Which entity groups this principal may see (permission-gated, in display order). */
function visibleEntities(roles: string[]): Entity[] {
  return (Object.keys(ENTITY_DEFS) as Entity[]).filter((entity) =>
    hasPermission(roles, SEARCH_ENTITY_PERMISSIONS[entity] as Permission),
  );
}

/** Escapes LIKE wildcards in the user term (backslash is the default escape). */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const ENTITY_DEFS: Record<Entity, EntityDef> = {
  product: {
    sql: `SELECT id, code, name, selling_price::text AS price, status,
                 created_at::text AS when_iso
          FROM product
          WHERE code ILIKE $1 OR name ILIKE $1
          ORDER BY code
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'product',
      id: String(r.id),
      code: String(r.code),
      title: String(r.name),
      subtitle: `selling ${String(r.price)}`,
      href: '/catalog',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  customer: {
    sql: `SELECT id, code, name, phone, status
          FROM customer
          WHERE name ILIKE $1 OR code ILIKE $1 OR phone ILIKE $1
          ORDER BY name
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'customer',
      id: String(r.id),
      code: r.code == null ? null : String(r.code),
      title: String(r.name),
      subtitle: String(r.phone),
      href: '/customers',
      status: String(r.status),
      when: null,
    }),
  },
  supplier: {
    sql: `SELECT id, code, name, phone, status
          FROM supplier
          WHERE name ILIKE $1 OR code ILIKE $1 OR phone ILIKE $1
          ORDER BY name
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'supplier',
      id: String(r.id),
      code: r.code == null ? null : String(r.code),
      title: String(r.name),
      subtitle: String(r.phone),
      href: '/suppliers',
      status: String(r.status),
      when: null,
    }),
  },
  invoice: {
    sql: `SELECT i.id, i.code, i.status, i.total::text AS total,
                 i.customer_id, c.name AS customer_name,
                 i.created_at::text AS when_iso
          FROM invoice i
          LEFT JOIN customer c ON c.id = i.customer_id
          WHERE i.code ILIKE $1
          ORDER BY i.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'invoice',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: `${r.customer_name == null ? 'walk-in' : String(r.customer_name)} · ${String(r.total)}`,
      href: '/sales',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  quotation: {
    sql: `SELECT q.id, q.code, q.status,
                 q.customer_id, c.name AS customer_name,
                 q.created_at::text AS when_iso
          FROM quotation q
          LEFT JOIN customer c ON c.id = q.customer_id
          WHERE q.code ILIKE $1
          ORDER BY q.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'quotation',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: r.customer_name == null ? 'walk-in' : String(r.customer_name),
      href: '/quotations',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  sales_order: {
    sql: `SELECT o.id, o.code, o.status, o.total::text AS total,
                 o.customer_id, c.name AS customer_name,
                 o.created_at::text AS when_iso
          FROM sales_order o
          LEFT JOIN customer c ON c.id = o.customer_id
          WHERE o.code ILIKE $1
          ORDER BY o.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'sales_order',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: `${r.customer_name == null ? 'walk-in' : String(r.customer_name)} · ${String(r.total)}`,
      href: '/sales-orders',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  waybill: {
    sql: `SELECT f.id, f.code, f.status,
                 f.sales_order_id, so.code AS order_code,
                 f.created_at::text AS when_iso
          FROM fulfillment f
          JOIN sales_order so ON so.id = f.sales_order_id
          WHERE f.code ILIKE $1
          ORDER BY f.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'waybill',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: `order ${String(r.order_code)}`,
      href: '/sales-orders',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  credit_note: {
    sql: `SELECT cn.id, cn.code, cn.total::text AS total, cn.business_date::text AS when_iso,
                 cn.customer_id, c.name AS customer_name
          FROM credit_note cn
          LEFT JOIN customer c ON c.id = cn.customer_id
          WHERE cn.code ILIKE $1
          ORDER BY cn.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'credit_note',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: `${r.customer_name == null ? 'walk-in' : String(r.customer_name)} · ${String(r.total)}`,
      href: '/returns/credit-notes',
      // a credit note is append-only once posted — there is no status column
      status: 'posted',
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  purchase_order: {
    sql: `SELECT po.id, po.code, po.status,
                 po.supplier_id, s.name AS supplier_name,
                 po.created_at::text AS when_iso
          FROM purchase_order po
          LEFT JOIN supplier s ON s.id = po.supplier_id
          WHERE po.code ILIKE $1
          ORDER BY po.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'purchase_order',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: r.supplier_name == null ? null : String(r.supplier_name),
      href: '/purchasing/orders',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  goods_receipt: {
    sql: `SELECT gr.id, gr.code, gr.status,
                 gr.supplier_id, s.name AS supplier_name,
                 gr.created_at::text AS when_iso
          FROM goods_receipt gr
          LEFT JOIN supplier s ON s.id = gr.supplier_id
          WHERE gr.code ILIKE $1
          ORDER BY gr.created_at DESC
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'goods_receipt',
      id: String(r.id),
      code: String(r.code),
      title: String(r.code),
      subtitle: r.supplier_name == null ? null : String(r.supplier_name),
      href: '/purchasing/grns',
      status: String(r.status),
      when: r.when_iso == null ? null : String(r.when_iso),
    }),
  },
  price_list: {
    sql: `SELECT id, code, name, kind, is_active
          FROM price_list
          WHERE code ILIKE $1 OR name ILIKE $1
          ORDER BY code
          LIMIT ${PER_ENTITY_LIMIT}`,
    params: [(like) => like],
    map: (r) => ({
      entity: 'price_list',
      id: String(r.id),
      code: String(r.code),
      title: String(r.name),
      subtitle: String(r.kind),
      href: '/price-lists',
      status: r.is_active ? 'active' : 'inactive',
      when: null,
    }),
  },
};
