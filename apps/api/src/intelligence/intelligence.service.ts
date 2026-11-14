/**
 * Phase 7a rules-based intelligence — scan orchestration and the alert
 * queue (ai-opportunity-map.md tier 7a). Rules are PURE functions in
 * @idepot/domain (intelligence.ts); this service loads candidate rows
 * over the canonical ledgers and persists alert drafts.
 *
 * Guardrails (master prompt rule 14 — AI is optional to core operation):
 *  - a scan NEVER mutates financial state; it only reads ledgers and
 *    writes ai_* rows in its OWN UnitOfWork transactions;
 *  - each rule runs in its OWN transaction and records an ai_model_run
 *    row (version, exact config + hash, window, counts, status) — a rule
 *    that fails marks ITS run failed and never breaks the others;
 *  - re-scans dedupe against open/acknowledged alerts (partial unique
 *    index) and refresh their evidence instead of flooding the queue;
 *    a resolved/dismissed alert does not block a fresh one;
 *  - thresholds come from the effective-dated tenant_setting key
 *    `intelligence.rules` (settings:manage), defaults in the domain.
 */
import { Injectable } from '@nestjs/common';
import {
  INTELLIGENCE_RULE_VERSION,
  evaluateAdjustmentAnomaly,
  evaluateAfterHours,
  evaluateDeadStock,
  evaluateDiscountAnomaly,
  evaluateReversalActivity,
  evaluateShiftVariance,
  evaluateStockoutRisk,
  evaluateVoidedInvoice,
  fingerprint,
  resolveIntelligenceConfig,
  type AlertDraft,
  type IntelligenceRulesConfig,
} from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class (emitDecoratorMetadata)
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

export const INTELLIGENCE_RULE_IDS = [
  'dead-stock',
  'stockout-risk',
  'anomaly:invoice-discount',
  'anomaly:after-hours',
  'anomaly:shift-variance',
  'anomaly:stock-adjustment',
  'anomaly:invoice-voided',
  'anomaly:invoice-reversal',
] as const;
export type IntelligenceRuleId = (typeof INTELLIGENCE_RULE_IDS)[number];

export interface RuleRunSummary {
  ruleId: string;
  runId: string;
  status: 'completed' | 'failed';
  alertsCreated: number;
  alertsSuppressed: number;
  error: string | null;
  durationMs: number;
}

export interface ScanResult {
  startedAt: string;
  finishedAt: string;
  config: IntelligenceRulesConfig;
  runs: RuleRunSummary[];
}

export type Principal = { userId: string; tenantId: string; displayName: string };
export type UowCtx = UowContext;

/** SQL loaders — one per rule family; evaluation happens in the domain. */
async function loadStockRules(ctx: UowCtx, cfg: IntelligenceRulesConfig): Promise<AlertDraft[]> {
  // One pass over stock_balance for BOTH dead-stock and stockout-risk:
  // on-hand + last sale-issue (all time) + first inbound movement +
  // sold quantity over each rule's own trailing window.
  const rows = await ctx.query<{
    product_id: string;
    product_code: string;
    product_name: string;
    warehouse_id: string;
    warehouse_code: string;
    on_hand_base: string;
    last_issue_at: Date | null;
    first_inbound_at: Date | null;
    velocity_qty: string;
    demand_qty: string;
  }>(
    `SELECT p.id AS product_id, p.code AS product_code, p.name AS product_name,
            w.id AS warehouse_id, w.code AS warehouse_code,
            sb.quantity_base::text AS on_hand_base,
            li.last_issue_at,
            fi.first_inbound_at,
            COALESCE(v.qty, 0)::text AS velocity_qty,
            COALESCE(d.qty, 0)::text AS demand_qty
       FROM stock_balance sb
       JOIN product p ON p.id = sb.product_id AND p.tenant_id = sb.tenant_id
       JOIN warehouse w ON w.id = sb.warehouse_id AND w.tenant_id = sb.tenant_id
       LEFT JOIN LATERAL (
         SELECT MAX(sm.occurred_at) AS last_issue_at
           FROM stock_movement sm
          WHERE sm.tenant_id = sb.tenant_id AND sm.product_id = sb.product_id
            AND sm.warehouse_id = sb.warehouse_id AND sm.movement_type = 'issue'
       ) li ON true
       LEFT JOIN LATERAL (
         SELECT MIN(sm.occurred_at) AS first_inbound_at
           FROM stock_movement sm
          WHERE sm.tenant_id = sb.tenant_id AND sm.product_id = sb.product_id
            AND sm.warehouse_id = sb.warehouse_id
            AND sm.movement_type IN ('receipt','transfer_in','adjustment','count_variance','reversal')
            AND sm.quantity_base > 0
       ) fi ON true
       LEFT JOIN LATERAL (
         SELECT SUM(-sm.quantity_base) AS qty
           FROM stock_movement sm
          WHERE sm.tenant_id = sb.tenant_id AND sm.product_id = sb.product_id
            AND sm.warehouse_id = sb.warehouse_id AND sm.movement_type = 'issue'
            AND sm.occurred_at >= now() - make_interval(days => $2)
       ) v ON true
       LEFT JOIN LATERAL (
         SELECT SUM(-sm.quantity_base) AS qty
           FROM stock_movement sm
          WHERE sm.tenant_id = sb.tenant_id AND sm.product_id = sb.product_id
            AND sm.warehouse_id = sb.warehouse_id AND sm.movement_type = 'issue'
            AND sm.occurred_at >= now() - make_interval(days => $3)
       ) d ON true
      WHERE sb.tenant_id = $1 AND p.status = 'active'`,
    [ctx.tenantId, cfg.deadStock.velocityWindowDays, cfg.stockoutRisk.demandWindowDays],
  );

  const now = new Date();
  const drafts: AlertDraft[] = [];
  for (const r of rows.rows) {
    const base = {
      productId: r.product_id,
      productCode: r.product_code,
      productName: r.product_name,
      warehouseId: r.warehouse_id,
      warehouseCode: r.warehouse_code,
      onHandBase: r.on_hand_base,
    };
    const dead = evaluateDeadStock(
      {
        ...base,
        lastIssueAt: r.last_issue_at ? new Date(r.last_issue_at) : null,
        firstReceiptAt: r.first_inbound_at ? new Date(r.first_inbound_at) : null,
        issuesInWindow: r.velocity_qty,
      },
      cfg,
      now,
    );
    if (dead) drafts.push(dead);
    const stockout = evaluateStockoutRisk(
      { ...base, demandInWindow: r.demand_qty, soldInWindow: Number(r.demand_qty) > 0 },
      cfg,
    );
    if (stockout) drafts.push(stockout);
  }
  return drafts;
}

async function loadDiscountAnomalies(ctx: UowCtx, cfg: IntelligenceRulesConfig, windowFrom: Date): Promise<AlertDraft[]> {
  const rows = await ctx.query<{
    invoice_id: string;
    invoice_code: string;
    subtotal: string;
    order_discount: string;
    business_date: string;
    created_by_name: string;
  }>(
    `SELECT i.id AS invoice_id, i.code AS invoice_code, i.subtotal::text, i.order_discount::text,
            to_char(i.business_date, 'YYYY-MM-DD') AS business_date,
            COALESCE(u.display_name, 'unknown') AS created_by_name
       FROM invoice i
       LEFT JOIN app_user u ON u.id = i.created_by
      WHERE i.tenant_id = $1 AND i.status = 'posted' AND i.order_discount > 0
        AND i.created_at >= $2`,
    [ctx.tenantId, windowFrom],
  );
  const drafts: AlertDraft[] = [];
  for (const r of rows.rows) {
    const d = evaluateDiscountAnomaly(
      {
        invoiceId: r.invoice_id,
        invoiceCode: r.invoice_code,
        subtotal: r.subtotal,
        orderDiscount: r.order_discount,
        createdByName: r.created_by_name,
        businessDate: r.business_date,
      },
      cfg,
    );
    if (d) drafts.push(d);
  }
  return drafts;
}

async function loadAfterHours(ctx: UowCtx, cfg: IntelligenceRulesConfig, windowFrom: Date): Promise<AlertDraft[]> {
  const rows = await ctx.query<{
    invoice_id: string;
    invoice_code: string;
    occurred_at: Date;
    business_date: string;
    created_by_name: string;
  }>(
    `SELECT i.id AS invoice_id, i.code AS invoice_code, i.occurred_at,
            to_char(i.business_date, 'YYYY-MM-DD') AS business_date,
            COALESCE(u.display_name, 'unknown') AS created_by_name
       FROM invoice i
       LEFT JOIN app_user u ON u.id = i.created_by
      WHERE i.tenant_id = $1 AND i.status = 'posted' AND i.occurred_at IS NOT NULL
        AND i.created_at >= $2`,
    [ctx.tenantId, windowFrom],
  );
  const drafts: AlertDraft[] = [];
  for (const r of rows.rows) {
    const d = evaluateAfterHours(
      {
        invoiceId: r.invoice_id,
        invoiceCode: r.invoice_code,
        occurredAt: new Date(r.occurred_at),
        createdByName: r.created_by_name,
        businessDate: r.business_date,
      },
      cfg,
    );
    if (d) drafts.push(d);
  }
  return drafts;
}

async function loadShiftVariances(ctx: UowCtx, cfg: IntelligenceRulesConfig, windowFrom: Date): Promise<AlertDraft[]> {
  const rows = await ctx.query<{
    shift_id: string;
    shift_code: string;
    cashier_name: string;
    expected_cash: string;
    counted_cash: string;
    variance: string;
    closed_at: Date;
  }>(
    `SELECT s.id AS shift_id, s.code AS shift_code,
            COALESCE(u.display_name, 'unknown') AS cashier_name,
            s.expected_cash::text, s.counted_cash::text, s.variance::text, s.closed_at
       FROM cashier_shift s
       LEFT JOIN app_user u ON u.id = s.user_id
      WHERE s.tenant_id = $1 AND s.status = 'closed' AND s.variance IS NOT NULL
        AND s.closed_at >= $2`,
    [ctx.tenantId, windowFrom],
  );
  const drafts: AlertDraft[] = [];
  for (const r of rows.rows) {
    const d = evaluateShiftVariance(
      {
        shiftId: r.shift_id,
        shiftCode: r.shift_code,
        cashierName: r.cashier_name,
        expectedCash: r.expected_cash,
        countedCash: r.counted_cash,
        variance: r.variance,
        closedAt: new Date(r.closed_at),
      },
      cfg,
    );
    if (d) drafts.push(d);
  }
  return drafts;
}

async function loadAdjustmentAnomalies(ctx: UowCtx, cfg: IntelligenceRulesConfig, windowFrom: Date): Promise<AlertDraft[]> {
  const rows = await ctx.query<{
    line_id: string;
    adjustment_code: string;
    posted_at: Date;
    product_code: string;
    product_name: string;
    quantity_base: string;
    reason: string | null;
    created_by_name: string;
  }>(
    `SELECT sal.id AS line_id, sa.code AS adjustment_code, sa.posted_at,
            p.code AS product_code, p.name AS product_name,
            sal.quantity_base::text, sa.reason,
            COALESCE(u.display_name, 'unknown') AS created_by_name
       FROM stock_adjustment_line sal
       JOIN stock_adjustment sa ON sa.id = sal.adjustment_id AND sa.tenant_id = sal.tenant_id
       JOIN product p ON p.id = sal.product_id AND p.tenant_id = sal.tenant_id
       LEFT JOIN app_user u ON u.id = sa.posted_by
      WHERE sal.tenant_id = $1 AND sa.status = 'posted' AND sa.posted_at >= $2
        -- count-derived adjustments (opening stock, count approvals) carry
        -- their own human-approval evidence in the count workflow; the
        -- anomaly queue watches DIRECT adjustments only
        AND sa.source_count_id IS NULL`,
    [ctx.tenantId, windowFrom],
  );
  const drafts: AlertDraft[] = [];
  for (const r of rows.rows) {
    const d = evaluateAdjustmentAnomaly(
      {
        adjustmentLineId: r.line_id,
        adjustmentCode: r.adjustment_code,
        adjustedAt: new Date(r.posted_at),
        productCode: r.product_code,
        productName: r.product_name,
        quantityBase: r.quantity_base,
        reason: r.reason,
        createdByName: r.created_by_name,
      },
      cfg,
    );
    if (d) drafts.push(d);
  }
  return drafts;
}

async function loadVoidedInvoices(ctx: UowCtx, windowFrom: Date): Promise<AlertDraft[]> {
  // Defensive by design: no current code path voids an invoice (corrections
  // go through invoice_reversal), but the status is legal at the DB and a
  // future path or a migration import could set it — the queue exists
  // precisely to surface rare states.
  const rows = await ctx.query<{
    invoice_id: string;
    invoice_code: string;
    business_date: string;
    total: string;
    created_by_name: string;
  }>(
    `SELECT i.id AS invoice_id, i.code AS invoice_code,
            to_char(i.business_date, 'YYYY-MM-DD') AS business_date,
            i.total::text,
            COALESCE(u.display_name, 'unknown') AS created_by_name
       FROM invoice i
       LEFT JOIN app_user u ON u.id = i.created_by
      WHERE i.tenant_id = $1 AND i.status = 'voided' AND i.created_at >= $2`,
    [ctx.tenantId, windowFrom],
  );
  return rows.rows.map((r) =>
    evaluateVoidedInvoice({
      invoiceId: r.invoice_id,
      invoiceCode: r.invoice_code,
      businessDate: r.business_date,
      total: r.total,
      createdByName: r.created_by_name,
    }),
  );
}

async function loadReversals(ctx: UowCtx, windowFrom: Date): Promise<AlertDraft[]> {
  const rows = await ctx.query<{
    reversal_id: string;
    invoice_code: string;
    reversal_date: string;
    total: string;
    reason: string | null;
    created_by_name: string;
  }>(
    `SELECT ir.id AS reversal_id, i.code AS invoice_code,
            to_char((ir.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS reversal_date,
            i.total::text, ir.reason,
            COALESCE(u.display_name, 'unknown') AS created_by_name
       FROM invoice_reversal ir
       JOIN invoice i ON i.tenant_id = ir.tenant_id AND i.id = ir.invoice_id
       LEFT JOIN app_user u ON u.id = ir.created_by
      WHERE ir.tenant_id = $1 AND ir.created_at >= $2`,
    [ctx.tenantId, windowFrom],
  );
  return rows.rows.map((r) =>
    evaluateReversalActivity({
      reversalId: r.reversal_id,
      invoiceCode: r.invoice_code,
      reversalDate: r.reversal_date,
      total: r.total,
      reason: r.reason,
      createdByName: r.created_by_name,
    }),
  );
}

const RULE_LOADERS: Record<
  IntelligenceRuleId,
  (ctx: UowCtx, cfg: IntelligenceRulesConfig, windowFrom: Date) => Promise<AlertDraft[]>
> = {
  'dead-stock': (ctx, cfg) => loadStockRules(ctx, cfg),
  'stockout-risk': (ctx, cfg) => loadStockRules(ctx, cfg),
  'anomaly:invoice-discount': loadDiscountAnomalies,
  'anomaly:after-hours': loadAfterHours,
  'anomaly:shift-variance': loadShiftVariances,
  'anomaly:stock-adjustment': loadAdjustmentAnomalies,
  'anomaly:invoice-voided': (ctx, _cfg, windowFrom) => loadVoidedInvoices(ctx, windowFrom),
  'anomaly:invoice-reversal': (ctx, _cfg, windowFrom) => loadReversals(ctx, windowFrom),
};

@Injectable()
export class IntelligenceService {
  constructor(private readonly uow: UnitOfWork) {}

  /** Run the requested rules now; each in its own transaction with its own
   *  ai_model_run audit row. A failed rule never fails the others. */
  async scan(principal: Principal, windowDays: number, rules: readonly IntelligenceRuleId[]): Promise<ScanResult> {
    const requested = rules.length === 0 ? [...INTELLIGENCE_RULE_IDS] : rules;
    const startedAt = new Date();
    const cfg = await this.effectiveConfig(principal.tenantId);
    const windowFrom = new Date(startedAt.getTime() - windowDays * 86_400_000);
    const runs: RuleRunSummary[] = [];
    for (const ruleId of requested) {
      runs.push(await this.runRule(principal, ruleId, cfg, windowFrom));
    }
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      config: cfg,
      runs,
    };
  }

  private async runRule(
    principal: Principal,
    ruleId: IntelligenceRuleId,
    cfg: IntelligenceRulesConfig,
    windowFrom: Date,
  ): Promise<RuleRunSummary> {
    const started = Date.now();
    const windowTo = new Date();
    try {
      const result = await this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
        // the stock loader serves BOTH dead-stock and stockout-risk — each
        // rule's run only persists (and counts) its OWN drafts
        const drafts = (await RULE_LOADERS[ruleId](ctx, cfg, windowFrom)).filter((d) => d.ruleId === ruleId);
        const runRow = await ctx.query<{ id: string }>(
          `INSERT INTO ai_model_run (tenant_id, rule_id, rule_version, config, config_hash,
                                     window_from, window_to, status, triggered_by, finished_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',$8,now())
           RETURNING id`,
          [
            ctx.tenantId,
            ruleId,
            INTELLIGENCE_RULE_VERSION,
            JSON.stringify(cfg),
            fingerprint(cfg),
            windowFrom,
            windowTo,
            principal.userId,
          ],
        );
        const runId = runRow.rows[0]!.id;
        let created = 0;
        let suppressed = 0;
        for (const d of drafts) {
          const inserted = await ctx.query<{ id: string }>(
            `INSERT INTO ai_alert (tenant_id, run_id, rule_id, severity, status, dedupe_key,
                                   entity_type, entity_id, entity_label, title, reason, evidence)
             VALUES ($1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (tenant_id, dedupe_key) WHERE status IN ('open','acknowledged')
             DO NOTHING
             RETURNING id`,
            [
              ctx.tenantId,
              runId,
              d.ruleId,
              d.severity,
              d.dedupeKey,
              d.entityType,
              d.entityId,
              d.entityLabel,
              d.title,
              d.reason,
              JSON.stringify(d.evidence),
            ],
          );
          if (inserted.rows.length > 0) {
            created++;
          } else {
            suppressed++;
            // refresh the standing alert so the queue always shows current
            // numbers (guarded to open/acknowledged — a terminal alert is
            // never resurrected)
            await ctx.query(
              `UPDATE ai_alert
                  SET severity = $3, title = $4, reason = $5, evidence = $6, updated_at = now()
                WHERE tenant_id = $1 AND dedupe_key = $2
                  AND status IN ('open','acknowledged')`,
              [ctx.tenantId, d.dedupeKey, d.severity, d.title, d.reason, JSON.stringify(d.evidence)],
            );
          }
        }
        await ctx.query(
          `UPDATE ai_model_run SET alerts_created = $2, alerts_suppressed = $3 WHERE id = $1`,
          [runId, created, suppressed],
        );
        return { runId, created, suppressed };
      });
      return {
        ruleId,
        runId: result.runId,
        status: 'completed',
        alertsCreated: result.created,
        alertsSuppressed: result.suppressed,
        error: null,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // record the failure — the rule's transaction rolled back cleanly
      let runId = '';
      try {
        runId = await this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
          const res = await ctx.query<{ id: string }>(
            `INSERT INTO ai_model_run (tenant_id, rule_id, rule_version, config, config_hash,
                                       window_from, window_to, status, error, triggered_by, finished_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'failed',$8,$9,now())
             RETURNING id`,
            [
              ctx.tenantId,
              ruleId,
              INTELLIGENCE_RULE_VERSION,
              JSON.stringify(cfg),
              fingerprint(cfg),
              windowFrom,
              windowTo,
              message.slice(0, 500),
              principal.userId,
            ],
          );
          return res.rows[0]!.id;
        });
      } catch {
        // the run ledger is best-effort on the failure path
      }
      return {
        ruleId,
        runId,
        status: 'failed',
        alertsCreated: 0,
        alertsSuppressed: 0,
        error: message,
        durationMs: Date.now() - started,
      };
    }
  }

  /** Effective-dated rule configuration (tenant_setting key `intelligence.rules`
   *  over the domain defaults). */
  async effectiveConfig(tenantId: string): Promise<IntelligenceRulesConfig> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const res = await ctx.query<{ value: unknown }>(
        `SELECT value FROM tenant_setting
          WHERE tenant_id = $1 AND key = 'intelligence.rules'
            AND effective_from <= CURRENT_DATE
            AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
          ORDER BY effective_from DESC
          LIMIT 1`,
        [ctx.tenantId],
      );
      return resolveIntelligenceConfig(res.rows[0]?.value ?? null);
    });
  }

  async listAlerts(
    tenantId: string,
    filters: {
      status?: string;
      ruleId?: string;
      severity?: string;
      entityType?: string;
      limit: number;
      offset: number;
    },
  ) {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT id, rule_id, severity, status, entity_type, entity_id, entity_label, title,
                created_at, updated_at, acknowledged_at, resolved_at
           FROM ai_alert
          WHERE tenant_id = $1
            AND ($2::text IS NULL OR status = $2)
            AND ($3::text IS NULL OR rule_id = $3)
            AND ($4::text IS NULL OR severity = $4)
            AND ($5::text IS NULL OR entity_type = $5)
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                   updated_at DESC
          LIMIT $6 OFFSET $7`,
        [
          ctx.tenantId,
          filters.status ?? null,
          filters.ruleId ?? null,
          filters.severity ?? null,
          filters.entityType ?? null,
          filters.limit,
          filters.offset,
        ],
      );
      return rows.rows;
    });
  }

  async getAlert(tenantId: string, id: string) {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT a.id, a.rule_id, a.severity, a.status, a.dedupe_key, a.entity_type, a.entity_id,
                a.entity_label, a.title, a.reason, a.evidence, a.created_at, a.updated_at,
                a.acknowledged_at, a.acknowledged_by, a.resolved_at, a.resolved_by, a.resolution_note,
                f.total_feedback, f.useful_count
           FROM ai_alert a
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS total_feedback,
                    COUNT(*) FILTER (WHERE useful)::int AS useful_count
               FROM ai_feedback
              WHERE alert_id = a.id AND tenant_id = a.tenant_id
           ) f ON true
          WHERE a.tenant_id = $1 AND a.id = $2`,
        [ctx.tenantId, id],
      );
      const feedback = await ctx.query(
        `SELECT id, useful, reason, created_by, created_at
           FROM ai_feedback WHERE tenant_id = $1 AND alert_id = $2
          ORDER BY created_at DESC`,
        [ctx.tenantId, id],
      );
      return { alert: rows.rows[0] ?? null, feedback: feedback.rows };
    });
  }

  async listRuns(tenantId: string, limit: number) {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT id, rule_id, rule_version, config_hash, window_from, window_to,
                alerts_created, alerts_suppressed, status, error, triggered_by, started_at, finished_at
           FROM ai_model_run
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [ctx.tenantId, limit],
      );
      return rows.rows;
    });
  }
}
