import { Injectable } from '@nestjs/common';
import type {
  CreateBarcode,
  CreateProduct,
  CreateProductUnit,
  ListDto,
  ProductBarcodeDto,
  ProductDto,
  ProductUnitDto,
  UpdateProduct,
} from '@idepot/contracts';
import {
  ConflictError,
  NotFoundError,
  validateBarcode,
  validateNewProduct,
  validateNewProductUnit,
} from '@idepot/domain';
import { UnitOfWork } from '../db/unit-of-work.js';

/** Postgres SQLSTATE of a driver error, when present (23505 unique, 23503 fk). */
function pgCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Catalog write model (ADR-0001): every method resolves the active UnitOfWork
 * context; a call outside a UoW throws NoActiveTransactionError — autocommit
 * writes are structurally impossible.
 *
 * Referenced rows (units, categories, suppliers, brands, products) are
 * verified with RLS-filtered SELECTs before insert: FK checks bypass RLS
 * (they run as the table owner), so the FK violation alone cannot reject
 * cross-tenant references. The FK-violation mappings kept in the catch
 * blocks are backstops for same-tenant races only.
 */
@Injectable()
export class ProductRepository {
  async create(input: CreateProduct): Promise<ProductDto> {
    const ctx = UnitOfWork.require();
    validateNewProduct(input);
    await this.assertRef('unit', 'unit', input.baseUnitId);
    if (input.defaultSaleUnitId) await this.assertRef('unit', 'unit', input.defaultSaleUnitId);
    if (input.categoryId) await this.assertRef('product_category', 'category', input.categoryId);
    if (input.supplierId) await this.assertRef('supplier', 'supplier', input.supplierId);
    if (input.brandId) await this.assertRef('brand', 'brand', input.brandId);
    try {
      const res = await ctx.query(
        `INSERT INTO product (tenant_id, code, name, description, category_id, supplier_id,
                              brand_id, base_unit_id, default_sale_unit_id, sold_in_units,
                              selling_price, purchase_price, tax_exempt, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, code, name, description, category_id, supplier_id, brand_id,
                   base_unit_id, default_sale_unit_id, sold_in_units, selling_price,
                   purchase_price, tax_exempt, status, created_at`,
        [
          ctx.tenantId,
          input.code,
          input.name,
          input.description ?? null,
          input.categoryId ?? null,
          input.supplierId ?? null,
          input.brandId ?? null,
          input.baseUnitId,
          input.defaultSaleUnitId ?? null,
          input.soldInUnits ?? false,
          input.sellingPrice,
          input.purchasePrice ?? null,
          input.taxExempt ?? false,
          input.status ?? 'active',
        ],
      );
      return this.toDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('product code already exists');
      throw err;
    }
  }

  async list(): Promise<ListDto<ProductDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, description, category_id, supplier_id, brand_id,
              base_unit_id, default_sale_unit_id, sold_in_units, selling_price,
              purchase_price, status, created_at,
              count(*) OVER ()::int AS total
       FROM product
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.toDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async findById(id: string): Promise<ProductDto | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, description, category_id, supplier_id, brand_id,
              base_unit_id, default_sale_unit_id, sold_in_units, selling_price,
              purchase_price, status, created_at
       FROM product WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.toDto(row) : undefined;
  }

  async update(id: string, patch: UpdateProduct): Promise<ProductDto | undefined> {
    const ctx = UnitOfWork.require();
    if (patch.categoryId) await this.assertRef('product_category', 'category', patch.categoryId);
    if (patch.supplierId) await this.assertRef('supplier', 'supplier', patch.supplierId);
    if (patch.brandId) await this.assertRef('brand', 'brand', patch.brandId);
    if (patch.defaultSaleUnitId) await this.assertRef('unit', 'unit', patch.defaultSaleUnitId);
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.description !== undefined) {
      params.push(patch.description ?? null);
      sets.push(`description = $${params.length}`);
    }
    if (patch.categoryId !== undefined) {
      params.push(patch.categoryId ?? null);
      sets.push(`category_id = $${params.length}`);
    }
    if (patch.supplierId !== undefined) {
      params.push(patch.supplierId ?? null);
      sets.push(`supplier_id = $${params.length}`);
    }
    if (patch.brandId !== undefined) {
      params.push(patch.brandId ?? null);
      sets.push(`brand_id = $${params.length}`);
    }
    if (patch.defaultSaleUnitId !== undefined) {
      params.push(patch.defaultSaleUnitId ?? null);
      sets.push(`default_sale_unit_id = $${params.length}`);
    }
    if (patch.soldInUnits !== undefined) {
      params.push(patch.soldInUnits);
      sets.push(`sold_in_units = $${params.length}`);
    }
    if (patch.sellingPrice !== undefined) {
      params.push(patch.sellingPrice);
      sets.push(`selling_price = $${params.length}`);
    }
    if (patch.purchasePrice !== undefined) {
      params.push(patch.purchasePrice ?? null);
      sets.push(`purchase_price = $${params.length}`);
    }
    if (patch.status !== undefined) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    params.push(id);
    const res = await ctx.query(
      `UPDATE product SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, code, name, description, category_id, supplier_id, brand_id,
                 base_unit_id, default_sale_unit_id, sold_in_units, selling_price,
                 purchase_price, status, created_at`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.toDto(row) : undefined;
  }

  /** Add a unit conversion: loads the product (RLS → 404 when missing),
   *  validates against its base unit, then inserts the conversion row. */
  async addUnit(productId: string, input: CreateProductUnit): Promise<ProductUnitDto> {
    const ctx = UnitOfWork.require();
    const prod = await ctx.query(`SELECT id, base_unit_id FROM product WHERE id = $1`, [
      productId,
    ]);
    const productRow = prod.rows[0] as Record<string, unknown> | undefined;
    if (!productRow) throw new NotFoundError('product', productId);
    validateNewProductUnit(
      {
        productId,
        unitId: input.unitId,
        conversionFactor: input.conversionFactor,
        price: input.price ?? null,
        isDefaultSale: input.isDefaultSale ?? false,
      },
      String(productRow.base_unit_id),
    );
    const unitRes = await ctx.query(`SELECT code FROM unit WHERE id = $1`, [input.unitId]);
    const unitRow = unitRes.rows[0] as Record<string, unknown> | undefined;
    if (!unitRow) throw new NotFoundError('unit', input.unitId);
    try {
      const res = await ctx.query(
        `INSERT INTO product_unit (tenant_id, product_id, unit_id, conversion_factor, price, is_default_sale)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, product_id, unit_id, conversion_factor, price, is_default_sale`,
        [
          ctx.tenantId,
          productId,
          input.unitId,
          input.conversionFactor,
          input.price ?? null,
          input.isDefaultSale ?? false,
        ],
      );
      const r = res.rows[0] as Record<string, unknown>;
      return {
        id: String(r.id),
        productId: String(r.product_id),
        unitId: String(r.unit_id),
        unitCode: String(unitRow.code),
        conversionFactor: String(r.conversion_factor),
        price: r.price == null ? null : String(r.price),
        isDefaultSale: Boolean(r.is_default_sale),
      };
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('conversion already exists for this unit');
      if (pgCode(err) === '23503') throw new NotFoundError('unit', input.unitId);
      throw err;
    }
  }

  async listUnits(productId: string): Promise<ProductUnitDto[]> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT pu.id, pu.product_id, pu.unit_id, u.code AS unit_code,
              pu.conversion_factor, pu.price, pu.is_default_sale
       FROM product_unit pu
       JOIN unit u ON u.id = pu.unit_id
       WHERE pu.product_id = $1
       ORDER BY pu.created_at, pu.id`,
      [productId],
    );
    return res.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        productId: String(row.product_id),
        unitId: String(row.unit_id),
        unitCode: row.unit_code == null ? null : String(row.unit_code),
        conversionFactor: String(row.conversion_factor),
        price: row.price == null ? null : String(row.price),
        isDefaultSale: Boolean(row.is_default_sale),
      };
    });
  }

  async addBarcode(productId: string, input: CreateBarcode): Promise<ProductBarcodeDto> {
    const ctx = UnitOfWork.require();
    validateBarcode(input.barcode);
    await this.assertRef('product', 'product', productId);
    try {
      const res = await ctx.query(
        `INSERT INTO product_barcode (tenant_id, product_id, barcode, is_primary)
         VALUES ($1,$2,$3,$4)
         RETURNING id, product_id, barcode, is_primary`,
        [ctx.tenantId, productId, input.barcode, input.isPrimary ?? false],
      );
      const r = res.rows[0] as Record<string, unknown>;
      return {
        id: String(r.id),
        productId: String(r.product_id),
        barcode: String(r.barcode),
        isPrimary: Boolean(r.is_primary),
      };
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('barcode already exists');
      if (pgCode(err) === '23503') throw new NotFoundError('product', productId);
      throw err;
    }
  }

  async listBarcodes(productId: string): Promise<ProductBarcodeDto[]> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, product_id, barcode, is_primary
       FROM product_barcode
       WHERE product_id = $1
       ORDER BY created_at, id`,
      [productId],
    );
    return res.rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        productId: String(row.product_id),
        barcode: String(row.barcode),
        isPrimary: Boolean(row.is_primary),
      };
    });
  }

  /** RLS-filtered existence check for a referenced row (table is a code literal). */
  private async assertRef(table: string, entity: string, id: string): Promise<void> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]);
    if (res.rows.length === 0) throw new NotFoundError(entity, id);
  }

  private toDto(r: Record<string, unknown>): ProductDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      description: r.description == null ? null : String(r.description),
      categoryId: r.category_id == null ? null : String(r.category_id),
      supplierId: r.supplier_id == null ? null : String(r.supplier_id),
      brandId: r.brand_id == null ? null : String(r.brand_id),
      baseUnitId: String(r.base_unit_id),
      defaultSaleUnitId: r.default_sale_unit_id == null ? null : String(r.default_sale_unit_id),
      soldInUnits: Boolean(r.sold_in_units),
      sellingPrice: String(r.selling_price),
      purchasePrice: r.purchase_price == null ? null : String(r.purchase_price),
      status: String(r.status) as ProductDto['status'],
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
