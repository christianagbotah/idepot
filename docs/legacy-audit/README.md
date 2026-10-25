# Phase 0 — Legacy iDepot Forensic Audit

**Status:** Complete (Phase 0) · **Evidence base:** `legacy/source/` (382 PHP files, `Admin.php` = 26,024 lines / 165 functions), `legacy/schema/legacy_mysql_schema.sql` (66 tables) · **Branch:** `phase-0/forensic-audit`

## Purpose

This directory is the verified business-rule map and migration baseline demanded by `ZAI_IDEPOT_MODERNIZATION_MASTER_PROMPT.md` §20 (Phase 0) before any new production module is built. Every claim below is grounded in a `file:line` citation into the sanitized legacy snapshot. Nothing here is inferred from filenames alone; where a behavior could not be traced to code, it is marked **uncertain** rather than guessed.

## How the audit was performed

1. **Structural census** — routes (`config/routes.php`: convention routing, default controller `login`), entry point (`index.php`: `date_default_timezone_set('Africa/Accra')`, app folder `_al01i`, views `v_l02i`), controller/model/helper line counts, and the complete function inventory of `Admin.php` (165 functions extracted with line numbers).
2. **Schema census** — all 66 tables classified by live usage (hot production tables vs. dead/never-wired DDL), column types (money as `double`, dates as `longtext`, statuses as free text), and `AUTO_INCREMENT` counters as volume evidence (e.g. `general_journal` ≈ 171k rows, `stock_manager` ≈ 842k rows, `payment_with_goods` ≈ 49.8k rows).
3. **Domain deep-dives** — five parallel forensic passes over (a) sales/POS lifecycle, (b) payments/banking/accounting/financial statements, (c) inventory/purchasing/transfers/units/stock reports, (d) customers/suppliers/AR-AP/returns/negative balances, (e) auth/RBAC/settings/integrations/navigation/view classification.
4. **Cross-referencing** — every view was matched to its loader (`Admin::<method>` / `Modal::popup_*`), every controller method to its model calls, every write path to its tables. Dead references (views posting to non-existent methods, tables with no writer, writers for views that never load) were each verified by repository-wide search.
5. **Spot verification** — headline findings (no `trans_start` anywhere, `clock_in_out` missing from `Admin.php`, `update_ables` at line 24775, bcrypt on web login) were re-verified directly before being recorded.

## Document index

| # | Document | Covers |
|---|----------|--------|
| 1 | [01-module-inventory.md](01-module-inventory.md) | Complete functionality/module inventory |
| 2 | [view-classification.md](view-classification.md) | View-by-view classification (active/dead/duplicate; iDepot relevance) |
| 3 | [controller-model-map.md](controller-model-map.md) | Route → controller → model → view → tables cross-reference |
| 4 | [table-business-map.md](table-business-map.md) | Table-by-table business meaning, writers, readers, verdict |
| 5 | [business-rules.md](business-rules.md) | Business-rules catalogue (status models, codes, policies) |
| 6 | [calculation-register.md](calculation-register.md) | Every formula found, with intent, defects and corrected rule |
| 7 | [sales-pos-lifecycle.md](sales-pos-lifecycle.md) | Sales/POS lifecycle map (all five order variants) |
| 8 | [purchasing-lifecycle.md](purchasing-lifecycle.md) | Purchase/procurement lifecycle map |
| 9 | [stock-movement-map.md](stock-movement-map.md) | Inventory/stock movement map |
| 10 | [accounting-transaction-flow.md](accounting-transaction-flow.md) | Accounting transaction-flow map & chart of accounts |
| 11 | [payment-transaction-map.md](payment-transaction-map.md) | Payment, cash/bank/MoMo transaction map |
| 12 | [ar-ap-lifecycle.md](ar-ap-lifecycle.md) | Customer/supplier/AR/AP lifecycle map |
| 13 | [returns-refund-credit.md](returns-refund-credit.md) | Refund/return/store-credit workflow map |
| 14 | [unit-conversion-rules.md](unit-conversion-rules.md) | Package/unit conversion rules |
| 15 | [document-numbering.md](document-numbering.md) | Invoice/receipt/waybill/SO/PO numbering rules |
| 16 | [rbac-analysis.md](rbac-analysis.md) | User/role/permission analysis (as-built) |
| 17 | [reports-kpi-inventory.md](reports-kpi-inventory.md) | Reports and KPI inventory |
| 18 | [integration-inventory.md](integration-inventory.md) | Integration inventory (Hubtel, Stripe, PayPal, barcode, etc.) |
| 19 | [dead-code-register.md](dead-code-register.md) | Duplicate/obsolete/dead/school-management code register |
| 20 | [defects-and-risks.md](defects-and-risks.md) | Known & suspected incorrect calculations/business logic |

Companion documents outside this directory:

- Architecture: `docs/architecture/` — target system context, domain model, offline-sync, POS hardware, mobile apps, AI opportunity map, security & RBAC design.
- Migration: `docs/migration/` — legacy MySQL → PostgreSQL mapping and client migration/reconciliation strategy.
- `docs/ROADMAP.md` — phased implementation roadmap.
- `docs/STATUS.md` — living phase status board.

## Headline findings (executive summary)

1. **The system is a single 26k-line controller** (`Admin.php`) with duplicated money paths (`sales_order_pos` vs dead `sales_order_pos_alterated`; `payments_received` vs dead `payments_received_backup`) — the largest maintainability and correctness hazard in the codebase.
2. **No database transactions anywhere** — zero `trans_start()` occurrences; every posting is dozens of sequential autocommit statements across 5–8 tables. A crash mid-sale leaves permanent ledger corruption.
3. **Money is `double` everywhere** in live tables, mutated via string-concatenated SQL (`set('current_balance', 'current_balance + ' . $x, FALSE)`) fed from raw `$_POST`.
4. **Control accounts are periodically overwritten from the browser** (`update_ables`, `Admin.php:24775-24817`, called by POS page JS) — accounting balances are a function of whichever POS page last loaded, not of the ledger.
5. **The balance sheet reads frozen snapshot tables** (`debtors`/`creditors`) whose only writer (`debtorsCreditorsUpdator`, `Admin.php:1198-1468`) is 100% commented out.
6. **~70 `Admin.php` endpoints have no authentication check**, including financial writes (`update_ables`, `delete_creditors`, `batchPriceUpdate`, `generateInvoiceCodes`), and every `Modal::popup_*` view server is unauthenticated.
7. **A whole designed returns/loyalty/RBAC/multi-shop schema generation exists only as dead DDL** (`sales_returns`, `refund_transactions`, `store_credits`, `roles`, `permissions`, `shops`, `shelves`, `loyalty_*`, `kpi_snapshots`, `audit_log` …) — never referenced by any code.
8. **Tax columns exist but no tax is ever computed** (`sales_order.vat_amount`…`tax_inclusive`, schema:947-952 — zero code references).
9. **Document integrity is race-prone**: invoice/waybill codes come from a pre-printed booklet table with no locking (`Crud_model.php:3126-3157`); receipt codes are second-resolution timestamps (`'DP1REC-'.YmdHis`).
10. **Refunds are destructive in-place order edits** with a hardcoded SO code in the only refund UI (`pages/sales/refund_sales_order.php:2`) and an unreachable `$param4` branch (`Admin.php:10075`).

## Rules of engagement for the rebuild

- Treat this audit as the **authoritative business-rule baseline**; new modules must preserve every rule marked *preserve* in [business-rules.md](business-rules.md) and every calculation marked *correct* in [calculation-register.md].
- Rules marked *defective* must be re-implemented per the corrected rule recorded there, with a migration/reconciliation note for existing client data.
- Never port the PHP architecture (god controller, denormalized per-row totals, mutable financial history, browser-computed accounting). The target architecture is defined in `docs/architecture/`.
