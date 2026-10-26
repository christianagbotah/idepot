# Duplicate / Obsolete / Dead / School-Management Code Register

Everything listed was verified unreferenced (or broken) by repository-wide search. Nothing here is deleted in Phase 0 — the legacy tree stays untouched as forensic evidence; this register defines what must **not** be ported and what the rebuild replaces.

## 1. Controllers

| Item | Size | Why dead/dangerous |
|---|---|---|
| `Admin::sales_order_pos_alterated()` (`Admin.php:7743-9807`) | ~2,065 lines | Zero references; divergent stock-check and payment math vs the live engine (complementary stock-check gaps; cumulative `payment.due`) |
| `Admin::payments_received_backup()` (`Admin.php:19598-22798`) | ~3,200 lines | Comment "on hold for a while"; zero references |
| `Admin::debtorsCreditorsUpdator()` (`Admin.php:1198-1468`) | ~270 lines | 100% commented; was the only writer of `debtors`/`creditors` (balance-sheet freeze) |
| `Admin::get_parents()` (`Admin.php:25191-25267`) | — | School `parent` table feed |
| Dead tail of `cronJobForClockingInClockingOut` (`Admin.php:25076-25173`) | ~100 lines | `var_dump($bulkStockIds); return;` kills it |
| `Admin_optimized.php` (395) / `Admin_clock_optimized.php` (382) | files | "Paste into Admin.php" patch artifacts; unroutable (optimized file has no class) |
| `Mobile.php` (939) | file | School API + auth bypass + sha1 resets + unvalidated upload |
| `Home.php` (153) | file | School frontend CMS |
| `Install.php` (265) | file | Installer with hardcoded DB password `'myjesus4mE'` (rotate!) |
| `Updater.php` (104) | file | Authenticated RCE via uploaded `update_script.php` |
| `Multilanguage.php` (54) | file | No language files exist |

## 2. Views (30+ files)

**Backup/formatting debris:** `pos/payment_with_goods.php-tmp`, `sales/get_orders_list_bydate.php-tmp`, `sales/get_payables_order_so_codes.php-tmp`, `sales/get_payment_with_goods_order.php-tmp` (Sublime formatter crash dumps with `C:\Users\CHRIS\` stack traces) · `sales/receipt-pos-bkup.php` · `sales/customer_statement-old.php` + root copy · `purchases/get_accounts_payable_listOLD.php` · `purchases/get_accounts_payable_list.phpOld` · `reports/inventory_reportOld.php` · `reports/accounts_payable_report_old.php` · `reports/cash_received_report-edited.php` · `reports/FINAL_OPTIMIZATION_{REPORT,SUMMARY}.md`.

**Unreferenced:** `pos/modern-pos.php` · `pos/edit_invoice.php` · `pos/edit_payment_with_goods.php` (posts to missing endpoint) · `sales/edit_invoice.php` · `sales/payment_with_goods_loan.php` · `sales/deposit.php` · `sales/view_deposits.php` · `sales/customer_statement_optimized.php` · `sales/modern-add-item.php` / `modern-edit-item.php` · `sales/add_item_script.php` · `purchases/get_creditor_by_name.php` · `purchases/payables_taken_page.php` (0 bytes) · `purchases/pay_payable.php` (static mockup, no controller) · `reports/accounts_payable_report2.php` (debug backdoor via `/test`) · `reports/backlog_closing_stock.php` · `banking/add_express_top_up.php` (0 bytes) · `items_transfers/tt.php` (pasted controller code) · `modal_forgot_to_clockout.php` · `modern-dashboard.php` (+ unreferenced `modern-layout.php` / `modern-header.php` / `quick-modern-header.php`) · root `payments.php` · root `view_accounts_payable.php` (static mockup) · root duplicates of `suppliers_list/enter_payable/purchase_order_list`.

**Whole directories:** `pages/pos-old/` (10 files; opening/closing summaries byte-identical to pos/).

**Duplicate families:** `pages/pos/*` vs `pages/sales/*` twins (sales_order_list, edit_sales_order, view_invoices, view_receipts, view_payments, payments, payment_with_goods, edit_payment_with_goods, add/edit_item, receipt_modal, account_field*) — served by `popup_pos` vs `popup_sales`; drift already proven (pos list delete URL broken, sales copy fixed).

## 3. Models / libraries / helpers

- `models/get_sales_order_list_extracted.php` — loose function using `$this` at file scope (fatals if included).
- `Setting_model.php` — queries non-existent school tables, yet loaded in constructor.
- `Stripe_model`, `Paypal_model`, `libraries/Stripegateway.php` (includes absent `stripe/init.php`), `libraries/Paypal.php` — dead.
- `libraries/hubtel-sms-api/` — dead SDK (live SMS uses inline cURL).
- `Barcode_model::create_barcode` — never called.
- `helpers/receipt_helper.php::print_in_thermal` — hardcoded "ExampleMart" demo with Windows paths.
- `Iptracker.php` — writes `visitor_tracker`, nothing reads; self-executes on autoload.
- School blocks inside `Crud_model` (student truncation 1301-1313, messaging 1336-1431, notifications 1509-1912, `find_student` 2028, `load_receipt` 2007, student auth branch 1931-1933), `Ajaxdataload_model` (books/teachers/parents 11-314; fee-receipt feeds 316-1800), `user_validation_helper.php` (teacher/parent/student/class validators 559-810).

## 4. Dead schema (never referenced by code)

`audit_log` · `balance_sheet` · `customer_loyalty` · `customer_rewards` · `customer_segments` · `customer_tiers` · `kpi_snapshots` · `language` · `loyalty_points` · `loyalty_settings` · `loyalty_transactions` · `message` · `noticeboard` · `permissions` · `prices` (item1..28 matrix) · `refund_transactions` · `return_reasons` · `returns_audit_trail` · `role_permissions` · `roles` · `sales_return_items` · `sales_returns` · `sales_targets` · `shelves` · `shop_attendants` · `shops` · `stock_record` (write path commented; q_sold never written) · `store_credits` · `visitor_tracker` (write-only) · `items.item_locations` (table exists; zero refs).

Dead columns: `admin.active_status` (never read), `admin.welcome_shown_date` (write-only), `admin.read_notice_ids`, `customers.balance_due` (never written), `items.price_column`, `items.po_id` (commented flow), `purchase_order.type_of_payment`, `payment.momo_type`, `payment.method`, `payment_with_goods.bundle_*` (used), `invoice.p_prev_paid`/`prev_paid` (half-maintained), `accounts.opening_balance` (never read), `stock_record.q_sold`.

Dead tax columns (designed, never computed): `sales_order.vat_amount`, `nhil_amount`, `getfund_amount`, `covid_amount`, `tax_total`, `tax_enabled`, `tax_inclusive`.

## 5. Dead endpoints & maintenance backdoors (still routable)

`updateZeroBalanceItems` (25835) · `batchPriceInsert` (25872) · `batchPriceUpdate` (25927) · `updateUnitQuantity` (25958) · `populateAccountsUsedTable` (25995) · `backups_creditors` (26002) · `delete_creditors` (26008 — unauthenticated mass rewrite) · `generateInvoiceCodes`/`generateWaybillCodes` (settings feature, unauthenticated) · broken targets: `admin/sales_order/*`, `admin/clock_in_out/*`, `admin/bank_enquery_print`, `admin/pay_payable/create`, `modal/n/*`, `modal/ln/*`.

## 6. School-domain concepts conclusively out of iDepot scope

students, teachers, classes/sections/routines, exams/marks/grades, subjects, parents, librarians/books, dormitories, syllabus, creche, feeding/class fees, school transport, bulk admission, student IDs, noticeboard, frontend CMS, messaging, 20-language phrase table. None of these have depot-side dependencies (verified: no depot controller reads them; only dead school code does).

## 7. Estimated dead weight

Roughly **8,000–9,000 lines** inside `Admin.php` (two dead engines + commented writers + dead cron tail), **~35 view files**, **28 schema tables**, **5 controllers**, **6 models/libraries**, plus all `-tmp/-old/OLD/bkup` debris. The live surface to preserve is large but tractable once the dead forks are excluded.
