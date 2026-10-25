# Reports and KPI Inventory

## 1. Operational reports

| Report | Entry | Source logic | Audit findings |
|---|---|---|---|
| Daily stock report | `Admin.php:1107-1142` → `reports/get_daily_stock_report.php` | stock_manager opening/stock_in ± Σ quantity_picked (by type_of_sales) + transfers vs last `item_balance` snapshot | actual-closing only computed when sale+transfer both exist; hardcoded "CEMENTS OUT" |
| Backlog report | `Admin.php:1145-1181` → `reports/get_backlog_report.php` | opening+in−picked−transfers; today→items.quantity | queries non-existent `item_units` table; cashier filter inconsistent |
| Item history | `Admin.php:25459-25486` → `sales/item_history.php` + `get_item_history(_purchase_dates).php` | SO/PO rows per item with balances | OK-ish; snapshot-based |
| Inventory report | `Admin.php:746-758` → `reports/inventory_report.php` | items×purchase_price (today) or next stock_manager opening (historical) | nondeterministic multi-user same-day |
| All items report | `Admin.php:762-774` | static item listing by category/supplier | fine |
| Stock margin daily/weekly/monthly | `Admin.php:777-875`, loaders 25762-25790 | S/C/M per item; sources differ per tab | three inclusion rules; cost = purchase price at sale |
| Item transfer report | `Admin.php:960-975` → `reports/item_transfer_report.php` | token groups; value = qty × latest stock_manager selling_price | nondeterministic valuation |
| Purchase order report | `Admin.php:943-957` | PO groups; SUM(qty/amount), MAX(due/price) | duplicated-totals aggregation done right (GROUP BY po_code) |
| Cash received report | `Admin.php:897-910` | payment rows by category × account | category conventions mixed |
| Daily cash received | `Admin.php:912-925` | receipts grouped by exact timestamp second | grouping ineffective |
| Expenses report | `Admin.php:928-940` | Payable + Expense payments | COGS conflation |
| Sales order report / summary / daily summary / all | `Admin.php:977-1075` | payment_with_goods via Ajax feeds | dual-table caveat |

## 2. Financial statements

| Report | Entry | Basis | Findings |
|---|---|---|---|
| Trial balance | `Admin.php:881-894` | general_journal grouped by account_name | orphans vanish; no opening balances |
| Balance sheet | `Admin.php:1184-1195` | snapshot balances + frozen debtors/creditors + inventory snapshots; equity plug | stale AR/AP; not derivable |
| Income statement | `Admin.php:1603-1614` | cash basis over payment types | COGS = supplier payments; mixed date filters |
| Cash flow | `Admin.php:1617-1628` | hybrid (POs as outflows; receipt payments as inflows) | cannot reconcile |
| Accounts receivable report | `Admin.php:1584-1602` | invoice amount_due sums + outstanding_debts | no aging; `$from_ts` used before definition; sign inversion on suppliers |
| Accounts payable report | `Admin.php:1471-1502` | negative invoices + outstanding_debts + goods creditors | goods-creditor math complex but intentional; `/test` debug variant |
| Creditors report | `Admin.php:1505-1529` | **frozen creditors table** | only historical date returns data |
| Payables taken report | `Admin.php:1532-1556` | payment_with_goods type Payables | pre-window/pre-year rules; R-code exclusions |
| Credit purchases report | `Admin.php:1559-1581` | accounts_payable amount_due>0 | fine |
| Invoice report | `Admin.php:1077-1104` | invoice lists | fine |
| Customer statement | `Admin.php:711-746` | weekly buckets from journal+payment_with_goods | grand-total mixing; date-filter quirks |

## 3. Journals

Sales / Purchases / Receipts / Payments / General (incl. Fund Transfer) / All — `admin/get_all_journal` (24325-24359) → `journal/get_*_journal.php`; direct `general_journal` queries; general view has an OR-chain bug.

## 4. Dashboards & KPIs

- Dashboard (`pages/dashboard.php`): KPI cards + search; fires `updateUnitQuantity` maintenance (line 309).
- `kpi_snapshots` table (revenue, orders, AOV, gross profit, margin, inventory value, low/out-of-stock) — **designed, never wired**; becomes the target KPI store seeded by a scheduled job.
- `sales_targets` — designed, never wired.
- No aging, no top-N, no trend charts beyond static cards.

## 5. KPI definitions for the new system (baseline from audit)

| KPI | Legacy availability | Target definition |
|---|---|---|
| Daily sales (cash vs credit) | partial (category conventions) | posted invoices by tender class, shift-scoped |
| Gross margin per item/period | margin reports (3 inconsistent tabs) | one canonical COGS basis; ties to P&L |
| Stock on hand & valuation | inventory report (nondeterministic) | ledger-derived at date × cost basis |
| Receivables aging | **none** | 0-30/31-60/61-90/91-120/120+ buckets |
| Payables aging | none | same |
| Cash position per account | banking cards (snapshot) | ledger-derived per account, transfer-aware |
| Daily cashier variance | daily stock + cash reports | shift session: expected vs counted (cash & stock) |
| Stock alerts (reorder) | **none** | reorder point/level per item-location (AI-assisted) |
| Top customers/items | none | standard rankings |
| Salesperson performance | raw data only | attributed sales & collections |
| Deposit/credit balances | deposit list | credit documents outstanding |
| Returns rate | none (broken refunds) | returns vs sales, by reason |

## 6. Print artefacts

Invoice (A4), proforma, receipt (thermal/A4), bank enquiry print, statement print, printer selection UI. ESC/POS helper is a dead demo. Target: designed print templates (thermal 58/80mm, A4/A5 invoice + waybill) with reprint audit.
