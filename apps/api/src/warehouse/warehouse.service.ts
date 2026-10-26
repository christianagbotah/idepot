import { Injectable } from '@nestjs/common';
import type { CreateWarehouse, UpdateWarehouse, WarehouseDto } from '@idepot/contracts';
import { NotFoundError } from '@idepot/domain';
import { UnitOfWork } from '../db/unit-of-work.js';
import { WarehouseRepository } from './warehouse.repository.js';

@Injectable()
export class WarehouseService {
  constructor(private readonly uow: UnitOfWork, private readonly repo: WarehouseRepository) {}

  /** Every mutating operation = one posting transaction (document + audit + outbox). */
  create(
    principal: { userId: string; tenantId: string; displayName: string },
    dto: CreateWarehouse,
  ): Promise<WarehouseDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const wh = await this.repo.create(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'warehouse.created',
        entityType: 'warehouse',
        entityId: wh.id,
        details: { code: wh.code, name: wh.name },
      });
      await ctx.outbox.emit('WarehouseCreated', { warehouseId: wh.id, code: wh.code });
      return wh;
    });
  }

  update(
    principal: { userId: string; tenantId: string; displayName: string },
    id: string,
    dto: UpdateWarehouse,
  ): Promise<WarehouseDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const wh = await this.repo.update(id, dto);
      if (!wh) throw new NotFoundError('warehouse', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'warehouse.updated',
        entityType: 'warehouse',
        entityId: wh.id,
        details: { ...dto },
      });
      await ctx.outbox.emit('WarehouseUpdated', { warehouseId: wh.id });
      return wh;
    });
  }

  list(principal: { tenantId: string }) {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.list());
  }

  get(principal: { tenantId: string }, id: string): Promise<WarehouseDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const wh = await this.repo.findById(id);
      if (!wh) throw new NotFoundError('warehouse', id);
      return wh;
    });
  }
}
