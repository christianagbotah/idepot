import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateBarcodeSchema,
  CreateProductSchema,
  CreateProductUnitSchema,
  UpdateProductSchema,
} from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ProductService } from './product.service.js';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Post()
  @RequirePermissions('catalog:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.products.create(req.principal!, parseBody(CreateProductSchema, body));
  }

  @Get()
  @RequirePermissions('catalog:read')
  list(@Req() req: Request) {
    return this.products.list(req.principal!);
  }

  @Get(':id')
  @RequirePermissions('catalog:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.products.get(req.principal!, id);
  }

  @Patch(':id')
  @RequirePermissions('catalog:write')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.products.update(req.principal!, id, parseBody(UpdateProductSchema, body));
  }

  @Post(':id/units')
  @RequirePermissions('catalog:write')
  addUnit(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.products.addUnit(req.principal!, id, parseBody(CreateProductUnitSchema, body));
  }

  @Get(':id/units')
  @RequirePermissions('catalog:read')
  listUnits(@Req() req: Request, @Param('id') id: string) {
    return this.products.listUnits(req.principal!, id);
  }

  @Post(':id/barcodes')
  @RequirePermissions('catalog:write')
  addBarcode(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.products.addBarcode(req.principal!, id, parseBody(CreateBarcodeSchema, body));
  }

  @Get(':id/barcodes')
  @RequirePermissions('catalog:read')
  listBarcodes(@Req() req: Request, @Param('id') id: string) {
    return this.products.listBarcodes(req.principal!, id);
  }
}
