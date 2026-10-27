import { Injectable } from '@nestjs/common';
import type { WarehouseDto } from '@idepot/contracts';
import { validateNewWarehouse } from '@idepot/domain';
import { UnitOfWork } from '../db/unit-of-work.js';

/** Repository-layer enforcement (ADR-0001): every method resolves the active
 *  UnitOfWork context; a call outside a UoW throws NoActiveTransactionError. */
@Injectable()
export class WarehouseRepository {
  async create(input: {
    code: string;
    name: string;
    isActive?: boolean;
  }): Promise<WarehouseDto> {
    const ctx = UnitOfWork.require();
    validateNewWarehouse({ ...input, isActive: input.isActive ?? true });
    const res = await ctx.query(
      `INSERT INTO warehouse (tenant_id, code, name, is_active)
       VALUES ($1, $2,$3,$4)
       RETURNING id, code, name, is_active, created_at`,
      [ctx.tenantId, input.code, input.name, input.isActive ?? true],
    );
    return this.toDto(res.rows[0] as Record<string, unknown>);
  }

  async list(): Promise<{ items: WarehouseDto[]; total: number }> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, is_active, created_at,
              count(*) OVER ()::int AS total
       FROM warehouse ORDER BY created_at, id LIMIT 200`,
    );
    return {
      items: res.rows.map((r) => this.toDto(r as Record<string, unknown>)),
      total: res.rows[0] ? Number((res.rows[0] as Record<string, unknown>).total) : 0,
    };
  }

  async findById(id: string): Promise<WarehouseDto | undefined> {
    const ctx = UnitOfWork.require();
    const res = await ctx.query(
      `SELECT id, code, name, is_active, created_at FROM warehouse WHERE id = $1`,
      [id],
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.toDto(row) : undefined;
  }

  async update(
    id: string,
    patch: { name?: string; isActive?: boolean },
  ): Promise<WarehouseDto | undefined> {
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
    if (sets.length === 0) return this.findById(id);
    params.push(id);
    const res = await ctx.query(
      `UPDATE warehouse SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, code, name, is_active, created_at`,
      params,
    );
    const row = res.rows[0] as Record<string, unknown> | undefined;
    return row ? this.toDto(row) : undefined;
  }

  private toDto(r: Record<string, unknown>): WarehouseDto {
    return {
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      isActive: Boolean(r.is_active),
      createdAt: new Date(r.created_at as string).toISOString(),
    };
  }
}
