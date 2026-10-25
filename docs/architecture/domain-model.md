# Domain Model — Target PostgreSQL Conceptual Design

Conceptual model derived from the legacy audit (not a 1:1 rename). Naming is snake_case in PG. Full DDL lands in Phase 1-2 migrations; this document fixes concepts, keys and invariants.

## 1. Tenancy & organization

- `tenant` — business (Ghana company), `timezone` default `Africa/Accra`, `currency` default `GHS`.
- `branch` (depot) → `warehouse` / `shop` (locations; the legacy `shops/shelves/item_locations` DDL was never wired — revived properly) → `bin_location` (optional shelf/row/col).
- `staff_assignment` — user ↔ branch/shop roles (replaces `shop_attendants` design).

## 2. Identity & access

- `app_user` (Argon2id password, TOTP optional, status), `role` (tenant-composable), `permission` (granular catalog), `role_permission`, `user_role` **with scope** (tenant/branch/warehouse/shop/salesperson).
- `device` (registered POS terminals/phones; key fingerprint, last sync cursor), `cashier_shift` (open float, cash in/out, counted, variance, approvals) — replaces `stock_manager`'s per-day sheet intent and adds true drawer sessions.

## 3. Catalog & units

- `product` (SKU, barcode(s) via `product_barcode`, base unit, `item_sold_in_units` equivalent = sale-unit set), `product_category` (two-level preserved: main + sub via `parent_id`).
- `unit` + `product_unit` (unit per product: `conversion_factor` to base, purchase/sale flags, default price) — generalizes `units_items.unit_total` and the ton/bundle special case (`order_item_has_unit_sales='2'`).
- `price_list` → `price_list_item` (product, unit, price, effective_from/to) with `customer`/`segment` assignment — replaces `items_prices`, `items_units_prices` (and the dead `prices` matrix). Deterministic resolution: customer-specific → segment → list default → product default.

## 4. Inventory

- `stock_movement` (append-only): movement id, product, location, **qty in base units (signed, numeric)**, reason enum (`purchase_receipt, sale, sale_return, transfer_out/in, adjustment, count, damage, unit_break/merge, opening`), source doc polymorphic FK, movement seq per (product, location) for gap detection.
- `stock_balance` (cache): product × location on-hand, rebuildable — **invariant: `balance ≡ Σ movements`**.
- `stock_count` + `count_line` (cycle counts with counted vs expected, variance approval) and `stock_adjustment` (reason, approver) — replaces silent `items.quantity` mutations.
- `transfer_order` + lines (from/to locations, in-transit state, receiver = staff, not free text; no GL postings).
- Cost basis: `product_cost_layer` optional FIFO; AVCO default (`moving_cost` on product). Sale lines record `cost_at_sale` — preserves legacy reporting intent with a defensible basis.

## 5. Parties & credit

- `customer` (phone-first, email optional, guest flag, active), `supplier`; addresses; `credit_term`/`credit_limit` (new).
- `customer_opening_balance` / `supplier_opening_balance` documents (replaces the three legacy opening mechanisms incl. goods-creditor/debtor opening SOs — modelled as **opening documents** with lines, not fake sales).
- Aging derived from documents (no stored buckets).

## 6. Sales & fulfillment

- `quotation` (proforma) header + lines (from legacy proforma tables).
- `sales_order` header (customer, branch, salesperson, dates, status enum, order_discount, totals) + `sales_order_line` (product, unit, qty in transacted unit, **qty in base units**, unit price resolved from price list, line net, tax lines). **No per-line order totals.**
- State machine: `draft → held → confirmed → picking → picked → dispatched → invoiced → part_paid/paid/overpaid → partially_returned/returned → closed | voided` with guarded, tested transitions.
- `fulfillment` (delivery) header + lines referencing order lines: picked qty, waybill code (from `document_sequence`), picked_by, timestamps — replaces `payment_with_goods` picking semantics; waybill same-day-per-customer reuse becomes a configurable allocation policy.
- `invoice` (AR document) + lines + tax lines; `credit_note`; `payment_allocation` (payment ↔ invoice/credit-note) — explicit, replacing implicit FIFO-at-read.

## 7. Purchasing

- `purchase_order` header + lines (ordered qty/status per line), `goods_receipt` (GRN) + lines (received qty, bin, variance vs PO), `supplier_invoice` + lines (matched to GRN/PO — 3-way match), `debit_note` (returns to supplier — new capability), `payable_allocation`.
- `outstanding_debt` (loans/other payables with allocated account) — preserved from `outstanding_debts`.

## 8. Payments, credit & refunds

- `payment` header (direction in/out, method breakdown via `payment_tender`: cash/bank/cheque/**momo(provider, phone, reference)**/customer-credit/imprest, tendered/change, receipt number from sequence, shift FK) + `payment_allocation` rows.
- `customer_credit` (deposits/unapplied cash/refund credits) with `credit_application` rows — replaces negative-invoice credit conventions and `cash_deposit_disbursement`.
- `refund` (references original payment where possible; method; account) linked to returns.
- `bank_account` mapping to CoA; `account_transfer` (no payment rows — but transfer-aware reporting); `bank_reconciliation` + statement import + matching (new).

## 9. Accounting

- `account` (CoA, FK-safe renames via id, `account_type` enum, effective-dated), `accounting_period` (open/closed/locked).
- `journal_entry` (header: date, period, source doc, posted_by, status posted/voided; **CHECK Σ debit = Σ credit** enforced by trigger/constraint on `journal_line`) + `journal_line` (account FK, debit, credit numeric).
- Posting engine maps domain events → entries: sale (Dr AR / Cr Revenue + tax lines), receipt (Dr cash-account / Cr AR), GRN (Dr Inventory or Purchases / Cr AP), supplier invoice, refund reversals, COGS (Dr COGS / Cr Inventory at sale), deposits (Dr cash / Cr customer credit liability), expense (Dr expense / Cr cash), transfer, return (inverse postings per disposition).
- Derived statements: trial balance, balance sheet (with real equity accounts + period close), P&L (accrual, COGS from stock ledger), cash flow (direct) — all computed from documents/ledger, property-tested.

## 10. Tax

- `tax_definition` (component: VAT/NHIL/GETFund/levy), `tax_rate` (effective-dated, inclusive/exclusive flag), `tax_line` on invoice/credit-note. Nothing hardcoded; deployment-time configuration authoritative (master prompt §8).

## 11. Documents & numbering

- `document_sequence` (tenant, branch, doc type, period, prefix, next value) with atomic allocation; `legacy_document_import` mode honoring pre-printed booklets (`invoice_code`/`waybill_code` registries migrate in, uniqueness preserved in legacy namespace).

## 12. Audit, sync, migration, AI

- `audit_event` (append-only; actor, action, entity, before/after JSONB, request id, device) — revives the dead `audit_log` design.
- `outbox` / `inbox`, `change_feed` (entity, seq, tenant/branch scope), `sync_cursor` per device, `idempotency_key` registry — see [offline-sync.md](offline-sync.md).
- `legacy_raw.*` staging schema + `migration_map` (legacy_table, legacy_id → entity) + `reconciliation_run`/`reconciliation_diff` — see migration docs.
- `ai_model_run`, `ai_prediction`, `ai_alert`, `ai_feedback` (tenant-isolated, versioned) — see [ai-opportunity-map.md](ai-opportunity-map.md).

## 13. ER summary (textual)

```
tenant ──< branch ──< warehouse/shop ──< bin_location
app_user >── user_role(scope) ──> role ──< role_permission >── permission
device ──< cashier_shift
product >──< product_unit >── unit ; product ──< product_barcode
price_list ──< price_list_item ──> product/unit ; customer/segment assignments
product/warehouse ──< stock_movement (append-only) ──> stock_balance
customer/supplier ──< orders/invoices/payments/credits/returns
sales_order ──< line ──< fulfillment_line ; invoice ──< line/tax_line
purchase_order ──< goods_receipt ──< supplier_invoice (3-way match)
payment ──< payment_tender ; payment ──< payment_allocation >── invoice/credit_note
journal_entry ──< journal_line >── account (ΣD=ΣC enforced)
document_sequence ; audit_event ; change_feed/outbox ; legacy_raw + migration_map
```

## 14. Mapping to legacy tables

Full column-level mapping lives in `docs/migration/legacy-to-postgres-map.md`.
