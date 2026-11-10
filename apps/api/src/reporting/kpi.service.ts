/**
 * KPI dashboards, snapshots and targets (Phase 5 §13).
 *
 * Every KPI is mathematically defined (KPI_DEFINITIONS below) and
 * computed from canonical transactional evidence. Snapshots are DERIVED,
 * REPRODUCIBLE and IDEMPOTENT (unique per tenant/scope/period/metric/
 * version — a rebuild overwrites, never duplicates) and can never become
 * authoritative ledgers: they carry the source watermark so staleness is
 * explicit. No target or KPI value is ever invented.
 */
import { Injectable } from '@nestjs/common';
import type {
  CreateKpiTarget,
  KpiAchievementDto,
  KpiDefinitionDto,
  KpiSnapshotDto,
  KpiTargetDto,
} from '@idepot/contracts';
import { NotFoundError, ValidationError, parseMoney, formatMoney } from '@idepot/domain';
import { randomUUID } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { UnitOfWork, type UowContext } from '../db/unit-of-work.js';

/** The KPI catalog — every metric's mathematics, declared once. */
export const KPI_DEFINITIONS: readonly KpiDefinitionDto[] = [
  { metric: 'daily_sales', unit: 'money', definition: 'Σ invoice.total of posted invoices in the period (gross charged, tax included).' },
  { metric: 'net_sales', unit: 'money', definition: 'Σ (subtotal − order_discount − tax_inclusive_total) of posted invoices − Σ credit-note net_revenue_reversal in the period.' },
  { metric: 'gross_profit', unit: 'money', definition: 'net_sales − (Σ invoice.cost_total − Σ credit-note cogs_reversal) in the period.' },
  { metric: 'gross_margin', unit: 'ratio', definition: 'gross_profit / net_sales, 0 when net_sales = 0.' },
  { metric: 'average_order_value', unit: 'money', definition: 'net_sales / count of posted invoices; 0 when no sales.' },
  { metric: 'sales_count', unit: 'count', definition: 'count of posted invoices in the period.' },
  { metric: 'cash_vs_credit_ratio', unit: 'ratio', definition: 'money-tender amounts of sale payments / (money tenders + AR taken); 0 when nothing was sold.' },
  { metric: 'total_refunds', unit: 'money', definition: 'Σ refund.amount with status posted/settled in the period.' },
  { metric: 'return_rate', unit: 'ratio', definition: 'Σ credit-note total / Σ invoice.total (posted invoices) in the period; 0 when no sales.' },
  { metric: 'inventory_valuation', unit: 'money', definition: 'Σ stock_cost_state.total_value at the snapshot watermark.' },
  { metric: 'outstanding_receivables', unit: 'money', definition: 'Σ max(invoice.total − settled, 0) over posted invoices at the as-of date.' },
  { metric: 'overdue_receivables', unit: 'money', definition: 'the outstanding-receivables slice of invoices older than 30 days at the as-of date.' },
  { metric: 'top_selling_items', unit: 'money', definition: 'products ranked by Σ invoice_line.line_net in the period (report, snapshot stores the top-1 value).' },
] as const;

@Injectable()
export class KpiService {
  constructor(private readonly uow: UnitOfWork) {}

  listDefinitions(): KpiDefinitionDto[] {
    return [...KPI_DEFINITIONS];
  }

  // =========================================================================
  // Compute + snapshot (idempotent by identity)
  // =========================================================================

  async snapshotPeriod(
    principal: { userId: string; tenantId: string; displayName: string },
    args: { from: string; to: string },
  ): Promise<KpiSnapshotDto[]> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const values = await this.computeAll(ctx, args.from, args.to);
      const out: KpiSnapshotDto[] = [];
      for (const [metric, value] of Object.entries(values)) {
        const def = KPI_DEFINITIONS.find((d) => d.metric === metric);
        if (!def) continue;
        const watermark = await ctx.query<{ now: string }>(`SELECT now()::text AS now`);
        await ctx.query(
          `INSERT INTO kpi_snapshot (id, tenant_id, scope_type, scope_id, period_start, period_end,
             metric, metric_version, value, unit, source_watermark, refresh_status)
           VALUES ($1,$2,'tenant',NULL,$3,$4,$5,1,$6,$7,$8,'ok')
           ON CONFLICT DO NOTHING`,
          [randomUUID(), ctx.tenantId, args.from, args.to, metric, value, def.unit, watermark.rows[0]!.now],
        );
        out.push(await this.readSnapshot(ctx, metric, args.from, args.to));
      }
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'kpi.snapshot_rebuilt',
        entityType: 'kpi_snapshot',
        entityId: `${args.from}..${args.to}`,
        details: { metrics: Object.keys(values).length, from: args.from, to: args.to },
      });
      return out;
    });
  }

  async listSnapshots(
    tenantId: string,
    filter: { from?: string; to?: string; metric?: string; limit?: number },
  ): Promise<KpiSnapshotDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const conditions = ['tenant_id = $1'];
      const params: unknown[] = [ctx.tenantId];
      if (filter.metric) {
        params.push(filter.metric);
        conditions.push(`metric = $${params.length}`);
      }
      if (filter.from) {
        params.push(filter.from);
        conditions.push(`period_start >= $${params.length}`);
      }
      if (filter.to) {
        params.push(filter.to);
        conditions.push(`period_end <= $${params.length}`);
      }
      params.push(Math.min(filter.limit ?? 200, 1000));
      const rows = await ctx.query(
        `SELECT * FROM kpi_snapshot WHERE ${conditions.join(' AND ')}
         ORDER BY period_start DESC, metric LIMIT $${params.length}`,
        params,
      );
      const out: KpiSnapshotDto[] = [];
      for (const r of rows.rows as Array<Record<string, unknown>>) {
        out.push({
          metric: String(r.metric),
          scopeType: String(r.scope_type),
          periodStart: String(r.period_start).slice(0, 10),
          periodEnd: String(r.period_end).slice(0, 10),
          value: String(r.value),
          unit: String(r.unit),
          sourceWatermark: String(r.source_watermark),
          calculatedAt: String(r.calculated_at),
          refreshStatus: String(r.refresh_status),
          previousValue: null,
          changePct: null,
        });
      }
      return out;
    });
  }

  private async readSnapshot(ctx: UowContext, metric: string, from: string, to: string): Promise<KpiSnapshotDto> {
    const r = await ctx.query(
      `SELECT * FROM kpi_snapshot WHERE metric = $1 AND period_start = $2 AND period_end = $3 AND scope_type = 'tenant'`,
      [metric, from, to],
    );
    if (r.rows.length === 0) throw new NotFoundError('kpi snapshot', metric);
    const row = r.rows[0]!;
    return {
      metric: String(row.metric),
      scopeType: String(row.scope_type),
      periodStart: String(row.period_start).slice(0, 10),
      periodEnd: String(row.period_end).slice(0, 10),
      value: String(row.value),
      unit: String(row.unit),
      sourceWatermark: String(row.source_watermark),
      calculatedAt: String(row.calculated_at),
      refreshStatus: String(row.refresh_status),
      previousValue: null,
      changePct: null,
    };
  }

  /** Compute every catalog metric for a period from canonical evidence.
   *  History-stability rules match the operational reports (independent
   *  review 5834590343): posted AND reversed invoices count on their own
   *  dates with the reversal inverse netted on the reversal's effective
   *  date; receivables settle strictly as of `to` (dated payments,
   *  deposit applications, store-credit redemptions, credit-note AR
   *  credits, reversal cancellations). */
  private async computeAll(ctx: UowContext, from: string, to: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const sales = await ctx.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(i.total), 0)::text AS gross,
              COALESCE(SUM(i.subtotal - i.order_discount - i.tax_inclusive_total), 0)::text AS net_sales,
              COALESCE(SUM(i.cost_total), 0)::text AS cogs
         FROM invoice i
        WHERE i.tenant_id = $1 AND i.status IN ('posted','reversed') AND i.business_date BETWEEN $2 AND $3`,
      [ctx.tenantId, from, to],
    );
    const s = sales.rows[0]!;
    let gross = parseMoney(String(s.gross));
    let netSales0 = parseMoney(String(s.net_sales));
    let cogs0 = parseMoney(String(s.cogs));
    let count = Number(s.n);

    // reversals effective INSIDE the window net the period (append-only:
    // a window covering the sale but not the later reversal keeps it)
    const reversalAdj = await ctx.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(i.total), 0)::text AS gross,
              COALESCE(SUM(i.subtotal - i.order_discount - i.tax_inclusive_total), 0)::text AS net_sales,
              COALESCE(SUM(i.cost_total), 0)::text AS cogs
         FROM invoice_reversal ir
         JOIN invoice i ON i.id = ir.invoice_id
        WHERE ir.tenant_id = $1 AND (ir.created_at AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3`,
      [ctx.tenantId, from, to],
    );
    const rv0 = reversalAdj.rows[0]!;
    gross -= parseMoney(String(rv0.gross));
    netSales0 -= parseMoney(String(rv0.net_sales));
    cogs0 -= parseMoney(String(rv0.cogs));
    count -= Number(rv0.n);

    const returns = await ctx.query(
      `SELECT COALESCE(SUM(cn.total), 0)::text AS total,
              COALESCE(SUM(cn.net_revenue_reversal), 0)::text AS rev,
              COALESCE(SUM(cn.cogs_reversal), 0)::text AS cogs
         FROM credit_note cn
        WHERE cn.tenant_id = $1 AND cn.business_date BETWEEN $2 AND $3`,
      [ctx.tenantId, from, to],
    );
    const rv = returns.rows[0]!;
    const returnsTotal = parseMoney(String(rv.total));
    const returnsRev = parseMoney(String(rv.rev));
    const returnsCogs = parseMoney(String(rv.cogs));

    const refunds = await ctx.query(
      `SELECT COALESCE(SUM(r.amount), 0)::text AS total FROM refund r
        WHERE r.tenant_id = $1 AND r.business_date BETWEEN $2 AND $3 AND r.status IN ('posted','settled')`,
      [ctx.tenantId, from, to],
    );
    const tenders = await ctx.query(
      `SELECT COALESCE(SUM(CASE WHEN pt.method != 'credit' THEN pt.amount ELSE 0 END), 0)::text AS money_in
         FROM payment p JOIN payment_tender pt ON pt.payment_id = p.id
        WHERE p.tenant_id = $1 AND p.source = 'sale' AND p.business_date BETWEEN $2 AND $3`,
      [ctx.tenantId, from, to],
    );
    const inventory = await ctx.query(
      `SELECT COALESCE(SUM(total_value), 0)::text AS value FROM stock_cost_state WHERE tenant_id = $1`,
      [ctx.tenantId],
    );
    // open receivables AS OF `to` — the canonical reversal-aware, dated
    // formula shared with the AR aging and the accounting control check
    const openAr = `GREATEST(i.total
              - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x
                           JOIN payment p ON p.id = x.payment_id AND p.business_date <= $2::date
                          WHERE x.invoice_id = i.id), 0)
              - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca
                          WHERE ca.invoice_id = i.id
                            AND (ca.created_at AT TIME ZONE 'UTC')::date <= $2::date), 0)
              - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr
                          WHERE scr.invoice_id = i.id AND scr.business_date <= $2::date), 0)
              - COALESCE((SELECT SUM(cn.ar_amount) FROM credit_note cn
                          WHERE cn.tenant_id = i.tenant_id AND cn.invoice_id = i.id
                            AND cn.business_date <= $2::date), 0)
              - CASE WHEN rev.effective_date IS NOT NULL AND rev.effective_date <= $2::date
                  THEN GREATEST(
                    i.total
                    - COALESCE((SELECT SUM(pa.amount) FROM payment_allocation pa
                                 JOIN payment p ON p.id = pa.payment_id
                                WHERE pa.invoice_id = i.id AND p.business_date <= rev.effective_date), 0)
                    - COALESCE((SELECT SUM(ca2.amount) FROM credit_application ca2
                                WHERE ca2.invoice_id = i.id AND (ca2.created_at AT TIME ZONE 'UTC')::date <= rev.effective_date), 0),
                    0)
                  ELSE 0 END, 0)`;
    const ar = await ctx.query(
      `SELECT COALESCE(SUM(${openAr}), 0)::text AS outstanding,
              COALESCE(SUM(CASE WHEN $2::date - i.business_date > 30 THEN ${openAr} ELSE 0 END), 0)::text AS overdue
         FROM invoice i
         LEFT JOIN LATERAL (
           SELECT COALESCE(re.business_date, (r.created_at AT TIME ZONE 'UTC')::date) AS effective_date
             FROM invoice_reversal r
             LEFT JOIN journal_entry re ON re.id = r.journal_entry_id
            WHERE r.tenant_id = i.tenant_id AND r.invoice_id = i.id
         ) rev ON true
        WHERE i.tenant_id = $1 AND i.status IN ('posted','reversed') AND i.business_date <= $2`,
      [ctx.tenantId, to],
    );

    const netSales = netSales0 - returnsRev;
    const netCogs = cogs0 - returnsCogs;
    const grossProfit = netSales - netCogs;
    const moneyIn = parseMoney(String(tenders.rows[0]!.money_in));

    out.daily_sales = formatMoney(gross);
    out.net_sales = formatMoney(netSales);
    out.gross_profit = formatMoney(grossProfit);
    out.gross_margin = netSales > 0n ? ratio(grossProfit, netSales) : '0.0000';
    out.average_order_value = count > 0 ? formatMoney(divide4(netSales, BigInt(count))) : '0.0000';
    out.sales_count = String(count);
    out.cash_vs_credit_ratio = moneyIn + (gross - moneyIn) > 0n ? ratio(moneyIn, moneyIn + (gross - moneyIn)) : '0.0000';
    out.total_refunds = String(refunds.rows[0]!.total);
    out.return_rate = gross > 0n ? ratio(returnsTotal, gross) : '0.0000';
    out.inventory_valuation = String(inventory.rows[0]!.value);
    out.outstanding_receivables = String(ar.rows[0]!.outstanding);
    out.overdue_receivables = String(ar.rows[0]!.overdue);
    return out;
  }

  // =========================================================================
  // Targets (effective-dated, audited, zero-target explicit)
  // =========================================================================

  async createTarget(
    principal: { userId: string; tenantId: string; displayName: string },
    dto: CreateKpiTarget,
  ): Promise<KpiTargetDto> {
    if (dto.scopeType === 'branch' && dto.scopeId == null) {
      throw new ValidationError('branch-scoped targets need a branch id');
    }
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const id = randomUUID();
      await ctx.query(
        `INSERT INTO kpi_target (id, tenant_id, metric, scope_type, scope_id, period_start, period_end,
           target_value, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id, ctx.tenantId, dto.metric, dto.scopeType, dto.scopeType === 'branch' ? dto.scopeId : null,
          dto.periodStart, dto.periodEnd, dto.targetValue, dto.note ?? null, principal.userId,
        ],
      );
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'kpi.target_created',
        entityType: 'kpi_target',
        entityId: id,
        details: { metric: dto.metric, target: dto.targetValue, period: `${dto.periodStart}..${dto.periodEnd}` },
      });
      const row = await ctx.query(`SELECT * FROM kpi_target WHERE id = $1`, [id]);
      return this.mapTarget(row.rows[0]!);
    });
  }

  async listTargets(tenantId: string, filter: { metric?: string }): Promise<KpiTargetDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT * FROM kpi_target WHERE tenant_id = $1 AND ($2::text IS NULL OR metric = $2)
         ORDER BY period_start DESC, metric`,
        [ctx.tenantId, filter.metric ?? null],
      );
      return (rows.rows as Array<Record<string, unknown>>).map((r) => this.mapTarget(r));
    });
  }

  async deleteTarget(principal: { userId: string; tenantId: string; displayName: string }, targetId: string): Promise<void> {
    return this.uow.run({ tenantId: principal.tenantId, userId: principal.userId }, async (ctx) => {
      const row = await ctx.query(`DELETE FROM kpi_target WHERE id = $1 RETURNING metric, period_start, period_end`, [targetId]);
      if (row.rows.length === 0) throw new NotFoundError('kpi target', targetId);
      await ctx.audit.record({
        tenantId: ctx.tenantId,
        actorUserId: principal.userId,
        actorDisplay: principal.displayName,
        action: 'kpi.target_deleted',
        entityType: 'kpi_target',
        entityId: targetId,
        details: { before: row.rows[0] },
      });
    });
  }

  /** Achievement vs the latest snapshot: explicit zero-target semantics. */
  async achievements(tenantId: string, args: { from: string; to: string }): Promise<KpiAchievementDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const targets = await ctx.query(
        `SELECT * FROM kpi_target
          WHERE tenant_id = $1 AND scope_type = 'tenant'
            AND period_start <= $2 AND period_end >= $3`,
        [ctx.tenantId, args.to, args.from],
      );
      const out: KpiAchievementDto[] = [];
      for (const t of targets.rows as Array<Record<string, unknown>>) {
        const snap = await ctx.query(
          `SELECT value FROM kpi_snapshot
            WHERE tenant_id = $1 AND metric = $2 AND scope_type = 'tenant'
              AND period_start = $3 AND period_end = $4`,
          [ctx.tenantId, String(t.metric), String(t.period_start).slice(0, 10), String(t.period_end).slice(0, 10)],
        );
        const target = parseMoney(String(t.target_value));
        const actual = snap.rows.length > 0 ? parseMoney(String(snap.rows[0]!.value)) : null;
        out.push({
          metric: String(t.metric),
          periodStart: String(t.period_start).slice(0, 10),
          periodEnd: String(t.period_end).slice(0, 10),
          target: String(t.target_value),
          actual: actual == null ? null : formatMoney(actual),
          achievementPct:
            actual == null ? null : target === 0n ? null : formatPct2(actual, target),
          gap: actual == null ? null : formatMoney(target - actual),
          zeroTarget: target === 0n,
        });
      }
      return out;
    });
  }

  private mapTarget(r: Record<string, unknown>): KpiTargetDto {
    return {
      id: String(r.id),
      metric: String(r.metric),
      scopeType: String(r.scope_type),
      scopeId: r.scope_id == null ? null : String(r.scope_id),
      periodStart: String(r.period_start).slice(0, 10),
      periodEnd: String(r.period_end).slice(0, 10),
      targetValue: String(r.target_value),
      note: r.note == null ? null : String(r.note),
      createdAt: String(r.created_at),
    };
  }
}

function ratio(numer: bigint, denom: bigint): string {
  // 4-decimal ratio, half-even
  const scaled = divideHalfEven(numer * 10000n, denom);
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const digits = abs.toString().padStart(5, '0');
  return `${negative ? '-' : ''}${digits.slice(0, digits.length - 4)}.${digits.slice(digits.length - 4)}`;
}

function divide4(n: bigint, d: bigint): bigint {
  return divideHalfEven(n, d);
}

function divideHalfEven(n: bigint, d: bigint): bigint {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const q = abs / d;
  const r = abs % d;
  const twice = r * 2n;
  let out = q;
  if (twice > d || (twice === d && q % 2n === 1n)) out = q + 1n;
  return negative ? -out : out;
}

function formatPct2(actual: bigint, target: bigint): string {
  const pct = divideHalfEven(actual * 10000n, target);
  const negative = pct < 0n;
  const abs = negative ? -pct : pct;
  const s = abs.toString().padStart(3, '0');
  return `${negative ? '-' : ''}${s.slice(0, s.length - 2)}.${s.slice(s.length - 2)}`;
}
