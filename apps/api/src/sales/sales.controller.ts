import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApplyCreditSchema,
  CloseShiftSchema,
  CommitSaleSchema,
  CreateDepositSchema,
  CreateFulfillmentSchema,
  CreateQuotationSchema,
  CreateSalesOrderSchema,
  CreateSequenceSchema,
  ConfirmSalesOrderSchema,
  ImportBookletSchema,
  IssueLeaseSchema,
  OpenShiftSchema,
  ReceivePaymentSchema,
  ShiftCashMovementSchema,
  SpoilCodeSchema,
  SyncPushSchema,
} from '@idepot/contracts';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { DocumentSequenceService } from './document-sequence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { OrderService } from './order.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PaymentService } from './payment.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ReceiptService } from './receipt.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SalePoster } from './sale-poster.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ShiftService } from './shift.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SyncService } from './sync.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

/* --------------------------------- POS ------------------------------------ */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly poster: SalePoster,
    private readonly receiptService: ReceiptService,
  ) {}

  /** The atomic POS/counter sale commit (ROADMAP Phase 3 posting rule). */
  @Post('commit')
  @RequirePermissions('sales:pos')
  commitSale(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.poster.commitSale(p, parseBody(CommitSaleSchema, body));
  }

  @Get('invoices')
  @RequirePermissions('sales:read')
  listInvoices(
    @Req() req: Request,
    @Query('customerId') customerId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('limit') limit?: string,
  ) {
    const p = principalOf(req);
    return this.poster.listInvoices(p.tenantId, {
      customerId,
      warehouseId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('invoices/:id')
  @RequirePermissions('sales:read')
  getInvoice(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.poster.getInvoice(p.tenantId, id);
  }

  /** Invoice/A4 print payload (thermal receipt + A4 render the same payload). */
  @Get('invoices/:id/receipt')
  @RequirePermissions('sales:read')
  receipt(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.receiptService.invoiceReceipt(p.tenantId, id);
  }
}
/* -------------------------------- payments --------------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payments')
export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @RequirePermissions('payment:write')
  receive(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.payments.receivePayment(p, parseBody(ReceivePaymentSchema, body));
  }

  @Get()
  @RequirePermissions('payment:read')
  list(@Req() req: Request, @Query('customerId') customerId?: string) {
    const p = principalOf(req);
    return this.payments.listPayments(p.tenantId, { customerId });
  }

  @Get(':id')
  @RequirePermissions('payment:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.payments.getPayment(p.tenantId, id);
  }

  /** Receipt print payload (thermal/A4 render from the same payload). */
  @Get(':id/receipt')
  @RequirePermissions('payment:read')
  receipt(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.receiptService.paymentReceipt(p.tenantId, id);
  }
}

/* ---------------------------- deposits / credit ---------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('deposits')
export class DepositController {
  constructor(private readonly payments: PaymentService) {}

  @Post()
  @RequirePermissions('payment:write')
  create(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.payments.createDeposit(p, parseBody(CreateDepositSchema, body));
  }

  @Get()
  @RequirePermissions('payment:read')
  list(@Req() req: Request, @Query('customerId') customerId?: string) {
    const p = principalOf(req);
    return this.payments.listDeposits(p.tenantId, { customerId });
  }

  @Get(':id')
  @RequirePermissions('payment:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.payments.getDeposit(p.tenantId, id);
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('credits')
export class CreditController {
  constructor(private readonly payments: PaymentService) {}

  @Post('apply')
  @RequirePermissions('payment:write')
  apply(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.payments.applyCredit(p, parseBody(ApplyCreditSchema, body));
  }

  @Get()
  @RequirePermissions('payment:read')
  applications(
    @Req() req: Request,
    @Query('depositId') depositId?: string,
    @Query('invoiceId') invoiceId?: string,
  ) {
    const p = principalOf(req);
    return this.payments.listCreditApplications(p.tenantId, { depositId, invoiceId });
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('customers')
export class CustomerBalanceController {
  constructor(private readonly payments: PaymentService) {}

  /** C-16 corrected: single subledger balance query (receivable + credit). */
  @Get(':id/balance')
  @RequirePermissions('payment:read')
  balance(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.payments.customerBalance(p.tenantId, id);
  }
}

/* -------------------------- quotations / orders ---------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('quotations')
export class QuotationController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @RequirePermissions('sales:write')
  create(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.orders.createQuotation(p, parseBody(CreateQuotationSchema, body));
  }

  @Get()
  @RequirePermissions('sales:read')
  list(@Req() req: Request) {
    const p = principalOf(req);
    return this.orders.listQuotations(p.tenantId);
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.getQuotation(p.tenantId, id);
  }

  @Post(':id/convert')
  @RequirePermissions('sales:write')
  convert(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.convertQuotation(p, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales:write')
  cancel(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.cancelQuotation(p, id);
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales-orders')
export class SalesOrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @RequirePermissions('sales:write')
  create(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.orders.createSalesOrder(p, parseBody(CreateSalesOrderSchema, body));
  }

  @Get()
  @RequirePermissions('sales:read')
  list(@Req() req: Request, @Query('status') status?: string) {
    const p = principalOf(req);
    return this.orders.listOrders(p.tenantId, { status });
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.getOrder(p.tenantId, id);
  }

  @Post(':id/confirm')
  @RequirePermissions('sales:write')
  confirm(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const p = principalOf(req);
    return this.orders.confirmSalesOrder(p, id, parseBody(ConfirmSalesOrderSchema, body));
  }

  @Post(':id/close')
  @RequirePermissions('sales:write')
  close(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.closeSalesOrder(p, id);
  }
}

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('fulfillments')
export class FulfillmentController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @RequirePermissions('sales:write')
  create(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.orders.createFulfillment(p, parseBody(CreateFulfillmentSchema, body));
  }

  @Get()
  @RequirePermissions('sales:read')
  list(@Req() req: Request, @Query('salesOrderId') salesOrderId?: string) {
    const p = principalOf(req);
    return this.orders.listFulfillments(p.tenantId, { salesOrderId });
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.getFulfillment(p.tenantId, id);
  }

  @Post(':id/dispatch')
  @RequirePermissions('sales:write')
  dispatch(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.dispatchFulfillment(p, id);
  }

  @Post(':id/deliver')
  @RequirePermissions('sales:write')
  deliver(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.deliverFulfillment(p, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales:write')
  cancel(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.orders.cancelFulfillment(p, id);
  }
}

/* --------------------------------- shifts ---------------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('shifts')
export class ShiftController {
  constructor(
    private readonly shifts: ShiftService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @RequirePermissions('shift:write')
  open(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.shifts.openShift(p, parseBody(OpenShiftSchema, body));
  }

  @Get()
  @RequirePermissions('shift:read')
  list(@Req() req: Request, @Query('openOnly') openOnly?: string, @Query('userId') userId?: string) {
    const p = principalOf(req);
    return this.shifts.listShifts(p.tenantId, { openOnly: openOnly === 'true', userId });
  }

  @Get(':id')
  @RequirePermissions('shift:read')
  get(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.shifts.getShift(p.tenantId, id);
  }

  @Post(':id/cash')
  @RequirePermissions('shift:write')
  cash(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const p = principalOf(req);
    return this.shifts.recordCashMovement(p, id, parseBody(ShiftCashMovementSchema, body));
  }

  @Post(':id/close')
  @RequirePermissions('shift:write')
  close(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const p = principalOf(req);
    return this.shifts.closeShift(p, id, parseBody(CloseShiftSchema, body));
  }

  /** Supervisor review of a variance close (shift:approve gate). */
  @Post(':id/review-variance')
  @RequirePermissions('shift:approve')
  reviewVariance(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.shifts.approveVariance(p, id);
  }

  /** X/Z report payload for the shift (cashier day sheet, C-11 corrected). */
  @Get(':id/report')
  @RequirePermissions('shift:read')
  report(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.receiptService.shiftReport(p.tenantId, id);
  }
}

/* ------------------------------- sequences --------------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sequences')
export class SequenceController {
  constructor(private readonly sequences: DocumentSequenceService) {}

  @Post()
  @RequirePermissions('sequence:manage')
  create(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.sequences.createSequence(p, parseBody(CreateSequenceSchema, body));
  }

  @Get()
  @RequirePermissions('sequence:manage')
  list(@Req() req: Request) {
    const p = principalOf(req);
    return this.sequences.listSequences(p.tenantId);
  }

  @Post('booklets')
  @RequirePermissions('sequence:manage')
  importBooklet(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.sequences.importBooklet(p, parseBody(ImportBookletSchema, body));
  }

  @Get('booklets/:id')
  @RequirePermissions('sequence:manage')
  booklet(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.sequences.getBooklet(p.tenantId, id);
  }

  @Get('booklets/:id/codes')
  @RequirePermissions('sequence:manage')
  bookletCodes(@Req() req: Request, @Param('id') id: string) {
    const p = principalOf(req);
    return this.sequences.listBookletCodes(p.tenantId, id);
  }

  @Post('codes/:id/spoil')
  @RequirePermissions('sequence:manage')
  spoil(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const p = principalOf(req);
    return this.sequences.spoilCode(p, id, parseBody(SpoilCodeSchema, body));
  }

  @Post('leases')
  @RequirePermissions('sequence:manage')
  issueLease(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.sequences.issueLease(p, parseBody(IssueLeaseSchema, body));
  }

  @Get('leases')
  @RequirePermissions('sequence:manage')
  leases(@Req() req: Request) {
    const p = principalOf(req);
    return this.sequences.listLeases(p.tenantId);
  }
}

/* ---------------------------------- sync ----------------------------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Offline push (offline-sync §4): idempotent, per-event apply through the
   *  same posting coordinator as online commands. */
  @Post('push')
  @RequirePermissions('sync:device')
  push(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    return this.sync.push(p, parseBody(SyncPushSchema, body));
  }

  /** Offline pull: resumable change feed (seq > cursor). */
  @Get('pull')
  @RequirePermissions('sync:device')
  pull(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const p = principalOf(req);
    return this.sync.pull(p.tenantId, { cursor, limit: limit ? Number(limit) : undefined });
  }
}
