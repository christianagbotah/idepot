# Business-Rules Catalogue

Every rule is tagged: **[P] preserve** (verified correct business behaviour), **[P*] preserve intent, fix mechanism** (real business need, broken implementation), **[D] defective — replace with corrected rule** (see [calculation-register.md](calculation-register.md) / [defects-and-risks.md](defects-and-risks.md)), **[X] drop** (school-era or dead). Evidence citations throughout.

## Sales & POS

| # | Rule | Tag | Evidence |
|---|---|---|---|
| S1 | A sale can be paid now (cash), later (credit), or part-paid; status ladder Unpaid / Partially Paid / Paid / Over Paid | P* (ladder correct; strict `===` + missing overpaid branch at create are defects) | `Admin.php:6120-6133`, 16884-16895 |
| S2 | `type_of_sales`: Cash / Receivables (credit) / Payables (paid, goods owed) | P | 6121-6132, 12335 |
| S3 | Goods may be delivered later than payment: `quantity_picked` vs `quantity_due = quantity − quantity_picked` | P | 5935, 12510-12511 |
| S4 | Later deliveries consume a **waybill**; one waybill may serve all of a customer's picks that day | P | `Crud_model.php:3136-3157`, `manager_helper.php:62-77` |
| S5 | Invoice numbers come from pre-printed booklets; spoiled codes are marked "not used" with a reason | P | [document-numbering.md](document-numbering.md) §2 |
| S6 | Order-level single discount field applied once to the total (not per line) | P* (intent) / D (line amounts don't carry discount → Σ lines ≠ total) | `add_order_row_pos.php:204-294`; invoice_print 361-383 |
| S7 | Customer-specific prices: per customer per item (package) and per customer per item per unit; fallback to default selling/unit price; first sale back-fills the customer's price row | P* (backfill buggy) | `Admin.php:23866-24049`, 6214-6239 |
| S8 | Items may be sold in packages or broken into units; tons sold as fixed-quantity bundles | P | [unit-conversion-rules.md](unit-conversion-rules.md) |
| S9 | Cash-creditor customers (negative balance) can settle credit by taking goods; codes get an `R` suffix; consumed credit tracked via deposit disbursement rows | P* | `Admin.php:10399-12287` |
| S10 | Deposits (advance payments) are customer credit, consumed FIFO-ish at invoicing (opening-balance credit first) | P* | 10773-10917 |
| S11 | Proforma/quotation writes no stock or GL | P | 5610-5756 |
| S12 | Overselling is silently allowed for package sales (stock goes negative) | D → configurable oversell policy, explicit | 5835-5862 |
| S13 | Editing a posted order is allowed (rewrites history); blocked only for >1 payment (guard actually counts unique accounts) | D → no destructive edits; void/correction documents | 6854-6861 |
| S14 | Salesperson attribution per line (`sales_person_id`) | P | schema:920 |
| S15 | A mirror of every sale row is written to `payment_with_goods` | X (implementation detail) → single fulfillment aggregate | 6198 |

## Payments & banking

| # | Rule | Tag | Evidence |
|---|---|---|---|
| P1 | A receipt may split across multiple accounts/tenders (cash + MoMo + cheque) | P | [payment-transaction-map.md](payment-transaction-map.md) §4 |
| P2 | Change due = tendered − applied | P | 6404, 16762 |
| P3 | Receipts allocate to owing invoices FIFO (insertion order), last invoice may go negative (credit) | P* (make allocation explicit) | 16842-17231 |
| P4 | Overpayment becomes customer credit (negative amount_due) and increases AP control | P* | 6440-6445, 16888 |
| P5 | Cheque/MoMo details captured per tender | P* (persisted only in POS path) | `account_field_payment.php:25-37` vs `Admin.php:6416-6420` |
| P6 | Suppliers are paid per specific PO; debts (`outstanding_debts`) and cash-creditor customers have their own payout flows | P | 14831-14978, 14219-14305, 14384-14505 |
| P7 | Expenses are paid from Imprest/Petty Cash into allocated expense accounts | P | `get_account_paid_from.php:3-12`, 15028-15094 |
| P8 | Fund transfers move balances between accounts without payment rows | P* (invisible in reports — needs transfer-aware reporting) | 2089-2110 |
| P9 | Imprest/Petty Cash top-up = transfer | P | `banking.php:58-62` |
| P10 | Deposits cannot be deleted once created | P* (needs void flow) | 16368-16734 |

## Inventory

| # | Rule | Tag | Evidence |
|---|---|---|---|
| I1 | Stock increases at PO save (no GRN), decreases at pick; transfers deduct; refunds restore | P* (GRN separation is the fix) | [stock-movement-map.md](stock-movement-map.md) §2 |
| I2 | Per-cashier daily stock sheet (stock_manager) with opening/closing; day closes at 18:00 | P* (shift-based sessions, no cross-user contamination) | 24975-25074, `Login.php:225-271` |
| I3 | Each transactional row snapshots `item_balance` (stock after that row) | X → immutable ledger + derived balances | 6181-6206 |
| I4 | Transfers move stock to a free-text receiver and post quantity rows to the GL | D → location-to-location transfers, no GL quantity postings | 23046-23105 |
| I5 | Cost price = latest purchase price at sale time (snapshot per row) | P* → configurable costing (FIFO/AVCO) with migration reconciliation | 6184-6190 |
| I6 | Item quantity not editable after create (adjustments via POs) | P* → dedicated adjustment documents | 4254 |
| I7 | `stock_record` purchase ledger | X (dead, bigint-typed) | [stock-movement-map.md](stock-movement-map.md) §3 |

## Customers / AR / AP

| # | Rule | Tag | Evidence |
|---|---|---|---|
| C1 | Three opening-balance kinds: cash (Opening-balance invoice), goods-creditor (opening SO with quantity_due), debtor (opening SO unpaid) | P* | [ar-ap-lifecycle.md](ar-ap-lifecycle.md) §1 |
| C2 | Customers may be flagged guest; name is the only required field; phone validated when present | P (Ghana phone-first: keep optional email, strengthen phone handling) | 2438-2492 |
| C3 | Customer balance = derived: Σ invoice.amount_due (sign convention) + goods owed (Σ price×quantity_due) | P* → explicit documents | [ar-ap-lifecycle.md](ar-ap-lifecycle.md) §3 |
| C4 | Supplier opening balance → 'Opening-balance' AP row; sign convention positive=owe / negative=owed to us | P | 2202-2237 |
| C5 | Customer deletion blocked once transactions exist | P | `Crud_model.php:108-116` |
| C6 | "Payables taken" = goods delivered against pre-year/pre-window credit, net of discounts, `R` codes excluded | P | `get_payables_taken_list.php` |
| C7 | `debtors`/`creditors` daily snapshot tables for reports | X (writer commented out) → live queries | 1198-1468 |
| C8 | No credit limits, terms, or aging buckets exist | gap → add | — |

## Accounting

| # | Rule | Tag | Evidence |
|---|---|---|---|
| A1 | Every event writes a Dr/Cr pair to `general_journal` with a journal-type label | P* → real posting engine | [accounting-transaction-flow.md](accounting-transaction-flow.md) §3 |
| A2 | Control accounts: AR, AP, General Sales, General Products Purchased + transferrable cash/bank/MoMo accounts | P | §2 ibid. |
| A3 | Deposits credit Accounts Payable (liability model) | P* → unapplied cash / customer credit | 16504-16542 |
| A4 | Income statement is cash-basis; COGS = supplier payments | D → accrual with real COGS | `income_statement_report.php:62-67` |
| A5 | Balance sheet equity is a plug; debtors/creditors from frozen snapshots | D | `balance_sheet_report.php:129-271` |
| A6 | AR/AP balances are refreshed from POS pages (`update_ables`) | X → subledger-derived control balances | 24775-24817 |
| A7 | Tax columns exist but no tax computation | gap → effective-dated configurable Ghana tax engine | schema:947-952 (zero code refs) |

## Administration / operations

| # | Rule | Tag | Evidence |
|---|---|---|---|
| M1 | Two-factor-ish login: 5-char auth key + bcrypt password | P* → proper MFA; key currently weak & displayed | `Login.php:99-186` |
| M2 | Users have levels 1-4 (super admin / admin / cashier / shop attendant); cashiers are redirected to POS and blocked from 5 shell pages only | D → full RBAC | [rbac-analysis.md](rbac-analysis.md) |
| M3 | `manager` flag gates two report menu items | P (fold into RBAC) | `sales-nav.php:88-92,141-145` |
| M4 | Blocked accounts at `block_limit=3` | P | `Login.php:136` |
| M5 | Attendance rows on first login; auto clock-out at 18:00; forgot-to-clockout modal | P* (currently broken — `clock_in_out` endpoint missing) | `Login.php:188-271` |
| M6 | Welcome modal once per day (session flashdata) | P | `Login.php:169-172` |
| M7 | SMS credential delivery on user creation (Hubtel) | P* (do not SMS passwords) | `Admin.php:236-243` |
| M8 | Hardcoded business day boundary 18:00 | P* (configurable per tenant) | `Login.php:240` |
| M9 | Timezone Africa/Accra, currency from settings | P | `index.php:56` |

## Multi-branch (intent vs reality)

The `shops`/`shelves`/`shop_attendants`/`item_locations` tables (schema:1042-1090, 348-364) and `items.shop_id` (schema:374) show an **unwired multi-shop design** — zero code references. iDepot today is effectively **single-branch**; multi-branch is a target capability, not a preserved behaviour. [X → target feature]
