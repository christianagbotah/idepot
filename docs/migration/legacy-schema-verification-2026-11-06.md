# Legacy Schema Verification — 2026-11-06 Intake

Scope: Task B of [legacy/intake/2026-11-06/ZAI_HANDOFF.md](../../legacy/intake/2026-11-06/ZAI_HANDOFF.md) —
check the owner's new 66-table MariaDB DDL against our references and the
PostgreSQL migration engine, and state truthfully what is and is not verified.

## 1. Equivalence of the new DDL vs the prior reference

**Result: structurally identical — 66/66 tables, 0 column/index/PK drift.**

Method (`scripts/schema_diff.py`, committed alongside this doc): both files
parsed to a normalized model (per table: column name, base type with length,
nullability, default, AUTO_INCREMENT; PK from inline or `ALTER TABLE ADD
PRIMARY KEY`; named indexes with column lists and prefix lengths), then
diffed table-by-table.

| Check | `legacy/intake/2026-11-06/depot_schema_only_sanitized.sql` (new, phpMyAdmin 5.2.3 / MariaDB 11.8.8) | `legacy/schema/legacy_mysql_schema.sql` (prior reference) |
|---|---|---|
| CREATE TABLE count | 66 | 66 |
| Tables only in one file | none | none |
| Column drift (add/remove/type/nullability/default) | **0 events** | **0 events** |
| Index drift (add/remove/definition) | **0 events** | **0 events** |
| PK drift | **0 events** | **0 events** |

Spot-verified money columns stay `double` with identical defaults
(`invoice.amount_due NOT NULL DEFAULT 0`, `payment.amount NULL DEFAULT 0`) —
the known migration risks (§4) are unchanged.

## 2. Equivalence of the sanitized PHP source vs the new archive

**Result: path-complete superset; content equivalence highly likely but NOT
proven byte-identical** (the private `depot.zip` is not in the repo — per the
handoff, do not assume identity).

- View inventory: all **266/266** business-page paths in the new intake exist
  verbatim in the committed `legacy/source/_al01i/v_l02i/backend/admin/pages/`
  tree. The committed tree additionally holds 7 files the intake excluded:
  4 `-tmp` crash dumps, 1 `.phpOld`, and the 2 dev `.md` artifacts — all
  classified dead in Phase 0.
- Controller fingerprint: committed `Admin.php` has **164** function
  declarations vs the intake report's "about **166**" for the new archive —
  within counting-method noise, no evidence of structural divergence.
- Conclusion: the earlier sanitized source remains a valid code-level
  reference for every inventoried business page. If an exact diff is ever
  required, request an authorized sanitized refreshed snapshot (per intake
  README); do not silently assert equivalence.

## 3. The 66-table register (verified against the engine)

Engine coverage verified 2026-11-09 from `packages/migration/src/types.ts`
(`FIXTURE_TABLES`), `transform-phase2..5.ts` code references and the
`legacy_raw` DDL in `infra/migrations/0002/0003/0006/0013` (+ **0020**, on
the Phase 5 branch `phase-5/returns-reporting-admin`, which stages the six
dead returns tables so the no-synthesis verification is non-vacuous).

Classification per the handoff's four buckets — **live** (actively written by
legacy code), **historical-reference-only** (frozen snapshots), **dead-unused**
(dead DDL / school-era / infra), **ambiguous** (partially written or
uncertain semantics):

| Legacy table | Classification | Target (docs/migration/legacy-to-postgres-map.md) | Engine coverage |
|---|---|---|---|
| `account_type` | live | enum values folded into the CoA account model (map §1) | mapped-not-implemented |
| `accounts` | live | account (CoA) + banking master + tender method mapping | staged+transformed |
| `accounts_payable` | live | supplier_invoice / outstanding_debt + allocations | staged+transformed |
| `accounts_used` | ambiguous | none (dead writer, read by receipt_pos only) | by-design-not-migrated |
| `admin` | live | app_user + user_role seed (map §1) | mapped-not-implemented |
| `attendance` | live | optional shift/attendance history import | mapped-not-implemented |
| `audit_log` | dead-unused | none (never written; new audit_event is the successor) | by-design-not-migrated |
| `balance_sheet` | dead-unused | none (report computed on the fly) | by-design-not-migrated |
| `cash_deposit_disbursement` | live | credit_application rows | staged+transformed |
| `ci_sessions` | dead-unused | none (framework sessions) | by-design-not-migrated |
| `creditors` | historical-reference-only | kept in legacy_raw for audit only (FROZEN writer) | by-design-not-migrated |
| `customer_loyalty` | dead-unused | none (dead DDL; new loyalty foundation is feature-flagged OFF) | by-design-not-migrated |
| `customer_rewards` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `customer_segments` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `customer_tiers` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `customers` | live | customer (+ opening-balance docs) | staged+transformed |
| `debtors` | historical-reference-only | kept in legacy_raw for audit only (FROZEN writer) | by-design-not-migrated |
| `general_journal` | live | journal reference-only import (D8/D9) + opening TB evidence | staged+transformed |
| `invoice` | live | invoice + lines (+ Opening-balance/Deposit classifications) | staged+transformed |
| `invoice_code` | live | document_sequence booklet import | staged+transformed |
| `item_category` | live | product_category (child) | staged+transformed |
| `item_locations` | dead-unused | none (dead DDL, multi-shop design) | by-design-not-migrated |
| `item_main_category` | live | product_category (parent) | staged+transformed |
| `items` | live | product + product_unit + opening stock count | staged+transformed |
| `items_in_units_order` | live | unit-sale line evidence; folded into order lines | mapped-not-implemented |
| `items_prices` | live | price_list_item (customer-specific package prices) | mapped-not-implemented |
| `items_transfers` | live | transfer_order with receiver evidence | mapped-not-implemented |
| `items_units_prices` | live | price_list_item per unit (dedupe on latest) | mapped-not-implemented |
| `kpi_snapshots` | dead-unused | none (dead DDL; new kpi_snapshot is the successor) | by-design-not-migrated |
| `language` | dead-unused | none (school i18n) | by-design-not-migrated |
| `loyalty_points` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `loyalty_settings` | dead-unused | none (dead DDL; never read by live code) | by-design-not-migrated |
| `loyalty_transactions` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `message` | dead-unused | none (school messaging) | by-design-not-migrated |
| `noticeboard` | dead-unused | none (school notices) | by-design-not-migrated |
| `outstanding_debts` | live | outstanding_debt documents (allocated account) | mapped-not-implemented |
| `packages` | live | folded into unit (package types) | mapped-not-implemented |
| `payment` | live | payment + payment_tender (+ dedupe D2 handling) | staged+transformed |
| `payment_with_goods` | live | mirror verified per so_code; orders imported from sales_order | staged+transformed |
| `permissions` | dead-unused | none (dead DDL; new RBAC catalog is the successor) | by-design-not-migrated |
| `prices` | dead-unused | none (school-era item1..28 matrix) | by-design-not-migrated |
| `proforma_invoice` | live | quotation headers | staged+transformed |
| `proforma_invoice_order` | live | quotation lines | staged+transformed |
| `purchase_order` | live | purchase_order + lines + collapsed GRN/invoice (legacy semantics) | staged+transformed |
| `refund_transactions` | dead-unused | none (dead DDL; new refund engine is the successor) | staged+verify-only(0020) |
| `return_reasons` | dead-unused | none (dead DDL; seeded new return_reason policy instead) | staged+verify-only(0020) |
| `returns_audit_trail` | dead-unused | none (dead DDL; new audit_event is the successor) | staged+verify-only(0020) |
| `role_permissions` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `roles` | dead-unused | none (dead DDL; new roles in RBAC catalog) | by-design-not-migrated |
| `sales_order` | live | sales_order + lines + invoice + receipts + open-SO carryover | staged+transformed |
| `sales_return_items` | dead-unused | none (dead DDL; new return_order_line is the successor) | staged+verify-only(0020) |
| `sales_returns` | dead-unused | none (dead DDL; new return_order is the successor) | staged+verify-only(0020) |
| `sales_targets` | dead-unused | none (dead DDL; new kpi_target is the successor) | by-design-not-migrated |
| `settings` | live | tenant/sequence config; SMS creds → vault (never Git) | mapped-not-implemented |
| `shelves` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `shop_attendants` | dead-unused | none (dead DDL) | by-design-not-migrated |
| `shops` | dead-unused | none (dead DDL — multi-branch is target-only) | by-design-not-migrated |
| `stock_manager` | live | informs the opening-stock count baseline (never a rebuild source) | mapped-not-implemented |
| `stock_record` | ambiguous | not migrated (purchase-side partial ledger; q_sold never written) | by-design-not-migrated |
| `store_credits` | dead-unused | none (dead DDL; new store_credit instrument is the successor) | staged+verify-only(0020) |
| `suppliers` | live | supplier (+ opening-balance docs) | staged+transformed |
| `unit_transfer` | live | folded into the opening stock count (base units) | mapped-not-implemented |
| `units` | live | unit | staged+transformed |
| `units_items` | live | product_unit (conversion factor + default unit price) | staged+transformed |
| `visitor_tracker` | dead-unused | none (page-view tracker) | by-design-not-migrated |
| `waybill_code` | live | document_sequence booklet import (waybill) | staged+transformed |

Counts: **32 live · 2 historical-reference-only · 30 dead-unused · 2 ambiguous**.
Engine coverage: **20 staged+transformed · 6 staged+verify-only (0020) · 12
mapped-not-implemented · 28 by-design-not-migrated**.

### The 12 mapped-but-not-implemented tables (cutover-time work, tracked in issue #9)

`admin` (user import), `account_type`, `attendance`, `items_in_units_order`,
`items_prices`, `items_transfers`, `items_units_prices`, `outstanding_debts`,
`packages`, `settings`, `stock_manager`, `unit_transfer`.

Each has a documented target in
[legacy-to-postgres-map.md](legacy-to-postgres-map.md); none is imported by
the current transforms. They are **not data-loss risks by omission** — the
register makes them explicit, and the cutover runbook requires their
transforms (or an owner-signed waiver per table) before a real-client
migration rehearsal. `stock_manager` in particular only informs the
opening-stock baseline (physical count is the authority).

## 4. Type-risk register (unchanged by the new dump, see map §5)

- `double` money everywhere → `numeric(18,4)` half-even with per-value
  correction records.
- `longtext` dates/quantities → strict parse, unparsable quarantined.
- Duplicated order-level totals per line (R14) → group-by doc code,
  first-row-wins + divergence records.
- `sales_order` + `payment_with_goods` dual tables → row-set equality check
  per `track_code`/`so_code`.
- Mixed semantics in `invoice` (sales / Opening-balance / Deposit-) →
  code-prefix classification during staging.
- Sign-convention balances (negative `amount_due` = credit) → explicit
  documents, not conventions.
- No foreign keys between financial tables → orphan detection + quarantine,
  never auto-drop.

## 5. What this schema does NOT prove (truth statement)

The uploaded `depot.sql` contains **zero INSERT/REPLACE statements**. This
verification therefore claims **schema-level** equivalence and engine
readiness only. It does **not** claim:

- that any customer, stock, AR/AP, payment or GL row was ever migrated;
- that legacy stored values are correct (the correction-aware reconciliation
  exists precisely because they provably are not — D1/R14/R8/D8/D9 fixtures);
- that a real-client migration rehearsal passed.

A real-client rehearsal requires a separately authorized, sanitized
**full-data** dump, an isolated staging environment (issue #10), source row
counts/checksums, correction sign-off queues, accountant tie-outs and
rollback evidence — per
[migration-reconciliation-strategy.md](migration-reconciliation-strategy.md).
Until then, every "migration PASS" in CI refers to the **synthetic fixture**.
