import { Injectable } from '@nestjs/common';
import type {
  ClosePriceListItem,
  CreatePriceList,
  CreatePriceListItem,
  ListDto,
  PriceListDto,
  PriceListItemDto,
  ResolvePriceQuery,
  ResolvedPriceDto,
} from '@idepot/contracts';
import { ConflictError, NotFoundError, ValidationError } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PricingRepository } from './pricing.repository.js';

interface Principal {
  userId: string;
  tenantId: string;
  displayName: string;
}

/**
 * Effective-dated pricing.
 *
 * Immutability rule (map doc §pricing): a price row is IMMUTABLE once it is
 * effective (effective_from <= today). There is deliberately NO endpoint that
 * changes `price` on an existing item — correcting a price means closing the
 * row (setting effective_to) and inserting a new one. Closing is allowed with
 * any effectiveTo > effectiveFrom (ending an active price today with
 * effectiveTo = today+1 is legitimate). Deletion is not offered: historical
 * rows are audit evidence.
 */
@Injectable()
export class PricingService {
  constructor(private readonly uow: UnitOfWork, private readonly repo: PricingRepository) {}

  createPriceList(principal: Principal, dto: CreatePriceList): Promise<PriceListDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.kind === 'customer' && !dto.customerId) {
        throw new ValidationError('kind=customer requires a customerId');
      }
      const list = await this.repo.createPriceList(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'price_list.created',
        entityType: 'price_list',
        entityId: list.id,
        details: { code: list.code, name: list.name, kind: list.kind, customerId: list.customerId },
      });
      await ctx.outbox.emit('PriceListCreated', { priceListId: list.id, code: list.code });
      return list;
    });
  }

  addItem(principal: Principal, priceListId: string, dto: CreatePriceListItem): Promise<PriceListItemDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      if (dto.effectiveTo && dto.effectiveTo <= dto.effectiveFrom) {
        throw new ConflictError('effective_to must be after effective_from');
      }
      const item = await this.repo.addItem(priceListId, dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'price_list_item.created',
        entityType: 'price_list_item',
        entityId: item.id,
        details: {
          priceListId,
          productId: item.productId,
          unitId: item.unitId,
          price: item.price,
          effectiveFrom: item.effectiveFrom,
          effectiveTo: item.effectiveTo,
        },
      });
      await ctx.outbox.emit('PriceListItemCreated', {
        priceListId,
        priceListItemId: item.id,
        productId: item.productId,
        unitId: item.unitId,
      });
      return item;
    });
  }

  closeItem(principal: Principal, id: string, dto: ClosePriceListItem): Promise<PriceListItemDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const existing = await this.repo.findItemById(id);
      if (!existing) throw new NotFoundError('price list item', id);
      if (dto.effectiveTo <= existing.effectiveFrom) {
        throw new ConflictError('effective_to must be after effective_from');
      }
      const item = await this.repo.closeItem(id, dto.effectiveTo);
      if (!item) throw new NotFoundError('price list item', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'price_list_item.closed',
        entityType: 'price_list_item',
        entityId: item.id,
        details: { priceListId: item.priceListId, effectiveTo: item.effectiveTo },
      });
      await ctx.outbox.emit('PriceListItemClosed', {
        priceListId: item.priceListId,
        priceListItemId: item.id,
        effectiveTo: item.effectiveTo,
      });
      return item;
    });
  }

  listPriceLists(principal: { tenantId: string }): Promise<ListDto<PriceListDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.listPriceLists());
  }

  resolve(principal: { tenantId: string }, query: ResolvePriceQuery): Promise<ResolvedPriceDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.resolve(query));
  }
}
