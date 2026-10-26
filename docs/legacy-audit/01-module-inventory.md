# 01 — Complete iDepot Functionality / Module Inventory

Evidence-based inventory of what the deployed legacy application **actually does today**. Every module is traced to its controller entry points and views. "Status" reflects the audit's findings, not the menu's claims: several menu items launch dead or broken flows.

## Module map

### 1. Authentication & session
| Capability | Entry | Status |
|---|---|---|
| Two-phase login (5-char auth key → email+password) | `login/auth_verification` (`Login.php:67`), `login/validate_login` (`Login.php:99-186`) | Active; bcrypt passwords (`Login.php:148`); no rate limiting; non-constant-time key compare |
| Password reset by email | `Login.php:285-318` (7-char md5-derived token, `:296`) | Active |
| Self block / status probe | `login/block_account` (`Login.php:72-87`) | Active but **unauthenticated DoS vector** |
| Logout | `Login.php:326-339` | Active |

### 2. Dashboard & global search
| Capability | Entry | Status |
|---|---|---|
| Role-agnostic dashboard with KPI cards | `admin/dashboard` (`Admin.php:554-572` → `pages/dashboard.php`) | Active; level-3 cashiers redirected to POS |
| Global search (items, customers, invoices) | `admin/search_results` (`Admin.php:78-103` → `pages/search_result.php`) | Active |
| Modern dashboard skin | `pages/modern-dashboard.php` via `modern-layout.php:104,116` | Dead (layout unreferenced by controllers) |

### 3. POS & sales orders (see [sales-pos-lifecycle.md](sales-pos-lifecycle.md))
| Capability | Entry | Status |
|---|---|---|
| Full-page POS shell (clock-in enforcement, item tiles, customer picker) | `admin/pos` (`Admin.php:24822` → `pages/pos/pos_page.php` + AJAX `get_main_page.php`) | Active |
| POS sale engine (create/update/delete) | `admin/sales_order_pos/create|update|delete` (`Admin.php:5760-7738`) | Active — the live money path |
| Dead POS fork | `admin/sales_order_pos_alterated/*` (`Admin.php:7743-9807`) | **Dead** (no view references) |
| "Add sales order" modal flow | `pages/sales/add_sales_order.php` → posts to **non-existent** `admin/sales_order/create` (`add_sales_order.php:176`) | Broken/dead |
| Goods picking/delivery with waybill ("payment with goods") | `admin/payment_with_goods/create` (`Admin.php:12291-13553`) | Active |
| Cash-creditor sales (spend customer credit on goods) | `admin/sales_order_negative_bal/create|update` (`Admin.php:10399-12287`) | Active |
| Proforma/quotation | `admin/create_proforma_invoice/create` (`Admin.php:5610-5756`) | Active (no stock/GL movement) |
| Refunds | `admin/sales_order_refund/create` (`Admin.php:9809-10396`) | **Broken** (writes non-existent columns `quantity_returned`/`amount_refunded`/`refund`, `Admin.php:9902-9930`; hardcoded SO code in UI `refund_sales_order.php:2`) |
| POS opening/closing stock summaries | `pages/pos/opening_stock_summary.php`, `closing_stock_summary.php` | Active (closing summary double-counts `stock_in_today`, `closing_stock_summary.php:46-47`) |
| Old POS skin | `pages/pos-old/*` (10 files) | Dead |

### 4. Invoices, receipts, payments (see [payment-transaction-map.md](payment-transaction-map.md))
| Capability | Entry | Status |
|---|---|---|
| Invoice list/edit/print | `modal/popup_sales/view_invoices`, `admin/invoice_print` (`Admin.php:674-689`) | Active |
| Receive payment (multi-account, FIFO allocation) | `admin/payments_received/create|update|delete` (`Admin.php:16734-19593`) | Active; specific-invoice split path multiplies money (Defect D1) |
| Dead payment engine backup | `payments_received_backup` (`Admin.php:19598-22798`) | Dead |
| Make payment (supplier/debt/expense) | `admin/payments/create|update|delete` (`Admin.php:14132-16368`) | Active; "general supplier payment" branch commented out → silent no-op (`Admin.php:14574-14827`) |
| Deposits received | `admin/deposits_received/create|update` (`Admin.php:16368-16734`) | Active (no delete) |
| Receipt print (thermal + A4) | `admin/receipt` (`Admin.php:24739-24764`) | Active |
| Goods-in-lieu payment | `payment_with_goods` table family | Active |

### 5. Customers, receivables (see [ar-ap-lifecycle.md](ar-ap-lifecycle.md))
| Capability | Entry | Status |
|---|---|---|
| Customer CRUD with three opening-balance mechanisms | `admin/customer/*` (`Admin.php:2426-4059`) | Active; duplicate-name check commented out (`Admin.php:2582`) |
| Customer statement (weekly buckets) | `admin/customer_statement` (`Admin.php:711-746` → `pages/sales/customer_statement.php`) | Active; grand-total row mixes cumulative/weekly (`customer_statement.php:1366-1368`) |
| Accounts receivable report | `admin/accounts_receivable_report` (`Admin.php:1584-1602`) | Active; no aging buckets |
| Cash-creditor (negative balance) management | `get_negative_balance` (`Admin.php:24670`), negative-bal engine above | Active |

### 6. Suppliers, payables (see [purchasing-lifecycle.md](purchasing-lifecycle.md))
| Capability | Entry | Status |
|---|---|---|
| Supplier CRUD with opening balance | `admin/supplier/*` (`Admin.php:2120-2423`) | Active |
| Purchase orders (create/update/delete, stock-in at creation) | `admin/purchase_order/*` (`Admin.php:4588-5594`) | Active; **no GRN concept** — stock added on PO save |
| Accounts payable (manual LPAY payables) | `admin/enter_payable/*` (`Admin.php:13554-14132`) | Active |
| Payables taken (goods delivered against credit) | `admin/payables_taken_report` (`Admin.php:1532-1556`) | Active |
| Credit purchases report | `admin/credit_purchases_report` (`Admin.php:1559-1581`) | Active |

### 7. Banking & accounting (see [accounting-transaction-flow.md](accounting-transaction-flow.md))
| Capability | Entry | Status |
|---|---|---|
| Banking overview (transferrable accounts, imprest top-up) | `admin/banking` (`Admin.php:626-647`) | Active |
| Account transfer | `admin/accounts_transfer/create` (`Admin.php:2006-2117`) | Active |
| Account enquiry + print | `admin/get_bank_enqueries` (`Admin.php:24317-24322`) | Active; print links target non-existent `bank_enquery_print` |
| Chart of accounts CRUD | `system_settings/account_create|update|delete` (`Admin.php:1810-1978`) | Active |
| Journals (sales/purchases/receipts/payments/general) | `admin/get_all_journal` (`Admin.php:24325-24359`) + `pages/journal/*` | Active |
| Trial balance | `Admin.php:881-894` → `pages/reports/trial_balance_report.php` | Active; movement-only, ignores opening balances |
| Balance sheet | `Admin.php:1184-1195` → `pages/reports/balance_sheet_report.php` | Active but reads **frozen** `debtors`/`creditors` snapshots; equity is a plug |
| Income statement (cash basis) | `Admin.php:1603-1614` | Active; COGS = supplier payments |
| Cash flow | `Admin.php:1617-1628` | Active; hybrid cash/accrual |

### 8. Inventory (see [stock-movement-map.md](stock-movement-map.md))
| Capability | Entry | Status |
|---|---|---|
| Item CRUD (categories, packages, images) | `admin/item/*` (`Admin.php:4075-4396`), `admin/item_category/*` (`Admin.php:4399-4585`) | Active; bulk edit posts to missing `item/bulk_update` branch |
| Unit/package management (box→pieces, ton bundles) | `admin/addItemUnits` (`Admin.php:25310-25448`), `unit_transfer` ledger | Active |
| Customer-specific pricing (per item & per unit) | `admin/pricing/update` (`Admin.php:22799-22939`) | Active |
| Item transfers (to free-text receiver, with GL lines) | `admin/items_transfer/*` (`Admin.php:22942-23404`) | Active |
| Daily stock report, backlog report | `Admin.php:1107-1181` | Active |
| Stock margin (daily/weekly/monthly) | `Admin.php:777-875`, loaders `:25762-25790` | Active; weekly uses different source table than daily/monthly |
| Item history | `Admin.php:25459-25486` | Active |

### 9. Reports & KPIs — full inventory in [reports-kpi-inventory.md](reports-kpi-inventory.md). ~30 report screens active.

### 10. Administration
| Capability | Entry | Status |
|---|---|---|
| Admin user management | `admin/admins/*` (`Admin.php:180-465`) | Active but **any cashier can create a level-1 superadmin** (`Admin.php:188-254`) |
| Attendance list | `admin/get_attendance` (`Admin.php:468-532`) | Active |
| Clock in/out | `admin/clock_in_out/*` UI → **method does not exist** in `Admin.php` | Broken (login-triggered stock seeding partially compensates, `Login.php:188-271`) |
| System settings (company, prefixes, accounts, logo) | `admin/system_settings/*` (`Admin.php:1689-2003`) | Active |
| SMS settings (Hubtel) | `admin/sms_settings/*` (`Admin.php:1631-1686`) | Active |
| Invoice/waybill code booklet generation | `admin/generateInvoiceCodes` / `generateWaybillCodes` (`Admin.php:25501-25672`) | Active but unauthenticated |

### 11. Integrations — full inventory in [integration-inventory.md](integration-inventory.md). Only Hubtel SMS (via inline cURL, `Sms_model.php:15-176`) and the autoloaded Iptracker are live; Stripe/PayPal/Hubtel-SDK/barcode are dead.

### 12. Explicitly OUT of iDepot scope (school-era remnants — see [dead-code-register.md](dead-code-register.md))
`Mobile.php` school API (classes/marks/messaging), `Home.php` frontend CMS, `Install.php`/`Updater.php` deployment tooling, `get_parents` (`Admin.php:25191`), school blocks in `Crud_model`/`Ajaxdataload_model`/`user_validation_helper.php`, `message`/`noticeboard`/`language` tables, `visitor_tracker`.

## Volume evidence of what is actually used

`AUTO_INCREMENT` counters from the schema (row-generation scale): `stock_manager` 842,433 · `general_journal` 171,003 · `debtors` 46,710 · `sales_order` 45,411 · `payment_with_goods` 49,842 · `payment` 42,851 · `invoice` 40,563 · `invoice_code` 11,024 · `items_prices` 14,893 · `creditors` 14,204 · `items` 565 · `customers` 4,905 · `admin` 27 · `suppliers` 45. Near-zero/absent counters (returns, loyalty, roles, shops, audit_log, kpi_snapshots…) confirm those subsystems never ran.
