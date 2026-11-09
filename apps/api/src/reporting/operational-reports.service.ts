/**
 * Operational reporting engine (Phase 5 §10–12) — a coherent framework
 * over canonical, properly dated transactional evidence. Legacy report
 * formulas were NOT copied where they were defective (documented per
 * report); every figure ties to the append-only ledgers.
 *
 * Corrected daily-stock formula (legacy defect: closing computed only
 * when sale+transfer both existed, quarantined returns counted as
 * sellable):
 *
 *   closing = opening + receipts + transfers_in + returns_restocked
 *             + positive_adjustments
 *             − sales_issues − transfers_out − negative_adjustments
 *
 * All quantities are BASE units from the append-only stock_movement
 * ledger; historic closings are LEDGER-DERIVED, never today's
 * stock_balance projection.
 */
import { Injectable } from '@nestjs/common';
import type {
  AgingRowDto,
  BacklogRowDto,
  CustomerStatementDto,
  DailySalesRowDto,
  DailyStockRowDto,
  DimensionSalesRowDto,
  ItemMarginRowDto,
  ReportQuery,
  ReturnsReportRowDto,
  ShiftVarianceRowDto,
  StockValuationRowDto,
  TenderTotalsRowDto,
} from '@idepot/contracts';
import { parseMoney, formatMoney } from '@idepot/domain';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest DI needs the runtime class
import { UnitOfWork } from '../db/unit-of-work.js';

@Injectable()
export class OperationalReportsService {
  constructor(private readonly uow: UnitOfWork) {}

  // =========================================================================
  // Daily sales — return-adjusted, tied to posted invoices + credit notes
  // =========================================================================

  async dailySales(tenantId: string, q: ReportQuery): Promise<DailySalesRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT to_char(i.business_date, 'YYYY-MM-DD') AS business_date,
                COUNT(*)::int AS sales_count,
                SUM(i.subtotal - i.order_discount - i.tax_inclusive_total)::text AS net_sales,
                SUM(i.tax_total)::text AS tax_total,
                SUM(i.cost_total)::text AS cogs_total,
                SUM(i.total)::text AS gross_sales
           FROM invoice i
          WHERE i.tenant_id = $1 AND i.status = 'posted'
            AND i.business_date BETWEEN $2 AND $3
            AND ($4::uuid IS NULL OR i.warehouse_id = $4)
          GROUP BY i.business_date
          ORDER BY i.business_date`,
        [ctx.tenantId, q.from, q.to, q.warehouseId ?? null],
      );
      // returns/refunds count on THEIR OWN business dates (a later
      // refund never changes an earlier day's reported sales)
      const returnsRows = await ctx.query(
        `SELECT to_char(cn.business_date, 'YYYY-MM-DD') AS business_date,
                SUM(cn.net_revenue_reversal)::text AS returns_revenue,
                SUM(cn.cogs_reversal)::text AS returns_cogs,
                SUM(cn.total)::text AS returns_total
           FROM credit_note cn
          WHERE cn.tenant_id = $1 AND cn.business_date BETWEEN $2 AND $3
          GROUP BY cn.business_date`,
        [ctx.tenantId, q.from, q.to],
      );
      const refundRows = await ctx.query(
        `SELECT to_char(r.business_date, 'YYYY-MM-DD') AS business_date, SUM(r.amount)::text AS refunds_total
           FROM refund r
          WHERE r.tenant_id = $1 AND r.business_date BETWEEN $2 AND $3
            AND r.status IN ('posted','settled')
          GROUP BY r.business_date`,
        [ctx.tenantId, q.from, q.to],
      );
      const tenderRows = await ctx.query(
        `SELECT to_char(p.business_date, 'YYYY-MM-DD') AS business_date,
                SUM(CASE WHEN pt.method != 'credit' THEN pt.amount ELSE 0 END)::text AS money_in
           FROM payment p JOIN payment_tender pt ON pt.payment_id = p.id
          WHERE p.tenant_id = $1 AND p.source = 'sale' AND p.business_date BETWEEN $2 AND $3
          GROUP BY p.business_date`,
        [ctx.tenantId, q.from, q.to],
      );
      const arRows = await ctx.query(
        `SELECT to_char(i.business_date, 'YYYY-MM-DD') AS business_date,
                SUM(i.total
                    - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                    - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0))::text AS ar_taken
           FROM invoice i
          WHERE i.tenant_id = $1 AND i.status = 'posted'
            AND i.business_date BETWEEN $2 AND $3
          GROUP BY i.business_date`,
        [ctx.tenantId, q.from, q.to],
      );
      const byDate = <T>(rows: Array<Record<string, unknown>>, fn: (r: Record<string, unknown>) => T) =>
        new Map<string, T>(rows.map((r) => [String(r.business_date).slice(0, 10), fn(r)]));

      const returns = byDate(returnsRows.rows as Array<Record<string, unknown>>, (r) => ({
        rev: parseMoney(money(r.returns_revenue)),
        cogs: parseMoney(money(r.returns_cogs)),
        total: parseMoney(money(r.returns_total)),
      }));
      const refunds = byDate(refundRows.rows as Array<Record<string, unknown>>, (r) => parseMoney(money(r.refunds_total)));
      const tenders = byDate(tenderRows.rows as Array<Record<string, unknown>>, (r) => parseMoney(money(r.money_in)));
      const arTaken = byDate(arRows.rows as Array<Record<string, unknown>>, (r) => parseMoney(money(r.ar_taken)));

      return (rows.rows as Array<Record<string, unknown>>).map((r) => {
        const date = String(r.business_date).slice(0, 10);
        const netSales = parseMoney(money(r.net_sales));
        const cogs = parseMoney(money(r.cogs_total));
        const ret = returns.get(date) ?? { rev: 0n, cogs: 0n, total: 0n };
        const netRevenue = netSales - ret.rev;
        const netCogs = cogs - ret.cogs;
        const ar = arTaken.get(date) ?? 0n;
        return {
          businessDate: date,
          salesCount: Number(r.sales_count),
          grossSales: money(r.gross_sales),
          netSales: money(r.net_sales),
          taxTotal: money(r.tax_total),
          cogsTotal: money(r.cogs_total),
          grossProfit: formatMoney(netRevenue - netCogs),
          cashSales: formatMoney(tenders.get(date) ?? 0n),
          creditSales: formatMoney(ar > 0n ? ar : 0n),
          returnsTotal: formatMoney(ret.total),
          refundsTotal: formatMoney(refunds.get(date) ?? 0n),
          netRevenue: formatMoney(netRevenue),
        };
      });
    });
  }

  // =========================================================================
  // Sales by dimension (customer / product / salesperson not tracked on
  // invoices — created_by serves as the counter user)
  // =========================================================================

  async salesByCustomer(tenantId: string, q: ReportQuery): Promise<DimensionSalesRowDto[]> {
    return this.salesByDimension(tenantId, q, 'customer');
  }

  async salesByProduct(tenantId: string, q: ReportQuery): Promise<DimensionSalesRowDto[]> {
    return this.salesByDimension(tenantId, q, 'product');
  }

  async salesByUser(tenantId: string, q: ReportQuery): Promise<DimensionSalesRowDto[]> {
    return this.salesByDimension(tenantId, q, 'user');
  }

  async salesByWarehouse(tenantId: string, q: ReportQuery): Promise<DimensionSalesRowDto[]> {
    return this.salesByDimension(tenantId, q, 'warehouse');
  }

  private async salesByDimension(
    tenantId: string,
    q: ReportQuery,
    dimension: 'customer' | 'product' | 'user' | 'warehouse',
  ): Promise<DimensionSalesRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      // 1. sales side
      const salesRows =
        dimension === 'product'
          ? await ctx.query(
              `SELECT il.product_id::text AS dimension_id,
                      COALESCE(p.code || ' · ' || p.name, 'unknown') AS dimension_label,
                      COUNT(DISTINCT i.id)::int AS sales_count,
                      SUM(il.line_net)::text AS net_sales,
                      COALESCE(SUM(il.cogs), 0)::text AS cogs
                 FROM invoice i JOIN invoice_line il ON il.invoice_id = i.id
                 LEFT JOIN product p ON p.id = il.product_id
                WHERE i.tenant_id = $1 AND i.status = 'posted'
                  AND i.business_date BETWEEN $2 AND $3
                  AND ($4::uuid IS NULL OR i.warehouse_id = $4)
                  AND ($5::uuid IS NULL OR il.product_id = $5)
                GROUP BY il.product_id, p.code, p.name
                ORDER BY net_sales DESC LIMIT $6 OFFSET $7`,
              [ctx.tenantId, q.from, q.to, q.warehouseId ?? null, q.productId ?? null, q.limit ?? 100, q.offset ?? 0],
            )
          : await ctx.query(
              `SELECT ${dimension === 'customer' ? 'i.customer_id' : dimension === 'user' ? 'i.created_by' : 'i.warehouse_id'}::text AS dimension_id,
                      ${dimension === 'customer'
                        ? `COALESCE(c.code || ' · ' || c.name, 'walk-in')`
                        : dimension === 'user'
                          ? `COALESCE(u.display_name, u.email, 'unknown')`
                          : `COALESCE(w.code || ' · ' || w.name, 'unknown')`} AS dimension_label,
                      COUNT(*)::int AS sales_count,
                      SUM(i.subtotal - i.order_discount - i.tax_inclusive_total)::text AS net_sales,
                      COALESCE(SUM(i.cost_total), 0)::text AS cogs
                 FROM invoice i
                 LEFT JOIN ${dimension === 'customer' ? 'customer c ON c.id = i.customer_id' : dimension === 'user' ? 'app_user u ON u.id = i.created_by' : 'warehouse w ON w.id = i.warehouse_id'}
                WHERE i.tenant_id = $1 AND i.status = 'posted'
                  AND i.business_date BETWEEN $2 AND $3
                  AND ($4::uuid IS NULL OR i.warehouse_id = $4)
                  AND ($5::uuid IS NULL OR i.${dimension === 'customer' ? 'customer_id' : dimension === 'user' ? 'created_by' : 'warehouse_id'} = $5)
                GROUP BY 1, 2
                ORDER BY net_sales DESC LIMIT $6 OFFSET $7`,
              [ctx.tenantId, q.from, q.to, q.warehouseId ?? null, q.customerId ?? null, q.limit ?? 100, q.offset ?? 0],
            );
      // 2. returns side (credit notes dated in the window, keyed by dimension)
      const returnRows =
        dimension === 'product'
          ? await ctx.query(
              `SELECT rl.product_id::text AS dimension_id,
                      SUM(rl.credit_net_slice)::text AS returns_total,
                      SUM(rl.cogs_reversal)::text AS cogs_reversal
                 FROM return_order_line rl
                 JOIN return_order ro ON ro.id = rl.return_order_id
                 JOIN credit_note cn ON cn.return_order_id = ro.id
                WHERE ro.tenant_id = $1 AND cn.business_date BETWEEN $2 AND $3
                  AND ro.status IN ('processed','completed')
                GROUP BY rl.product_id`,
              [ctx.tenantId, q.from, q.to],
            )
          : await ctx.query(
              `SELECT ro.${dimension === 'customer' ? 'customer_id' : dimension === 'user' ? 'created_by' : 'warehouse_id'}::text AS dimension_id,
                      SUM(cn.net_revenue_reversal)::text AS returns_total,
                      SUM(cn.cogs_reversal)::text AS cogs_reversal
                 FROM credit_note cn
                 JOIN return_order ro ON ro.id = cn.return_order_id
                 JOIN invoice i ON i.id = ro.invoice_id
                WHERE cn.tenant_id = $1 AND cn.business_date BETWEEN $2 AND $3
                  AND ro.status IN ('processed','completed')
                GROUP BY 1`,
              [ctx.tenantId, q.from, q.to],
            );
      const returnsByDim = new Map<string, { ret: bigint; cogsRev: bigint }>(
        (returnRows.rows as Array<Record<string, unknown>>).map((r) => [
          String(r.dimension_id),
          { ret: parseMoney(money(r.returns_total)), cogsRev: parseMoney(money(r.cogs_reversal)) },
        ]),
      );

      return (salesRows.rows as Array<Record<string, unknown>>).map((r) => {
        const dimId = r.dimension_id == null ? null : String(r.dimension_id);
        const rv = dimId == null ? undefined : returnsByDim.get(dimId);
        const netSales = parseMoney(money(r.net_sales));
        const cogs = parseMoney(money(r.cogs));
        const returnsTotal = rv?.ret ?? 0n;
        const netRevenue = netSales - returnsTotal;
        const netCogs = cogs - (rv?.cogsRev ?? 0n);
        return {
          dimensionId: dimId,
          dimensionLabel: String(r.dimension_label),
          salesCount: Number(r.sales_count),
          netSales: money(r.net_sales),
          returns: formatMoney(returnsTotal),
          netRevenue: formatMoney(netRevenue),
          cogs: money(r.cogs),
          grossProfit: formatMoney(netRevenue - netCogs),
          grossMarginPct: netRevenue > 0n ? formatPct(netRevenue - netCogs, netRevenue) : '0.00',
        };
      });
    });
  }

  // =========================================================================
  // Tender totals (payment collection by method, refunds netted)
  // =========================================================================

  async tenderTotals(tenantId: string, q: ReportQuery): Promise<TenderTotalsRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const inRows = await ctx.query(
        `SELECT pt.method, SUM(pt.amount)::text AS received
           FROM payment p JOIN payment_tender pt ON pt.payment_id = p.id
          WHERE p.tenant_id = $1 AND p.business_date BETWEEN $2 AND $3
          GROUP BY pt.method ORDER BY pt.method`,
        [ctx.tenantId, q.from, q.to],
      );
      const outRows = await ctx.query(
        `SELECT r.method, SUM(r.amount)::text AS refunded
           FROM refund r
          WHERE r.tenant_id = $1 AND r.business_date BETWEEN $2 AND $3
            AND r.status IN ('posted','settled')
          GROUP BY r.method ORDER BY r.method`,
        [ctx.tenantId, q.from, q.to],
      );
      const map = new Map<string, { received: bigint; refunded: bigint }>();
      for (const r of inRows.rows as Array<Record<string, unknown>>) {
        map.set(String(r.method), { received: parseMoney(String(r.received ?? '0')), refunded: 0n });
      }
      for (const r of outRows.rows as Array<Record<string, unknown>>) {
        const e = map.get(String(r.method)) ?? { received: 0n, refunded: 0n };
        e.refunded = parseMoney(String(r.refunded ?? '0'));
        map.set(String(r.method), e);
      }
      return [...map.entries()].map(([method, v]) => ({
        method,
        received: formatMoney(v.received),
        refunded: formatMoney(v.refunded),
        net: formatMoney(v.received - v.refunded),
      }));
    });
  }

  // =========================================================================
  // Daily stock — the CORRECTED legacy formula, ledger-derived
  // =========================================================================

  async dailyStock(tenantId: string, q: ReportQuery): Promise<DailyStockRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `WITH classified AS (
           SELECT sm.warehouse_id, sm.product_id,
                  (sm.occurred_at AT TIME ZONE 'UTC')::date AS business_date,
                  CASE
                    WHEN sm.movement_type = 'receipt' AND (sm.reason = 'customer_return' OR sm.source_document_type = 'return_order')
                      THEN 'returns_restocked'
                    WHEN sm.movement_type = 'receipt'
                      THEN 'receipts'
                    WHEN sm.movement_type = 'transfer_in' THEN 'transfers_in'
                    WHEN sm.movement_type = 'transfer_out' THEN 'transfers_out'
                    WHEN sm.movement_type = 'issue' AND sm.source_document_type = 'invoice' THEN 'sales_issues'
                    WHEN sm.movement_type = 'issue' THEN 'sales_issues' -- supplier returns etc. leave as issues
                    WHEN sm.quantity_base > 0 THEN 'positive_adjustments'
                    ELSE 'negative_adjustments'
                  END AS bucket,
                  -- stock_movement.quantity_base is SIGNED (issues/transfers-out
                  -- are negative): outs render as POSITIVE magnitudes below.
                  CASE WHEN sm.movement_type IN ('issue','transfer_out') OR
                            (sm.movement_type NOT IN ('receipt','transfer_in','issue','transfer_out')
                             AND sm.quantity_base < 0)
                    THEN -sm.quantity_base ELSE sm.quantity_base END AS qty,
                  sm.quantity_base
             FROM stock_movement sm
            WHERE sm.tenant_id = $1
              AND sm.warehouse_id = COALESCE($2::uuid, sm.warehouse_id)
              AND sm.occurred_at < ($3::date + INTERVAL '1 day')
              AND ($4::uuid IS NULL OR sm.product_id = $4)
         )
         SELECT c.warehouse_id, c.product_id,
                w.code AS warehouse_code, p.code AS product_code, p.name AS product_name,
                -- opening = signed sum of ALL movements before the from date
                -- (the ledger balance — no bucket sign gymnastics needed)
                COALESCE(SUM(CASE WHEN c.business_date < $3 THEN c.quantity_base ELSE 0 END), 0)::text AS opening,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'receipts' THEN c.qty ELSE 0 END), 0)::text AS receipts,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'transfers_in' THEN c.qty ELSE 0 END), 0)::text AS transfers_in,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'returns_restocked' THEN c.qty ELSE 0 END), 0)::text AS returns_restocked,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'positive_adjustments' THEN c.qty ELSE 0 END), 0)::text AS positive_adjustments,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'sales_issues' THEN c.qty ELSE 0 END), 0)::text AS sales_issues,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'transfers_out' THEN c.qty ELSE 0 END), 0)::text AS transfers_out,
                COALESCE(SUM(CASE WHEN c.business_date >= $3 AND c.bucket = 'negative_adjustments' THEN c.qty ELSE 0 END), 0)::text AS negative_adjustments
           FROM classified c
           LEFT JOIN warehouse w ON w.id = c.warehouse_id
           LEFT JOIN product p ON p.id = c.product_id
          GROUP BY c.warehouse_id, c.product_id, w.code, p.code, p.name
          HAVING COUNT(*) FILTER (WHERE c.business_date >= $3) > 0
             OR COALESCE(SUM(CASE WHEN c.business_date < $3 THEN c.quantity_base ELSE 0 END), 0) <> 0
          ORDER BY p.code, w.code
          LIMIT $5`,
        [ctx.tenantId, q.warehouseId ?? null, q.from, q.productId ?? null, q.limit ?? 500],
      );
      return rows.rows.map((r: Record<string, unknown>) => {
        const opening = parseQty(String(r.opening ?? '0'));
        const ins = ['receipts', 'transfers_in', 'returns_restocked', 'positive_adjustments'].map((k) =>
          parseQty(String(r[k] ?? '0')),
        );
        const outs = ['sales_issues', 'transfers_out', 'negative_adjustments'].map((k) =>
          parseQty(String(r[k] ?? '0')),
        );
        const closing = opening + ins.reduce((a, b) => a + b, 0n) - outs.reduce((a, b) => a + b, 0n);
        return {
          businessDate: q.from,
          productId: String(r.product_id),
          productCode: r.product_code == null ? null : String(r.product_code),
          productName: r.product_name == null ? null : String(r.product_name),
          warehouseId: String(r.warehouse_id),
          warehouseCode: r.warehouse_code == null ? null : String(r.warehouse_code),
          opening: String(r.opening ?? '0'),
          receipts: String(r.receipts ?? '0'),
          transfersIn: String(r.transfers_in ?? '0'),
          returnsRestocked: String(r.returns_restocked ?? '0'),
          positiveAdjustments: String(r.positive_adjustments ?? '0'),
          salesIssues: String(r.sales_issues ?? '0'),
          transfersOut: String(r.transfers_out ?? '0'),
          writeOffs: '0',
          negativeAdjustments: String(r.negative_adjustments ?? '0'),
          closing: closing.toString(),
        };
      });
    });
  }

  // =========================================================================
  // Backlog — actual unfulfilled quantities from the order state machine
  // (legacy defect: queried a nonexistent item_units table)
  // =========================================================================

  async backlog(tenantId: string, q: ReportQuery): Promise<BacklogRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT so.id AS sales_order_id, so.code AS order_code, so.created_at::date::text AS order_date,
               sol.product_id, p.code AS product_code, p.name AS product_name,
               sol.quantity_base::text AS ordered_qty,
               sol.fulfilled_quantity_base::text AS delivered_qty,
               (sol.quantity_base - sol.fulfilled_quantity_base)::text AS backlog_qty,
               sol.unit_price::text AS unit_price
           FROM sales_order so
           JOIN sales_order_line sol ON sol.order_id = so.id
           LEFT JOIN product p ON p.id = sol.product_id
          WHERE so.tenant_id = $1
            AND so.status IN ('draft','confirmed','partially_fulfilled')
            AND so.created_at::date BETWEEN $2 AND $3
            AND sol.quantity_base > sol.fulfilled_quantity_base
            AND ($4::uuid IS NULL OR sol.product_id = $4)
          ORDER BY so.created_at, so.code
          LIMIT $5 OFFSET $6`,
        [ctx.tenantId, q.from, q.to, q.productId ?? null, q.limit ?? 200, q.offset ?? 0],
      );
      return rows.rows.map((r: Record<string, unknown>) => {
        const backlogQty = parseQty(String(r.backlog_qty ?? '0'));
        const unitPrice = parseMoney(String(r.unit_price ?? '0'));
        return {
          salesOrderId: String(r.sales_order_id),
          orderCode: r.order_code == null ? null : String(r.order_code),
          orderDate: String(r.order_date),
          productId: String(r.product_id),
          productCode: r.product_code == null ? null : String(r.product_code),
          productName: r.product_name == null ? null : String(r.product_name),
          orderedQty: String(r.ordered_qty ?? '0'),
          deliveredQty: String(r.delivered_qty ?? '0'),
          cancelledQty: '0',
          backlogQty: String(r.backlog_qty ?? '0'),
          unitPrice: String(r.unit_price ?? '0'),
          backlogValue: formatMoney4(backlogQty * unitPrice),
        };
      });
    });
  }

  // =========================================================================
  // Item margin — ONE canonical costing basis: cost-at-sale AVCO
  // evidence, return-adjusted (legacy defect: three inconsistent tabs,
  // cost = purchase price at report time)
  // =========================================================================

  async itemMargin(tenantId: string, q: ReportQuery): Promise<ItemMarginRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT il.product_id, COALESCE(p.code, '?') AS product_code, COALESCE(p.name, '?') AS product_name,
                SUM(il.quantity_base)::text AS quantity_sold,
                SUM(il.line_net)::text AS gross_revenue,
                COALESCE(SUM(il.cogs), 0)::text AS cogs,
                COALESCE((SELECT SUM(rl.quantity_base) FROM return_order_line rl
                   JOIN return_order ro ON ro.id = rl.return_order_id
                  WHERE rl.invoice_line_id IN (SELECT id FROM invoice_line WHERE product_id = il.product_id
                      AND invoice_id IN (SELECT id FROM invoice WHERE business_date BETWEEN $2 AND $3 AND status = 'posted'))
                    AND ro.status IN ('processed','completed')), 0)::text AS quantity_returned,
                COALESCE((SELECT SUM(rl.credit_net_slice) FROM return_order_line rl
                   JOIN return_order ro ON ro.id = rl.return_order_id
                  WHERE rl.invoice_line_id IN (SELECT id FROM invoice_line WHERE product_id = il.product_id
                      AND invoice_id IN (SELECT id FROM invoice WHERE business_date BETWEEN $2 AND $3 AND status = 'posted'))
                    AND ro.status IN ('processed','completed')), 0)::text AS returns_value,
                COALESCE((SELECT SUM(rl.cogs_reversal) FROM return_order_line rl
                   JOIN return_order ro ON ro.id = rl.return_order_id
                  WHERE rl.invoice_line_id IN (SELECT id FROM invoice_line WHERE product_id = il.product_id
                      AND invoice_id IN (SELECT id FROM invoice WHERE business_date BETWEEN $2 AND $3 AND status = 'posted'))
                    AND ro.status IN ('processed','completed')), 0)::text AS cogs_reversal
           FROM invoice_line il
           LEFT JOIN product p ON p.id = il.product_id
          WHERE il.tenant_id = $1
            AND il.invoice_id IN (SELECT id FROM invoice WHERE tenant_id = $1 AND business_date BETWEEN $2 AND $3 AND status = 'posted')
          GROUP BY il.product_id, p.code, p.name
          ORDER BY gross_revenue DESC
          LIMIT $4 OFFSET $5`,
        [ctx.tenantId, q.from, q.to, q.limit ?? 100, q.offset ?? 0],
      );
      return rows.rows.map((r: Record<string, unknown>) => {
        const grossRevenue = parseMoney(String(r.gross_revenue ?? '0'));
        const returnsValue = parseMoney(String(r.returns_value ?? '0'));
        const cogs = parseMoney(String(r.cogs ?? '0'));
        const cogsRev = parseMoney(String(r.cogs_reversal ?? '0'));
        const netRevenue = grossRevenue - returnsValue;
        const netCogs = cogs - cogsRev;
        return {
          productId: String(r.product_id),
          productCode: String(r.product_code),
          productName: String(r.product_name),
          quantitySold: String(r.quantity_sold ?? '0'),
          quantityReturned: String(r.quantity_returned ?? '0'),
          grossRevenue: String(r.gross_revenue ?? '0'),
          returns: String(r.returns_value ?? '0'),
          netRevenue: formatMoney(netRevenue),
          cogs: String(r.cogs ?? '0'),
          cogsReversal: String(r.cogs_reversal ?? '0'),
          netCogs: formatMoney(netCogs),
          grossProfit: formatMoney(netRevenue - netCogs),
          grossMarginPct: netRevenue > 0n ? formatPct(netRevenue - netCogs, netRevenue) : '0.00',
        };
      });
    });
  }

  // =========================================================================
  // Returns & refunds by reason
  // =========================================================================

  async returnsByReason(tenantId: string, q: ReportQuery): Promise<ReturnsReportRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      // Refunds/store credits are pre-aggregated per reason in CTEs: the
      // previous form referenced ungrouped rr.id columns from scalar
      // subqueries in the SELECT list, which PostgreSQL rejects outright
      // (HTTP 500 on any tenant with processed returns).
      const rows = await ctx.query(
        `WITH ro_agg AS (
           SELECT ro.reason_id,
                  COUNT(*)::int AS returns_count,
                  COALESCE(SUM((SELECT SUM(quantity_base) FROM return_order_line WHERE return_order_id = ro.id)), 0)::text AS quantity_returned,
                  COALESCE(SUM(ro.gross_credit), 0)::text AS gross_credit
             FROM return_order ro
            WHERE ro.tenant_id = $1 AND ro.business_date BETWEEN $2 AND $3
              AND ro.status IN ('processed','completed')
            GROUP BY ro.reason_id
         ),
         refund_agg AS (
           SELECT ro.reason_id, COALESCE(SUM(r.amount), 0)::text AS refunded
             FROM refund r JOIN return_order ro ON ro.id = r.return_order_id
            WHERE r.tenant_id = $1 AND r.status IN ('posted','settled')
              AND r.business_date BETWEEN $2 AND $3
            GROUP BY ro.reason_id
         ),
         sc_agg AS (
           SELECT ro.reason_id, COALESCE(SUM(sc.amount), 0)::text AS store_credit_issued
             FROM store_credit sc JOIN return_order ro ON ro.credit_note_id = sc.credit_note_id
            WHERE sc.tenant_id = $1
            GROUP BY ro.reason_id
         )
         SELECT rr.code AS reason_code,
                a.returns_count,
                a.quantity_returned,
                a.gross_credit,
                COALESCE(f.refunded, '0') AS refunded,
                COALESCE(s.store_credit_issued, '0') AS store_credit_issued
           FROM ro_agg a
           LEFT JOIN refund_agg f ON f.reason_id = a.reason_id
           LEFT JOIN sc_agg s ON s.reason_id = a.reason_id
           LEFT JOIN return_reason rr ON rr.id = a.reason_id
          ORDER BY a.gross_credit DESC`,
        [ctx.tenantId, q.from, q.to],
      );
      return rows.rows.map((r: Record<string, unknown>) => ({
        reasonCode: r.reason_code == null ? 'unknown' : String(r.reason_code),
        returnsCount: Number(r.returns_count),
        quantityReturned: String(r.quantity_returned ?? '0'),
        grossCredit: String(r.gross_credit ?? '0'),
        refunded: String(r.refunded ?? '0'),
        storeCreditIssued: String(r.store_credit_issued ?? '0'),
      }));
    });
  }

  // =========================================================================
  // Shift variance
  // =========================================================================

  async shiftVariance(tenantId: string, q: ReportQuery): Promise<ShiftVarianceRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT cs.id AS shift_id, cs.code AS shift_code, u.display_name AS user_name,
                cs.opened_at::text AS opened_at, cs.closed_at::text AS closed_at,
                COALESCE(cs.expected_cash, 0)::text AS expected_cash,
                cs.counted_cash::text AS counted_cash, cs.status
           FROM cashier_shift cs
           LEFT JOIN app_user u ON u.id = cs.user_id
          WHERE cs.tenant_id = $1
            AND (cs.opened_at AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3
          ORDER BY cs.opened_at DESC
          LIMIT $4 OFFSET $5`,
        [ctx.tenantId, q.from, q.to, q.limit ?? 100, q.offset ?? 0],
      );
      return rows.rows.map((r: Record<string, unknown>) => {
        const expected = parseMoney(String(r.expected_cash ?? '0'));
        const counted = r.counted_cash == null ? null : parseMoney(String(r.counted_cash));
        return {
          shiftId: String(r.shift_id),
          shiftCode: r.shift_code == null ? null : String(r.shift_code),
          userName: r.user_name == null ? null : String(r.user_name),
          openedAt: r.opened_at == null ? null : String(r.opened_at),
          closedAt: r.closed_at == null ? null : String(r.closed_at),
          expectedCash: String(r.expected_cash ?? '0'),
          countedCash: r.counted_cash == null ? null : String(r.counted_cash),
          variance: counted == null ? null : formatMoney(counted - expected),
          status: String(r.status),
        };
      });
    });
  }

  // =========================================================================
  // Stock valuation (AVCO cost state — the same evidence COGS uses)
  // =========================================================================

  async stockValuation(tenantId: string, q: ReportQuery): Promise<StockValuationRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const rows = await ctx.query(
        `SELECT scs.warehouse_id, w.code AS warehouse_code, scs.product_id,
                p.code AS product_code, p.name AS product_name,
                scs.quantity_base::text AS quantity_base, scs.total_value::text AS total_value
           FROM stock_cost_state scs
           LEFT JOIN warehouse w ON w.id = scs.warehouse_id
           LEFT JOIN product p ON p.id = scs.product_id
          WHERE scs.tenant_id = $1
            AND ($2::uuid IS NULL OR scs.warehouse_id = $2)
            AND ($3::uuid IS NULL OR scs.product_id = $3)
            AND scs.quantity_base <> 0
          ORDER BY scs.total_value DESC
          LIMIT $4 OFFSET $5`,
        [ctx.tenantId, q.warehouseId ?? null, q.productId ?? null, q.limit ?? 500, q.offset ?? 0],
      );
      return rows.rows.map((r: Record<string, unknown>) => ({
        warehouseId: String(r.warehouse_id),
        warehouseCode: r.warehouse_code == null ? null : String(r.warehouse_code),
        productId: String(r.product_id),
        productCode: r.product_code == null ? null : String(r.product_code),
        productName: r.product_name == null ? null : String(r.product_name),
        quantityBase: String(r.quantity_base ?? '0'),
        totalValue: String(r.total_value ?? '0'),
      }));
    });
  }

  // =========================================================================
  // Customer statement — invoices, payments, returns, credit notes,
  // refunds, store credit in ONE running-balance ledger
  // =========================================================================

  async customerStatement(tenantId: string, customerId: string, asOf: string): Promise<CustomerStatementDto> {
    return this.uow.run({ tenantId }, async (ctx) => {
      const cust = await ctx.query(`SELECT code, name FROM customer WHERE id = $1`, [customerId]);
      if (cust.rows.length === 0) {
        throw new (await import('@idepot/domain')).NotFoundError('customer', customerId);
      }
      const rows = await ctx.query(
        `SELECT business_date, document_type, document_code, description, debit, credit FROM (
           SELECT to_char(i.business_date, 'YYYY-MM-DD') AS business_date, 'invoice' AS document_type, i.code AS document_code,
                  COALESCE(c.code, 'walk-in') || ' sale' AS description,
                  i.total::text AS debit, '0' AS credit
             FROM invoice i LEFT JOIN customer c ON c.id = i.customer_id
            WHERE i.customer_id = $1 AND i.status = 'posted' AND i.business_date <= $2
           UNION ALL
           SELECT to_char(p.business_date, 'YYYY-MM-DD'), 'payment', p.code, 'payment received', '0', pa.amount::text
             FROM payment_allocation pa JOIN payment p ON p.id = pa.payment_id
            WHERE pa.invoice_id IN (SELECT id FROM invoice WHERE customer_id = $1) AND p.business_date <= $2
           UNION ALL
           SELECT to_char(ca.created_at::date, 'YYYY-MM-DD'), 'credit_application', d.code, 'deposit credit applied', '0', ca.amount::text
             FROM credit_application ca JOIN customer_deposit d ON d.id = ca.deposit_id
            WHERE ca.invoice_id IN (SELECT id FROM invoice WHERE customer_id = $1) AND ca.created_at::date <= $2
           UNION ALL
           SELECT to_char(cn.business_date, 'YYYY-MM-DD'), 'credit_note', cn.code, 'return credit note', '0', cn.ar_amount::text
             FROM credit_note cn
            WHERE cn.customer_id = $1 AND cn.business_date <= $2
           UNION ALL
           SELECT to_char(scr.business_date, 'YYYY-MM-DD'), 'store_credit_redemption', sc.code, 'store credit redeemed', '0', scr.amount::text
             FROM store_credit_redemption scr JOIN store_credit sc ON sc.id = scr.store_credit_id
            WHERE sc.customer_id = $1 AND scr.business_date <= $2
          ) ledger
         ORDER BY business_date, document_type
         LIMIT 2000`,
        [customerId, asOf],
      );
      let balance = 0n;
      const lines = rows.rows.map((r: Record<string, unknown>) => {
        balance += parseMoney(String(r.debit ?? '0')) - parseMoney(String(r.credit ?? '0'));
        return {
          businessDate: String(r.business_date).slice(0, 10),
          documentType: String(r.document_type),
          documentCode: String(r.document_code),
          description: String(r.description),
          debit: String(r.debit ?? '0'),
          credit: String(r.credit ?? '0'),
          balance: formatMoney(balance),
        };
      });
      const arRow = await ctx.query(
        `SELECT COALESCE(SUM(i.total
              - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
              - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
              - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0)), 0)::text AS receivable
           FROM invoice i WHERE i.customer_id = $1 AND i.status = 'posted'`,
        [customerId],
      );
      const scRow = await ctx.query(
        `SELECT COALESCE(SUM(sc.amount - COALESCE((SELECT SUM(r.amount) FROM store_credit_redemption r WHERE r.store_credit_id = sc.id), 0)), 0)::text AS credit
           FROM store_credit sc WHERE sc.customer_id = $1 AND sc.status IN ('active','expired')`,
        [customerId],
      );
      return {
        customerId,
        customerName: cust.rows[0]!.name == null ? null : String(cust.rows[0]!.name),
        asOf,
        openingBalance: '0.0000',
        closingBalance: formatMoney(balance),
        receivable: String(arRow.rows[0]!.receivable ?? '0'),
        storeCredit: String(scRow.rows[0]!.credit ?? '0'),
        lines,
      };
    });
  }

  // =========================================================================
  // AR aging (0-30/31-60/61-90/91-120/120+) — the legacy had NO aging
  // =========================================================================

  async arAging(tenantId: string, asOf: string): Promise<AgingRowDto[]> {
    return this.aging(tenantId, asOf, 'ar');
  }

  async apAging(tenantId: string, asOf: string): Promise<AgingRowDto[]> {
    return this.aging(tenantId, asOf, 'ap');
  }

  private async aging(tenantId: string, asOf: string, side: 'ar' | 'ap'): Promise<AgingRowDto[]> {
    return this.uow.run({ tenantId }, async (ctx) => {
      if (side === 'ar') {
        const rows = await ctx.query(
          `SELECT c.id AS party_id, c.code AS party_code, c.name AS party_name,
                  SUM(CASE WHEN $2::date - i.business_date <= 30 THEN i.total
                        - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0) ELSE 0 END)::text AS current,
                  SUM(CASE WHEN $2::date - i.business_date BETWEEN 31 AND 60 THEN i.total
                        - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0) ELSE 0 END)::text AS d31_60,
                  SUM(CASE WHEN $2::date - i.business_date BETWEEN 61 AND 90 THEN i.total
                        - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0) ELSE 0 END)::text AS d61_90,
                  SUM(CASE WHEN $2::date - i.business_date BETWEEN 91 AND 120 THEN i.total
                        - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0) ELSE 0 END)::text AS d91_120,
                  SUM(CASE WHEN $2::date - i.business_date > 120 THEN i.total
                        - COALESCE((SELECT SUM(x.amount) FROM payment_allocation x WHERE x.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(ca.amount) FROM credit_application ca WHERE ca.invoice_id = i.id), 0)
                        - COALESCE((SELECT SUM(scr.amount) FROM store_credit_redemption scr WHERE scr.invoice_id = i.id), 0) ELSE 0 END)::text AS over120
             FROM invoice i JOIN customer c ON c.id = i.customer_id
            WHERE i.tenant_id = $1 AND i.status = 'posted' AND i.business_date <= $2
            GROUP BY c.id, c.code, c.name`,
          [ctx.tenantId, asOf],
        );
        return rows.rows.map((r) => this.mapAging(r));
      }
      // AP: open = total + debit notes − credit notes − payment allocations − advance applications
      const open = `si.total
        + COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'debit_note'), 0)
        - COALESCE((SELECT SUM(sa.amount) FROM supplier_adjustment sa WHERE sa.supplier_invoice_id = si.id AND sa.kind = 'credit_note'), 0)
        - COALESCE((SELECT SUM(spa.amount) FROM supplier_payment_allocation spa WHERE spa.supplier_invoice_id = si.id), 0)
        - COALESCE((SELECT SUM(saal.amount) FROM supplier_advance_application_line saal
             JOIN supplier_advance_application saa ON saa.id = saal.application_id
            WHERE saal.supplier_invoice_id = si.id), 0)`;
      const rows = await ctx.query(
        `SELECT s.id AS party_id, s.code AS party_code, s.name AS party_name,
                SUM(CASE WHEN $2::date - si.business_date <= 30 THEN ${open} ELSE 0 END)::text AS current,
                SUM(CASE WHEN $2::date - si.business_date BETWEEN 31 AND 60 THEN ${open} ELSE 0 END)::text AS d31_60,
                SUM(CASE WHEN $2::date - si.business_date BETWEEN 61 AND 90 THEN ${open} ELSE 0 END)::text AS d61_90,
                SUM(CASE WHEN $2::date - si.business_date BETWEEN 91 AND 120 THEN ${open} ELSE 0 END)::text AS d91_120,
                SUM(CASE WHEN $2::date - si.business_date > 120 THEN ${open} ELSE 0 END)::text AS over120
           FROM supplier_invoice si JOIN supplier s ON s.id = si.supplier_id
          WHERE si.tenant_id = $1 AND si.status IN ('posted','partially_paid','matched') AND si.business_date <= $2
          GROUP BY s.id, s.code, s.name`,
        [ctx.tenantId, asOf],
      );
      return rows.rows.map((r) => this.mapAging(r));
    });
  }

  private mapAging(r: Record<string, unknown>): AgingRowDto {
    const s = (v: unknown) => String(v ?? '0');
    const buckets = ['current', 'd31_60', 'd61_90', 'd91_120', 'over120'].map((k) => parseMoney(s(r[k])));
    const total = buckets.reduce((a, b) => a + b, 0n);
    return {
      partyId: String(r.party_id),
      partyCode: r.party_code == null ? null : String(r.party_code),
      partyName: r.party_name == null ? null : String(r.party_name),
      current: s(r.current),
      days31to60: s(r.d31_60),
      days61to90: s(r.d61_90),
      days91to120: s(r.d91_120),
      over120: s(r.over120),
      total: formatMoney(total),
    };
  }
}

function money(v: unknown): string {
  return v == null ? '0.0000' : String(v);
}

function parseQty(v: string): bigint {
  // quantities are numeric(18,6); parse to scaled-6 BigInt
  const [intPart, fracPart = ''] = v.split('.');
  const digits = (intPart || '0') + fracPart.padEnd(6, '0');
  return BigInt(digits.replace(/[^\d-]/g, '') || '0');
}

function formatMoney4(qtyScaled6TimesMoneyScaled4: bigint): string {
  // qty(6dp) × money(4dp) → 10dp; render at 4dp half-even
  const scaled4 = divideHalfEven(qtyScaled6TimesMoneyScaled4, 1000000n);
  const negative = scaled4 < 0n;
  const abs = negative ? -scaled4 : scaled4;
  const digits = abs.toString().padStart(5, '0');
  return `${negative ? '-' : ''}${digits.slice(0, digits.length - 4)}.${digits.slice(digits.length - 4)}`;
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

function formatPct(numer: bigint, denom: bigint): string {
  // percentage with 2 decimals, half-even
  const pctScaled2 = divideHalfEven(numer * 10000n, denom);
  const negative = pctScaled2 < 0n;
  const abs = negative ? -pctScaled2 : pctScaled2;
  const s = abs.toString().padStart(3, '0');
  return `${negative ? '-' : ''}${s.slice(0, s.length - 2)}.${s.slice(s.length - 2)}`;
}
