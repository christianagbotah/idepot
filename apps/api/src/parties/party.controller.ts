import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateCustomerSchema,
  CreateSupplierSchema,
  PostPartyOpeningBalanceSchema,
  UpdateCustomerSchema,
  UpdateSupplierSchema,
} from '@idepot/contracts';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { parseBody } from '../parse-body.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PartyService } from './party.service.js';

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('customers')
export class CustomerController {
  constructor(private readonly parties: PartyService) {}

  @Post()
  @RequirePermissions('party:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.parties.createCustomer(req.principal!, parseBody(CreateCustomerSchema, body));
  }

  @Get()
  @RequirePermissions('party:read')
  list(@Req() req: Request) {
    return this.parties.listCustomers(req.principal!);
  }

  @Get(':id')
  @RequirePermissions('party:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.parties.getCustomer(req.principal!, id);
  }

  @Patch(':id')
  @RequirePermissions('party:write')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.parties.updateCustomer(req.principal!, id, parseBody(UpdateCustomerSchema, body));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly parties: PartyService) {}

  @Post()
  @RequirePermissions('party:write')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.parties.createSupplier(req.principal!, parseBody(CreateSupplierSchema, body));
  }

  @Get()
  @RequirePermissions('party:read')
  list(@Req() req: Request) {
    return this.parties.listSuppliers(req.principal!);
  }

  @Get(':id')
  @RequirePermissions('party:read')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.parties.getSupplier(req.principal!, id);
  }

  @Patch(':id')
  @RequirePermissions('party:write')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.parties.updateSupplier(req.principal!, id, parseBody(UpdateSupplierSchema, body));
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('party-opening-balances')
export class PartyOpeningBalanceController {
  constructor(private readonly parties: PartyService) {}

  /** Document FOUNDATION only — GL posting arrives with Phase 4. */
  @Post()
  @RequirePermissions('party:write')
  post(@Req() req: Request, @Body() body: unknown) {
    return this.parties.postOpeningBalance(
      req.principal!,
      parseBody(PostPartyOpeningBalanceSchema, body),
    );
  }

  @Get()
  @RequirePermissions('party:read')
  list(@Req() req: Request) {
    return this.parties.listOpeningBalances(req.principal!);
  }
}
