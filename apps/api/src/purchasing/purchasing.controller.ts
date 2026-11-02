/**
 * Purchasing & AP API (Phase 4). Server-enforced RBAC on every route;
 * hidden buttons are never the authorization.
 */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  ApplySupplierAdvanceSchema,
  ApproveMatchExceptionsSchema,
  CreateGrnSchema,
  CreatePurchaseOrderSchema,
  CreateSupplierAdjustmentSchema,
  CreateSupplierInvoiceSchema,
  PaySupplierSchema,
} from '@idepot/contracts';
import { parseBody } from '../parse-body.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import type { Principal } from '../auth/jwt-auth.guard.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { PurchaseOrderService } from './purchase.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ReceivingService } from './receiving.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SupplierInvoiceService } from './supplier-invoice.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { ApPaymentService } from './ap-payment.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { SupplierAdjustmentService } from './supplier-adjustment.service.js';

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

@UseGuards(JwtAuthGuard)
@Controller('purchasing')
export class PurchasingController {
  constructor(
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly receiving: ReceivingService,
    private readonly supplierInvoices: SupplierInvoiceService,
    private readonly apPayments: ApPaymentService,
    private readonly adjustments: SupplierAdjustmentService,
  ) {}

  /* ------------------------------ purchase orders ---------------------- */

  @Post('purchase-orders')
  @RequirePermissions('purchasing:write')
  createPurchaseOrder(@Req() req: Request, @Body() body: unknown) {
    return this.purchaseOrders.createPurchaseOrder(principalOf(req), parseBody(CreatePurchaseOrderSchema, body));
  }

  @Get('purchase-orders')
  @RequirePermissions('purchasing:read')
  listPurchaseOrders(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.purchaseOrders.listPurchaseOrders(principalOf(req).tenantId, {
      status,
      supplierId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('purchase-orders/:id')
  @RequirePermissions('purchasing:read')
  getPurchaseOrder(@Req() req: Request, @Param('id') id: string) {
    return this.purchaseOrders.getPurchaseOrder(principalOf(req).tenantId, id);
  }

  @Post('purchase-orders/:id/approve')
  @RequirePermissions('purchasing:approve')
  approvePurchaseOrder(@Req() req: Request, @Param('id') id: string) {
    return this.purchaseOrders.approvePurchaseOrder(principalOf(req), id);
  }

  @Post('purchase-orders/:id/issue')
  @RequirePermissions('purchasing:write')
  issuePurchaseOrder(@Req() req: Request, @Param('id') id: string) {
    return this.purchaseOrders.issuePurchaseOrder(principalOf(req), id);
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermissions('purchasing:approve')
  cancelPurchaseOrder(@Req() req: Request, @Param('id') id: string) {
    return this.purchaseOrders.cancelPurchaseOrder(principalOf(req), id);
  }

  @Post('purchase-orders/:id/close')
  @RequirePermissions('purchasing:approve')
  closePurchaseOrder(@Req() req: Request, @Param('id') id: string) {
    return this.purchaseOrders.closePurchaseOrder(principalOf(req), id);
  }

  /* --------------------------------- receiving -------------------------- */

  @Post('grns')
  @RequirePermissions('receiving:write')
  postGrn(@Req() req: Request, @Body() body: unknown) {
    return this.receiving.postGrn(principalOf(req), parseBody(CreateGrnSchema, body));
  }

  @Get('grns')
  @RequirePermissions('receiving:read')
  listGrns(
    @Req() req: Request,
    @Query('supplierId') supplierId?: string,
    @Query('purchaseOrderId') purchaseOrderId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.receiving.listGrns(principalOf(req).tenantId, {
      supplierId,
      purchaseOrderId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('grns/:id')
  @RequirePermissions('receiving:read')
  getGrn(@Req() req: Request, @Param('id') id: string) {
    return this.receiving.getGrn(principalOf(req).tenantId, id);
  }

  /* ------------------------------ supplier invoices --------------------- */

  @Post('supplier-invoices')
  @RequirePermissions('purchasing:write')
  createSupplierInvoice(@Req() req: Request, @Body() body: unknown) {
    return this.supplierInvoices.createSupplierInvoice(principalOf(req), parseBody(CreateSupplierInvoiceSchema, body));
  }

  @Get('supplier-invoices')
  @RequirePermissions('purchasing:read')
  listSupplierInvoices(
    @Req() req: Request,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.supplierInvoices.listSupplierInvoices(principalOf(req).tenantId, {
      supplierId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('supplier-invoices/:id')
  @RequirePermissions('purchasing:read')
  getSupplierInvoice(@Req() req: Request, @Param('id') id: string) {
    return this.supplierInvoices.getSupplierInvoice(principalOf(req).tenantId, id);
  }

  @Post('supplier-invoices/:id/post')
  @RequirePermissions('purchasing:approve')
  postSupplierInvoice(@Req() req: Request, @Param('id') id: string, @Body() body?: unknown) {
    const approval =
      body != null && Object.keys(body as object).length > 0
        ? parseBody(ApproveMatchExceptionsSchema, body)
        : undefined;
    return this.supplierInvoices.postSupplierInvoice(principalOf(req), id, approval);
  }

  /* ------------------------------ supplier payments ---------------------- */

  @Post('supplier-payments')
  @RequirePermissions('ap:pay')
  paySupplier(@Req() req: Request, @Body() body: unknown) {
    return this.apPayments.paySupplier(principalOf(req), parseBody(PaySupplierSchema, body));
  }

  @Post('supplier-payments/apply-advance')
  @RequirePermissions('ap:pay')
  applyAdvance(@Req() req: Request, @Body() body: unknown) {
    return this.apPayments.applyAdvance(principalOf(req), parseBody(ApplySupplierAdvanceSchema, body));
  }

  @Get('supplier-payments')
  @RequirePermissions('ap:read')
  listPayments(@Req() req: Request, @Query('supplierId') supplierId?: string, @Query('limit') limit?: string) {
    return this.apPayments.listPayments(principalOf(req).tenantId, {
      supplierId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /* ------------------------------ adjustments ---------------------------- */

  @Post('supplier-adjustments')
  @RequirePermissions('ap:write')
  createAdjustment(@Req() req: Request, @Body() body: unknown) {
    return this.adjustments.createSupplierAdjustment(principalOf(req), parseBody(CreateSupplierAdjustmentSchema, body));
  }

  @Get('supplier-adjustments')
  @RequirePermissions('ap:read')
  listAdjustments(@Req() req: Request, @Query('supplierId') supplierId?: string, @Query('limit') limit?: string) {
    return this.adjustments.listAdjustments(principalOf(req).tenantId, {
      supplierId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('ap')
export class ApController {
  constructor(private readonly apPayments: ApPaymentService) {}

  @Get('aging')
  @RequirePermissions('ap:read')
  aging(@Req() req: Request, @Query('asOf') asOf?: string) {
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    return this.apPayments.apAging(principalOf(req).tenantId, date);
  }

  @Get('balances')
  @RequirePermissions('ap:read')
  balances(@Req() req: Request) {
    return this.apPayments.apBalances(principalOf(req).tenantId);
  }

  @Get('statements/:supplierId')
  @RequirePermissions('ap:read')
  statement(@Req() req: Request, @Param('supplierId') supplierId: string, @Query('asOf') asOf?: string) {
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    return this.apPayments.supplierStatement(principalOf(req).tenantId, supplierId, date);
  }
}
