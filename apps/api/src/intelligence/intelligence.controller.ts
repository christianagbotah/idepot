/**
 * Phase 7a intelligence endpoints — the rules catalog, the scan command,
 * the alert queue (list/detail/lifecycle/feedback) and the run ledger.
 *
 * RBAC: intelligence:read (owner/admin/manager/auditor/accountant/
 * procurement) for every read + the feedback loop; intelligence:manage
 * (owner/admin/manager) for scans and alert lifecycle transitions.
 * Cashiers deliberately see NOTHING — an anomaly/fraud queue visible to
 * the monitored population defeats its purpose; stockout and dead-stock
 * alerts flow to the same managers/procurement who act on them.
 *
 * Every mutation is audited (who scanned, who acknowledged/resolved/
 * dismissed, who gave feedback). Alerts never mutate financial state.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../rbac/permissions.decorator.js';
import { RbacGuard } from '../rbac/rbac.guard.js';
import { parseBody } from '../parse-body.js';
import { INTELLIGENCE_RULE_CATALOG } from '@idepot/domain';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork } from '../db/unit-of-work.js';
import { INTELLIGENCE_RULE_IDS, type IntelligenceRuleId } from './intelligence.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { IntelligenceService } from './intelligence.service.js';

type Principal = { userId: string; tenantId: string; displayName: string };

function principalOf(req: Request): Principal {
  return req.principal as Principal;
}

const ScanSchema = z.object({
  /** how far back the EVENT-window (anomaly) rules look */
  windowDays: z.number().int().min(1).max(365).default(30),
  /** empty = all rules */
  rules: z.array(z.enum(INTELLIGENCE_RULE_IDS)).max(16).default([]),
});

const LifecycleSchema = z.object({
  note: z.string().trim().min(1).max(500).nullish(),
});

const FeedbackSchema = z.object({
  useful: z.boolean(),
  reason: z.string().trim().min(1).max(500).nullish(),
});

const ListQuerySchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).optional(),
  ruleId: z.string().max(60).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  entityType: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly service: IntelligenceService,
    private readonly uow: UnitOfWork,
  ) {}

  /** Self-describing rule catalog (ids, semantics, default thresholds). */
  @Get('rules')
  @RequirePermissions('intelligence:read')
  rules() {
    return INTELLIGENCE_RULE_CATALOG;
  }

  /** Run rule evaluations now. Each rule gets its own transaction and
   *  ai_model_run audit row; a failing rule is reported, never throws the
   *  scan. The response carries the exact effective config used. */
  @Post('scan')
  @RequirePermissions('intelligence:manage')
  async scan(@Req() req: Request, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(ScanSchema, body);
    const result = await this.service.scan(p, dto.windowDays, dto.rules as IntelligenceRuleId[]);
    await this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'intelligence.scan',
        entityType: 'ai_model_run',
        entityId: result.runs[0]?.runId ?? '',
        details: {
          windowDays: dto.windowDays,
          rules: dto.rules.length === 0 ? [...INTELLIGENCE_RULE_IDS] : dto.rules,
          runs: result.runs.map((r) => ({
            ruleId: r.ruleId,
            status: r.status,
            created: r.alertsCreated,
            suppressed: r.alertsSuppressed,
          })),
        },
      });
    });
    return result;
  }

  /** The investigation queue, priority-ordered (critical first). */
  @Get('alerts')
  @RequirePermissions('intelligence:read')
  async alerts(@Req() req: Request, @Query() query: Record<string, string | undefined>) {
    const p = principalOf(req);
    const q = parseBody(ListQuerySchema, query);
    return this.service.listAlerts(p.tenantId, q);
  }

  /** Alert detail with evidence and the feedback trail. */
  @Get('alerts/:id')
  @RequirePermissions('intelligence:read')
  async alert(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const p = principalOf(req);
    const result = await this.service.getAlert(p.tenantId, id);
    if (!result.alert) throw new NotFoundException('unknown alert');
    return result;
  }

  @Post('alerts/:id/acknowledge')
  @RequirePermissions('intelligence:manage')
  async acknowledge(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.transition(principalOf(req), id, 'acknowledged', null);
  }

  @Post('alerts/:id/resolve')
  @RequirePermissions('intelligence:manage')
  async resolve(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(LifecycleSchema, body);
    return this.transition(principalOf(req), id, 'resolved', dto.note ?? null);
  }

  @Post('alerts/:id/dismiss')
  @RequirePermissions('intelligence:manage')
  async dismiss(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const dto = parseBody(LifecycleSchema, body);
    if (!dto.note) throw new BadRequestException('a dismissal requires a note — say why it is not actionable');
    return this.transition(principalOf(req), id, 'dismissed', dto.note);
  }

  private async transition(p: Principal, id: string, target: 'acknowledged' | 'resolved' | 'dismissed', note: string | null) {
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const existing = await ctx.query<{ status: string; rule_id: string }>(
        `SELECT status, rule_id FROM ai_alert WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [ctx.tenantId, id],
      );
      const row = existing.rows[0];
      if (!row) throw new NotFoundException('unknown alert');
      if (row.status !== 'open' && row.status !== 'acknowledged') {
        throw new BadRequestException(`alert is already ${row.status} — terminal states are final`);
      }
      if (target === 'acknowledged' && row.status !== 'open') {
        throw new BadRequestException('only an open alert can be acknowledged');
      }
      const stampCols =
        target === 'acknowledged'
          ? `acknowledged_at = now(), acknowledged_by = $3`
          : `resolved_at = now(), resolved_by = $3, resolution_note = $4`;
      const params = target === 'acknowledged' ? [ctx.tenantId, id, p.userId] : [ctx.tenantId, id, p.userId, note];
      const res = await ctx.query(
        `UPDATE ai_alert SET status = '${target}', ${stampCols} WHERE tenant_id = $1 AND id = $2
         RETURNING id, status, acknowledged_at, resolved_at, resolution_note`,
        params,
      );
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: `intelligence.alert_${target}`,
        entityType: 'ai_alert',
        entityId: id,
        details: { ruleId: row.rule_id, note },
      });
      return res.rows[0];
    });
  }

  /** The human feedback loop (opportunity map §4): useful/not with a
   *  reason, upserted per user — future tuning tiers read this. */
  @Post('alerts/:id/feedback')
  @RequirePermissions('intelligence:read')
  async feedback(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const p = principalOf(req);
    const dto = parseBody(FeedbackSchema, body);
    return this.uow.run({ tenantId: p.tenantId, userId: p.userId }, async (ctx) => {
      const alert = await ctx.query(`SELECT id FROM ai_alert WHERE tenant_id = $1 AND id = $2`, [ctx.tenantId, id]);
      if (alert.rows.length === 0) throw new NotFoundException('unknown alert');
      const res = await ctx.query(
        `INSERT INTO ai_feedback (tenant_id, alert_id, useful, reason, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, alert_id, created_by)
         DO UPDATE SET useful = EXCLUDED.useful, reason = EXCLUDED.reason
         RETURNING id, useful, reason, created_at`,
        [ctx.tenantId, id, dto.useful, dto.reason ?? null, p.userId],
      );
      await ctx.audit.record({
        tenantId: p.tenantId,
        actorUserId: p.userId,
        actorDisplay: p.displayName,
        action: 'intelligence.alert_feedback',
        entityType: 'ai_alert',
        entityId: id,
        details: { useful: dto.useful, reason: dto.reason ?? null },
      });
      return res.rows[0];
    });
  }

  /** Run ledger — every rule evaluation with its config hash and outcome. */
  @Get('runs')
  @RequirePermissions('intelligence:read')
  async runs(@Req() req: Request, @Query('limit') limit?: string) {
    const p = principalOf(req);
    const n = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 100);
    return this.service.listRuns(p.tenantId, n);
  }
}
