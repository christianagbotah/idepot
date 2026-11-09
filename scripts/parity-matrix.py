#!/usr/bin/env python3
"""Generate docs/parity/legacy-view-matrix.csv from the 2026-11-06 intake
view inventory + the Phase 0 forensic classification (view-classification.md)
+ the verified new-implementation surface (web routes, API controllers, tests).

Run from the repo root:  python3 scripts/parity-matrix.py
Outputs: docs/parity/legacy-view-matrix.csv
"""
import csv
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INTAKE = REPO / "legacy/intake/2026-11-06/idepot_legacy_view_inventory.csv"
OUT = REPO / "docs/parity/legacy-view-matrix.csv"

# ---------------------------------------------------------------------------
# Curated per-file register.
# classification: active | active-broken | duplicate | dead | school-only
# status: implemented | implemented-changed | partial | pending |
#         dropped-dead | dropped-duplicate | dropped-school
# Evidence sources: docs/legacy-audit/view-classification.md (Phase 0),
# controller-model-map.md, and direct verification of the current
# apps/web routes / apps/api controllers / test files (2026-11-09).
# ---------------------------------------------------------------------------
R = {}  # relpath -> dict of curated fields

def add(path, cls, status, target_web, target_api, test, capability, notes=""):
    R[path] = dict(classification=cls, status=status, target_web=target_web,
                   target_api=target_api, test=test, capability=capability, notes=notes)

# ============================ banking (4) ==================================
add("banking/account_enquiry.php", "active", "implemented", "/banking/accounts, /banking/statements",
    "GET /banking/accounts, GET /banking/statements, GET /banking/statements/:id", "banking-flows",
    "Bank account enquiry with running ledger", "Legacy read mutable accounts.current_balance; new GL-derived")
add("banking/account_transfer.php", "active", "implemented", "/banking/transfers",
    "POST /banking/transfers (explicit fees, balanced journal, client-doc dedupe)", "banking-flows",
    "Bank-to-bank transfer", "")
add("banking/add_express_top_up.php", "dead", "dropped-dead", "—", "—", "—",
    "0-byte file", "No loader; empty file")
add("banking/get_bank_enquery_print.php", "active", "implemented-changed", "/banking (browser print)",
    "GET /banking/statements", "banking-flows", "Print bank enquiry",
    "Browser print from the same data; no separate print endpoint")

# ============================ dates_selection (15) ==========================
for f in ["accounts_payable_report", "accounts_receivable_report", "all_items_report",
          "backlog_report", "balance_sheet_report", "cash_flow_report", "creditors_report",
          "customer_statement", "daily_stock_report", "income_statement_report",
          "inventory_report", "invoice_report", "item_history", "stock_margin_report",
          "trial_balance_report"]:
    add(f"dates_selection/date_selection_{f}.php", "active", "implemented-changed",
        "date-range inputs on the report pages", "—", "—",
        "Date-picker dialog driving the report", "Folded into web report filters (from/to); no modal dialog needed")

# ============================ items_transfers (7) ===========================
for f, note in [("add_item_transfer.php", ""), ("add_item_transfer_row.php", "line editor inside the transfer form")]:
    add(f"items_transfers/{f}", "active", "implemented", "/inventory/transfers",
        "POST /transfers (+ lines)", "stock-operations.e2e", "Stock transfer document", note)
add("items_transfers/edit_item_transfer.php", "active", "implemented-changed", "/inventory/transfers",
    "POST /transfers/:id/dispatch, POST /transfers/:id/receive", "stock-operations.e2e",
    "Edit transfer", "State machine draft→dispatched→received with value carry; free-text receiver replaced by staff/location evidence")
add("items_transfers/edit_item_transfer_row.php", "active", "implemented-changed", "/inventory/transfers",
    "PATCH /transfers/:id/lines", "stock-operations.e2e", "Edit transfer line", "")
add("items_transfers/get_item_transfer.php", "active", "implemented", "/inventory/transfers",
    "GET /transfers", "stock-operations.e2e", "Transfer list/feed", "")
add("items_transfers/items_transfer_list.php", "active", "implemented", "/inventory/transfers",
    "GET /transfers", "stock-operations.e2e", "Transfer list", "")
add("items_transfers/tt.php", "dead", "dropped-dead", "—", "—", "—",
    "Pasted controller code inside a view", "Dev debris")

# ============================ journal (6) ===================================
for f in ["get_all_journal.php", "get_general_journal.php", "get_payments_journal.php",
          "get_purchases_journal.php", "get_receipts_journal.php", "get_sales_journal.php"]:
    add(f"journal/{f}", "active", "implemented-changed", "/accounting/journals",
        "GET /accounting/journals (source/type/reference/date filters)", "accounting-statements",
        "Journal register (per type)", "Six legacy per-type feeds → one GL inquiry with filters; append-only journals, ΣD=ΣC enforced")

# ============================ pos (43) ======================================
POS_SHELL = dict(target_web="web app shell (layout)", target_api="—", test="—",
                 capability="Theme shell/fragment", notes="Replaced by the Next.js app shell")
for f in ["css.php", "styles.php", "header.php", "top-header.php", "includes_top.php",
          "includes_bottom.php", "modal.php"]:
    add(f"pos/{f}", "active", "implemented-changed", **POS_SHELL)
add("pos/pos_page.php", "active", "implemented", "/pos (offline-first)",
    "POST /sales/commit, POST /sync/push, GET /sync/pull", "sales-flows.e2e, sales-sync-chaos",
    "POS main screen", "Keyboard-first; IndexedDB outbox; same posting coordinator online/offline")
add("pos/get_main_page.php", "active", "implemented", "/pos", "GET /products (search), GET /products/:id/units",
    "sales-flows.e2e", "POS landing content", "")
add("pos/add_invoice.php", "active", "implemented-changed", "/pos",
    "POST /sales/commit (server computes totals)", "sales-flows.e2e",
    "Create POS invoice", "Server-authoritative totals; C-2 header math; DB CHECK")
add("pos/create_proforma_invoice.php", "active", "partial", "— (web UI pending)",
    "POST /quotations, POST /quotations/:id/issue|accept|convert", "review-hardening",
    "Create proforma (quotation)", "API + lifecycle + tests done; quotation web page + A4 print pending")
add("pos/add_sales_order_negative_bal.php", "active", "implemented", "/deposits",
    "POST /deposits", "sales-flows.e2e", "Negative-balance (deposit) order", "Explicit customer_deposit documents; no negative invoice rows")
add("pos/edit_sales_order_negative_bal.php", "active", "implemented-changed", "/deposits",
    "credit applications are explicit rows (POST /credits/apply)", "sales-flows.e2e",
    "Edit deposit order", "Append-only credit_application waterfall replaces destructive edits")
add("pos/calendar.php", "school-only", "dropped-school", "—", "—", "—",
    "Noticeboard remnant inside POS", "School-era content (view-classification §9)")
add("pos/closing_stock_summary.php", "active", "implemented", "/reports (daily-stock tab)",
    "GET /reports/daily-stock", "—", "Closing stock summary", "Ledger-derived closing (legacy defect: closing only when sale+transfer both exist)")
add("pos/opening_stock_summary.php", "active", "implemented", "/reports (daily-stock tab)",
    "GET /reports/daily-stock", "—", "Opening stock summary", "")
add("pos/account_field.php", "active", "implemented-changed", "/pos, /payments",
    "structured tenders in POST /payments", "sales-flows.e2e",
    "Payment-account picker fragment", "Accounts-as-payment-methods → typed tenders (cash/momo/cheque/bank)")
add("pos/account_field_edit.php", "active", "implemented-changed", "/payments",
    "structured tenders", "sales-flows.e2e", "Payment-account edit fragment", "")
add("pos/account_field_payment.php", "active", "implemented-changed", "/payments",
    "structured tenders", "sales-flows.e2e", "Payment-account payment fragment", "")
add("pos/add_item.php", "active", "implemented", "/catalog",
    "POST /products", "vertical-slice.e2e", "Quick item create", "")
add("pos/edit_item.php", "active", "implemented", "/catalog",
    "PATCH /products/:id", "vertical-slice.e2e", "Quick item edit", "")
add("pos/edit_customer.php", "active", "implemented", "/customers",
    "PATCH /customers/:id (party CRUD)", "sales-flows.e2e", "Quick customer edit", "")
add("pos/edit_debtor_opening_balance.php", "active", "implemented", "— (back-office API)",
    "POST /party-opening-balances", "sales-flows.e2e", "Debtor opening balance", "Explicit opening-balance documents")
add("pos/edit_creditor_opening_balance.php", "active", "implemented", "— (back-office API)",
    "POST /party-opening-balances (supplier)", "purchasing-flows.e2e", "Creditor opening balance", "")
add("pos/edit_invoice.php", "dead", "dropped-dead", "—", "—", "—",
    "Edit posted invoice", "Invoices immutable by design; reversal is a new document (POST /sales/invoices/:id/reverse)")
add("pos/edit_payments.php", "active", "implemented-changed", "/payments",
    "append-only payments; corrections are reversals", "sales-flows.e2e",
    "Edit payment", "Legacy destructive edits structurally impossible")
add("pos/edit_sales_order.php", "active", "implemented-changed", "/sales-orders",
    "PATCH before confirm; state machine", "sales-flows.e2e", "Edit sales order", "")
add("pos/edit_payment_with_goods.php", "active-broken", "dropped-dead", "—", "—", "—",
    "Edit credit application (posts to missing endpoint)", "Explicit credit_application rows replace PWG edits")
add("pos/payment_with_goods.php", "active", "implemented-changed", "/payments (credit tender)",
    "POST /credits/apply", "sales-flows.e2e", "Payment-with-goods (credit)",
    "PWG mirror table dropped; explicit credit applications + advisory-lock waterfall")
add("pos/payments.php", "active", "implemented", "/payments",
    "POST /payments (typed tenders + allocations)", "sales-flows.e2e", "POS payments", "")
add("pos/get_all_customers.php", "active", "implemented", "/pos (customer search)",
    "GET /customers", "sales-flows.e2e", "Customer feed", "")
add("pos/get_all_invoice_items.php", "active", "implemented", "/sales (invoice drilldown)",
    "GET /sales/invoices/:id", "sales-flows.e2e", "Invoice items feed", "")
add("pos/get_confirm_item.php", "active", "implemented-changed", "/pos (cart)",
    "— (client-side cart; server recomputes)", "sales-flows.e2e", "Item confirm fragment",
    "Client amounts advisory; server computes line.net")
add("pos/get_invoice_for_verification.php", "active", "implemented", "— (verification API)",
    "GET /sequences (booklet verification)", "sales-flows.e2e", "Invoice code verification", "")
add("pos/get_waybill_for_verification.php", "active", "implemented", "— (verification API)",
    "GET /sequences", "sales-flows.e2e", "Waybill code verification", "")
add("pos/get_item_unit_list.php", "active", "implemented", "/pos (unit picker)",
    "GET /products/:id/units", "sales-flows.e2e", "Item unit list", "")
add("pos/receipt_modal.php", "active", "implemented", "/print/receipt/[id]",
    "GET /sales/invoices/:id/receipt", "sales-flows.e2e", "Receipt modal/payload",
    "Thermal-80mm/A4 from ONE payload; balance-owed = this invoice's due")
add("pos/sales_order_list.php", "active", "implemented-changed", "/sales-orders",
    "GET /sales-orders", "sales-flows.e2e", "POS order list", "Legacy delete URL was broken; fixed")
add("pos/view_invoices.php", "active", "implemented-changed", "/sales",
    "GET /sales/invoices", "sales-flows.e2e", "POS invoice list", "Legacy delete URL broken; reversal flow instead")
add("pos/view_payments.php", "active", "implemented", "/payments",
    "GET /payments", "sales-flows.e2e", "POS payments list", "")
add("pos/view_receipts.php", "active", "implemented", "/payments + /print/receipt/[id]",
    "GET /payments, GET /sales/invoices/:id/receipt", "sales-flows.e2e", "POS receipts list", "")
add("pos/view_items.php", "active", "implemented", "/catalog",
    "GET /products", "vertical-slice.e2e", "POS item list", "")
add("pos/modern-pos.php", "dead", "dropped-dead", "—", "—", "—", "Modern skin experiment", "Unreferenced")

# ============================ pos-old (11) ==================================
for f in ["calendar.php", "closing_stock_summary.php", "css.php", "header.php",
          "includes_bottom.php", "includes_top.php", "modal.php", "opening_stock_summary.php",
          "payments.php", "pos_page.php", "top-header.php"]:
    add(f"pos-old/{f}", "dead", "dropped-dead", "—", "—", "—",
        "Old POS backup tree", "Superseded by pages/pos; no loader")

# ============================ purchases (28) ================================
add("purchases/accounts_payable.php", "active", "implemented", "/ap",
    "GET /ap/aging, GET /ap/statements/:supplierId", "purchasing-flows.e2e, accounting-statements", "AP workbench", "")
add("purchases/add_purchase_order.php", "active", "implemented", "/purchasing/orders",
    "POST /purchasing/purchase-orders (submit/approve/issue)", "purchasing-flows.e2e", "Create PO", "Pure commitment document; 3-way match downstream")
add("purchases/edit_purchase_order.php", "active", "implemented", "/purchasing/orders",
    "PATCH /purchasing/purchase-orders/:id (before submit)", "purchasing-flows.e2e", "Edit PO", "")
add("purchases/preview_order.php", "active", "implemented-changed", "/purchasing/orders (review step)",
    "GET /purchasing/purchase-orders/:id", "purchasing-flows.e2e", "PO preview", "")
add("purchases/purchase_order_list.php", "active", "implemented", "/purchasing/orders",
    "GET /purchasing/purchase-orders", "purchasing-flows.e2e", "PO list", "")
add("purchases/add_supplier.php", "active", "implemented", "/suppliers",
    "POST /suppliers (party CRUD)", "purchasing-flows.e2e", "Create supplier", "")
add("purchases/edit_supplier.php", "active", "implemented", "/suppliers",
    "PATCH /suppliers/:id", "purchasing-flows.e2e", "Edit supplier", "")
add("purchases/suppliers_list.php", "active", "implemented", "/suppliers",
    "GET /suppliers", "purchasing-flows.e2e", "Supplier list", "")
add("purchases/payments.php", "active", "implemented", "/purchasing/payments",
    "POST /purchasing/supplier-payments (tenders + allocations + advances)", "purchasing-flows.e2e, purchasing-concurrency", "Supplier payment", "")
add("purchases/edit_payments.php", "active", "implemented-changed", "/purchasing/payments",
    "append-only; advance application is explicit (POST .../apply-advance)", "purchasing-flows.e2e",
    "Edit supplier payment", "Legacy destructive edits impossible")
add("purchases/payments_history.php", "active", "implemented", "/ap (statements)",
    "GET /ap/statements/:supplierId", "accounting-statements", "Payment history", "")
add("purchases/enter_payable.php", "active", "implemented-changed", "/purchasing (manual docs)",
    "POST /purchasing/supplier-invoices; supplier debit/credit notes", "purchasing-flows.e2e",
    "Enter other payable", "LPAY manual payables → explicit supplier documents (append-only)")
add("purchases/edit_enter_payable.php", "active", "implemented-changed", "/purchasing",
    "supplier adjustments (append-only)", "purchasing-flows.e2e", "Edit payable", "")
add("purchases/credit_purchases.php", "active", "implemented-changed", "/ap",
    "GET /ap/aging (derived open AP)", "purchasing-flows.e2e", "Credit purchases list",
    "Open AP always ledger/allocation-derived — never a mutable snapshot")
add("purchases/get_credit_purchases_list.php", "active", "implemented-changed", "/ap",
    "GET /ap/aging", "purchasing-flows.e2e", "Credit purchases feed", "")
add("purchases/get_creditors_list.php", "active", "implemented-changed", "/ap, /suppliers",
    "GET /ap/aging, GET /suppliers", "accounting-statements", "Creditors list",
    "Legacy creditors snapshot table was FROZEN; new figures regenerate from documents")
add("purchases/get_accounts_payable_list.php", "active", "implemented", "/ap",
    "GET /ap/aging", "purchasing-flows.e2e", "AP list feed", "")
add("purchases/get_accounts_payable_listOLD.php", "dead", "dropped-dead", "—", "—", "—", "OLD backup", "")
add("purchases/get_creditor_by_name.php", "dead", "dropped-dead", "—", "—", "—", "Unused feed", "")
add("purchases/get_expenses_list.php", "active", "implemented-changed", "/accounting/journals",
    "POST /accounting/journals (manual)", "accounting-statements", "Expenses list",
    "Expenses = approved manual journals with live preview")
add("purchases/get_account_paid_from.php", "active", "implemented", "/purchasing/payments",
    "GET /banking/accounts", "purchasing-flows.e2e", "Paid-from account picker", "")
add("purchases/get_orders_list_bydate.php", "active", "implemented", "/purchasing/orders",
    "GET /purchasing/purchase-orders?from&to", "purchasing-flows.e2e", "PO list by date", "")
add("purchases/get_payables_taken_list.php", "active", "implemented", "/ap (statement lines)",
    "GET /ap/statements/:supplierId", "accounting-statements", "Payables-taken list", "")
add("purchases/get_payables_taken_list_below_date.php", "active", "implemented-changed", "/ap",
    "GET /ap/statements/:supplierId?asOf=", "accounting-statements", "Payables below date", "As-of statements never see future transactions")
add("purchases/payables_taken.php", "active", "implemented", "/ap", "GET /ap/statements/:supplierId", "accounting-statements", "Payables taken", "")
add("purchases/payables_taken_page.php", "dead", "dropped-dead", "—", "—", "—", "0-byte file", "")
add("purchases/pay_payable.php", "dead", "dropped-dead", "—", "—", "—",
    "Static mockup posting to non-existent endpoint", "Pay flow lives at /purchasing/payments")
add("purchases/view_accounts_payable.php", "active", "implemented", "/ap",
    "GET /ap/aging", "purchasing-flows.e2e", "AP detail view", "")

# ============================ reports (34) ==================================
add("reports/accounts_payable_report.php", "active", "implemented", "/reports (ap-aging) + /ap",
    "GET /reports/ap-aging", "—", "AP aging report", "Reversal-aware open equation")
add("reports/accounts_payable_report2.php", "dead", "dropped-dead", "—", "—", "—",
    "Debug backdoor via /test", "Security hazard removed")
add("reports/accounts_payable_report_old.php", "dead", "dropped-dead", "—", "—", "—", "Old backup", "")
add("reports/accounts_receivable_report.php", "active", "implemented", "/reports (ar-aging)",
    "GET /reports/ar-aging", "—", "AR aging report", "")
add("reports/all_sales_order_report.php", "active", "implemented-changed", "/reports (daily-sales, sales-by-*)",
    "GET /reports/daily-sales", "—", "All sales orders report", "")
add("reports/backlog.php", "active", "implemented-changed", "/reports (backlog)",
    "GET /reports/backlog", "—", "Backlog report", "Legacy queried a nonexistent item_units table; new backlog from the order state machine")
add("reports/get_backlog_report.php", "active", "implemented-changed", "/reports (backlog)",
    "GET /reports/backlog", "—", "Backlog data feed", "")
add("reports/backlog_closing_stock.php", "dead", "dropped-dead", "—", "—", "—", "Orphan variant", "")
add("reports/balance_sheet_report.php", "active", "implemented", "/accounting/reports (BS)",
    "GET /accounting/balance-sheet", "accounting-statements", "Balance sheet", "A=L+E with real equity + current earnings")
add("reports/cash_flow_report.php", "active", "implemented-changed", "/accounting/reports (CF)",
    "GET /accounting/cash-flow", "financial-corrections", "Cash flow statement",
    "Corrected indirect method (legacy sign errors fixed); ties to ledger cash exactly")
add("reports/cash_received_report.php", "active", "implemented-changed", "/reports (tender-totals)",
    "GET /reports/tender-totals", "—", "Daily cash received", "")
add("reports/cash_received_report-edited.php", "dead", "dropped-dead", "—", "—", "—", "Dev artifact", "")
add("reports/credit_purchases_report.php", "active", "implemented-changed", "/ap",
    "GET /ap/aging", "purchasing-flows.e2e", "Credit purchases report", "")
add("reports/creditors_report.php", "active", "implemented-changed", "/ap",
    "GET /ap/aging", "accounting-statements", "Creditors report", "FROZEN snapshot → derived subledger")
add("reports/daily_stock_report.php", "active", "implemented-changed", "/reports (daily-stock)",
    "GET /reports/daily-stock", "—", "Daily stock report", "Corrected formula; ledger-derived closing")
add("reports/get_daily_stock_report.php", "active", "implemented-changed", "/reports (daily-stock)",
    "GET /reports/daily-stock", "—", "Daily stock feed", "")
add("reports/expenses_report.php", "active", "implemented-changed", "/accounting/journals",
    "GET /accounting/journals", "accounting-statements", "Expenses report", "")
add("reports/get_daily_sales_order_report.php", "active", "implemented", "/reports (daily-sales)",
    "GET /reports/daily-sales", "—", "Daily sales order feed", "")
add("reports/income_statement_report.php", "active", "implemented", "/accounting/reports (P&L)",
    "GET /accounting/profit-and-loss", "accounting-statements", "Income statement", "COGS ties to AVCO ledger")
add("reports/inventory_report.php", "active", "implemented", "/reports (stock-valuation)",
    "GET /reports/stock-valuation", "—", "Inventory report", "")
add("reports/inventory_reportOld.php", "dead", "dropped-dead", "—", "—", "—", "Old backup", "")
add("reports/invoice_report.php", "active", "implemented-changed", "/sales (filters)",
    "GET /sales/invoices?from&to", "sales-flows.e2e", "Invoice report", "")
add("reports/item_transfer_report.php", "active", "implemented", "/inventory/movements",
    "GET /inventory/movements (type filter)", "stock-operations.e2e", "Item transfer report", "")
add("reports/purchase_order_report.php", "active", "implemented", "/purchasing/orders",
    "GET /purchasing/purchase-orders", "purchasing-flows.e2e", "PO report", "")
for scope in ["daily", "weekly", "monthly"]:
    add(f"reports/stock_margin_report_{scope}.php", "active", "implemented-changed", "/reports (item-margin)",
        "GET /reports/item-margin", "—", f"Stock margin report ({scope})",
        "Legacy had 3 inconsistent margin tabs; canonical cost-at-sale AVCO basis")
    add(f"reports/get_stock_margin_report_{scope}.php", "active", "implemented-changed", "/reports (item-margin)",
        "GET /reports/item-margin", "—", f"Stock margin feed ({scope})", "")
add("reports/sales_order_report.php", "active", "implemented", "/reports (sales-by-*)",
    "GET /reports/sales-by-customer|product|user|warehouse", "—", "Sales order report", "")
add("reports/sales_order_summary_report.php", "active", "implemented", "/reports (daily-sales)",
    "GET /reports/daily-sales", "—", "SO summary report", "")
add("reports/sales_order_daily_summary_report.php", "active", "implemented", "/reports (daily-sales)",
    "GET /reports/daily-sales", "—", "SO daily summary", "")
add("reports/trial_balance_report.php", "active", "implemented", "/accounting/reports (TB)",
    "GET /accounting/trial-balance", "accounting-statements", "Trial balance", "Opening+period+closing; ties to BS by construction")

# ============================ root (35) =====================================
for f, cap in [("add_order_row.php", "AJAX order-row adder"),
               ("add_order_row_pos.php", "POS order-row adder"),
               ("add_order_row_pos_unit.php", "POS unit order-row adder"),
               ("add_order_row_pos_unit_fixed_quantity.php", "POS fixed-qty unit row adder"),
               ("add_order_row_negative_bal.php", "Negative-bal order-row adder"),
               ("add_debtor_order_row.php", "Debtor order-row adder"),
               ("add_creditor_order_row.php", "Creditor order-row adder"),
               ("add_proforma_invoice_row.php", "Proforma row adder")]:
    add(f, "active", "implemented-changed", "/pos, /sales-orders (cart/line editors)",
        "server-side line computation in POST /sales/commit, POST /sales-orders", "sales-flows.e2e", cap,
        "Legacy client-side row math (R14 duplication) replaced by server-authoritative line.net (half-even, once)")
add("root_placeholder", "skip", "skip", "", "", "", "", "")  # removed below
del R["root_placeholder"]
add("admin_list.php", "active", "pending", "— (user management UI pending)",
    "— (no user-management controller yet)", "rbac-matrix (permission model only)",
    "User/staff management list", "GAP: user CRUD + role assignment API and page not yet implemented; RBAC catalog exists and is matrix-tested")
add("attendance_list.php", "active", "implemented-changed", "/shifts",
    "GET /shifts, POST /shifts/:id/close, review-variance", "sales-flows.e2e",
    "Staff attendance", "Clock in/out → cashier shifts with derived expected cash + supervisor variance review")
add("backups_creditors.php", "active", "dropped-dead", "—", "—", "—",
    "Maintenance archive of frozen creditor snapshots", "Obsolete: AP is derived from documents; no frozen snapshot to archive")
add("banking.php", "active", "implemented-changed", "/banking/*", "GET/POST /banking/*", "banking-flows", "Banking section shell", "")
add("sales.php", "active", "implemented-changed", "/sales, /payments, /deposits", "GET /sales/invoices, /payments, /deposits", "sales-flows.e2e", "Sales section shell", "")
add("purchases.php", "active", "implemented-changed", "/purchasing/*, /ap", "GET/POST /purchasing/*, /ap/*", "purchasing-flows.e2e", "Purchasing section shell", "")
add("reports.php", "active", "implemented-changed", "/reports, /accounting/reports, /kpi", "GET /reports/*, /accounting/*", "accounting-statements", "Reports section shell", "")
add("customer_statement-old.php", "dead", "dropped-dead", "—", "—", "—", "Backup", "")
add("dashboard.php", "active", "implemented-changed", "/kpi (KPI dashboard); login lands on /catalog",
    "GET /reports/kpi/*", "—", "Home dashboard",
    "Legacy dashboard aggregates → KPI dashboard (13 metrics, snapshots, targets); no legacy-style landing page — register in UAT")
add("enter_payable.php", "active", "duplicate", "—", "—", "—", "Root duplicate of purchases/enter_payable", "See purchases/enter_payable.php row")
add("manage_profile.php", "active", "pending", "— (profile page pending)",
    "GET /auth/me (read-only)", "—", "Own profile management",
    "GAP: password change + profile edit not implemented (auth/me is read-only)")
add("modal_admin_add.php", "active", "pending", "— (pending)", "—", "—", "Add user modal", "GAP: see admin_list.php")
add("modal_admin_edit.php", "active", "pending", "— (pending)", "—", "—", "Edit user modal", "GAP: see admin_list.php")
add("modal_forgot_to_clockout.php", "dead", "dropped-dead", "—", "—", "—", "Posts to dead endpoint", "")
add("modal_goodbye.php", "active", "implemented-changed", "auth flows (login page)",
    "POST /auth/login, /auth/refresh", "rbac-matrix", "Logout/goodbye modal", "Token pair + device registry")
add("modal_logout.php", "active", "implemented-changed", "auth flows", "POST /auth/refresh (rotation)", "rbac-matrix", "Logout modal", "")
add("modal_welcome.php", "active", "implemented-changed", "login → app shell", "—", "—", "Welcome modal", "")
add("modern-dashboard.php", "dead", "dropped-dead", "—", "—", "—", "Modern skin experiment", "")
add("pay_payable.php", "dead", "dropped-dead", "—", "—", "—", "Root mockup duplicate", "")
add("payments.php", "dead", "dropped-dead", "—", "—", "—", "Static-ish page posting w/o param", "")
add("purchase_order_list.php", "active", "duplicate", "—", "—", "—", "Root duplicate of purchases/purchase_order_list", "See purchases row")
add("search_result.php", "active", "partial", "per-page search only",
    "GET /products?query, GET /customers (per-entity)", "—", "Global search",
    "GAP: no cross-entity global search; per-page filters exist")
add("sms_settings.php", "active", "pending", "—", "—", "—",
    "SMS settings", "GAP: settings versioning exists but rejects credential-shaped keys by design; SMS send integration not implemented (demand unvalidated)")
add("suppliers_list.php", "active", "duplicate", "—", "—", "—", "Root duplicate", "See purchases/suppliers_list.php")
add("system_settings.php", "active", "implemented", "/admin/settings",
    "GET/POST /reports/settings (versioned tenant settings)", "returns-flows (settings guard tests)",
    "System settings", "Versioned effective-dated settings; credential-shaped keys rejected")
add("view_accounts_payable.php", "active", "duplicate", "—", "—", "—", "Root duplicate", "See purchases/view_accounts_payable.php")
add("view_journals.php", "active", "implemented", "/accounting/journals",
    "GET /accounting/journals", "accounting-statements", "Journals popup", "")

# ============================ sales (83) ====================================
add("sales/accounts_receivable.php", "active", "implemented", "/reports (ar-aging)",
    "GET /reports/ar-aging", "—", "AR workbench", "Subledger-derived customer balances")
add("sales/get_accounts_receivable_list.php", "active", "implemented", "/reports (ar-aging)",
    "GET /reports/ar-aging", "—", "AR list feed", "")
add("sales/add_customer.php", "active", "implemented", "/customers",
    "POST /customers", "sales-flows.e2e", "Create customer", "")
add("sales/add_customer_pos.php", "active", "implemented", "/pos (quick add)",
    "POST /customers", "sales-flows.e2e", "POS quick customer", "")
add("sales/edit_customer.php", "active", "implemented", "/customers",
    "PATCH /customers/:id", "sales-flows.e2e", "Edit customer", "")
add("sales/customers_list.php", "active", "implemented", "/customers",
    "GET /customers", "sales-flows.e2e", "Customer list", "")
add("sales/add_debtor_opening_balance.php", "active", "implemented", "— (back-office API)",
    "POST /party-opening-balances", "sales-flows.e2e", "Debtor opening balance", "")
add("sales/edit_debtor_opening_balance.php", "active", "implemented-changed", "—",
    "opening balances are explicit documents (append-only adjustments)", "sales-flows.e2e", "Edit debtor opening", "")
add("sales/add_creditor_opening_balance.php", "active", "implemented", "—",
    "POST /party-opening-balances", "purchasing-flows.e2e", "Creditor opening balance", "")
add("sales/edit_creditor_opening_balance.php", "active", "implemented-changed", "—",
    "append-only documents", "purchasing-flows.e2e", "Edit creditor opening", "")
add("sales/add_invoice.php", "active-broken", "implemented-changed", "— (via orders/POS)",
    "POST /sales-orders/:id/confirm posts the invoice", "sales-flows.e2e",
    "Create invoice", "Legacy posted to missing admin/sales_order/create; fixed semantics")
add("sales/edit_invoice.php", "dead", "dropped-dead", "—", "—", "—", "Edit invoice", "Immutability; reversal instead")
add("sales/add_sales_order.php", "active-broken", "implemented-changed", "/sales-orders",
    "POST /sales-orders", "sales-flows.e2e", "Create sales order", "Legacy broken endpoint fixed")
add("sales/edit_sales_order.php", "active", "implemented-changed", "/sales-orders",
    "PATCH /sales-orders/:id (before confirm)", "sales-flows.e2e", "Edit sales order", "")
add("sales/sales_order_list.php", "active", "implemented", "/sales-orders",
    "GET /sales-orders", "sales-flows.e2e", "Sales order list", "")
add("sales/preview_order.php", "active-broken", "implemented-changed", "/sales-orders (review)",
    "GET /sales-orders/:id", "sales-flows.e2e", "Order preview", "Legacy update path missing; fixed")
add("sales/get_orders.php", "active", "implemented", "/sales-orders",
    "GET /sales-orders", "sales-flows.e2e", "Orders feed", "")
add("sales/get_orders_list.php", "active", "implemented", "/sales-orders",
    "GET /sales-orders", "sales-flows.e2e", "Orders list feed", "(loader was commented out in legacy)")
add("sales/get_orders_list_bydate.php", "active", "implemented", "/sales-orders",
    "GET /sales-orders?from&to", "sales-flows.e2e", "Orders by date", "")
add("sales/get_unpicked_order.php", "active", "implemented", "/sales-orders (fulfillment)",
    "GET /fulfillments, POST /fulfillments/:id/dispatch|deliver", "sales-flows.e2e",
    "Unpicked orders", "Fulfillment documents track the physical handover")
add("sales/create_proforma_invoice.php", "active", "partial", "— (web UI pending)",
    "POST /quotations (+ lifecycle)", "review-hardening", "Create proforma/quotation",
    "API + tests done; web page pending")
add("sales/proforma_invoice_print.php", "active", "pending", "—",
    "—", "—", "Proforma A4 print", "GAP: quotation print layout pending (template gallery)")
add("sales/payments.php", "active", "implemented", "/payments",
    "POST /payments (typed tenders + explicit allocations)", "sales-flows.e2e", "Payments", "")
add("sales/payments_select.php", "active", "implemented", "/payments",
    "allocation rows in POST /payments", "sales-flows.e2e", "Payment invoice selection", "")
add("sales/edit_payments.php", "active", "implemented-changed", "/payments",
    "append-only + reversals", "sales-flows.e2e", "Edit payment", "")
add("sales/view_payments.php", "active", "implemented", "/payments",
    "GET /payments", "sales-flows.e2e", "Payments list", "")
add("sales/view_invoices.php", "active", "implemented", "/sales",
    "GET /sales/invoices", "sales-flows.e2e", "Invoice list", "")
add("sales/view_receipts.php", "active", "implemented", "/payments + /print/receipt/[id]",
    "GET /payments", "sales-flows.e2e", "Receipts list", "")
add("sales/get_receipt_list.php", "active", "implemented", "/payments",
    "GET /payments", "sales-flows.e2e", "Receipt list feed", "")
add("sales/get_cash_received_list.php", "active", "implemented-changed", "/reports (tender-totals)",
    "GET /reports/tender-totals", "—", "Cash received feed", "")
add("sales/daily_cash_received.php", "active", "implemented-changed", "/reports (tender-totals)",
    "GET /reports/tender-totals", "—", "Daily cash received", "")
add("sales/receipt.php", "active", "implemented", "/print/receipt/[id]",
    "GET /sales/invoices/:id/receipt", "sales-flows.e2e", "Receipt print (A4)", "")
add("sales/receipt_pos.php", "active", "implemented", "/print/receipt/[id]",
    "GET /sales/invoices/:id/receipt", "sales-flows.e2e", "Receipt print (thermal)", "")
add("sales/receipt_modal.php", "active", "implemented", "/print/receipt/[id]",
    "GET /sales/invoices/:id/receipt", "sales-flows.e2e", "Receipt modal", "")
add("sales/receipt-pos-bkup.php", "dead", "dropped-dead", "—", "—", "—", "Backup", "")
add("sales/invoice_print.php", "active", "implemented", "/sales (print view)",
    "GET /sales/invoices/:id", "sales-flows.e2e", "Invoice print", "")
add("sales/printer_selection.php", "active", "implemented-changed", "browser print dialog",
    "—", "—", "Printer selection", "Web print via browser; ESC/POS adapters are Phase 6 hardware work")
add("sales/payment_with_goods.php", "active", "implemented-changed", "/payments (credit tender)",
    "POST /credits/apply", "sales-flows.e2e", "Payment with goods (credit)", "")
add("sales/edit_payment_with_goods.php", "active-broken", "dropped-dead", "—", "—", "—",
    "Broken PWG editor", "Replaced by append-only credit applications")
add("sales/payment_with_goods_loan.php", "dead", "dropped-dead", "—", "—", "—", "Loan variant", "")
add("sales/get_payment_with_goods_order.php", "active", "implemented-changed", "—",
    "credit applications carry order references", "sales-flows.e2e", "PWG order lookup", "")
add("sales/get_payables_order_so_codes.php", "active", "implemented-changed", "—",
    "allocation references", "sales-flows.e2e", "Payables SO code lookup", "")
add("sales/cash_goods.php", "active", "implemented", "/pos (split tenders)",
    "POST /sales/commit (mixed tenders)", "sales-flows.e2e", "Cash+goods sale", "")
add("sales/deposit.php", "dead", "dropped-dead", "—", "—", "—", "Dead deposit view",
    "Capability delivered by /deposits page + POST /deposits")
add("sales/view_deposits.php", "dead", "dropped-dead", "—", "—", "—", "Dead deposits view", "See /deposits")
add("sales/get_deposit_list.php", "active", "implemented", "/deposits",
    "GET /deposits", "sales-flows.e2e", "Deposit list feed", "")
add("sales/edit_deposit.php", "active", "implemented-changed", "/deposits",
    "deposits are documents; consumption via POST /credits/apply", "sales-flows.e2e", "Edit deposit", "")
add("sales/add_sales_order_negative_bal.php", "active", "implemented", "/deposits",
    "POST /deposits", "sales-flows.e2e", "Deposit (negative-bal) order", "")
add("sales/edit_sales_order_negative_bal.php", "active", "implemented-changed", "/deposits",
    "explicit credit applications", "sales-flows.e2e", "Edit deposit order", "")
add("sales/enter_payable.php", "active", "implemented-changed", "—",
    "customer docs via party APIs", "sales-flows.e2e", "Enter payable (sales side)", "")
add("sales/edit_enter_payable.php", "active", "implemented-changed", "—",
    "append-only", "sales-flows.e2e", "Edit payable", "")
add("sales/customer_statement.php", "active", "implemented", "/reports (customer-statement)",
    "GET /reports/customer-statement", "—", "Customer statement",
    "One running balance: invoices/payments/returns/credit notes/store credit")
add("sales/customer_statement-old.php", "dead", "dropped-dead", "—", "—", "—", "Backup", "")
add("sales/customer_statement_optimized.php", "dead", "dropped-dead", "—", "—", "—", "Experiment", "")
add("sales/add_item.php", "active", "implemented", "/catalog",
    "POST /products", "vertical-slice.e2e", "Create item", "")
add("sales/edit_item.php", "active", "implemented", "/catalog",
    "PATCH /products/:id", "vertical-slice.e2e", "Edit item", "")
add("sales/view_items.php", "active", "implemented", "/catalog",
    "GET /products", "vertical-slice.e2e", "Item list", "")
add("sales/add_item_category.php", "active", "implemented", "/categories",
    "POST /categories", "vertical-slice.e2e", "Create category", "")
add("sales/edit_item_category.php", "active", "implemented", "/categories",
    "PATCH /categories/:id", "vertical-slice.e2e", "Edit category", "")
add("sales/view_items_category.php", "active", "implemented", "/categories",
    "GET /categories", "vertical-slice.e2e", "Category list", "")
add("sales/add_item_main_category.php", "active", "implemented", "/categories",
    "POST /categories (parent)", "vertical-slice.e2e", "Create main category", "")
add("sales/edit_item_main_category.php", "active", "implemented", "/categories",
    "PATCH /categories/:id", "vertical-slice.e2e", "Edit main category", "")
add("sales/view_items_main_category.php", "active", "implemented", "/categories",
    "GET /categories", "vertical-slice.e2e", "Main category list", "")
add("sales/edit_items_bulk.php", "active-broken", "dropped-dead", "—", "—", "—",
    "Bulk item edit (missing item/bulk_update endpoint)", "Broken in legacy; not ported — register as candidate enhancement")
add("sales/add_item_script.php", "dead", "dropped-dead", "—", "—", "—", "Script debris", "")
add("sales/modern-add-item.php", "dead", "dropped-dead", "—", "—", "—", "Modern skin", "")
add("sales/modern-edit-item.php", "dead", "dropped-dead", "—", "—", "—", "Modern skin", "")
add("sales/pricing.php", "active", "partial", "— (web UI pending)",
    "POST /price-lists, POST /price-lists/:id/items, GET /pricing/resolve", "—",
    "Price list management", "API implemented (effective-dated lists + resolve + price authority); management page pending")
add("sales/get_price_list.php", "active", "partial", "—",
    "GET /price-lists", "—", "Price list feed", "See pricing.php")
add("sales/get_price_item_list.php", "active", "partial", "—",
    "GET /price-lists", "—", "Price item feed", "See pricing.php")
add("sales/add_item_to_price_list.php", "active", "partial", "—",
    "POST /price-lists/:id/items", "—", "Add item to price list", "See pricing.php")
add("sales/item_history.php", "active", "implemented", "/inventory/movements",
    "GET /inventory/movements?productId", "stock-operations.e2e", "Item history", "")
add("sales/get_item_history.php", "active", "implemented", "/inventory/movements",
    "GET /inventory/movements", "stock-operations.e2e", "Item history feed", "")
add("sales/get_item_history_purchase_dates.php", "active", "implemented-changed", "/inventory/movements",
    "GET /inventory/movements (receipt layers)", "stock-operations.e2e", "Purchase dates", "AVCO layers carry receipt cost evidence")
add("sales/get_available_units_ids.php", "active", "implemented", "—",
    "GET /products/:id/units", "sales-flows.e2e", "Available units", "")
add("sales/get_added_units_list_for_item.php", "active", "implemented", "—",
    "GET /products/:id/units", "sales-flows.e2e", "Item units list", "")
add("sales/get_invoice_list_bydate.php", "active", "implemented", "/sales",
    "GET /sales/invoices?from&to", "sales-flows.e2e", "Invoices by date", "")
add("sales/refund_sales_order.php", "active-broken", "implemented-changed", "/returns, /returns/new",
    "POST /returns (+ approval, credit notes, refunds, store credit, exchanges)", "returns-flows",
    "Refund sales order",
    "Legacy was destructive in-place amendment (broken vs own schema, hardcoded SO code); replaced by the full append-only returns engine — Phase 5")
for f in ["css.php", "includes_top.php", "includes_bottom.php", "modal.php"]:
    add(f"sales/{f}", "active", "implemented-changed", **POS_SHELL)
add("sales/all_items_report.php", "active", "implemented", "/reports (stock-valuation)",
    "GET /reports/stock-valuation", "—", "All items report", "")

# ============================ emit ==========================================
def main():
    rows = list(csv.DictReader(INTAKE.open()))
    missing = []
    out_rows = []
    for r in rows:
        rel = r["Legacy PHP path"].replace("v_l02i/backend/admin/pages/", "")
        cur = R.get(rel)
        if cur is None:
            missing.append(rel)
            continue
        out_rows.append({
            "legacy_view": rel,
            "module": r["Module/folder"],
            "classification": cur["classification"],
            "capability": cur["capability"],
            "target_web": cur["target_web"],
            "target_api": cur["target_api"],
            "test_reference": cur["test"],
            "parity_status": cur["status"],
            "notes": cur["notes"],
        })
    extra = sorted(set(R) - {r["Legacy PHP path"].replace("v_l02i/backend/admin/pages/", "") for r in rows})
    if missing:
        print("MISSING curations for %d intake rows:" % len(missing))
        for m in missing:
            print("  -", m)
        return 1
    if extra:
        print("curated rows not in intake (ignored):", extra)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    # summary
    from collections import Counter
    cls = Counter(r["classification"] for r in out_rows)
    st = Counter(r["parity_status"] for r in out_rows)
    print(f"wrote {len(out_rows)} rows -> {OUT}")
    print("classification:", dict(cls))
    print("parity_status:", dict(st))
    return 0

if __name__ == "__main__":
    sys.exit(main())
