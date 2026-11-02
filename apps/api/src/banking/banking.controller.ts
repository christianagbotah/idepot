/**
 * Banking API (Phase 4). Server-enforced RBAC on every route.
 */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  BankMatchSchema,
  BankTransferSchema,
  CreateBankAccountSchema,
} from '@idepot/contracts';
import { ValidationError } from '@idepot/domain';
import { parseBody } from '../parse-body.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import type { Principal } from '../auth/jwt-auth.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { BankService } from './bank.service.js';

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

@UseGuards(JwtAuthGuard)
@Controller('banking')
export class BankingController {
  constructor(private readonly bank: BankService) {}

  /* ------------------------------ bank accounts ---------------------------- */

  @Get('accounts')
  @RequirePermissions('banking:read')
  listAccounts(@Req() req: Request) {
    return this.bank.listBankAccounts(principalOf(req).tenantId);
  }

  @Post('accounts')
  @RequirePermissions('banking:write')
  createAccount(@Req() req: Request, @Body() body: unknown) {
    return this.bank.createBankAccount(principalOf(req), parseBody(CreateBankAccountSchema, body));
  }

  /* -------------------------------- transfers ------------------------------ */

  @Post('transfers')
  @RequirePermissions('banking:write')
  transfer(@Req() req: Request, @Body() body: unknown) {
    return this.bank.transfer(principalOf(req), parseBody(BankTransferSchema, body));
  }

  @Get('transfers')
  @RequirePermissions('banking:read')
  listTransfers(@Req() req: Request, @Query('limit') limit?: string) {
    return this.bank.listTransfers(principalOf(req).tenantId, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  /* ------------------------------ statements ------------------------------- */

  @Post('statements/import')
  @RequirePermissions('banking:write')
  async importStatement(@Req() req: Request, @Body() body: unknown) {
    const payload = body as {
      bankAccountId?: unknown;
      filename?: unknown;
      content?: unknown;
      statementDate?: unknown;
    };
    if (
      typeof payload.bankAccountId !== 'string' ||
      typeof payload.filename !== 'string' ||
      typeof payload.content !== 'string' ||
      typeof payload.statementDate !== 'string'
    ) {
      throw new ValidationError('expected { bankAccountId, filename, content, statementDate }');
    }
    if (payload.filename.length > 200) {
      throw new ValidationError('filename too long');
    }
    return this.bank.importStatement(principalOf(req), {
      bankAccountId: payload.bankAccountId,
      filename: payload.filename,
      content: payload.content,
      statementDate: payload.statementDate,
    });
  }

  @Get('statements')
  @RequirePermissions('banking:read')
  listStatements(@Req() req: Request, @Query('bankAccountId') bankAccountId?: string) {
    return this.bank.listStatements(principalOf(req).tenantId, bankAccountId);
  }

  @Get('statements/:id')
  @RequirePermissions('banking:read')
  getStatement(@Req() req: Request, @Param('id') id: string) {
    // statementDto is reachable via list; expose a direct read too
    return this.bank.listStatements(principalOf(req).tenantId).then((all) => {
      const found = all.find((s) => s.id === id);
      if (!found) {
        const err = new Error(`bank_statement ${id} not found`);
        err.name = 'NotFoundError';
        throw err;
      }
      return found;
    });
  }

  /* -------------------------------- matching ------------------------------- */

  @Get('match/suggestions/:statementLineId')
  @RequirePermissions('banking:reconcile')
  suggestMatches(@Req() req: Request, @Param('statementLineId') statementLineId: string) {
    return this.bank.suggestMatches(principalOf(req).tenantId, statementLineId);
  }

  @Post('match')
  @RequirePermissions('banking:reconcile')
  match(@Req() req: Request, @Body() body: unknown) {
    const dto = parseBody(BankMatchSchema, body);
    return this.bank.matchLine(principalOf(req), dto);
  }

  @Post('match/unmatch')
  @RequirePermissions('banking:reconcile')
  unmatch(
    @Req() req: Request,
    @Body() body: { statementLineId?: unknown; journalLineId?: unknown },
  ) {
    if (typeof body.statementLineId !== 'string' || typeof body.journalLineId !== 'string') {
      throw new ValidationError('expected { statementLineId, journalLineId }');
    }
    return this.bank.unmatchLine(principalOf(req), body.statementLineId, body.journalLineId);
  }

  /* ------------------------------ reconciliation ---------------------------- */

  @Post('reconciliations')
  @RequirePermissions('banking:reconcile')
  finalize(@Req() req: Request, @Body() body: { bankAccountId?: unknown; asOf?: unknown; notes?: unknown }) {
    if (typeof body.bankAccountId !== 'string' || typeof body.asOf !== 'string') {
      throw new ValidationError('expected { bankAccountId, asOf }');
    }
    return this.bank.finalizeReconciliation(principalOf(req), {
      bankAccountId: body.bankAccountId,
      asOf: body.asOf,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });
  }

  @Get('reconciliations')
  @RequirePermissions('banking:read')
  listReconciliations(@Req() req: Request, @Query('bankAccountId') bankAccountId?: string) {
    return this.bank.listReconciliations(principalOf(req).tenantId, bankAccountId);
  }
}
