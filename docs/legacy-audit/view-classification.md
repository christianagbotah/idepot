# View Classification — `v_l02i/backend/` (266 PHP business pages + shells)

Classification method: every file matched against controller loads (`$this->load->view` / `Modal::popup_*` / `Admin::loadContents`) and JS AJAX targets; then classified active / dead / duplicate / broken. The sanitized snapshot contains **no top-level school views** (`backend/admin/` holds only `navs/` and `pages/`); school remnants survive only inside mixed files, listed at the end.

Legend: **A** active · **D** dead (no loader) · **B** broken (loads but posts to missing endpoints / fails at runtime) · **DUP** duplicate of another view · **S** school remnant content.

## 1. Backend shells & layouts

| File | Class | Notes |
|---|---|---|
| `login.php` | A | Two-phase login; leaks superadmin email on blocked screen (line 5,127) |
| `index.php` (master layout) | A | **Absent from snapshot** (referenced `Admin.php:106,366,572,596,620,644,668`) — sanitized out |
| `header.php`, `top-header.php`, `footer.php`, `includes_top.php`, `includes_bottom.php`, `modal.php`, `top-header-tabs-contents.php` | A | Neon theme shell; clock buttons post to missing `admin/clock_in_out` |
| `modern-header.php`, `quick-modern-header.php`, `modern-layout.php` | D | Unreferenced modern skin experiments (modern-layout references modern-dashboard) |
| `styles.php`, `js.php` | A/vestigial | Near-empty shells |

## 2. `pages/` root (shells + shared fragments)

| View | Loaded by | Class | Tables |
|---|---|---|---|
| dashboard.php | `Admin::dashboard` | A | admin, settings, aggregates |
| modern-dashboard.php | modern-layout only | D | — |
| sales.php / purchases.php / banking.php / reports.php | `Admin::sales|purchases|banking|reports` | A | shells |
| search_result.php | `Admin::search_results` | A | payment_with_goods, items, invoice |
| admin_list.php | `modal/popup/admin_list` | A | admin |
| attendance_list.php | `modal/popup/attendance_list` | A | attendance, admin |
| manage_profile.php | `modal/popup/manage_profile` | A | admin |
| system_settings.php | `modal/popup/system_settings` | A | settings, accounts, account_type, invoice_code, waybill_code |
| sms_settings.php | `modal/popup/sms_settings` | A | settings |
| view_journals.php | `modal/popup/view_journals` | A | general_journal |
| payments.php (root) | none | D | posts `admin/payments/create` w/o param — static-ish |
| enter_payable.php / pay_payable.php / view_accounts_payable.php / suppliers_list.php / purchase_order_list.php (root) | `modal/popup_purchases/*` | A/DUP | live equivalents also under purchases/ (pay_payable is a static mockup posting to non-existent `pay_payable`) |
| backups_creditors.php | `Admin::backups_creditors`/`delete_creditors` | A (maintenance) | sales_order, payment_with_goods |
| modal_welcome.php / modal_goodbye.php / modal_logout.php / modal_admin_add.php / modal_admin_edit.php | `modal/popup*` | A (welcome/goodbye flows dead — missing endpoint) | admin |
| modal_forgot_to_clockout.php | none | D | posts to dead endpoint |
| customer_statement-old.php (root) | none | D | backup |
| add_order_row.php · add_order_row_pos.php · add_order_row_pos_unit.php · add_order_row_pos_unit_fixed_quantity.php · add_order_row_negative_bal.php · add_debtor_order_row.php · add_creditor_order_row.php · add_proforma_invoice_row.php | `Admin::add_order_row*` (23646-23833) | A | items, units_items, items_prices, items_units_prices |

## 3. `pages/pos/` (POS suite)

Active: `pos_page.php`, `get_main_page.php`, `add_invoice.php`, `create_proforma_invoice.php`, `add_/edit_sales_order_negative_bal.php`, `sales_order_list.php` (its delete URL is broken — posts to missing `admin/sales_order/delete`), `view_invoices.php` (delete URL broken), `view_receipts.php`, `view_payments.php`, `payments.php`, `edit_payments.php`, `payment_with_goods.php`, `receipt_modal.php`, `get_confirm_item.php`, `get_item_unit_list.php`, `get_all_invoice_items.php`, `get_all_customers.php`, `get_invoice_for_verification.php`, `get_waybill_for_verification.php`, `opening_/closing_stock_summary.php`, `account_field.php`, `account_field_edit.php`, `account_field_payment.php`, `edit_customer.php`, `edit_debtor_/edit_creditor_opening_balance.php`, `edit_sales_order.php`, `edit_item.php`, `add_item.php`, `view_items.php`, `calendar.php` (S: noticeboard remnant), `modal.php`, `top-header.php`, `header.php`, `css.php`, `styles.php`, `includes_top.php`, `includes_bottom.php`.

Dead/broken: **`modern-pos.php`** (D), **`edit_invoice.php`** (D), **`edit_payment_with_goods.php`** (B — posts to missing `admin/sales_order/update`), **`payment_with_goods.php-tmp`** (formatter crash dump).

## 4. `pages/sales/` (~70 files)

Active: add_sales_order.php (B — posts to missing `admin/sales_order/create`), edit_sales_order.php, add_invoice.php (B — same), create_proforma_invoice.php, preview_order.php (B — update path missing), sales_order_list.php, get_orders_list.php (commented-out loader), get_orders_list_bydate.php, get_orders.php, get_unpicked_order.php, get_invoice_list_bydate.php, view_invoices.php, view_payments.php, view_receipts.php, payments.php, payments_select.php, edit_payments.php, payment_with_goods.php, cash_goods.php, refund_sales_order.php (B — hardcoded SO code), customers_list.php, add_customer.php, add_customer_pos.php, edit_customer.php, accounts_receivable.php, get_accounts_receivable_list.php, get_receipt_list.php, get_cash_received_list.php, daily_cash_received.php, get_deposit_list.php, edit_deposit.php, add_/edit_debtor_opening_balance.php, add_/edit_creditor_opening_balance.php, enter_payable.php, edit_enter_payable.php, item_history.php, get_item_history.php, get_item_history_purchase_dates.php, pricing.php, get_price_list.php, get_price_item_list.php, add_item_to_price_list.php, add_item.php, edit_item.php, edit_items_bulk.php (B — missing `item/bulk_update`), add_/edit_item_category.php, view_items_category.php, add_/edit_item_main_category.php, view_items_main_category.php, view_items.php, customer_statement.php, receipt.php, receipt_pos.php, receipt_modal.php, invoice_print.php, proforma_invoice_print.php, printer_selection.php, get_available_units_ids.php, get_added_units_list_for_item.php, get_payables_order_so_codes.php, get_payment_with_goods_order.php, all_items_report.php, modal.php, css.php, includes_top.php, includes_bottom.php.

Dead: `edit_invoice.php`, `payment_with_goods_loan.php`, `deposit.php`, `view_deposits.php`, `customer_statement-old.php`, `customer_statement_optimized.php`, `receipt-pos-bkup.php`, `*-tmp` ×3, `modern-add-item.php`, `modern-edit-item.php`, `add_item_script.php`.

## 5. `pages/purchases/`

Active: add_purchase_order.php, edit_purchase_order.php, preview_order.php, purchase_order_list.php, suppliers_list.php, add_supplier.php, edit_supplier.php, payments.php, edit_payments.php, payments_history.php, enter_payable.php, edit_enter_payable.php, credit_purchases.php, get_credit_purchases_list.php, get_creditors_list.php, get_accounts_payable_list.php, get_payables_taken_list.php, get_payables_taken_list_below_date.php, payables_taken.php, get_expenses_list.php, get_orders_list_bydate.php, get_account_paid_from.php, view_accounts_payable.php, accounts_payable.php.
Dead: `get_accounts_payable_listOLD.php`, `get_accounts_payable_list.phpOld`, `get_creditor_by_name.php`, `payables_taken_page.php` (0 bytes), `pay_payable.php` (mockup — no controller).

## 6. `pages/reports/`

Active: balance_sheet_report.php, income_statement_report.php, cash_flow_report.php, trial_balance_report.php, accounts_receivable_report.php, accounts_payable_report.php, invoice_report.php, inventory_report.php, stock_margin_report_{daily,weekly,monthly}.php + get_stock_margin_report_{daily,weekly,monthly}.php, daily_stock_report.php, get_daily_stock_report.php, backlog.php, get_backlog_report.php, cash_received_report.php, expenses_report.php, purchase_order_report.php, sales_order_report.php, sales_order_summary_report.php, sales_order_daily_summary_report.php, get_daily_sales_order_report.php, all_sales_order_report.php, all_items_report.php, creditors_report.php, credit_purchases_report.php, item_transfer_report.php.
Dead/special: `accounts_payable_report2.php` (debug backdoor via `/test`), `accounts_payable_report_old.php`, `inventory_reportOld.php`, `backlog_closing_stock.php`, `cash_received_report-edited.php`, `FINAL_OPTIMIZATION_REPORT.md`, `FINAL_OPTIMIZATION_SUMMARY.md` (dev artifacts).

## 7. `pages/journal/`, `pages/banking/`, `pages/items_transfers/`, `pages/dates_selection/`

- journal/: all 6 views active (get_all/general/sales/purchases/payments/receipts_journal.php).
- banking/: account_enquiry.php, account_transfer.php, get_bank_enquery_print.php active; `add_express_top_up.php` 0-byte dead.
- items_transfers/: add_/edit_item_transfer.php, items_transfer_list.php, add_/edit_item_transfer_row.php, get_item_transfer.php active; **`tt.php` D** (pasted controller code).
- dates_selection/: all 15 date-picker dialogs active via `Modal::popup_dates`.

## 8. `navs/`

`dashboard-nav.php`, `sales-nav.php`, `purchases-nav.php`, `banking-nav.php`, `reports-nav.php` — all active (full menu trees in [rbac-analysis.md](rbac-analysis.md) §4). Notable menu landmines: "Accounts Payable Test" debug entry (reports-nav.php:51); pay_payable link commented out; manager-only Daily Cash Received / Daily Stock Report gates.

## 9. School-era remnants inside retained files

| Location | Remnant |
|---|---|
| `pos/calendar.php:46` | renders `noticeboard` rows |
| `user_validation_helper.php:559-810` | teacher/parent/student/class-routine validators; `get_receiver_email` messaging |
| `Ajaxdataload_model.php:11-25,212-314,316-1800` | books/teachers/parents/fee-receipt feeds |
| `Crud_model.php:1301-1431,1509-1950,2007-2028` | student truncation, messaging, notifications, `find_student`, `load_receipt`, student auth branch |
| `Admin.php:25191-25267` | `get_parents()` DataTables feed of `parent` table |
| `Iptracker.php:54` | skips URLs containing `'dimiyo'` (school product name) |
| `top-header.php:50` | hardcoded customer webmail link |
| tables: `language`, `message`, `noticeboard`, `visitor_tracker`, `prices(item1..28)` | school-era schema |

## 10. Summary counts

- ~233 active views (including shells and fragments), ~30 dead/duplicate/broken files, 4 `-tmp` crash dumps, 2 dev `.md` artifacts in the tree, 1 `.phpOld`.
- Highest-risk duplication family: `pages/pos/*` vs `pages/sales/*` twins (12+ near-identical pairs) served by `modal/popup_pos` vs `popup_sales` — guaranteed drift (already observed: pos list delete URL broken, sales copy fixed).
