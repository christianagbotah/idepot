import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  CreateBrandSchema,
  CreateCategorySchema,
  CreateUnitSchema,
  UpdateCategorySchema,
} from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { CatalogReferenceService } from './catalog-reference.service.js';

// local schema: contracts ships no UpdateUnit wire schema; shape mirrors
// UpdateCategorySchema (name/isActive only).
const UpdateUnitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
});

/** Category / unit / brand reference data — one service, three route roots. */
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class CatalogReferenceController {
  constructor(private readonly reference: CatalogReferenceService) {}

  @Post('categories')
  @RequirePermissions('catalog:write')
  createCategory(@Req() req: Request, @Body() body: unknown) {
    return this.reference.createCategory(req.principal!, parseBody(CreateCategorySchema, body));
  }

  @Get('categories')
  @RequirePermissions('catalog:read')
  listCategories(@Req() req: Request) {
    return this.reference.listCategories(req.principal!);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalog:write')
  updateCategory(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.reference.updateCategory(
      req.principal!,
      id,
      parseBody(UpdateCategorySchema, body),
    );
  }

  @Post('units')
  @RequirePermissions('catalog:write')
  createUnit(@Req() req: Request, @Body() body: unknown) {
    return this.reference.createUnit(req.principal!, parseBody(CreateUnitSchema, body));
  }

  @Get('units')
  @RequirePermissions('catalog:read')
  listUnits(@Req() req: Request) {
    return this.reference.listUnits(req.principal!);
  }

  @Patch('units/:id')
  @RequirePermissions('catalog:write')
  updateUnit(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.reference.updateUnit(req.principal!, id, parseBody(UpdateUnitSchema, body));
  }

  @Post('brands')
  @RequirePermissions('catalog:write')
  createBrand(@Req() req: Request, @Body() body: unknown) {
    return this.reference.createBrand(req.principal!, parseBody(CreateBrandSchema, body));
  }

  @Get('brands')
  @RequirePermissions('catalog:read')
  listBrands(@Req() req: Request) {
    return this.reference.listBrands(req.principal!);
  }
}
