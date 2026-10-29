import { Injectable } from '@nestjs/common';
import type {
  BrandDto,
  CategoryDto,
  CreateCategory,
  CreateUnit,
  ListDto,
  UnitDto,
} from '@idepot/contracts';
import { NotFoundError } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { CatalogReferenceRepository } from './catalog-reference.repository.js';

interface Principal {
  userId: string;
  tenantId: string;
  displayName: string;
}

/** contracts ships CreateBrandSchema without an inferred alias; z.infer shape. */
interface CreateBrandInput {
  code: string;
  name: string;
}

@Injectable()
export class CatalogReferenceService {
  constructor(private readonly uow: UnitOfWork, private readonly repo: CatalogReferenceRepository) {}

  /* ------------------------------ categories ------------------------------ */

  createCategory(principal: Principal, dto: CreateCategory): Promise<CategoryDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const category = await this.repo.createCategory(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'category.created',
        entityType: 'category',
        entityId: category.id,
        details: { code: category.code, name: category.name, parentId: category.parentId },
      });
      await ctx.outbox.emit('CategoryCreated', { categoryId: category.id, code: category.code });
      return category;
    });
  }

  updateCategory(principal: Principal, id: string, patch: { name?: string; isActive?: boolean }): Promise<CategoryDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const category = await this.repo.updateCategory(id, patch);
      if (!category) throw new NotFoundError('category', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'category.updated',
        entityType: 'category',
        entityId: category.id,
        details: { ...patch },
      });
      await ctx.outbox.emit('CategoryUpdated', { categoryId: category.id });
      return category;
    });
  }

  /* -------------------------------- units --------------------------------- */

  createUnit(principal: Principal, dto: CreateUnit): Promise<UnitDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const unit = await this.repo.createUnit(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'unit.created',
        entityType: 'unit',
        entityId: unit.id,
        details: { code: unit.code, name: unit.name },
      });
      await ctx.outbox.emit('UnitCreated', { unitId: unit.id, code: unit.code });
      return unit;
    });
  }

  updateUnit(principal: Principal, id: string, patch: { name?: string; isActive?: boolean }): Promise<UnitDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const unit = await this.repo.updateUnit(id, patch);
      if (!unit) throw new NotFoundError('unit', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'unit.updated',
        entityType: 'unit',
        entityId: unit.id,
        details: { ...patch },
      });
      await ctx.outbox.emit('UnitUpdated', { unitId: unit.id });
      return unit;
    });
  }

  /* -------------------------------- brands -------------------------------- */

  createBrand(principal: Principal, dto: CreateBrandInput): Promise<BrandDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const brand = await this.repo.createBrand(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'brand.created',
        entityType: 'brand',
        entityId: brand.id,
        details: { code: brand.code, name: brand.name },
      });
      await ctx.outbox.emit('BrandCreated', { brandId: brand.id, code: brand.code });
      return brand;
    });
  }

  /* -------------------------------- reads --------------------------------- */

  listCategories(principal: { tenantId: string }): Promise<ListDto<CategoryDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listCategories());
  }

  listUnits(principal: { tenantId: string }): Promise<ListDto<UnitDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listUnits());
  }

  listBrands(principal: { tenantId: string }): Promise<ListDto<BrandDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listBrands());
  }
}
