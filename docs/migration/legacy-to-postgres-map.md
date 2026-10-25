# Legacy MySQL → PostgreSQL Mapping

Column-level mapping for the migration toolchain. Direction: legacy table → staging (`legacy_raw`) → target entity. Rules: master data before transactions; `legacy_table` + `legacy_id` preserved on every row (in `migration_map` and/or on the entity); original document codes preserved verbatim; no destructive normalization without a reconciliation diff.

## 1. Master data

| Legacy | Target | Mapping notes |
|---|---|---|
| `admin` | `app_user` (+ `user_role` seed by `level`: 1→Platform/Owner-Admin, 2→Administrator, 3→Cashier, 4→Shop Attendant; `manager=1` → add Sales Manager role) | passwords re-set via forced reset on first login (bcrypt hashes portable but policy requires rotation); `authentication_key` dropped; `block_limit` → status; `active_status`/`welcome_shown_date`/`read_notice_ids` dropped |
| `customers` | `customer` (+ `customer_opening_balance` doc per mechanism below) | `guest` → is_guest; `balance_due` ignored (never written); `opening_accounts_*_id`/`opening_so_code`/`debtor_opening_so_code` used to locate opening docs (see §4) |
| `suppliers` | `supplier` (+ `supplier_opening_balance`) | sign convention preserved inside the document |
| `item_main_category` + `item_category` | `product_category` (parent_id two-level) | |
| `items` | `product` + `product_unit` (implicit base unit "package") + `product_barcode` (from name/price_column if any) | `quantity`/`unit_quantity` → **opening stock count document** (see §5), NOT direct balance write; `item_sold_in_units` → sale-unit set; `package_id` → default sale unit; `shop_id` dropped (unwired) |
| `units` + `units_items` | `unit` + `product_unit` (`unit_total` → conversion_factor to base) | |
| `packages` | folded into `unit` (package types) | |
| `items_prices` | `price_list_item` (customer-specific list) | dedupe on (item, customer) — take latest `updated_date`; missing-customer_id rows (backfill bug R15) → quarantine report |
| `items_units_prices` | `price_list_item` per unit | unique-key defect: keep latest per (item, customer, unit); report dropped duplicates |
| `accounts` | `account` (CoA) + payment-method mapping on tenders | `account_is_bank`/`account_is_transferrable` → flags; `current_balance` **not migrated as truth** (D3) — opening balance = reconciled subledger figure; `opening_balance` recorded as legacy reference |
| `account_type` | enum on `account` | 1=asset/cash-bank, 3=AR (verify 2/4/5 semantics from data during staging) |
| `settings` | `tenant`/`branch` config + template/sequence config | prefixes (`so_prefix`…`) → `document_sequence`; SMS creds → vault; `running_year/term`, skin, school keys dropped |
| `invoice_code` / `waybill_code` | `document_sequence` booklet import (`legacy booklet` mode) | status preserved (open/closed/not used + reason); codes kept unique in legacy namespace |

## 2. Sales documents

| Legacy | Target | Mapping notes |
|---|---|---|
| `sales_order` + `payment_with_goods` (per so_code) | `sales_order` header (one per so_code; header fields from any row — verify all rows equal per R14 and diff otherwise) + `sales_order_line` per row | `quantity`→ordered qty (transacted unit), `quantity_picked`→fulfilled; `order_item_has_unit_sales` → unit binding; `bundle_quantity/price` → unit qty/price for bundle unit; `cost_price` → cost_at_sale; `item_balance` dropped (ledger rebuilds); `vat_*` columns are always 0/unused → recorded in migration report, no tax lines synthesized |
| `invoice` (type sales) | `invoice` + lines (rebuilt from SO rows) | `amount`/`amount_paid`/`amount_due` recomputed from allocations; legacy values compared → diff report; `status` normalized to enum incl. 'Over Paid'→paid+credit |
| `invoice` (`invoice_code='Opening-balance'`) | `customer_opening_balance` (cash) | sign preserved |
| `invoice` (`invoice_code LIKE 'Deposit-%'`) | `customer_credit` (deposit) + applications | |
| `invoice` (LPAY negative rows) | `customer_credit` (manual credit) or `customer_opening_balance` (negative) per flow | |
| `proforma_invoice` + `proforma_invoice_order` | `quotation` + lines | |
| `cash_deposit_disbursement` | `credit_application` | |
| `debtors`/`creditors` | **not migrated** (frozen snapshots) | kept in legacy_raw for audit reference only |
| `prices`, `balance_sheet`, `stock_record`, `visitor_tracker`, `message`, `noticeboard`, `language` + all DEAD-DDL tables (returns/loyalty/roles/shops/kpi/audit_log…) | **not migrated** | schema dead weight per [dead-code-register.md](../legacy-audit/dead-code-register.md) |

## 3. Purchasing & payments

| Legacy | Target | Mapping notes |
|---|---|---|
| `purchase_order` (per po_code) | `purchase_order` header + lines; **each line also becomes a GRN + supplier_invoice line dated at PO date** (stock+AP hit at PO save — legacy semantics) with a migration note; payments → `payment` + `payable_allocation` | `'Opening-or…'` POs → opening stock documents instead |
| `accounts_payable` | `supplier_invoice`/`outstanding_debt` documents + allocations | `po_code='Opening-balance'` → supplier opening balance; `LPAY-` → manual payable doc; sign preserved |
| `outstanding_debts` | `outstanding_debt` docs (allocated account) | |
| `payment` | `payment` + `payment_tender` (one tender per row; method fields mapped: cheque → tender details; momo → provider inferred from account name where possible, reference from `momo_phone/transaction_id`) | `payment_type` → direction+kind; `category` → reporting tags; `cash_sales_in_payables` → analysis tag; receipt_code preserved as legacy receipt no (new sequence for new receipts); duplicate receipt_code (D2) → dedupe report + suffix disambiguation |
| `general_journal` | `journal_entry`/`journal_line` — **replayed only as legacy reference**; the new GL opens with opening balances (see strategy doc) | account_name → account id via name map; unmatched names → quarantine |
| `stock_manager` | not migrated as data; last state informs the **opening stock count baseline** (see §5) | |
| `items_transfers` | `transfer_order` (token_no → doc) with receiver → staff/location text note | GL quantity rows dropped |
| `unit_transfer`, `items_in_units_order` | opening unit-pool state folded into the opening stock count (base units) | |
| `attendance` | `shift`/attendance history import (optional, tenant choice) | |
| `ci_sessions` | dropped | |

## 4. Opening balances (the critical rules)

1. **Customer AR opening** = `Σ invoice.amount_due > 0` per customer (legacy derivation, [ar-ap-lifecycle.md](../legacy-audit/ar-ap-lifecycle.md) §3) — imported as one `customer_opening_balance` document per customer with the invoice-level breakdown attached (legacy invoice rows kept as subledagement reference).
2. **Customer credit (cash creditor)** = `abs(Σ invoice.amount_due < 0)` → `customer_credit` documents.
3. **Goods owed to customers** (paid, undelivered) = per open SO, `Σ price × quantity_due` → open `sales_order` with remaining fulfillment (orders imported as `confirmed/partially_fulfilled` with pick state = `quantity_picked`).
4. **Supplier AP opening** = `Σ accounts_payable.amount_due > 0` per supplier → `supplier_opening_balance` (+ supplier credit for negatives).
5. **Stock opening** = physical count at cutover reconciled against `items.quantity`/`items.unit_quantity` (see strategy doc §freeze); differences → adjustment documents with reasons (not silent overrides).
6. **GL opening** = trial balance built from 1-5 + cash/bank account reconciled balances + inventory value; equity plug documented as "opening equity" (legacy had no capital accounts — client accountant confirms distribution during pilot).

## 5. Type & normalization rules

| Legacy type | PostgreSQL type | Rule |
|---|---|---|
| `double` money | `numeric(18,4)` | round-half-even at 4dp; every changed value logged in rounding report |
| `longtext` dates (d-m-Y strings) | `date` | parse strictly; unparsable → quarantine (report shows raw) |
| `longtext` timestamps (unix strings) | `timestamptz` (UTC) | epoch seconds → UTC; **legacy stored Africa/Accra wall-clock epochs — verify offsets on sampled rows** |
| `float` quantities | `numeric(18,6)` | |
| `bigint` quantities (stock_record) | not migrated | |
| free-text statuses | enums | mapping table (Unpaid/Partially Paid/Paid/Over Paid/…); unknown values → quarantine |
| `tinytext/mediumtext/longtext` codes | `varchar` + FK/unique | preserved verbatim; legacy namespace for uniqueness |
| `enum('0','1')` flags | boolean | |
| `momo_type` | tender provider field | always NULL in legacy (never written) — provider inferred from account name; unknown → 'unknown' |

## 6. Character/encoding

Legacy mixes `utf8mb3`/`utf8mb4`/`latin1` tables (schema header). Pipeline: load dump bytes → normalize to UTF-8 (latin1 tables transcoded), strip BOMs/control chars, NFC-normalize; mojibake heuristics reported (e.g. `â€` sequences) for manual confirmation list.

## 7. Sequencing & referential checks before transform

- Orphan detection: payment.invoice_id without invoice; invoice.customer_id without customer; SO.item_id without item (items were deleted historically — `delete_item` left orphan docs, [stock-movement-map.md](../legacy-audit/stock-movement-map.md) §7) → quarantine + report (never auto-drop).
- Dual-table consistency: per so_code, `sales_order` row-set vs `payment_with_goods` row-set (they are written together — mismatches indicate crashed writes, D4) → diff report.
- Header-field consistency: per so_code/po_code all rows must agree on grand_total/amount_paid/amount_due/status (R14) → first-row-wins + diff report.
- D1 detection: receipts with >1 distinct account where `invoice.amount_paid > Σ payment.amount` → corrected import uses payment rows as truth.

## 8. Entity the migration must NOT invent

- No tax lines (legacy computed none) — tax starts accruing post-cutover under the new engine.
- No returns/credit notes for historical edited orders — they import as the final state (see [returns-refund-credit.md](../legacy-audit/returns-refund-credit.md) §4).
- No stock movement history — ledger starts at cutover baseline; legacy history remains queryable in `legacy_raw` for audit.
