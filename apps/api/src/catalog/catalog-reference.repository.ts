import { Injectable } from '@nestjs/common';
import type { BrandDto, CategoryDto, ListDto, UnitDto } from '@idepot/contracts';
import { ConflictError, NotFoundError, validateNewCategory, validateNewUnit } from '@idepot/domain';
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
 * Catalog reference data: two-level categories, units of measure, brands.
 * Repository-layer enforcement (ADR-0001): every method resolves the active
 * UnitOfWork context; a call outside a UoW throws NoActiveTransactionError.
 */
@Injectable()
export class CatalogReferenceRepository {
  /* ------------------------------ categories ------------------------------ */

  async createCategory(input: {
    code: string;
    name: string;
    parentId?: string | null;
  }): Promise<CategoryDto> {
    const ctx = UnitOfWork.require();
    let parentHasParent = false;
    if (input.parentId) {
      // RLS-filtered load: a parent in another tenant is indistinguishable
      // from a missing one (both are "not found").
      const parent = await this.findCategoryRow(input.parentId);
      if (!parent) throw new NotFoundError('category', input.parentId);
      // the tree is limited to two levels: the chosen parent must be a root
      parentHasParent = parent.parent_id != null;
    }
    validateNewCategory(
      { code: input.code, name: input.name, parentId: input.parentId ?? null },
      parentHasParent,
    );
    try {
      const res = await ctx.query(
        `INSERT INTO product_category (tenant_id, parent_id, code, name)
         VALUES ($1,$2,$3,$4)
         RETURNING id, parent_id, code, name, is_active`,
        [ctx.tenantId, input.parentId ?? null, input.code, input.name],
      );
      return this.categoryToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('category code already exists');
      if (pgCode(err) === '23503' && input.parentId) throw new NotFoundError('category', input.parentId);
      throw err;
    }
  }

  async listCategories(): Promise<ListDto<CategoryDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, parent_id, code, name, is_active,
              count(*) OVER ()::int AS total
       FROM product_category
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.categoryToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async updateCategory(
    id: string,
    patch: { name?: string; isActive?: boolean },
  ): Promise<CategoryDto | undefined> {
    const ctx = UnitOfWork.require();
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.isActive !== undefined) {
      params.push(patch.isActive);
      sets.push(`is_active = $${params.length}`);
    }
    params.push(id);
    const res = await ctx.query(
      `UPDATE product_category SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, parent_id, code, name, is_active`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.categoryToDto(row) : undefined;
  }

  /* -------------------------------- units --------------------------------- */

  async createUnit(input: { code: string; name: string }): Promise<UnitDto> {
    const ctx = UnitOfWork.require();
    validateNewUnit(input);
    try {
      const res = await ctx.query(
        `INSERT INTO unit (tenant_id, code, name)
         VALUES ($1,$2,$3)
         RETURNING id, code, name, is_active`,
        [ctx.tenantId, input.code, input.name],
      );
      return this.unitToDto(res.rows[0] as Record<string, unknown>);
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('unit code already exists');
      throw err;
    }
  }

  async listUnits(): Promise<ListDto<UnitDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, is_active,
              count(*) OVER ()::int AS total
       FROM unit
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.unitToDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async updateUnit(
    id: string,
    patch: { name?: string; isActive?: boolean },
  ): Promise<UnitDto | undefined> {
    const ctx = UnitOfWork.require();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      params.push(patch.name);
      sets.push(`name = $${params.length}`);
    }
    if (patch.isActive !== undefined) {
      params.push(patch.isActive);
      sets.push(`is_active = $${params.length}`);
    }
    if (sets.length === 0) {
      const existing = await ctx.query(`SELECT id, code, name, is_active FROM unit WHERE id = $1`, [id]);
      const row = existing.rows[0] as Record<string, unknown> | undefined;
      return row ? this.unitToDto(row) : undefined;
    }
    params.push(id);
    const res = await ctx.query(
      `UPDATE unit SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, code, name, is_active`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.unitToDto(row) : undefined;
  }

  /* -------------------------------- brands -------------------------------- */

  async createBrand(input: { code: string; name: string }): Promise<BrandDto> {
    const ctx = UnitOfWork.require();
    try {
      const res = await ctx.query(
        `INSERT INTO brand (tenant_id, code, name)
         VALUES ($1,$2,$3)
         RETURNING id, code, name`,
        [ctx.tenantId, input.code, input.name],
      );
      const r = res.rows[0] as Record<string, unknown>;
      return { id: String(r.id), code: String(r.code), name: String(r.name) };
    } catch (err) {
      if (pgCode(err) === '23505') throw new ConflictError('brand code already exists');
      throw err;
    }
  }

  async listBrands(): Promise<ListDto<BrandDto>> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name,
              count(*) OVER ()::int AS total
       FROM brand
       ORDER BY created_at DESC, id
       LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => {
        const row = r as Record<string, unknown>;
        return { id: String(row.id), code: String(row.code), name: String(row.name) };
      }),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  /* ------------------------------- internals ------------------------------ */

  private async findCategoryRow(id: string): Promise<Record<string, unknown> | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(`SELECT id, parent_id FROM product_category WHERE id = $1`, [id]);
    return res.rows[0] as Record<string, unknown> | undefined;
  }

  private categoryToDto(r: Record<string, unknown>): CategoryDto {
    return {
      id: String(r.id),
      parentId: r.parent_id == null ? null : String(r.parent_id),
      code: String(r.code),
      name: String(r.name),
      isActive: Boolean(r.is_active),
    };
  }

  private unitToDto(r: Record<string, unknown>): UnitDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      isActive: Boolean(r.is_active),
    };
  }
}
