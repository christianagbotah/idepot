# Advanced AI Opportunity Map

Implements master prompt §14. The audit defines exactly which data foundations each AI feature needs, which legacy defects must be fixed **before** the feature is trustworthy, and the guardrails. AI is always optional to core operation and never silently posts financial entries.

## 0. Foundations (prerequisites — from the audit)

| Foundation | Why needed | Audit link |
|---|---|---|
| Ledger-based stock & accounting | Forecasts/anomalies need trustworthy series | D1-D15, I1 |
| Clean sales history with cost basis | Margin/pricing assistants | C-12 (cost = purchase price at sale; no AVCO) |
| Explicit payment allocations | Credit risk, cash-flow forecast | C-17/C-18 |
| Product/location model | Branch-level demand | multi-shop DDL was never wired |
| `ai_model_run/prediction/alert/feedback` tables | Auditability & versioning | new schema |

## 1. Feature map (value × readiness)

| # | Feature | Data foundation | Approach | Guardrails |
|---|---|---|---|---|
| 1 | **Demand forecasting** per item/branch | daily sales lines (base units) + calendar | gradient boosting / Prophet-class with seasonality (day-of-week, pay-day cycles, harmattan/rainy effects), prediction intervals | confidence shown; backtests with time-aware splits; forecast ≠ fact |
| 2 | **Reorder recommendations** | forecast + lead time + safety stock + open POs | (demand × lead time) + safety − on-hand − on-order; suggests qty & supplier | suggestion-only; one-click draft PO requires `purchase.create` |
| 3 | **Stockout/overstock risk alerts** | forecast vs on-hand | probability of stockout within lead time; overstock by days-of-cover | alert reasons explicit |
| 4 | **Slow-moving/dead stock** | movement series | days-since-last-sale, velocity percentiles, aging of stock layers | per-category thresholds |
| 5 | **Gross-margin & pricing assistant** | cost basis + price history + velocity | target-margin pricing suggestions, price-elasticity hints, customer-price outliers | suggestions only; applying requires `catalog.price.manage` |
| 6 | **Sales forecasting & target tracking** | sales series + `sales_targets` (dead DDL → revived) | hierarchical forecast (tenant→branch→category) vs targets | variance explanations |
| 7 | **Customer segmentation & retention** | RFM + payment behavior | k-means/rules hybrid; at-risk & dormant flags (ties to `customer_segments` DDL) | no cross-tenant training |
| 8 | **Credit-risk assistant** | payment history, aging, order behavior | scoring with explainable factors (avg days-to-pay, aging buckets, order frequency) | advisory only; never sole basis for denial; shows reasons |
| 9 | **Supplier performance scoring** | PO→GRN lead times, fill rate, price variance, returns | weighted scorecard | explainable components |
| 10 | **Cash-flow forecasting** | AR/AP aging + expected collections + recurring expenses + purchasing plans | scenario model (base/optimistic/pessimistic) | labeled projection |
| 11 | **Anomaly / fraud detection** | discounts, voids, refunds, reprints, stock adjustments, cash variances, after-hours activity | rules + isolation forest on event streams; per-branch baselines | alert-only → investigation queue; feeds `ai_alert` |
| 12 | **Smart reconciliation assistant** | bank/MoMo statement imports vs payments | fuzzy matching on amount/date/reference/counterparty; learning from confirmations | human confirm before posting |
| 13 | **Stock-count discrepancy assistant** | count sessions vs ledger | prioritizes suspicious items, suggests likely causes (mis-scan, unit confusion, theft pattern) | advisory |
| 14 | **Document OCR / intelligence** | supplier invoices, delivery notes, waybills | OCR + LLM extraction to GRN/supplier-invoice drafts | **human confirmation mandatory** before posting |
| 15 | **Duplicate detection** | migration + daily creates | fuzzy matching (names, phones, addresses; product names/SKUs) | merge requires permission; audit trail |
| 16 | **Natural-language business intelligence** | semantic layer over read models | NL → governed SQL/semantic queries, answers with evidence links; permission-aware | read-only; row-level scope enforced; query evidence shown |
| 17 | **Executive daily briefing** | KPIs + alerts | generated digest (sales, margin, stock risks, AR/AP, cash, anomalies) | clearly labeled AI-generated |
| 18 | **Predictive alerts with actionable reasons** | all of the above | routed through notifications with reasons | never auto-act |

## 2. Architecture

- Python 3.12 **FastAPI** service (`services/ai`): versioned endpoints (`/v1/forecast`, `/v1/anomalies`, `/v1/nlq`, `/v1/ocr`), model registry with version + config hash, `ai_model_run` audit rows (inputs hash, features, output, tenant).
- Consumes the transactional outbox / change feed asynchronously (never in the POS path).
- Read access via read-replica or read models; **tenant isolation enforced at the data layer** (tenant id in every query; no cross-tenant training without explicit legal/product approval).
- Non-AI fallback: every feature degrades to rule-based or manual workflows if the service is down (core POS unaffected by design).
- Secrets (LLM/OCR providers) in vault; per-tenant opt-in for external API features.

## 3. Phasing (aligned to roadmap)

- Phase 7a: 4 (dead stock), 11 (anomaly rules), 15 (dedupe — also used in migration), 3 (stockout alerts, rules first).
- Phase 7b: 1/2 (forecasting + reorder), 9 (supplier scorecard), 17 (briefing).
- Phase 7c: 7/8 (segmentation, credit risk), 10 (cash-flow), 12 (reconciliation assistant), 13 (count assistant).
- Phase 7d: 14 (OCR), 16 (NL BI), 5/6 (pricing assistant, targets) — after enough clean history has accumulated in the new system (≥ 6-12 months of ledger-accurate data or after migration backfill passes reconciliation).

## 4. Evaluation & quality gates

- Backtests with time-aware splits; accuracy targets per feature set in the AI service README before shipping.
- Human feedback loop: every prediction/alert can be marked useful/not with reason (`ai_feedback`).
- Drift monitoring; model retraining calendar; champion/challenger for the forecasting tier.
- The legacy data can bootstrap some features (demand history exists at scale — `payment_with_goods` ≈ 50k lines) **only after** migration reconciliation passes; defect-contaminated periods (D1-affected receipts, frozen-snapshot eras) must be excluded from training sets and flagged.
