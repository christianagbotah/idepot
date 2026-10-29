import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApproveCountSchema,
  CreateStockAdjustmentSchema,
  CreateStockCountSchema,
  CreateTransferSchema,
  RebuildBalancesSchema,
  ReceiveTransferSchema,
  SubmitCountSchema,
  UpdateCountLinesSchema,
} from '@idepot/contracts';
 
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
 
import { RequirePermissions } from '../rbac/permissions.decorator.js';
 
import { RbacGuard } from '../rbac/rbac.guard.js';
 
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { BalanceRebuildService, InventoryReadService } from './balance-rebuild.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { OpeningStockService } from './opening-stock.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockAdjustmentService } from './stock-adjustment.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { StockCountService } from './stock-count.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { TransferService } from './transfer.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly reads: InventoryReadService,
    private readonly rebuild: BalanceRebuildService,
    private readonly opening: OpeningStockService,
  ) {}

  @Get('balances')
  @RequirePermissions('inventory:read')
  balances(
    @Req() req: Request,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
  ) {
    const p = principalOf(req);
    return this.reads.balances(p.tenantId, { warehouseId, productId });
  }

  @Get('movements')
  @RequirePermissions('inventory:read')
  movements(
    @Req() req: Request,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('transferId') transferId?: string,
    @Query('limit') limit?: string,
  ) {
    const p = principalOf(req);
    return this.reads.movements(p.tenantId, {
      warehouseId,
      productId,
      transferId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('balances/rebuild')
  @RequirePermissions('inventory:write')
  rebuildBalances(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.rebuild.runForTenant(p.tenantId, parseBody(RebuildBalancesSchema, body));
  }

  @Post('opening-stock')
  @RequirePermissions('inventory:write')
  openingStock(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.opening.createOpeningStock(p, parseBody(OpeningStockSchema, body));
  }
}

// local schema: the opening-stock payload is service-validated in depth
// (authority/risk/permission gates); zod covers the wire shape here.
import { z } from 'zod';
const OpeningStockSchema = z.object({
  warehouseId: z.string().uuid(),
  lines: z
    .array(z.object({ productId: z.string().uuid(), quantityBase: z.string().regex(/^-?\d{1,14}(\.\d{1,6})?$/) }))
    .min(1)
    .max(2000),
  authority: z.enum(['physical_count', 'legacy_quantity', 'system_entry']).default('physical_count'),
  acceptedMigrationRisk: z.boolean().optional(),
  sourceEvidence: z.string().max(1000).nullish(),
  note: z.string().max(2000).nullish(),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('stock-counts')
export class StockCountController {
  constructor(private readonly counts: StockCountService) {}

  @Post()
  @RequirePermissions('stockcount:count')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.counts.create(principalOf(req), parseBody(CreateStockCountSchema, body));
  }

  @Get()
  @RequirePermissions('stockcount:read')
  list(@Req() req: Request) {
    return this.counts.list(principalOf(req));
  }

  @Get(':id')
  @RequirePermissions('stockcount:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.counts.get(principalOf(req), id);
  }

  @Patch(':id/lines')
  @RequirePermissions('stockcount:count')
  updateLines(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.counts.updateLines(principalOf(req), id, parseBody(UpdateCountLinesSchema, body));
  }

  @Post(':id/submit')
  @RequirePermissions('stockcount:count')
  submit(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.counts.submit(principalOf(req), id, parseBody(SubmitCountSchema, body));
  }

  @Post(':id/approve')
  @RequirePermissions('stockcount:approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.counts.approve(principalOf(req), id, parseBody(ApproveCountSchema, body));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('stock-adjustments')
export class StockAdjustmentController {
  constructor(private readonly adjustments: StockAdjustmentService) {}

  @Post()
  @RequirePermissions('inventory:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.adjustments.create(principalOf(req), parseBody(CreateStockAdjustmentSchema, body));
  }

  @Post(':id/reverse')
  @RequirePermissions('inventory:write')
  reverse(@Req() req: Request, @Param('id') id: string) {
    return this.adjustments.reverse(principalOf(req), id);
  }

  @Get()
  @RequirePermissions('inventory:read')
  list(@Req() req: Request) {
    return this.adjustments.list(principalOf(req));
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.adjustments.get(principalOf(req), id);
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('transfers')
export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  @Post()
  @RequirePermissions('inventory:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.transfers.create(principalOf(req), parseBody(CreateTransferSchema, body));
  }

  @Get()
  @RequirePermissions('inventory:read')
  list(@Req() req: Request) {
    return this.transfers.list(principalOf(req));
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.transfers.get(principalOf(req), id);
  }

  @Post(':id/dispatch')
  @RequirePermissions('inventory:write')
  dispatch(@Req() req: Request, @Param('id') id: string) {
    return this.transfers.dispatch(principalOf(req), id);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory:write')
  receive(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.transfers.receive(principalOf(req), id, parseBody(ReceiveTransferSchema, body));
  }
}
