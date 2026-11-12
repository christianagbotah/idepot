import { Controller, Get, Post, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CreateKpiTargetSchema,
  ReportQuerySchema,
  UpsertTenantSettingSchema,
} from '@idepot/contracts';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { OperationalReportsService } from './operational-reports.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { KpiService } from './kpi.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { AdminService } from '../admin/admin.service.js';

type Principal = { userId: string; tenantId: string; displayName: string; roles: string[] };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

/* ---------------------- operational reports (Phase 5 §10–12) -------------- */

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: OperationalReportsService,
    private readonly kpi: KpiService,
    private readonly admin: AdminService,
  ) {}

  private query(req: Request) {
    const q = req.query as Record<string, string | undefined>;
    return parseBody(ReportQuerySchema, {
      from: q.from ?? '1970-01-01',
      to: q.to ?? new Date().toISOString().slice(0, 10),
      branchId: q.branchId || null,
      warehouseId: q.warehouseId || null,
      customerId: q.customerId || null,
      supplierId: q.supplierId || null,
      productId: q.productId || null,
      userId: q.userId || null,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('daily-sales')
  @RequirePermissions('reports:read')
  dailySales(@Req() req: Request) {
    return this.reports.dailySales(principalOf(req).tenantId, this.query(req));
  }

  @Get('sales-by-customer')
  @RequirePermissions('reports:read')
  salesByCustomer(@Req() req: Request) {
    return this.reports.salesByCustomer(principalOf(req).tenantId, this.query(req));
  }

  @Get('sales-by-product')
  @RequirePermissions('reports:read')
  salesByProduct(@Req() req: Request) {
    return this.reports.salesByProduct(principalOf(req).tenantId, this.query(req));
  }

  @Get('sales-by-user')
  @RequirePermissions('reports:read')
  salesByUser(@Req() req: Request) {
    return this.reports.salesByUser(principalOf(req).tenantId, this.query(req));
  }

  @Get('sales-by-warehouse')
  @RequirePermissions('reports:read')
  salesByWarehouse(@Req() req: Request) {
    return this.reports.salesByWarehouse(principalOf(req).tenantId, this.query(req));
  }

  @Get('tender-totals')
  @RequirePermissions('reports:read')
  tenderTotals(@Req() req: Request) {
    return this.reports.tenderTotals(principalOf(req).tenantId, this.query(req));
  }

  @Get('daily-stock')
  @RequirePermissions('reports:read')
  dailyStock(@Req() req: Request) {
    return this.reports.dailyStock(principalOf(req).tenantId, this.query(req));
  }

  @Get('backlog')
  @RequirePermissions('reports:read')
  backlog(@Req() req: Request) {
    return this.reports.backlog(principalOf(req).tenantId, this.query(req));
  }

  @Get('item-margin')
  @RequirePermissions('reports:read')
  itemMargin(@Req() req: Request) {
    return this.reports.itemMargin(principalOf(req).tenantId, this.query(req));
  }

  @Get('returns-by-reason')
  @RequirePermissions('returns:read')
  returnsByReason(@Req() req: Request) {
    return this.reports.returnsByReason(principalOf(req).tenantId, this.query(req));
  }

  @Get('shift-variance')
  @RequirePermissions('reports:read')
  shiftVariance(@Req() req: Request) {
    return this.reports.shiftVariance(principalOf(req).tenantId, this.query(req));
  }

  @Get('stock-valuation')
  @RequirePermissions('reports:read')
  stockValuation(@Req() req: Request) {
    return this.reports.stockValuation(principalOf(req).tenantId, this.query(req));
  }

  @Get('customer-statement')
  @RequirePermissions('reports:read')
  customerStatement(@Req() req: Request, @Query('customerId') customerId: string, @Query('asOf') asOf?: string) {
    return this.reports.customerStatement(
      principalOf(req).tenantId,
      customerId,
      asOf ?? new Date().toISOString().slice(0, 10),
    );
  }

  @Get('ar-aging')
  @RequirePermissions('financial-report:read')
  arAging(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.reports.arAging(principalOf(req).tenantId, asOf ?? new Date().toISOString().slice(0, 10));
  }

  @Get('ap-aging')
  @RequirePermissions('financial-report:read')
  apAging(@Req() req: Request, @Query('asOf') asOf?: string) {
    return this.reports.apAging(principalOf(req).tenantId, asOf ?? new Date().toISOString().slice(0, 10));
  }

  // ---- KPI ----
  @Get('kpi/definitions')
  @RequirePermissions('reports:read')
  kpiDefinitions() {
    return this.kpi.listDefinitions();
  }

  @Get('kpi/snapshots')
  @RequirePermissions('reports:read')
  kpiSnapshots(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('metric') metric?: string,
  ) {
    return this.kpi.listSnapshots(principalOf(req).tenantId, { from, to, metric });
  }

  @Post('kpi/snapshots/rebuild')
  @RequirePermissions('kpi:manage')
  kpiRebuild(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(ReportQuerySchema, {
      from: (body as { from?: string })?.from ?? new Date().toISOString().slice(0, 10),
      to: (body as { to?: string })?.to ?? new Date().toISOString().slice(0, 10),
    });
    return this.kpi.snapshotPeriod(p, { from: dto.from, to: dto.to });
  }

  @Get('kpi/targets')
  @RequirePermissions('reports:read')
  kpiTargets(@Req() req: Request, @Query('metric') metric?: string) {
    return this.kpi.listTargets(principalOf(req).tenantId, { metric });
  }

  @Post('kpi/targets')
  @RequirePermissions('kpi:manage')
  createKpiTarget(@Req() req: Request, @Body() body: unknown) {
    return this.kpi.createTarget(principalOf(req), parseBody(CreateKpiTargetSchema, body));
  }

  @Post('kpi/targets/:id/delete')
  @RequirePermissions('kpi:manage')
  deleteKpiTarget(@Req() req: Request, @Param('id') id: string) {
    return this.kpi.deleteTarget(principalOf(req), id);
  }

  @Get('kpi/achievements')
  @RequirePermissions('reports:read')
  kpiAchievements(@Req() req: Request, @Query('from') from: string, @Query('to') to: string) {
    return this.kpi.achievements(principalOf(req).tenantId, { from, to });
  }

  // ---- audit search & export (§16) ----
  @Get('audit')
  @RequirePermissions('audit:read')
  searchAudit(@Req() req: Request) {
    const q = req.query as Record<string, string | undefined>;
    return this.admin.searchAudit(principalOf(req).tenantId, {
      query: q.q || null,
      userId: q.userId || null,
      entityType: q.entityType || null,
      entityId: q.entityId || null,
      action: q.action || null,
      from: q.from || null,
      to: q.to || null,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Get('audit/export.csv')
  @RequirePermissions('audit:read')
  async exportAudit(@Req() req: Request, @Res() res: Response) {
    const q = req.query as Record<string, string | undefined>;
    const csv = await this.admin.exportAuditCsv(principalOf(req).tenantId, {
      query: q.q || null,
      userId: q.userId || null,
      entityType: q.entityType || null,
      entityId: q.entityId || null,
      action: q.action || null,
      from: q.from || null,
      to: q.to || null,
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Get('audit/timeline/:invoiceId')
  @RequirePermissions('audit:read')
  documentTimeline(@Req() req: Request, @Param('invoiceId') invoiceId: string) {
    return this.admin.documentTimeline(principalOf(req).tenantId, invoiceId);
  }

  // ---- settings (§15) ----
  @Get('settings')
  @RequirePermissions('settings:manage')
  listSettings(@Req() req: Request, @Query('key') key?: string) {
    return this.admin.listSettings(principalOf(req).tenantId, key);
  }

  @Post('settings')
  @RequirePermissions('settings:manage')
  upsertSetting(@Req() req: Request, @Body() body: unknown) {
    return this.admin.upsertSetting(principalOf(req), parseBody(UpsertTenantSettingSchema, body));
  }
}
