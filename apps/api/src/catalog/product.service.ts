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
import { NotFoundError } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ProductRepository } from './product.repository.js';

interface Principal {
  userId: string;
  tenantId: string;
  displayName: string;
}

@Injectable()
export class ProductService {
  constructor(private readonly uow: UnitOfWork, private readonly repo: ProductRepository) {}

  /** Every mutating operation = one posting transaction (document + audit + outbox). */
  create(principal: Principal, dto: CreateProduct): Promise<ProductDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const product = await this.repo.create(dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'product.created',
        entityType: 'product',
        entityId: product.id,
        details: { code: product.code, name: product.name, baseUnitId: product.baseUnitId },
      });
      await ctx.outbox.emit('ProductCreated', { productId: product.id, code: product.code });
      return product;
    });
  }

  update(principal: Principal, id: string, dto: UpdateProduct): Promise<ProductDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const product = await this.repo.update(id, dto);
      if (!product) throw new NotFoundError('product', id);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'product.updated',
        entityType: 'product',
        entityId: product.id,
        details: { ...dto },
      });
      await ctx.outbox.emit('ProductUpdated', { productId: product.id });
      return product;
    });
  }

  addUnit(principal: Principal, productId: string, dto: CreateProductUnit): Promise<ProductUnitDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const unit = await this.repo.addUnit(productId, dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'product_unit.created',
        entityType: 'product_unit',
        entityId: unit.id,
        details: { productId, unitId: unit.unitId, conversionFactor: unit.conversionFactor },
      });
      await ctx.outbox.emit('ProductUnitCreated', {
        productId,
        productUnitId: unit.id,
        unitId: unit.unitId,
      });
      return unit;
    });
  }

  addBarcode(principal: Principal, productId: string, dto: CreateBarcode): Promise<ProductBarcodeDto> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const barcode = await this.repo.addBarcode(productId, dto);
      await ctx.audit.record({
        tenantId: principal.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'product_barcode.created',
        entityType: 'product_barcode',
        entityId: barcode.id,
        details: { productId, barcode: barcode.barcode, isPrimary: barcode.isPrimary },
      });
      await ctx.outbox.emit('ProductBarcodeCreated', {
        productId,
        barcodeId: barcode.id,
        barcode: barcode.barcode,
      });
      return barcode;
    });
  }

  list(principal: { tenantId: string }): Promise<ListDto<ProductDto>> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => this.repo.list());
  }

  get(principal: { tenantId: string }, id: string): Promise<ProductDto> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const product = await this.repo.findById(id);
      if (!product) throw new NotFoundError('product', id);
      return product;
    });
  }

  listUnits(principal: { tenantId: string }, productId: string): Promise<ProductUnitDto[]> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const product = await this.repo.findById(productId);
      if (!product) throw new NotFoundError('product', productId);
      return this.repo.listUnits(productId);
    });
  }

  listBarcodes(principal: { tenantId: string }, productId: string): Promise<ProductBarcodeDto[]> {
    return this.uow.run({ tenantId: principal.tenantId }, async () => {
      const product = await this.repo.findById(productId);
      if (!product) throw new NotFoundError('product', productId);
      return this.repo.listBarcodes(productId);
    });
  }
}
