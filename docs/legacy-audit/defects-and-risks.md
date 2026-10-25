# Defects and Risks — Known & Suspected Incorrect Calculations / Business Logic

Severity: **S1 critical** (data corruption / security), **S2 major** (wrong numbers, broken flows), **S3 moderate** (drift, UX, maintainability). Every item carries evidence. Items marked *(verify in production data)* are suspected from code but should be quantified against the real dump during migration dry-runs.

## A. Money-multiplication & accounting integrity

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| D1 | S1 | **Specific-invoice split payments multiply money.** Every per-account statement in `payments_received('create')` specific-invoice branch uses the receipt **total** instead of the per-account share: invoice `amount_paid += total` per account; AR `−= total` per account; paid-to `+= total`; `payment.amount = total`; journal Dr/Cr = total. N accounts → N× total posted while `amount_due` stays correct. *(verify: receipts with >1 distinct account_id per receipt_code vs invoice.amount_paid)* | `Admin.php:17270-17438` |
| D2 | S1 | **Receipt-code collisions.** `'DP1REC-'.YmdHis`, no uniqueness; receipt views/edit/delete key on it → same-second receipts merge. | 6336, 16815, 17367; `receipt_pos.php:80-90` |
| D3 | S1 | **Browser-driven ledger overwrites.** `update_ables` overwrites AR/AP `current_balance` + latest journal snapshots from POS page JS on every load; masks D1 and races concurrent cashiers. | `Admin.php:24775-24817`; `get_main_page.php:691-706` |
| D4 | S1 | **No DB transactions anywhere** (zero `trans_start`); every posting is 5–8 sequential autocommit writes. Crash → permanent ledger corruption. *(verify: orphan rows — payment without journals, invoice without SO lines)* | repo-wide search |
| D5 | S1 | **Float money + raw-POST SQL arithmetic** (`set('current_balance','current_balance + '.$x, FALSE)`); no casting, no cents math. | throughout; schema `double` columns |
| D6 | S2 | **`payment.journal_id` links only the second (Dr) journal row** — Cr linkage lost. | 17033-17038, 14307-14312 |
| D7 | S1 | **Balance sheet reads frozen `debtors`/`creditors` tables** whose only writer (`debtorsCreditorsUpdator`) is 100% commented out → AR/AP sections frozen at last run (~2023-12-31). `creditors_report` same. | `Admin.php:1198-1468`; `balance_sheet_report.php:129-222`; `creditors_report.php:39-46` |
| D8 | S2 | **Trial balance omits orphan account names & opening balances** — movement-only, cannot tie to balance sheet. | `trial_balance_report.php:47-57` |
| D9 | S2 | **Income statement is cash-basis with COGS = supplier payments** (incl. loan repayments `de_*` and cash-creditor payouts `ce_*`); mixed lexicographic-date vs timestamp filters → sections cover different periods. | `income_statement_report.php:47-78` |
| D10 | S2 | **Cash flow counts all POs as outflows** (credit purchases included) while excluding po-tied supplier payments; deposits never inflows; cannot reconcile to closing balances. | `cash_flow_report.php:56-178` |
| D11 | S2 | **`prev_paid`/`p_prev_paid` half-maintained**; `track_code` overwritten onto prior payment rows (16943-16948) destroying audit linkage; "no edit after a day" rule commented out (17719-17725). | 17842, 18760-18770; `Crud_model.php:570-580` |
| D12 | S2 | **General supplier payment is a silent no-op** (whole branch commented out; no JSON response → UI hangs). | `Admin.php:14574-14827`, 15540+ |
| D13 | S2 | **Deposits update posts even after validation errors** (account/journal writes outside the error `else`); mismatched `'Deposit-His'` vs `'Opening-balance'` existence check. | 16430-16450, 16607-16725 |
| D14 | S2 | **`accounts_used` column mismatch** (`account_amount` vs schema `amount`) + never maintained live → receipt "Payment Methods" block stale/empty. | `Crud_model.php:3231`; schema:57; `receipt_pos.php:270-279` |
| D15 | S2 | **Journal general view OR-chain broken** — Fund Transfer rows from any account/date leak into filtered listings. | `get_general_journal.php:37-39` |

## B. Sales / POS correctness

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| R1 | S1 | **No stock check for package sales** on the live engine → silent negative stock. (The dead alterated fork checks packages but not units — complementary gaps.) | `Admin.php:5835-5862` vs 7826-7847 |
| R2 | S2 | **Views post to non-existent `admin/sales_order/*` endpoints** — pos list delete, add_sales_order/add_invoice create, preview_order update, edit_payment_with_goods update, view_invoices delete. | `pos/sales_order_list.php:908`; `add_sales_order.php:176,686`; `preview_order.php:35,505`; `edit_payment_with_goods.php:22,292`; `view_invoices.php:668,750` |
| R3 | S1 | **Same-second row-id collisions** — row inputs keyed by `strtotime('now')`; two rows in one second merge (last value wins; server double-inserts merged row). | `add_order_row_pos.php:12-57`; `get_main_page.php:1172-1179` |
| R4 | S2 | **Strict `===` POST-string status comparisons** + missing overpaid branch at create → NULL/stale statuses. | 6120-6133, 6323, 7038, 7424, 10529, 10761 |
| R5 | S2 | **`can_edit_order` guard broken** — looks up `so_id` with a so_code; always returns 'yes'; waybill-edit rule never fires. | `Admin.php:24566-24619` |
| R6 | S1 | **Race conditions in every code allocator** — booklet read-then-use with no locking; two cashiers can consume one invoice code. | `Crud_model.php:3126-3157` vs closure at sale end |
| R7 | S2 | **Undefined-variable accounting bugs** — `$payable_to_customer` (7091-7093), `$customer_id` in negative-bal create (10919-10921), `$amount` in `add_creditor_order_row` (23804), `$ounter`/`$counter` typo (uvh:354-362). | cited |
| R8 | S2 | **Discount inconsistency** — line amounts exclude the order discount; invoice print sums line amounts → printed total ≠ invoice amount whenever discount ≠ 0. | `invoice_print.php:361-383` |
| R9 | S2 | **Editing posted orders rewrites history** — cascades `item_balance` and `stock_manager` rewrites across later rows/dates; multi-payment guard counts unique accounts not payments → double journal posting possible. | 7211-7270, 7465-7494; 6854-6861 |
| R10 | S1 | **Refund engine writes non-existent columns** (`quantity_returned`, `amount_refunded`, `refund` not in `sales_order` schema) → SQL error; flow broken. `$param4` branches unreachable. | `Admin.php:9902-9930`, 10075+; schema:909-958 |
| R11 | S2 | **Refund UI hardcodes SO code** `'DP1SO-42299'`; `$param2` commented out. | `refund_sales_order.php:2, 557` |
| R12 | S2 | **Dead tax columns** — no VAT/NHIL/GETFund/COVID computation anywhere despite columns. | schema:947-952; repo-wide search |
| R13 | S2 | **Nondeterministic price picks** — `last_row()` without ORDER BY; unit price lookup ignores `unit_id`. | 23877-23938 |
| R14 | S3 | **Per-row duplication of order totals** (`grand_total`, `total_quantity`, `amount_paid`, `amount_due`) — any naive SUM multiplies. | 5916-5935; `Crud_model.php:237` |
| R15 | S3 | **`items_prices` backfill** missing `customer_id`, gated on last iteration. | 6214-6239 |

## C. Inventory integrity

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| I1 | S1 | **Stock replicated in ≥7 stores without reconciliation**; only `delete_sales_order` cascades snapshot fixes — historical `item_balance` drift is proven by the existence of `updateZeroBalanceItems()` patch endpoint. | [stock-movement-map.md](stock-movement-map.md) §1; `Admin.php:25835-25869` |
| I2 | S1 | **`clock_in_out` endpoint missing** — UI posts to a method that doesn't exist; private `clock_in/out` uncallable from helper → the daily stock-sheet wiring is broken; first-login SQL partially compensates. | `top-header.php:197,282,318`; `manager_helper.php:98-223` |
| I3 | S2 | **`stock_manager` cross-user contamination** — PO create/update/delete and SO delete adjust rows **without user_id filter** while reports filter by user. | 4756-4762; `Crud_model.php:353-358, 967-986` |
| I4 | S2 | **Closing stock summary double-counts** `stock_in_today` (already in closing). | `closing_stock_summary.php:46-47` |
| I5 | S2 | **Backlog report queries non-existent table** `item_units.quantity_per_unit`; sales not cashier-filtered while transfers are. | `get_backlog_report.php:128-164` |
| I6 | S2 | **Margin reports disagree by construction** — weekly sources `sales_order`, daily/monthly `payment_with_goods` (and every sale writes both); three receivable-inclusion rules; cost basis = purchase price at sale (no FIFO/AVCO). | margin views cited in [calculation-register.md](calculation-register.md) C-12 |
| I7 | S2 | **PO edit fatal bug** — `where_not_in('account_name', $account_names_array)` on an undefined variable. | `Admin.php:5468, 5564` |
| I8 | S3 | **PO create** supplier-address update on undefined `$supplier_id` (silent no-op). | 4954 |
| I9 | S3 | **`item/bulk_update` has no handler** — bulk edit silently does nothing. | `edit_items_bulk.php:58` |
| I10 | S3 | **Same-second `units_items` binding race** (timestamp keying); `items_units_prices` unique key omits `unit_id`; `stock_record` bigint vs float quantities. | `Admin.php:4143-4146`; schema:462-464, 1111-1128 |
| I11 | S3 | **Transfers post quantities into GL money columns**; receiver is free text; edit cleanup block uses undefined `$item`. | 23062-23105; 23309-23321 |
| I12 | S3 | **Dead cron tail** (`var_dump; return;`) makes half of `cronJobForClockingInClockingOut` unreachable. | 25119-25120 |

## D. AR/AP & customer data

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| A1 | S2 | **Asymmetric goods-creditor opening accounting** — creation never credits AP (commented out) but removal debits it → systematic AP under-count on edits. | `Admin.php:2693-2701` vs 3184-3203 |
| A2 | S2 | **Opening-balance edits don't adjust control accounts** (only the insert path does) → AR/AP drift. | 3935-4032 |
| A3 | S2 | **Statement grand-total row mixes cumulative/weekly**; `from/to` filtering only applies to week discovery; opening row always rendered. | `customer_statement.php:1366-1368, 424-428` |
| A4 | S2 | **AR report uses `$from_ts` before definition** — overpaid-supplier section unreliable; supplier candidates selected `amount_due<0` but summed `>0` (sign inversion). | `accounts_receivable_report.php:334-339`; `get_accounts_receivable_list.php:70-80,192-198` |
| A5 | S3 | **`'supllier'` typo** in category filters (vs 'supplier') — supplier filter matches nothing. | `Admin.php:24224, 24446, 24476` |
| A6 | S3 | **`customer_validation_insert/update` disabled** (commented) → duplicate customers accumulate. | 2582, 3017, 3318 |
| A7 | S3 | **Delete-customer leaves `payment_with_goods` rows**; deposits have no delete/void → orphan negative invoices. | `Crud_model.php:188-210`; 16368-16734 |
| A8 | S3 | **Echo-and-continue error paths** (invalid email still inserts; loop echoes after partial writes). | 2495-2500, 2651-2654 |
| A9 | S2 | **No unique indexes** on `invoice(invoice_code)`, `sales_order(so_code)`; duplicate-check helpers disabled in several flows; `'R'` suffix code reuse by design. | schema; 10486-10496 |

## E. Security (details in `docs/architecture/security-rbac.md`)

| ID | Sev | Defect | Evidence |
|---|---|---|---|
| E1 | S1 | **~70 unauthenticated `Admin.php` endpoints**, incl. financial writes (`update_ables`, `delete_creditors`, `batchPriceUpdate`, `generateInvoiceCodes`, `addItemUnits`, `updateUnitQuantity`, `updateZeroBalanceItems`) and full report/receipt reads; **every `Modal::popup_*` unauthenticated**. | function-by-function auth diff (61 checks / 165 functions) |
| E2 | S1 | **Any cashier can create a level-1 superadmin, delete admins, edit settings/SMS** — only `admin_login` checked. | `Admin.php:181-465, 1631-2003` |
| E3 | S1 | **Mobile API**: `authenticate=false` global bypass; sha1 password overwrite would brick web bcrypt logins; unvalidated image upload; table-name injection. | `Mobile.php:913-914, 695-723, 451-462, 918` |
| E4 | S1 | **Updater = authenticated RCE** (uploads zip, executes `update_script.php`). | `Updater.php:53-102` |
| E5 | S1 | **Unauthenticated account-lockout DoS** (`login/block_account`). | `Login.php:72-87` |
| E6 | S2 | **Mass XSS** — 6,497 raw echoes vs 2 `htmlspecialchars` calls; JSON builders embed unescaped DB values; auth key displayed in admin list; login screen leaks superadmin email. | views census; `Admin.php:434-451`; `login.php:5,127` |
| E7 | S2 | **Weak secrets handling** — 5-char auth keys from small mt-rand space, non-constant-time compare; plaintext password SMSed/emailed; Hubtel secret in `settings` echoed to UI; hard-coded DB password in `Install.php:176`. | cited |
| E8 | S2 | **Uploads without validation** (profile, logo, item images, updater zip). | 133, 1983, 4217, 4361 |
| E9 | S3 | **CSRF posture unverifiable** (config absent from snapshot; GET modals exempt regardless); no session regeneration on login; order-by direction injection on DataTables. | cited |

## F. Data-quality risks for migration (to quantify during dry-runs)

1. Split-payment receipts on specific invoices (D1) → invoice.amount_paid inflated vs Σ payments. Reconciliation must recompute from payment rows.
2. `update_ables` history → `accounts.current_balance` untrustworthy; AR/AP must be rebuilt from invoice/AP sums.
3. Frozen `debtors`/`creditors` → statements before cutover may disagree with derived balances; pick derived as truth, report the difference.
4. Discount-era invoices → `Σ sales_order.amount ≠ invoice.amount`; use invoice.amount as authority.
5. `'R'`-suffixed codes and `'Opening-*'` literals → namespace collisions in unique-constrained new schema; import with legacy namespace.
6. Negative stock rows / zero-balance patches (`updateZeroBalanceItems` usage) → stock rebuild must start from a physical count baseline at cutover, not from computed history.
7. `stock_record` bigint rounding → cannot serve as migration source for quantities.
8. Same-second receipt collisions → deduplicate by (receipt_code, customer, timestamp-second) heuristics + manual review list.
9. Multi-unit items under the `(item_id, customer_id)`-unique price tables → possible lost unit prices; import all rows, dedupe by latest updated_date.
10. Orders edited after payment (allowed historically) → journal/SO/payment inconsistencies; flag via `track_code` mismatch report rather than auto-repair.

## G. Priority remediation order (for the rebuild)

1. New schema + posting engine with transactions, decimal money, unique codes (kills D2/D4/D5 class).
2. Server-side totals/status/allocation engines (kills D1, R3, R4, C-17/C-18/C-31 class).
3. Auth guard on every endpoint + RBAC (kills E1/E2 class).
4. Stock ledger (kills I1/I3 class).
5. Returns as documents on the dead-DDL design (kills R10/R11 class).
6. Live-computed statements (kills D7-D10, A3/A4 class).
