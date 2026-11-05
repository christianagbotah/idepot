import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  CancelRefundSchema,
  CancelReturnSchema,
  CreateExchangeSchema,
  CreateRefundSchema,
  CreateReturnReasonSchema,
  CreateReturnSchema,
  FailRefundSchema,
  ReceiveReturnSchema,
  RedeemStoreCreditSchema,
  RejectReturnSchema,
  SettleRefundSchema,
  SubmitReturnSchema,
  UpdateReturnReasonSchema,
} from '@idepot/contracts';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { ExchangeService } from './exchange.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { RefundService } from './refund.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { ReturnsService } from './returns.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime classes
import { StoreCreditService } from './store-credit.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

/* ------------------------- Returns & refunds (Phase 5) -------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly refunds: RefundService,
    private readonly storeCredits: StoreCreditService,
    private readonly exchanges: ExchangeService,
  ) {}

  // ---- reasons (configurable policy) ----
  @Get('reasons')
  @RequirePermissions('returns:read')
  listReasons(@Req() req: Request) {
    return this.returns.listReasons(principalOf(req).tenantId);
  }

  @Post('reasons')
  @RequirePermissions('settings:manage')
  createReason(@Req() req: Request, @Body() body: unknown) {
    return this.returns.createReason(principalOf(req), parseBody(CreateReturnReasonSchema, body));
  }

  @Post('reasons/:id')
  @RequirePermissions('settings:manage')
  updateReason(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.returns.updateReason(principalOf(req), id, parseBody(UpdateReturnReasonSchema, body));
  }

  // ---- returnable invoice evidence ----
  @Get('returnable-invoice/:invoiceId')
  @RequirePermissions('returns:read')
  getReturnableInvoice(@Req() req: Request, @Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.returns.getReturnableInvoice(principalOf(req).tenantId, invoiceId);
  }

  // ---- return orders ----
  @Get()
  @RequirePermissions('returns:read')
  listReturns(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.returns.listReturns(principalOf(req).tenantId, {
      status,
      invoiceId,
      customerId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post()
  @RequirePermissions('returns:write')
  createReturn(@Req() req: Request, @Body() body: unknown) {
    return this.returns.createReturn(principalOf(req), parseBody(CreateReturnSchema, body));
  }

  @Get('credit-notes')
  @RequirePermissions('returns:read')
  listCreditNotes(
    @Req() req: Request,
    @Query('invoiceId') invoiceId?: string,
    @Query('customerId') customerId?: string,
    @Query('returnOrderId') returnOrderId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.refunds.listCreditNotes(principalOf(req).tenantId, {
      invoiceId, customerId, returnOrderId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('credit-notes/:id')
  @RequirePermissions('returns:read')
  getCreditNote(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.getCreditNote(principalOf(req).tenantId, id);
  }

  @Get('refunds')
  @RequirePermissions('returns:read')
  listRefunds(
    @Req() req: Request,
    @Query('creditNoteId') creditNoteId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.refunds.listRefunds(principalOf(req).tenantId, {
      creditNoteId, customerId, status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('refunds')
  @RequirePermissions('returns:refund')
  createRefund(@Req() req: Request, @Body() body: unknown) {
    return this.refunds.createRefund(principalOf(req), parseBody(CreateRefundSchema, body));
  }

  @Post('refunds/:id/approve')
  @RequirePermissions('returns:refund')
  approveRefund(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.approveRefund(principalOf(req), id);
  }

  @Post('refunds/:id/post')
  @RequirePermissions('returns:refund')
  postRefund(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.postRefund(principalOf(req), id);
  }

  @Post('refunds/:id/settle')
  @RequirePermissions('returns:refund')
  settleRefund(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(SettleRefundSchema, body);
    return this.refunds.settleRefund(principalOf(req), id, dto.settlementReference);
  }

  @Post('refunds/:id/cancel')
  @RequirePermissions('returns:refund')
  cancelRefund(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(CancelRefundSchema, body);
    return this.refunds.cancelRefund(principalOf(req), id, dto.reason);
  }

  @Post('refunds/:id/fail')
  @RequirePermissions('returns:refund')
  failRefund(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(FailRefundSchema, body);
    return this.refunds.failRefund(principalOf(req), id, dto.reason);
  }

  @Get('store-credits')
  @RequirePermissions('returns:read')
  listStoreCredits(
    @Req() req: Request,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.storeCredits.listStoreCredits(principalOf(req).tenantId, {
      customerId, status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('store-credits/redemptions')
  @RequirePermissions('returns:read')
  listStoreCreditRedemptions(
    @Req() req: Request,
    @Query('storeCreditId') storeCreditId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeCredits.listRedemptions(principalOf(req).tenantId, {
      storeCreditId, invoiceId, customerId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('store-credits/statement/:customerId')
  @RequirePermissions('returns:read')
  storeCreditStatement(@Req() req: Request, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.storeCredits.customerStatement(principalOf(req).tenantId, customerId);
  }

  @Get('store-credits/:id')
  @RequirePermissions('returns:read')
  getStoreCredit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.storeCredits.getStoreCredit(principalOf(req).tenantId, id);
  }

  @Post('store-credits/redeem')
  @RequirePermissions('payment:write')
  redeemStoreCredit(@Req() req: Request, @Body() body: unknown) {
    return this.storeCredits.redeemStoreCredit(principalOf(req), parseBody(RedeemStoreCreditSchema, body));
  }

  @Post('store-credits/:id/expire')
  @RequirePermissions('accounting:journal')
  expireStoreCredit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parseBody(CancelReturnSchema, body); // { reason: 10..500 }
    return this.storeCredits.expireStoreCredit(principalOf(req), id, reason);
  }

  @Post('store-credits/:id/void')
  @RequirePermissions('returns:approve')
  voidStoreCredit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { reason } = parseBody(CancelReturnSchema, body);
    return this.storeCredits.voidStoreCredit(principalOf(req), id, reason);
  }

  // ---- exchanges ----
  @Get('exchanges')
  @RequirePermissions('returns:read')
  listExchanges(
    @Req() req: Request,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.exchanges.listExchanges(principalOf(req).tenantId, {
      customerId,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('exchanges')
  @RequirePermissions('returns:write')
  createExchange(@Req() req: Request, @Body() body: unknown) {
    return this.exchanges.createExchange(principalOf(req), parseBody(CreateExchangeSchema, body));
  }

  @Get('exchanges/:id')
  @RequirePermissions('returns:read')
  getExchange(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.exchanges.getExchange(principalOf(req).tenantId, id);
  }

  // ---- single return order (declared LAST so literal segments win) ----
  @Get(':id')
  @RequirePermissions('returns:read')
  getReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.returns.getReturn(principalOf(req).tenantId, id);
  }

  @Post(':id/submit')
  @RequirePermissions('returns:write')
  submitReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(SubmitReturnSchema, body);
    return this.returns.submitReturn(principalOf(req), { id, clientDocId: dto.clientDocId });
  }

  @Post(':id/approve')
  @RequirePermissions('returns:approve')
  approveReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.returns.approveReturn(principalOf(req), { id });
  }

  @Post(':id/reject')
  @RequirePermissions('returns:approve')
  rejectReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(RejectReturnSchema, body);
    return this.returns.rejectReturn(principalOf(req), { id, reason: dto.reason });
  }

  @Post(':id/receive')
  @RequirePermissions('returns:write')
  receiveReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(ReceiveReturnSchema, body);
    return this.returns.receiveReturn(principalOf(req), {
      id,
      inspectionNote: dto.inspectionNote,
    });
  }

  @Post(':id/process')
  @RequirePermissions('returns:approve')
  processReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.returns.processReturn(principalOf(req), id);
  }

  @Post(':id/cancel')
  @RequirePermissions('returns:approve')
  cancelReturn(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(CancelReturnSchema, body);
    return this.returns.cancelReturn(principalOf(req), { id, reason: dto.reason });
  }
}
