/**
 * Phase 7a rules-based intelligence — pure evaluation library
 * (ai-opportunity-map.md tier 7a: dead stock, stockout risk
 * [rules first], anomaly rules). This module contains ZERO I/O:
 * SQL loads candidate rows, these pure functions decide alerts.
 *
 * Guardrails (master prompt rule 14 + opportunity map §1):
 *  - every rule is ADVISORY: it returns an alert draft, never
 *    posts, never mutates financial state, never blocks a sale;
 *  - every alert carries an explicit human-readable reason and
 *    the exact numbers behind it (evidence object);
 *  - all money/quantity comparisons use exact scaled-BigInt
 *    math — a threshold is never compared through a float;
 *  - days-of-cover is derived from the append-only stock ledger
 *    (issue movements in BASE units), never from today's
 *    stock_balance projection alone.
 *
 * Configuration: defaults below are overridable per tenant via
 * the effective-dated `tenant_setting` key `intelligence.rules`
 * (settings:manage) — the scan service resolves the effective
 * config and stamps it + its SHA-256 into every ai_model_run.
 */
import { parseDecimal, MONEY_SCALE, QTY_SCALE } from './decimal.js';

export const INTELLIGENCE_RULE_VERSION = '1.0.0';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type IntelligenceEntityType =
  | 'product'
  | 'warehouse'
  | 'invoice'
  | 'invoice_reversal'
  | 'shift'
  | 'stock_adjustment'
  | 'cashier';

/** A rule's decision output — the API layer persists it as an ai_alert row. */
export interface AlertDraft {
  ruleId: string;
  severity: AlertSeverity;
  /** stable per (rule, entity) so re-scans dedupe against open alerts */
  dedupeKey: string;
  entityType: IntelligenceEntityType;
  entityId: string | null;
  entityLabel: string;
  title: string;
  /** explicit, human-readable, carries the numbers */
  reason: string;
  /** the machine-checkable numbers behind the reason */
  evidence: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration (defaults; tenant_setting key `intelligence.rules`)
// ---------------------------------------------------------------------------

export interface IntelligenceRulesConfig {
  deadStock: {
    /** alert when the product last sold this many days ago or more */
    noSaleDays: number;
    /** trailing window (days) for the velocity evidence figure */
    velocityWindowDays: number;
  };
  stockoutRisk: {
    /** trailing window (days) for demand estimation */
    demandWindowDays: number;
    /** replenishment lead time assumption (days) — per-supplier lead times arrive with tier 7b */
    leadTimeDays: number;
    /** ignore products whose on-hand is below this floor (dust) */
    onHandFloor: number;
  };
  anomaly: {
    /** order_discount/subtotal ratio ≥ this fraction → warning (0.10 = 10%) */
    discountWarnRatio: number;
    discountCriticalRatio: number;
    /** shop operating hours in UTC (Ghana deployments are UTC+0, no DST) */
    afterHoursOpenUtc: number;
    afterHoursCloseUtc: number;
    /** |shift variance| ≥ this money amount → warning */
    shiftVarianceWarn: number;
    shiftVarianceCritical: number;
    /** |adjustment| ≥ this base quantity → warning */
    adjustmentQtyWarn: number;
    adjustmentQtyCritical: number;
  };
}

export const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceRulesConfig = {
  deadStock: { noSaleDays: 60, velocityWindowDays: 90 },
  stockoutRisk: { demandWindowDays: 30, leadTimeDays: 7, onHandFloor: 0.000001 },
  anomaly: {
    discountWarnRatio: 0.1,
    discountCriticalRatio: 0.25,
    afterHoursOpenUtc: 6,
    afterHoursCloseUtc: 21,
    shiftVarianceWarn: 50,
    shiftVarianceCritical: 200,
    adjustmentQtyWarn: 20,
    adjustmentQtyCritical: 100,
  },
};

/** Merge a tenant's effective setting payload over the defaults (unknown
 *  keys ignored, known keys validated by type — fail loud on nonsense). */
export function resolveIntelligenceConfig(raw: unknown): IntelligenceRulesConfig {
  const out: IntelligenceRulesConfig = {
    deadStock: { ...DEFAULT_INTELLIGENCE_CONFIG.deadStock },
    stockoutRisk: { ...DEFAULT_INTELLIGENCE_CONFIG.stockoutRisk },
    anomaly: { ...DEFAULT_INTELLIGENCE_CONFIG.anomaly },
  };
  if (raw == null || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

  const dead = src.deadStock;
  if (dead && typeof dead === 'object') {
    const d = dead as Record<string, unknown>;
    const noSaleDays = num(d.noSaleDays);
    const velocityWindowDays = num(d.velocityWindowDays);
    if (noSaleDays != null) out.deadStock.noSaleDays = Math.floor(noSaleDays);
    if (velocityWindowDays != null) out.deadStock.velocityWindowDays = Math.floor(velocityWindowDays);
  }
  const stock = src.stockoutRisk;
  if (stock && typeof stock === 'object') {
    const s = stock as Record<string, unknown>;
    const demandWindowDays = num(s.demandWindowDays);
    const leadTimeDays = num(s.leadTimeDays);
    const onHandFloor = num(s.onHandFloor);
    if (demandWindowDays != null) out.stockoutRisk.demandWindowDays = Math.max(1, Math.floor(demandWindowDays));
    if (leadTimeDays != null) out.stockoutRisk.leadTimeDays = Math.max(1, Math.floor(leadTimeDays));
    if (onHandFloor != null) out.stockoutRisk.onHandFloor = onHandFloor;
  }
  const anomaly = src.anomaly;
  if (anomaly && typeof anomaly === 'object') {
    const a = anomaly as Record<string, unknown>;
    const dw = num(a.discountWarnRatio);
    const dc = num(a.discountCriticalRatio);
    const ho = num(a.afterHoursOpenUtc);
    const hc = num(a.afterHoursCloseUtc);
    const sv = num(a.shiftVarianceWarn);
    const svc = num(a.shiftVarianceCritical);
    const aw = num(a.adjustmentQtyWarn);
    const ac = num(a.adjustmentQtyCritical);
    if (dw != null) out.anomaly.discountWarnRatio = dw;
    if (dc != null) out.anomaly.discountCriticalRatio = dc;
    if (ho != null) out.anomaly.afterHoursOpenUtc = Math.min(23, Math.floor(ho));
    if (hc != null) out.anomaly.afterHoursCloseUtc = Math.min(24, Math.floor(hc));
    if (sv != null) out.anomaly.shiftVarianceWarn = sv;
    if (svc != null) out.anomaly.shiftVarianceCritical = svc;
    if (aw != null) out.anomaly.adjustmentQtyWarn = aw;
    if (ac != null) out.anomaly.adjustmentQtyCritical = ac;
  }
  if (out.anomaly.discountCriticalRatio < out.anomaly.discountWarnRatio) {
    out.anomaly.discountCriticalRatio = out.anomaly.discountWarnRatio;
  }
  if (out.anomaly.shiftVarianceCritical < out.anomaly.shiftVarianceWarn) {
    out.anomaly.shiftVarianceCritical = out.anomaly.shiftVarianceWarn;
  }
  if (out.anomaly.adjustmentQtyCritical < out.anomaly.adjustmentQtyWarn) {
    out.anomaly.adjustmentQtyCritical = out.anomaly.adjustmentQtyWarn;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rule: dead stock (opportunity map feature 4)
// ---------------------------------------------------------------------------

export interface DeadStockInput {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  /** current on-hand BASE units (stock_balance projection, evidence only) */
  onHandBase: string;
  /** most recent sale-issue occurred_at; null when the product never sold */
  lastIssueAt: Date | null;
  /** earliest stock-receipt occurred_at — anchors the never-sold case */
  firstReceiptAt: Date | null;
  /** BASE units issued (sold) inside the trailing velocity window */
  issuesInWindow: string;
}

/**
 * Dead stock: a product with stock on the shelf that has not sold for at
 * least `noSaleDays` days. Evidence carries the velocity so a human can
 * tell "never sold" from "slower lately". Reversal movements return stock
 * but never count as sales; the SQL loader filters movement_type='issue'.
 */
export function evaluateDeadStock(
  input: DeadStockInput,
  cfg: IntelligenceRulesConfig,
  now: Date,
): AlertDraft | null {
  const onHand = parseDecimal(input.onHandBase, QTY_SCALE);
  if (onHand <= 0n) return null;
  if (input.lastIssueAt == null) {
    // never sold — only alert once the stock itself has been sitting at least
    // the full threshold window (anchored to the FIRST receipt; on-hand > 0
    // implies receipts exist, so the anchor is present)
    const anchor = input.firstReceiptAt ?? now;
    const daysSinceReceipt = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
    if (daysSinceReceipt < cfg.deadStock.noSaleDays) return null;
    return {
      ruleId: 'dead-stock',
      severity: 'warning',
      dedupeKey: `dead-stock:${input.productId}:${input.warehouseId}`,
      entityType: 'product',
      entityId: input.productId,
      entityLabel: `${input.productCode} — ${input.productName} @ ${input.warehouseCode}`,
      title: 'Dead stock: never sold',
      reason:
        `${input.productCode} (${input.productName}) has ${input.onHandBase} base units on hand at ${input.warehouseCode} ` +
        `but has never recorded a sale in ${daysSinceReceipt} days of stock history. ` +
        `Review for markdown, transfer or return to supplier.`,
      evidence: {
        productCode: input.productCode,
        productName: input.productName,
        warehouseCode: input.warehouseCode,
        onHandBase: input.onHandBase,
        lastIssueAt: null,
        neverSold: true,
        daysSinceFirstReceipt: daysSinceReceipt,
        firstReceiptAt: anchor.toISOString(),
        issuesInVelocityWindow: input.issuesInWindow,
        noSaleDaysThreshold: cfg.deadStock.noSaleDays,
      },
    };
  }
  const daysSince = Math.floor((now.getTime() - input.lastIssueAt.getTime()) / 86_400_000);
  if (daysSince < cfg.deadStock.noSaleDays) return null;
  const severity: AlertSeverity = daysSince >= 2 * cfg.deadStock.noSaleDays ? 'critical' : 'warning';
  return {
    ruleId: 'dead-stock',
    severity,
    dedupeKey: `dead-stock:${input.productId}:${input.warehouseId}`,
    entityType: 'product',
    entityId: input.productId,
    entityLabel: `${input.productCode} — ${input.productName} @ ${input.warehouseCode}`,
    title: `Dead stock: no sale for ${daysSince} days`,
    reason:
      `${input.productCode} (${input.productName}) last sold ${daysSince} days ago (threshold ` +
      `${cfg.deadStock.noSaleDays} days) and still holds ${input.onHandBase} base units at ${input.warehouseCode}. ` +
      `Only ${input.issuesInWindow} base units sold in the last ${cfg.deadStock.velocityWindowDays} days. ` +
      `Review for markdown, transfer or supplier return.`,
    evidence: {
      productCode: input.productCode,
      productName: input.productName,
      warehouseCode: input.warehouseCode,
      onHandBase: input.onHandBase,
      lastIssueAt: input.lastIssueAt.toISOString(),
      daysSinceLastIssue: daysSince,
      issuesInVelocityWindow: input.issuesInWindow,
      noSaleDaysThreshold: cfg.deadStock.noSaleDays,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: stockout risk (opportunity map feature 3, rules first)
// ---------------------------------------------------------------------------

export interface StockoutRiskInput {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  onHandBase: string;
  /** BASE units issued inside the trailing demand window */
  demandInWindow: string;
  /** true when the product sold at least once inside the window */
  soldInWindow: boolean;
}

/**
 * Stockout risk, rules-first (the probabilistic tier arrives with 7b
 * forecasting). Two outcomes:
 *  - OUT NOW: on-hand at (near) zero while the product demonstrably sold
 *    inside the demand window → critical — every further customer is a
 *    lost sale;
 *  - LOW COVER: days-of-cover = on-hand / avg daily demand < configured
 *    lead time → warning — the shelf will run out before a typical
 *    replenishment arrives.
 * Days-of-cover uses exact quantity math; the average is computed with
 * half-even division at QTY_SCALE and only for the comparison.
 */
export function evaluateStockoutRisk(input: StockoutRiskInput, cfg: IntelligenceRulesConfig): AlertDraft | null {
  const onHand = parseDecimal(input.onHandBase, QTY_SCALE);
  const demand = parseDecimal(input.demandInWindow, QTY_SCALE);
  const floor = parseDecimal(String(cfg.stockoutRisk.onHandFloor), QTY_SCALE);
  const days = BigInt(cfg.stockoutRisk.demandWindowDays);

  // no demand evidence at all → the stockout rule has nothing to say
  if (demand <= 0n || !input.soldInWindow) return null;

  // OUT NOW: on-hand at/below the dust floor while it sold this window
  if (onHand <= floor) {
    return {
      ruleId: 'stockout-risk',
      severity: 'critical',
      dedupeKey: `stockout-risk:${input.productId}:${input.warehouseId}`,
      entityType: 'product',
      entityId: input.productId,
      entityLabel: `${input.productCode} — ${input.productName} @ ${input.warehouseCode}`,
      title: 'Stocked out while selling',
      reason:
        `${input.productCode} (${input.productName}) is out of stock at ${input.warehouseCode} ` +
        `(on-hand ${input.onHandBase} base units) but sold ${input.demandInWindow} base units in the last ` +
        `${cfg.stockoutRisk.demandWindowDays} days. Every further demand is a lost sale — reorder now.`,
      evidence: {
        productCode: input.productCode,
        productName: input.productName,
        warehouseCode: input.warehouseCode,
        onHandBase: input.onHandBase,
        demandInWindow: input.demandInWindow,
        demandWindowDays: cfg.stockoutRisk.demandWindowDays,
        daysOfCover: 0,
      },
    };
  }

  // avg daily demand = demand / windowDays (half-even, QTY_SCALE) — exactness
  // is preserved for the cover comparison by comparing onHand < avg*leadTime
  // as an exact integer cross-multiply (no division loss at all).
  const coverShortfall = onHand * days < demand * BigInt(cfg.stockoutRisk.leadTimeDays);
  if (!coverShortfall) return null;
  // avg daily demand (display only): days-of-cover = on-hand / avg demand.
  // The DECISION above used the exact integer cross-multiply; this figure is
  // evidence for humans, so float display precision is acceptable here.
  const avgDaily = Number(input.demandInWindow) / cfg.stockoutRisk.demandWindowDays;
  const daysOfCover = avgDaily > 0 ? Number(input.onHandBase) / avgDaily : null;
  return {
    ruleId: 'stockout-risk',
    severity: 'warning',
    dedupeKey: `stockout-risk:${input.productId}:${input.warehouseId}`,
    entityType: 'product',
    entityId: input.productId,
    entityLabel: `${input.productCode} — ${input.productName} @ ${input.warehouseCode}`,
    title: 'Low stock cover',
    reason:
      `${input.productCode} (${input.productName}) at ${input.warehouseCode} holds ${input.onHandBase} base units ` +
      `against ${input.demandInWindow} sold in the last ${cfg.stockoutRisk.demandWindowDays} days — about ` +
      `${daysOfCover == null ? 'n/a' : daysOfCover.toFixed(1)} days of cover, under the assumed ` +
      `${cfg.stockoutRisk.leadTimeDays}-day replenishment lead time. Consider reordering.`,
    evidence: {
      productCode: input.productCode,
      productName: input.productName,
      warehouseCode: input.warehouseCode,
      onHandBase: input.onHandBase,
      demandInWindow: input.demandInWindow,
      demandWindowDays: cfg.stockoutRisk.demandWindowDays,
      daysOfCover: daysOfCover == null ? null : Number(daysOfCover.toFixed(2)),
      leadTimeDays: cfg.stockoutRisk.leadTimeDays,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: anomaly — deep invoice discount (feature 11)
// ---------------------------------------------------------------------------

export interface DiscountAnomalyInput {
  invoiceId: string;
  invoiceCode: string;
  subtotal: string;
  orderDiscount: string;
  createdByName: string;
  businessDate: string;
}

/** Deep order discount on a posted invoice — a classic shrink signal when
 *  paired with a cashier's name. The decision compares exactly:
 *  orderDiscount/subtotal ≥ ratio ⇔ orderDiscount·denom ≥ subtotal·numen. */
export function evaluateDiscountAnomaly(
  input: DiscountAnomalyInput,
  cfg: IntelligenceRulesConfig,
): AlertDraft | null {
  const subtotal = parseDecimal(input.subtotal, MONEY_SCALE);
  if (subtotal <= 0n) return null;
  const discount = parseDecimal(input.orderDiscount, MONEY_SCALE);
  const warnNum = BigInt(Math.round(cfg.anomaly.discountWarnRatio * 100));
  const critNum = BigInt(Math.round(cfg.anomaly.discountCriticalRatio * 100));
  const isCritical = discount * 100n >= subtotal * critNum;
  const isWarn = discount * 100n >= subtotal * warnNum;
  if (!isWarn) return null;
  const ratioPct = ((Number(input.orderDiscount) / Number(input.subtotal)) * 100).toFixed(1);
  return {
    ruleId: 'anomaly:invoice-discount',
    severity: isCritical ? 'critical' : 'warning',
    dedupeKey: `anomaly:discount:${input.invoiceId}`,
    entityType: 'invoice',
    entityId: input.invoiceId,
    entityLabel: `${input.invoiceCode} (${input.businessDate})`,
    title: `Deep discount ${ratioPct}% on ${input.invoiceCode}`,
    reason:
      `Invoice ${input.invoiceCode} (${input.businessDate}) carries an order discount of ${input.orderDiscount} ` +
      `on a subtotal of ${input.subtotal} (${ratioPct}% — threshold ` +
      `${(cfg.anomaly.discountWarnRatio * 100).toFixed(0)}%). Recorded by ${input.createdByName}. ` +
      `Verify the discount was authorised.`,
    evidence: {
      invoiceCode: input.invoiceCode,
      businessDate: input.businessDate,
      subtotal: input.subtotal,
      orderDiscount: input.orderDiscount,
      discountPct: Number(ratioPct),
      thresholdPct: cfg.anomaly.discountWarnRatio * 100,
      createdBy: input.createdByName,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: anomaly — after-hours posting (feature 11)
// ---------------------------------------------------------------------------

export interface AfterHoursInput {
  invoiceId: string;
  invoiceCode: string;
  occurredAt: Date;
  createdByName: string;
  businessDate: string;
}

/** Activity outside the configured operating window (UTC; Ghana
 *  deployments are UTC+0 with no DST — timezone-aware windows arrive
 *  with tenant locale configuration). */
export function evaluateAfterHours(
  input: AfterHoursInput,
  cfg: IntelligenceRulesConfig,
): AlertDraft | null {
  const hour = input.occurredAt.getUTCHours();
  const open = cfg.anomaly.afterHoursOpenUtc;
  const close = cfg.anomaly.afterHoursCloseUtc;
  if (hour >= open && hour < close) return null;
  const hh = String(hour).padStart(2, '0');
  return {
    ruleId: 'anomaly:after-hours',
    severity: 'info',
    dedupeKey: `anomaly:after-hours:${input.invoiceId}`,
    entityType: 'invoice',
    entityId: input.invoiceId,
    entityLabel: `${input.invoiceCode} (${input.businessDate})`,
    title: `After-hours sale at ${hh}:00 UTC`,
    reason:
      `Invoice ${input.invoiceCode} was posted at ${hh}:00 UTC, outside the configured operating window ` +
      `${open}:00–${close}:00 UTC. Recorded by ${input.createdByName}. Confirm the sale is legitimate.`,
    evidence: {
      invoiceCode: input.invoiceCode,
      businessDate: input.businessDate,
      occurredAtUtc: input.occurredAt.toISOString(),
      hourUtc: hour,
      windowOpenUtc: open,
      windowCloseUtc: close,
      createdBy: input.createdByName,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: anomaly — shift cash variance (feature 11)
// ---------------------------------------------------------------------------

export interface ShiftVarianceInput {
  shiftId: string;
  shiftCode: string;
  cashierName: string;
  expectedCash: string;
  countedCash: string;
  variance: string;
  closedAt: Date;
}

/** Closed shift with a cash variance beyond the configured band. */
export function evaluateShiftVariance(
  input: ShiftVarianceInput,
  cfg: IntelligenceRulesConfig,
): AlertDraft | null {
  const variance = parseDecimal(input.variance, MONEY_SCALE);
  const negative = variance < 0n;
  const abs = negative ? -variance : variance;
  const warn = parseDecimal(String(cfg.anomaly.shiftVarianceWarn), MONEY_SCALE);
  const crit = parseDecimal(String(cfg.anomaly.shiftVarianceCritical), MONEY_SCALE);
  if (abs < warn) return null;
  const isCritical = abs >= crit;
  return {
    ruleId: 'anomaly:shift-variance',
    severity: isCritical ? 'critical' : 'warning',
    dedupeKey: `anomaly:shift-variance:${input.shiftId}`,
    entityType: 'shift',
    entityId: input.shiftId,
    entityLabel: `Shift ${input.shiftCode}`,
    title: `Cash variance ${input.variance} on ${input.shiftCode}`,
    reason:
      `Shift ${input.shiftCode} (cashier ${input.cashierName}) closed ${input.closedAt.toISOString()} with ` +
      `expected cash ${input.expectedCash} vs counted ${input.countedCash} — a variance of ${input.variance} ` +
      `(threshold ${cfg.anomaly.shiftVarianceWarn}). Review tenders, change and paid-outs.`,
    evidence: {
      shiftCode: input.shiftCode,
      cashier: input.cashierName,
      expectedCash: input.expectedCash,
      countedCash: input.countedCash,
      variance: input.variance,
      threshold: cfg.anomaly.shiftVarianceWarn,
      closedAt: input.closedAt.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: anomaly — large stock adjustment (feature 11)
// ---------------------------------------------------------------------------

export interface AdjustmentAnomalyInput {
  adjustmentLineId: string;
  adjustmentCode: string;
  adjustedAt: Date;
  productCode: string;
  productName: string;
  quantityBase: string;
  reason: string | null;
  createdByName: string;
}

/** A single adjustment line whose magnitude crosses the configured base-unit
 *  thresholds. Adjustments are legitimate inventory hygiene — the alert
 *  simply routes the big ones to human review. */
export function evaluateAdjustmentAnomaly(
  input: AdjustmentAnomalyInput,
  cfg: IntelligenceRulesConfig,
): AlertDraft | null {
  const qty = parseDecimal(input.quantityBase, QTY_SCALE);
  const abs = qty < 0n ? -qty : qty;
  const warn = parseDecimal(String(cfg.anomaly.adjustmentQtyWarn), QTY_SCALE);
  const crit = parseDecimal(String(cfg.anomaly.adjustmentQtyCritical), QTY_SCALE);
  if (abs < warn) return null;
  const isCritical = abs >= crit;
  return {
    ruleId: 'anomaly:stock-adjustment',
    severity: isCritical ? 'critical' : 'warning',
    dedupeKey: `anomaly:stock-adjustment:${input.adjustmentLineId}`,
    entityType: 'stock_adjustment',
    entityId: input.adjustmentLineId,
    entityLabel: `Adjustment ${input.adjustmentCode} — ${input.productCode}`,
    title: `Large stock adjustment ${input.quantityBase} on ${input.adjustmentCode}`,
    reason:
      `Stock adjustment ${input.adjustmentCode} moved ${input.quantityBase} base units of ` +
      `${input.productCode} (${input.productName}) on ${input.adjustedAt.toISOString()} ` +
      `by ${input.createdByName}${input.reason ? ` — stated reason: "${input.reason}"` : ' — NO stated reason'}. ` +
      `Magnitude threshold is ${cfg.anomaly.adjustmentQtyWarn}. Verify against a count or supplier document.`,
    evidence: {
      adjustmentCode: input.adjustmentCode,
      adjustedAt: input.adjustedAt.toISOString(),
      productCode: input.productCode,
      productName: input.productName,
      quantityBase: input.quantityBase,
      reason: input.reason,
      createdBy: input.createdByName,
      threshold: cfg.anomaly.adjustmentQtyWarn,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule: anomaly — voided invoice / reversal activity (feature 11)
// ---------------------------------------------------------------------------

export interface VoidedInvoiceInput {
  invoiceId: string;
  invoiceCode: string;
  businessDate: string;
  total: string;
  createdByName: string;
}

/** Every voided invoice deserves a look — voids are rare and a classic
 *  misuse vector, so they surface as info-severity queue entries. */
export function evaluateVoidedInvoice(input: VoidedInvoiceInput): AlertDraft {
  return {
    ruleId: 'anomaly:invoice-voided',
    severity: 'info',
    dedupeKey: `anomaly:invoice-voided:${input.invoiceId}`,
    entityType: 'invoice',
    entityId: input.invoiceId,
    entityLabel: `${input.invoiceCode} (${input.businessDate})`,
    title: `Invoice ${input.invoiceCode} voided`,
    reason:
      `Invoice ${input.invoiceCode} (${input.businessDate}, total ${input.total}) was voided. ` +
      `Recorded by ${input.createdByName}. Confirm the void reason is documented.`,
    evidence: {
      invoiceCode: input.invoiceCode,
      businessDate: input.businessDate,
      total: input.total,
      createdBy: input.createdByName,
    },
  };
}

export interface ReversalActivityInput {
  reversalId: string;
  invoiceCode: string;
  reversalDate: string;
  total: string;
  reason: string | null;
  createdByName: string;
}

/** Invoice reversals are legitimate correction documents (review hardening
 *  P0-2) — the alert surfaces each one for the record, info severity. */
export function evaluateReversalActivity(input: ReversalActivityInput): AlertDraft {
  return {
    ruleId: 'anomaly:invoice-reversal',
    severity: 'info',
    dedupeKey: `anomaly:invoice-reversal:${input.reversalId}`,
    entityType: 'invoice_reversal',
    entityId: input.reversalId,
    entityLabel: `Reversal of ${input.invoiceCode}`,
    title: `Invoice ${input.invoiceCode} reversed`,
    reason:
      `Invoice ${input.invoiceCode} (total ${input.total}) was reversed on ${input.reversalDate} ` +
      `by ${input.createdByName}${input.reason ? ` — reason: "${input.reason}"` : ''}. ` +
      `Confirm the correction was warranted.`,
    evidence: {
      invoiceCode: input.invoiceCode,
      reversalDate: input.reversalDate,
      total: input.total,
      reason: input.reason,
      createdBy: input.createdByName,
    },
  };
}

// ---------------------------------------------------------------------------
// Rule catalog (self-describing; surfaced by GET /intelligence/rules)
// ---------------------------------------------------------------------------

export interface RuleCatalogEntry {
  ruleId: string;
  description: string;
  defaults: string;
  tier: '7a';
}

export const INTELLIGENCE_RULE_CATALOG: readonly RuleCatalogEntry[] = [
  {
    ruleId: 'dead-stock',
    description:
      'Product with stock on the shelf that has not sold within the configured window. ' +
      'Evidence: days since last sale, on-hand, velocity in the trailing window.',
    defaults: `noSaleDays ${DEFAULT_INTELLIGENCE_CONFIG.deadStock.noSaleDays}d, velocity window ${DEFAULT_INTELLIGENCE_CONFIG.deadStock.velocityWindowDays}d`,
    tier: '7a',
  },
  {
    ruleId: 'stockout-risk',
    description:
      'Out-of-stock while demonstrably selling (critical) or days-of-cover below the assumed ' +
      'replenishment lead time (warning). Rules-first tier; probabilistic forecasting arrives with 7b.',
    defaults: `demand window ${DEFAULT_INTELLIGENCE_CONFIG.stockoutRisk.demandWindowDays}d, lead time ${DEFAULT_INTELLIGENCE_CONFIG.stockoutRisk.leadTimeDays}d`,
    tier: '7a',
  },
  {
    ruleId: 'anomaly:invoice-discount',
    description: 'Order discount at or beyond the configured ratio of the invoice subtotal.',
    defaults: `warn ≥ ${(DEFAULT_INTELLIGENCE_CONFIG.anomaly.discountWarnRatio * 100).toFixed(0)}%, critical ≥ ${(DEFAULT_INTELLIGENCE_CONFIG.anomaly.discountCriticalRatio * 100).toFixed(0)}%`,
    tier: '7a',
  },
  {
    ruleId: 'anomaly:after-hours',
    description: 'Sales posted outside the configured operating window (UTC hours).',
    defaults: `outside ${DEFAULT_INTELLIGENCE_CONFIG.anomaly.afterHoursOpenUtc}:00–${DEFAULT_INTELLIGENCE_CONFIG.anomaly.afterHoursCloseUtc}:00 UTC`,
    tier: '7a',
  },
  {
    ruleId: 'anomaly:shift-variance',
    description: 'Closed cashier shift whose counted cash differs from the derived expected cash beyond the band.',
    defaults: `warn ≥ ${DEFAULT_INTELLIGENCE_CONFIG.anomaly.shiftVarianceWarn}, critical ≥ ${DEFAULT_INTELLIGENCE_CONFIG.anomaly.shiftVarianceCritical}`,
    tier: '7a',
  },
  {
    ruleId: 'anomaly:stock-adjustment',
    description: 'A stock adjustment line whose base-unit magnitude crosses the threshold.',
    defaults: `warn ≥ ${DEFAULT_INTELLIGENCE_CONFIG.anomaly.adjustmentQtyWarn}, critical ≥ ${DEFAULT_INTELLIGENCE_CONFIG.anomaly.adjustmentQtyCritical}`,
    tier: '7a',
  },
  {
    ruleId: 'anomaly:invoice-voided',
    description: 'Every voided invoice, surfaced for review (rare by design).',
    defaults: 'no thresholds',
    tier: '7a',
  },
  {
    ruleId: 'anomaly:invoice-reversal',
    description: 'Every invoice reversal correction, surfaced for review with its documented reason.',
    defaults: 'no thresholds',
    tier: '7a',
  },
] as const;
