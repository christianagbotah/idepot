# Table-Business Map — Legacy MySQL, Table by Table

Verdict legend: **HOT** production workhorse · **WARM** active but small · **DEAD** no code references · **FROZEN** written historically, read today · **PARTIAL** written by dead/partial flows.

| Table | Rows (≈, from AUTO_INCREMENT) | Business meaning | Principal writers | Principal readers | Verdict / migration note |
|---|---|---|---|---|---|
| `account_type` | 5 | CoA types (1=asset/cash, 3=AR, 5=expense) | settings UI | reports filters | WARM |
| `accounts` | 16 | Chart of accounts; each row also = a payment method (cash/bank/MoMo/imprest) | settings UI, every posting flow | banking, reports, POS | HOT — `current_balance` untrustworthy (update_ables); `opening_balance` never read |
| `accounts_payable` | 1,230 | AP subledger per supplier per PO (incl. Opening-balance, LPAY) | purchase_order, payments, enter_payable, supplier | AP reports, pay flows | HOT |
| `accounts_used` | 0+ | Receipt→account breakdown (one-time backfill only; column mismatch) | populateAccountsUsedTable (dead) | receipt_pos | DEAD/stale — replace with payment tenders |
| `admin` | 26 | Users; `level` 1-4, `manager`, `block_limit`, bcrypt password, 5-char auth key | Admin::admins, Login | everywhere | HOT |
| `attendance` | 5,420 | Staff clock in/out (date, in/out timestamps, status) | Login, cron | attendance_list | WARM |
| `audit_log` | 0 | **Designed audit trail — never written or read** | none | none | DEAD — seed for new audit design |
| `balance_sheet` | 0 | Legacy BS storage | none | none | DEAD (report computed in view) |
| `cash_deposit_disbursement` | 5 | Deposit consumption ledger | negative-bal engine | statement/deposit logic | WARM — becomes credit applications |
| `ci_sessions` | — | CI sessions (+user_id col core doesn't set) | framework | — | infra |
| `creditors` | 14,203 | Daily creditor snapshot (customers/suppliers/debts) | **frozen** (writer commented out) | balance sheet, creditors report | FROZEN — reports show stale data |
| `customer_loyalty` | 0 | Loyalty profile per customer | none | none | DEAD DDL |
| `customer_rewards` | 0 | Reward vouchers | none | none | DEAD DDL |
| `customer_segments` | 5 | Segment definitions | none | none | DEAD DDL |
| `customer_tiers` | 5 | Loyalty tiers | none | none | DEAD DDL |
| `customers` | 4,904 | Customer master (guest flag, opening_balance, 3 opening-* FK columns, balance_due never written) | customer CRUD, POS | everywhere | HOT — `balance_due` vestigial |
| `debtors` | 46,709 | Daily debtor snapshot | **frozen** | balance sheet | FROZEN |
| `general_journal` | 171,002 | The GL — flat rows: journal type, account **name**, debit/credit, balance snapshot, doc codes | every posting flow | journals, TB, BS, bank enquiry | HOT — account_name not FK |
| `invoice` | 40,562 | AR documents incl. Opening-balance + Deposit- rows (negative = credit) | sales engines, payments, deposits | lists, statements, reports | HOT — mixed semantics |
| `invoice_code` | 11,023 | Pre-printed invoice booklet registry (open/closed/not used + reason) | generateInvoiceCodes, POS closure | POS verification | HOT |
| `item_category` | 58 | Sub-categories (main_id FK) | item_category CRUD | lists, reports | WARM |
| `item_locations` | 0 | Bin locations (item/shop/shelf/row/col, qty) | none | none | DEAD DDL (multi-shop design) |
| `item_main_category` | 7 | Main categories | CRUD | lists | WARM |
| `items` | 564 | Product master: selling/purchase price, quantity (packages), unit_quantity, item_sold_in_units, package_id, shop_id (unused) | item CRUD, PO, sales, transfers | everywhere | HOT |
| `items_in_units_order` | 466 | Unit-sale lines (qty, unit price, total, unit_balance snapshot) | sales engines | backlog/margin reports | WARM |
| `items_prices` | 14,892 | Customer-specific package prices (unique item+customer) | pricing, sales backfill | price resolution | HOT |
| `items_transfers` | 857 | Stock transfer lines (token_no, free-text receiver, qty, item_balance, journal ids) | items_transfer CRUD | transfer reports | WARM |
| `items_units_prices` | 557 | Customer-specific unit prices (unique key omits unit_id — defect) | pricing, item edit | price resolution | WARM |
| `kpi_snapshots` | 0 | Daily KPI snapshot | none | none | DEAD DDL |
| `language` | — | i18n phrases (school) | none | dead helper | DEAD |
| `loyalty_points` | 0 | Points balances | none | none | DEAD DDL |
| `loyalty_settings` | 1 | Loyalty config | none | none | DEAD DDL |
| `loyalty_transactions` | 0 | Points ledger | none | none | DEAD DDL |
| `message` | — | School messaging | dead code | dead code | DEAD |
| `noticeboard` | — | School notices | dead Home/calendar | calendar.php | DEAD (school) |
| `outstanding_debts` | — | Other payables: loans/TNT/expenditure debts (alloc_acc_id) | enter_payable, payments (de_) | AP/AR reports, BS, cash flow | WARM |
| `packages` | 4 | Package type list | settings-ish | item UI | WARM |
| `payment` | 42,850 | Payment rows (one per receipt×account): type, method fields (cheque/momo), tendered/change, category, cash_sales_in_payables | POS checkout, payments_received, payments, deposits | receipt lists, reports | HOT — `momo_type`/`method` never written |
| `payment_with_goods` | 49,841 | Mirror of sales_order used by lists & picking: quantity_picked/due, waybill_code, negative_or_goods, cost_price snapshot | sales engines, picking | order lists, margin reports, is_creditor | HOT — dual-table design to unify |
| `permissions` | 17 | RBAC permission list (seeded) | none | none | DEAD DDL |
| `prices` | 3,476 | School-era item1..item28 price matrix | none (commented) | none | DEAD |
| `proforma_invoice` | 4 | Quotation headers | create_proforma_invoice | print | WARM |
| `proforma_invoice_order` | 13 | Quotation lines | create_proforma_invoice | print | WARM |
| `purchase_order` | 2,168 | PO lines (duplicated totals; item_balance snapshot) | purchase_order CRUD | PO reports, AP | HOT |
| `refund_transactions` | 0 | Refund documents (designed) | none | none | DEAD DDL — seed for new module |
| `return_reasons` | 16 | Return reason list (designed) | none | none | DEAD DDL |
| `returns_audit_trail` | 0 | Returns audit (designed) | none | none | DEAD DDL |
| `role_permissions` | — | Role↔permission map | none | none | DEAD DDL |
| `roles` | 4 | Role list (seeded) | none | none | DEAD DDL |
| `sales_order` | 45,410 | Sales order lines (duplicated totals, statuses, tax columns unused, quantity_picked/due, item_balance) | sales engines | invoice print, statements, weekly margin | HOT |
| `sales_return_items` | 0 | Return lines (designed) | none | none | DEAD DDL |
| `sales_returns` | 0 | Return headers (designed) | none | none | DEAD DDL |
| `sales_targets` | 0 | Sales targets | none | none | DEAD DDL |
| `settings` | 63 | Key/value config (company, prefixes, currency, SMS creds, skin) | settings UIs | everywhere | HOT — secrets stored here |
| `shelves` | — | Shelf registry (multi-shop design) | none | none | DEAD DDL |
| `shop_attendants` | 0 | Shop↔admin assignments | none | none | DEAD DDL |
| `shops` | 3 | Shop/branch registry | none | none | DEAD DDL — multi-branch is target-only |
| `stock_manager` | 842,432 | Per-(user,item,day) stock sheet: opening/stock_in/closing | login, cron, PO, item CRUD, SO delete | daily stock, backlog, inventory, transfer valuation | HOT — cross-user contamination |
| `stock_record` | 1,279 | Purchase-side ledger (q_bought bigint; q_sold never written) | PO flows | (item history purchase dates) | PARTIAL/dead — not a rebuild source |
| `store_credits` | 0 | Store credit documents (designed) | none | none | DEAD DDL |
| `suppliers` | 44 | Supplier master (opening_balance → AP row) | supplier CRUD | everywhere | WARM |
| `unit_transfer` | 81 | Package↔unit breakout ledger | sales engines (unit path) | unit balance sync | WARM |
| `units` | 5 | Unit list (piece, yard, ton…) | settings-ish | unit UI | WARM |
| `units_items` | 66 | Per item+unit: unit_total (units per package) + default unit price | addItemUnits | price resolution, conversions | WARM |
| `visitor_tracker` | 3,595 | Page-view tracker (Iptracker library) | Iptracker (autoload) | none | infra/dead |
| `waybill_code` | 893 | Waybill booklet registry (same lifecycle as invoice_code; same-day customer reuse) | generateWaybillCodes, picking | verification | HOT |

## Key schema-level risks carried into migration

1. **No foreign keys** between financial tables (only indexes) — orphans possible and must be detected, not assumed away.
2. **`longtext` dates and `double` money** on all hot tables (see per-table notes) — normalization required with reported rounding.
3. **Duplicated order-level totals per line** — aggregation rules must always `GROUP BY` doc code and take header values from one row.
4. **Dual sales tables** (`sales_order` + `payment_with_goods` written together) — migration must verify row-set equality per `track_code`/so_code and report mismatches.
5. **Mixed semantics in `invoice`** (sales invoices, opening balances, deposits-as-negative-credit) — classify by code prefixes during staging.
6. **Sign-convention balances** (negative amount_due = credit) — preserved as documents in the new model, not as conventions.
