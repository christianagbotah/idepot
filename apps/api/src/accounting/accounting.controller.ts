/**
 * Accounting API (Phase 4): chart of accounts, purpose mappings,
 * accounting periods, GL inquiry, manual journals, financial
 * statements, reconciliation and backfill. Server-enforced RBAC.
 */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CreateGlAccountSchema,
  CreatePeriodsSchema,
  ManualJournalSchema,
  PeriodTransitionSchema,
  SetGlMappingSchema,
  UpdateGlAccountSchema,
} from '@idepot/contracts';
import { parseBody } from '../parse-body.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import type { Principal } from '../auth/jwt-auth.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ChartOfAccountsService } from './chart-of-accounts.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { JournalService } from './journal.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { FinancialStatementsService } from './statements.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ReconciliationService } from './reconciliation.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { BackfillService } from './backfill.service.js';

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly coa: ChartOfAccountsService,
    private readonly journals: JournalService,
    private readonly statements: FinancialStatementsService,
    private readonly reconciliation: ReconciliationService,
    private readonly backfill: BackfillService,
  ) {}

  /* ------------------------------ chart of accounts ---------------------- */

  @Get('accounts')
  @RequirePermissions('gl:read')
  listAccounts(@Req() req: Request) {
    return this.coa.listAccounts(principalOf(req).tenantId);
  }

  @Post('accounts')
  @RequirePermissions('accounting:configure')
  createAccount(@Req() req: Request, @Body() body: unknown) {
    return this.coa.createAccount(principalOf(req), parseBody(CreateGlAccountSchema, body));
  }

  @Post('accounts/:id')
  @RequirePermissions('accounting:configure')
  updateAccount(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.coa.updateAccount(principalOf(req), id, parseBody(UpdateGlAccountSchema, body));
  }

  @Post('accounts/:id/deactivate')
  @RequirePermissions('accounting:configure')
  deactivateAccount(@Req() req: Request, @Param('id') id: string) {
    return this.coa.deactivateAccount(principalOf(req), id);
  }

  @Post('mappings')
  @RequirePermissions('accounting:configure')
  setMapping(@Req() req: Request, @Body() body: unknown) {
    return this.coa.setMapping(principalOf(req), parseBody(SetGlMappingSchema, body));
  }

  /* --------------------------------- periods ----------------------------- */

  @Get('periods')
  @RequirePermissions('accounting:read')
  listPeriods(@Req() req: Request) {
    return this.coa.listPeriods(principalOf(req).tenantId);
  }

  @Post('periods')
  @RequirePermissions('accounting:close')
  createPeriods(@Req() req: Request, @Body() body: unknown) {
    return this.coa.createFiscalYearPeriods(principalOf(req), parseBody(CreatePeriodsSchema, body));
  }

  @Post('periods/:id/status')
  @RequirePermissions('accounting:close')
  transitionPeriod(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    return this.coa.transitionPeriod(principalOf(req), id, parseBody(PeriodTransitionSchema, body));
  }

  /* ------------------------------ GL inquiry ------------------------------ */

  @Get('journals')
  @RequirePermissions('gl:read')
  listJournals(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountCode') accountCode?: string,
    @Query('sourceKind') sourceKind?: string,
    @Query('reference') reference?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.journals.listJournals(principalOf(req).tenantId, {
      from,
      to,
      accountCode,
      sourceKind,
      reference,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('journals/:id')
  @RequirePermissions('gl:read')
  getJournal(@Req() req: Request, @Param('id') id: string) {
    return this.journals.getJournal(principalOf(req).tenantId, id);
  }

  @Post('journals/:id/reverse')
  @RequirePermissions('accounting:journal')
  reverseJournal(@Req() req: Request, @Param('id') id: string) {
    return this.journals.reverseManualJournal(principalOf(req), id);
  }

  @Get('accounts/:code/ledger')
  @RequirePermissions('gl:read')
  accountLedger(
    @Req() req: Request,
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.journals.accountLedger(principalOf(req).tenantId, code, { from, to });
  }

  @Post('journals')
  @RequirePermissions('accounting:journal')
  postManualJournal(@Req() req: Request, @Body() body: unknown) {
    return this.journals.postManualJournal(principalOf(req), parseBody(ManualJournalSchema, body));
  }

  /* ------------------------------ statements ------------------------------ */

  @Get('trial-balance')
  @RequirePermissions('financial-report:read')
  trialBalance(@Req() req: Request, @Query('asOf') asOf?: string, @Query('from') from?: string) {
    return this.statements.trialBalance(principalOf(req).tenantId, {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      from,
    });
  }

  @Get('profit-and-loss')
  @RequirePermissions('financial-report:read')
  profitAndLoss(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    return this.statements.profitAndLoss(principalOf(req).tenantId, {
      from: from ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      to: to ?? new Date().toISOString().slice(0, 10),
    });
  }

  @Get('balance-sheet')
  @RequirePermissions('financial-report:read')
  balanceSheet(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.statements.balanceSheet(principalOf(req).tenantId, asOf ?? new Date().toISOString().slice(0, 10));
  }

  @Get('cash-flow')
  @RequirePermissions('financial-report:read')
  cashFlow(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    return this.statements.cashFlow(principalOf(req).tenantId, {
      from: from ?? new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
      to: to ?? new Date().toISOString().slice(0, 10),
    });
  }

  /* ----------------------------- reconciliation --------------------------- */

  @Get('reconciliation')
  @RequirePermissions('accounting:read')
  reconciliationReport(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.reconciliation.arApReconciliation(
      principalOf(req).tenantId,
      asOf ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Post('backfill')
  @RequirePermissions('accounting:configure')
  runBackfill(@Req() req: Request) {
    return this.backfill.runBackfill(principalOf(req));
  }
}
