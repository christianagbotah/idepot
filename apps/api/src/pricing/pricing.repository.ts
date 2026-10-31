import { Injectable } from '@nestjs/common';
import { MONEY_SCALE, formatDecimal, parseDecimal, rescale } from '@idepot/domain';
import type {
  CreatePriceList,
  CreatePriceListItem,
  ListDto,
  PriceListDto,
  PriceListItemDto,
  ResolvePriceQuery,
  ResolvedPriceDto,
} from '@idepot/contracts';
import { ConflictError, NotFoundError } from '@idepot/domain';
import { UnitOfWork } from '../db/unit-of-work.js';

/** Postgres SQLSTATE of a driver error, when present. */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Today as YYYY-MM-DD (UTC) — the resolve default date. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Effective-dated pricing write/read model.
 * Repository-layer enforcement (ADR-0001): every method resolves the active
 * UnitOfWork context; a call outside a UoW throws NoActiveTransactionError.
 *
 * Exclusion-constraint note: price_list_item carries a GiST EXCLUDE on
 * (price_list, product, unit, effective window) — the database is the
 * authority on overlap detection (error 23P01), mapped to ConflictError here.
 */
@Injectable()
export class PricingRepository {
  async createPriceList(input: CreatePriceList): Promise<PriceListDto> {
    const ctx = UnitOfWork.require();
    if (input.customerId) {
      // RLS-filtered check: a customer in another tenant is "not found"
      await this.assertRef('customer', input.customerId, 'customer');
    }
    try {
      const res = await ctx.query(
        `INSERT INTO price_list (tenant_id, code, name, kind, customer_id, is_active)
         VALUES ($1,$2,$3,$4,$5,true)
         RETURNING id, code, name, kind, customer_id, is_active`,
        [ctx.tenantId, input.code, input.name, input.kind, input.customerId ?? null],
      );
      return this.priceListToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('price list code already exists');
      if (pgCode(err) === '23503' && input.customerId) throw new NotFoundError('customer', input.customerId);
      throw err;
    }
  }

  async listPriceLists(): Promise<ListDto<PriceListDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, kind, customer_id, is_active,
              count(*) OVER ()::int AS total
       FROM price_list
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.priceListToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async addItem(priceListId: string, input: CreatePriceListItem): Promise<PriceListItemDto> {
    const ctx = UnitOfWork.require();
    await this.assertRef('price_list', priceListId, 'price list');
    await this.assertRef('product', input.productId, 'product');
    await this.assertRef('unit', input.unitId, 'unit');
    try {
      const res = await ctx.query(
        `INSERT INTO price_list_item (tenant_id, price_list_id, product_id, unit_id, price,
                                      effective_from, effective_to)
         VALUES ($1,$2,$3,$4,$5,$6::date,$7::date)
         RETURNING id, price_list_id, product_id, unit_id, price,
                   effective_from::text, effective_to::text`,
        [
          ctx.tenantId,
          priceListId,
          input.productId,
          input.unitId,
          input.price,
          input.effectiveFrom,
          input.effectiveTo ?? null,
        ],
      );
      return this.priceListItemToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23P01') {
        throw new ConflictError('overlapping effective window for this product/unit in this price list');
      }
      if (pgCode(err) === '23505') throw new ConflictError('price list item already exists');
      if (pgCode(err) === '23503') {
        // race backstop: product/unit verified above; the remaining FK is the list
        throw new NotFoundError('price list', priceListId);
      }
      throw err;
    }
  }

  async findItemById(id: string): Promise<PriceListItemDto | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, price_list_id, product_id, unit_id, price,
              effective_from::text, effective_to::text
       FROM price_list_item WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.priceListItemToDto(row) : undefined;
  }

  /** Sets effective_to on an existing item (the "close" operation). */
  async closeItem(id: string, effectiveTo: string): Promise<PriceListItemDto | undefined> {
    const ctx = UnitOfWork.require();
    try {
      const res = await ctx.query(
        `UPDATE price_list_item SET effective_to = $2::date WHERE id = $1
         RETURNING id, price_list_id, product_id, unit_id, price,
                   effective_from::text, effective_to::text`,
        [id, effectiveTo],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      return row ? this.priceListItemToDto(row) : undefined;
    } catch (err) {
      if (pgCode(err) === '23P01') {
        throw new ConflictError('overlapping effective window for this product/unit in this price list');
      }
      throw err;
    }
  }

  /**
   * Price resolution precedence: customer list → standard list → product
   * default selling price. All lookups are RLS-filtered (tenant_id comes from
   * the UoW session; the explicit pl.tenant_id predicate mirrors the contract).
   */
  async resolve(query: ResolvePriceQuery): Promise<ResolvedPriceDto> {
    const ctx = UnitOfWork.require();
    const date = query.date ?? today();

    if (query.customerId) {
      const res = await ctx.query(
        `SELECT pli.id, pli.price_list_id, pli.price, pli.effective_from::text AS effective_from
         FROM price_list_item pli
         JOIN price_list pl ON pl.id = pli.price_list_id
         WHERE pl.tenant_id = $1 AND pl.kind = 'customer' AND pl.customer_id = $2
           AND pl.is_active
           AND pli.product_id = $3 AND pli.unit_id = $4
           AND pli.effective_from <= $5::date
           AND (pli.effective_to IS NULL OR pli.effective_to >= $5::date)
         ORDER BY pli.effective_from DESC
         LIMIT 1`,
        [ctx.tenantId, query.customerId, query.productId, query.unitId, date],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (row) {
        return {
          price: formatDecimal(rescale(parseDecimal(String(row.price), MONEY_SCALE), MONEY_SCALE, 2), 2),
          source: 'customer_list',
          priceListId: String(row.price_list_id),
          priceListItemId: String(row.id),
          effectiveFrom: String(row.effective_from),
        };
      }
    }

    const standard = await ctx.query(
      `SELECT pli.id, pli.price_list_id, pli.price, pli.effective_from::text AS effective_from
       FROM price_list_item pli
       JOIN price_list pl ON pl.id = pli.price_list_id
       WHERE pl.tenant_id = $1 AND pl.kind = 'standard'
         AND pl.is_active
         AND pli.product_id = $2 AND pli.unit_id = $3
         AND pli.effective_from <= $4::date
         AND (pli.effective_to IS NULL OR pli.effective_to >= $4::date)
       ORDER BY pli.effective_from DESC
       LIMIT 1`,
      [ctx.tenantId, query.productId, query.unitId, date],
    );
    const stdRow = standard.rows[0] as Record<string, unknown> | undefined;
    if (stdRow) {
      return {
        price: formatDecimal(rescale(parseDecimal(String(stdRow.price), MONEY_SCALE), MONEY_SCALE, 2), 2),
        source: 'standard_list',
        priceListId: String(stdRow.price_list_id),
        priceListItemId: String(stdRow.id),
        effectiveFrom: String(stdRow.effective_from),
      };
    }

    const product = await ctx.query(`SELECT selling_price FROM product WHERE id = $1`, [
      query.productId,
    ]);
    const productRow = product.rows[0] as Record<string, unknown> | undefined;
    if (!productRow) throw new NotFoundError('product', query.productId);
    return {
      price: formatDecimal(rescale(parseDecimal(String(productRow.selling_price), MONEY_SCALE), MONEY_SCALE, 2), 2),
      source: 'product_default',
      priceListId: null,
      priceListItemId: null,
      effectiveFrom: null,
    };
  }

  /**
   * Phase 3 sale-posting variant: same precedence (customer list → standard
   * list → product default) but returns the stored decimal(18,4) price
   * VERBATIM (no 2dp display rescale) so the sale poster's price-override
   * comparison is exact at money scale. Also resolves the product's base
   * unit when the caller passes the base unit explicitly.
   */
  async resolveRaw(query: ResolvePriceQuery): Promise<ResolvedPriceDto> {
    const ctx = UnitOfWork.require();
    const date = query.date ?? today();

    if (query.customerId) {
      const res = await ctx.query<Record<string, unknown>>(
        `SELECT pli.id, pli.price_list_id, pli.price::text AS price, pli.effective_from::text AS effective_from
         FROM price_list_item pli
         JOIN price_list pl ON pl.id = pli.price_list_id
         WHERE pl.tenant_id = $1 AND pl.kind = 'customer' AND pl.customer_id = $2
           AND pl.is_active
           AND pli.product_id = $3 AND pli.unit_id = $4
           AND pli.effective_from <= $5::date
           AND (pli.effective_to IS NULL OR pli.effective_to >= $5::date)
         ORDER BY pli.effective_from DESC
         LIMIT 1`,
        [ctx.tenantId, query.customerId, query.productId, query.unitId, date],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (row) {
        return {
          price: String(row.price),
          source: 'customer_list',
          priceListId: String(row.price_list_id),
          priceListItemId: String(row.id),
          effectiveFrom: String(row.effective_from),
        };
      }
    }

    const standard = await ctx.query<Record<string, unknown>>(
      `SELECT pli.id, pli.price_list_id, pli.price::text AS price, pli.effective_from::text AS effective_from
       FROM price_list_item pli
       JOIN price_list pl ON pl.id = pli.price_list_id
       WHERE pl.tenant_id = $1 AND pl.kind = 'standard'
         AND pl.is_active
         AND pli.product_id = $2 AND pli.unit_id = $3
         AND pli.effective_from <= $4::date
         AND (pli.effective_to IS NULL OR pli.effective_to >= $4::date)
       ORDER BY pli.effective_from DESC
       LIMIT 1`,
      [ctx.tenantId, query.productId, query.unitId, date],
    );
    const stdRow = standard.rows[0] as Record<string, unknown> | undefined;
    if (stdRow) {
      return {
        price: String(stdRow.price),
        source: 'standard_list',
        priceListId: String(stdRow.price_list_id),
        priceListItemId: String(stdRow.id),
        effectiveFrom: String(stdRow.effective_from),
      };
    }

    const product = await ctx.query<Record<string, unknown>>(
      `SELECT selling_price::text AS selling_price FROM product WHERE id = $1`,
      [query.productId],
    );
    const productRow = product.rows[0] as Record<string, unknown> | undefined;
    if (!productRow) throw new NotFoundError('product', query.productId);
    return {
      price: String(productRow.selling_price),
      source: 'product_default',
      priceListId: null,
      priceListItemId: null,
      effectiveFrom: null,
    };
  }

  /** RLS-filtered existence check for a referenced row (table is a code literal). */
  private async assertRef(table: string, id: string, entity: string): Promise<void> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundError(entity, id);
  }

  private priceListToDto(r: Record<string, unknown>): PriceListDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      kind: String(r.kind) as PriceListDto['kind'],
      customerId: r.customer_id == null ? null : String(r.customer_id),
      isActive: Boolean(r.is_active),
    };
  }

  private priceListItemToDto(r: Record<string, unknown>): PriceListItemDto {
    return {
      id: String(r.id),
      priceListId: String(r.price_list_id),
      productId: String(r.product_id),
      unitId: String(r.unit_id),
      price: String(r.price),
      effectiveFrom: String(r.effective_from),
      effectiveTo: r.effective_to == null ? null : String(r.effective_to),
    };
  }
}
