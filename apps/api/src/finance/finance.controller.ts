import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateTaxProfileSchema, CreateTaxVersionSchema } from '@idepot/contracts';
import { parseBody } from '../parse-body.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import type { Principal } from '../auth/jwt-auth.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialConfigurationService } from './financial-configuration.service.js';

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

/**
 * Financial configuration & evidence API (Phase 3 hardening).
 *
 * Tax profiles/versions are EFFECTIVE-DATED, IMMUTABLE-ONCE-CREATED
 * configuration: a new version is the only lawful way a rate changes, and
 * every invoice stores the transaction-time evidence, so a configuration
 * change can never rewrite history. The chart of accounts and journals are
 * read models for review/audit; Phase 4 grows the full accounting product
 * on these primitives.
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class TaxController {
  constructor(private readonly finance: FinancialConfigurationService) {}

  @Get('tax/profiles')
  @RequirePermissions('tax:manage')
  list(@Req() req: Request) {
    return this.finance.listTaxProfiles(principalOf(req).tenantId);
  }

  @Post('tax/profiles')
  @RequirePermissions('tax:manage')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.finance.createTaxProfile(principalOf(req), parseBody(CreateTaxProfileSchema, body));
  }

  @Post('tax/profiles/:id/versions')
  @RequirePermissions('tax:manage')
  createVersion(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.finance.createTaxVersion(principalOf(req), id, parseBody(CreateTaxVersionSchema, body));
  }
}

@UseGuards(JwtAuthGuard)
@Controller('gl')
export class GlController {
  constructor(private readonly finance: FinancialConfigurationService) {}

  @Get('accounts')
  @RequirePermissions('gl:read')
  accounts(@Req() req: Request) {
    return this.finance.listAccounts(principalOf(req).tenantId);
  }

  @Get('mappings')
  @RequirePermissions('gl:read')
  mappings(@Req() req: Request) {
    return this.finance.listMappings(principalOf(req).tenantId);
  }

  @Get('journals')
  @RequirePermissions('gl:read')
  journals(
    @Req() req: Request,
    @Query('sourceKind') sourceKind?: string,
    @Query('sourceId') sourceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.finance.listJournals(principalOf(req).tenantId, {
      sourceKind,
      sourceId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
