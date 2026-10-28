import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ClosePriceListItemSchema,
  CreatePriceListItemSchema,
  CreatePriceListSchema,
  ResolvePriceQuerySchema,
} from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PricingService } from './pricing.service.js';

/** Price lists span two route roots (price-lists, price-list-items) plus the
 *  resolution query — hence the empty controller prefix. */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('price-lists')
  @RequirePermissions('pricing:write')
  createPriceList(@Req() req: Request, @Body() body: unknown) {
    return this.pricing.createPriceList(req.principal!, parseBody(CreatePriceListSchema, body));
  }

  @Get('price-lists')
  @RequirePermissions('pricing:read')
  listPriceLists(@Req() req: Request) {
    return this.pricing.listPriceLists(req.principal!);
  }

  @Post('price-lists/:id/items')
  @RequirePermissions('pricing:write')
  addItem(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.pricing.addItem(req.principal!, id, parseBody(CreatePriceListItemSchema, body));
  }

  @Post('price-list-items/:id/close')
  @RequirePermissions('pricing:write')
  closeItem(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.pricing.closeItem(req.principal!, id, parseBody(ClosePriceListItemSchema, body));
  }

  @Get('pricing/resolve')
  @RequirePermissions('pricing:read')
  resolve(@Req() req: Request) {
    return this.pricing.resolve(req.principal!, parseBody(ResolvePriceQuerySchema, req.query));
  }
}
