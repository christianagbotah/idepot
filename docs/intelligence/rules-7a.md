# Phase 7a — Rules-Based Intelligence (tier 7a)

Implements the tier-7a slice of [ai-opportunity-map.md](../architecture/ai-opportunity-map.md) §3: **dead stock (feature 4), stockout alerts rules-first (feature 3), anomaly rules (feature 11)** — plus the alert/run/feedback foundation every later tier (7b–7d) builds on. Duplicate detection (feature 15) is the next 7a increment, delivered separately.

## Guardrails (master prompt rule 14)

- **Advisory only.** A rule evaluation never posts, never mutates financial state, never blocks or retries a sale. It reads the canonical ledgers and writes `ai_*` rows only.
- **Human loop.** Alerts land in an investigation queue (`open → acknowledged → resolved | dismissed`, always by a human with `intelligence:manage`); every alert can be marked useful/not-with-reason (`ai_feedback`) — the signal future tuning tiers will read.
- **Auditable.** Every rule run is an `ai_model_run` row: rule id + version, the exact effective config and its SHA-256, the evaluation window, alerts created/suppressed, status (`completed`/`failed`) and error. A rule that fails marks only ITS run failed — the other rules still complete.
- **Never a flood.** Re-scans dedupe against open/acknowledged alerts (partial unique index on `(tenant, dedupe_key)` where open/acknowledged) and refresh their evidence; a resolved/dismissed alert never blocks a fresh one when the condition still holds.
- **Cashiers see nothing.** The queue is deliberately invisible to the monitored population (`intelligence:read` = owner/admin/manager/auditor/accountant/procurement; `intelligence:manage` = owner/admin/manager).

## Endpoints

| Route | Permission | Purpose |
| --- | --- | --- |
| `GET /api/intelligence/rules` | read | self-describing catalog (ids, semantics, defaults) |
| `POST /api/intelligence/scan` | manage | run rules now; body `{ windowDays?: 1–365 (default 30), rules?: string[] (default all) }` |
| `GET /api/intelligence/alerts` | read | the queue, priority-ordered; filters `status`, `severity`, `ruleId`, `entityType`, `limit`, `offset` |
| `GET /api/intelligence/alerts/:id` | read | detail + evidence + feedback trail |
| `POST /api/intelligence/alerts/:id/acknowledge` | manage | open → acknowledged |
| `POST /api/intelligence/alerts/:id/resolve` | manage | open/acknowledged → resolved (optional note) |
| `POST /api/intelligence/alerts/:id/dismiss` | manage | requires a note — say why it is not actionable |
| `POST /api/intelligence/alerts/:id/feedback` | read | `{ useful, reason? }` — upserted per user |
| `GET /api/intelligence/runs` | read | the run ledger (config hash, counts, status, error) |

Web: `/intelligence` (Insights group) — filters, scan button (managers), severity badges, evidence viewer, lifecycle + feedback actions, recent runs.

## Rules (version 1.0.0)

All decisions use exact scaled-BigInt comparisons (never floats). Thresholds are defaults; each tenant overrides them through the effective-dated `tenant_setting` key **`intelligence.rules`** (`settings:manage`, corrections are new versions — same-day re-versioning is intentionally not possible).

### `dead-stock` (feature 4)

Per active product **with stock on the shelf** (`stock_balance` row, per warehouse):
- last sold ≥ `deadStock.noSaleDays` (default **60**) days ago → **warning**; ≥ 2× threshold → **critical**;
- never sold and the oldest inbound stock has sat ≥ threshold days (anchored to the first receipt/transfer-in/positive adjustment) → **warning** ("never sold");
- evidence: days since last sale, on-hand base units, base units sold in the trailing `velocityWindowDays` (default **90**), thresholds.

Sales = `movement_type='issue'` from the append-only stock ledger (reversals never count as sales). Intent: markdown / transfer / supplier-return decisions. *AVCO layer aging is deferred to 7b, where cost-layer analytics arrive with forecasting.*

### `stockout-risk` (feature 3, rules-first)

Per active product/warehouse:
- **critical** — on-hand at/below `onHandFloor` (dust, default 1 base unit) while the product demonstrably sold in the trailing `demandWindowDays` (default **30**): every further customer is a lost sale;
- **warning** — days-of-cover below the assumed `leadTimeDays` (default **7**). The decision is an exact integer cross-multiply (`onHand × windowDays < demand × leadTimeDays`); the days-of-cover figure shown in evidence is display-only;
- silent when there is no demand evidence.

*Open purchase orders are deliberately not netted here — that is tier 7b reorder logic (feature 2). Per-supplier lead times likewise arrive with 7b; today the lead time is a tenant-wide assumption.*

### Anomaly rules (feature 11)

| Rule | Trigger | Severity |
| --- | --- | --- |
| `anomaly:invoice-discount` | posted invoice with `order_discount/subtotal` ≥ `discountWarnRatio` (default **10%**) | warning; **critical** ≥ `discountCriticalRatio` (default **25%**) |
| `anomaly:after-hours` | posted invoice whose `occurred_at` hour is outside `afterHoursOpenUtc`–`afterHoursCloseUtc` (default **06–21 UTC**; Ghana deployments are UTC+0, no DST) | info |
| `anomaly:shift-variance` | closed shift with \|variance\| ≥ `shiftVarianceWarn` (default **50.00**) | warning; **critical** ≥ `shiftVarianceCritical` (default **200.00**) |
| `anomaly:stock-adjustment` | DIRECT adjustment line with \|quantity_base\| ≥ `adjustmentQtyWarn` (default **20**) | warning; **critical** ≥ `adjustmentQtyCritical` (default **100**) |
| `anomaly:invoice-voided` | any voided invoice (no production path voids today — corrections go through reversals — so this is a defensive catch) | info |
| `anomaly:invoice-reversal` | every invoice reversal correction, with its documented reason | info |

`anomaly:stock-adjustment` deliberately **excludes count-derived adjustments** (`source_count_id IS NOT NULL` — opening stock, count approvals): those already carry human-approval evidence in the count workflow; the queue watches direct adjustments only. Receipt reprints are not yet instrumented (browser-side printing) and returns/refund frequency baselining is deferred to the next increment — both documented, neither silently missing.

## Configuration example

```json
POST /api/reports/settings
{
  "key": "intelligence.rules",
  "value": { "deadStock": { "noSaleDays": 45 },
             "stockoutRisk": { "leadTimeDays": 10 },
             "anomaly": { "discountWarnRatio": 0.05 } },
  "note": "tighten for the Accra branch pilot"
}
```

Unknown keys are ignored; non-numeric/negative values are rejected back to defaults; a critical threshold can never fall below its warning threshold. Values must terminate within the decimal scales (money 4dp, quantity 6dp) — a non-terminating value (e.g. `0.00001` for a money threshold) fails the rule's run loudly and is recorded in the run ledger, without affecting other rules.

## Scheduling

Scans are explicit (`intelligence:manage`). There is deliberately no in-process scheduler yet: POS-path independence comes first, and a dedicated worker (consuming the outbox feed) arrives with the 7b forecasting service. A daily scan cadence is the recommended operational pattern until then.

## Defect found and fixed en route (0023)

The Phase 7a integration suite exposed a latent Phase 5 defect: the `trg_kpi_target_overlap_guard` and `trg_tenant_setting_overlap_guard` BEFORE-triggers ended in `RETURN NULL`, which in PostgreSQL **silently skips the operation** — every `kpi_target` and `tenant_setting` INSERT/UPDATE since migration 0019 was a no-op (the settings API returned 500 on its post-insert read-back; no prior test exercised either write path). Migration `0023_phase7a_settings_trigger_fix.sql` replaces both functions with the identical guard logic and `RETURN NEW`. No data repair is needed: no rows were ever written.
