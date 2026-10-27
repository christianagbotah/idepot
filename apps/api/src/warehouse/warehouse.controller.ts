import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
} from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { WarehouseService } from './warehouse.service.js';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('warehouses')
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseService) {}

  @Post()
  @RequirePermissions('warehouse:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.warehouses.create(req.principal!, parseBody(CreateWarehouseSchema, body));
  }

  @Get()
  @RequirePermissions('warehouse:read')
  list(@Req() req: Request) {
    return this.warehouses.list(req.principal!);
  }

  @Get(':id')
  @RequirePermissions('warehouse:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.warehouses.get(req.principal!, id);
  }

  @Patch(':id')
  @RequirePermissions('warehouse:write')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.warehouses.update(
      req.principal!,
      id,
      parseBody(UpdateWarehouseSchema, body),
    );
  }
}
